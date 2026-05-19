use anyhow::{Context, anyhow, bail};
use base64::{Engine, engine::general_purpose};
use chrono::Utc;
use serde_json::{Map, Number, Value, json};
use url::Url;

use crate::{
    model::{NetworkSettings, ProxySource, ProxySourceKind},
    network,
};

pub async fn refresh_source(
    source: &mut ProxySource,
    settings: &NetworkSettings,
) -> anyhow::Result<usize> {
    let content = match source.kind {
        ProxySourceKind::Manual => return Ok(source.nodes.len()),
        ProxySourceKind::Subscription => {
            if source.subscription.url.trim().is_empty() {
                bail!("subscription url is empty");
            }
            let client = network::build_client(settings, source.subscription.skip_tls_verify)?;
            let mut request = client.get(source.subscription.url.trim());
            if !source.subscription.user_agent.trim().is_empty() {
                request = request.header("user-agent", source.subscription.user_agent.trim());
            }
            request
                .send()
                .await
                .with_context(|| format!("failed to fetch {}", source.subscription.url))?
                .error_for_status()?
                .text()
                .await?
        }
    };

    let nodes = parse_subscription_content(&content)?;
    source.nodes = nodes;
    if source.kind == ProxySourceKind::Subscription {
        source.subscription.last_fetch_at = Some(Utc::now());
    }
    Ok(source.nodes.len())
}

pub fn parse_subscription_content(content: &str) -> anyhow::Result<Vec<Value>> {
    if let Some(nodes) = parse_structured(content)? {
        return Ok(nodes);
    }
    if let Ok(decoded) = decode_base64_relaxed(content.trim()) {
        if let Ok(text) = String::from_utf8(decoded) {
            if let Some(nodes) = parse_structured(&text)? {
                return Ok(nodes);
            }
            return parse_uri_lines(&text);
        }
    }
    parse_uri_lines(content)
}

fn parse_structured(content: &str) -> anyhow::Result<Option<Vec<Value>>> {
    if let Ok(value) = serde_json::from_str::<Value>(content) {
        return extract_structured_nodes(value).map(Some);
    }
    if let Ok(value) = serde_yaml::from_str::<serde_yaml::Value>(content) {
        let json_value = serde_json::to_value(value)?;
        return extract_structured_nodes(json_value).map(Some);
    }
    Ok(None)
}

fn extract_structured_nodes(value: Value) -> anyhow::Result<Vec<Value>> {
    match value {
        Value::Array(items) => Ok(items),
        Value::Object(mut object) => {
            if let Some(Value::Array(outbounds)) = object.remove("outbounds") {
                return Ok(outbounds);
            }
            if let Some(Value::Array(proxies)) = object.remove("proxies") {
                return proxies
                    .into_iter()
                    .filter_map(|proxy| match proxy {
                        Value::Object(object) => convert_clash_proxy(object),
                        _ => None,
                    })
                    .collect();
            }
            bail!("structured subscription has no outbounds or proxies")
        }
        _ => bail!("structured subscription is not an object or array"),
    }
}

fn convert_clash_proxy(mut proxy: Map<String, Value>) -> Option<anyhow::Result<Value>> {
    let name = take_string(&mut proxy, "name")?;
    let proxy_type = take_string(&mut proxy, "type")?.to_ascii_lowercase();
    let server = take_string(&mut proxy, "server")?;
    let server_port = take_u16(&mut proxy, "port")
        .or_else(|| take_u16(&mut proxy, "server_port"))
        .unwrap_or(0);
    if server_port == 0 {
        return Some(Err(anyhow!("proxy {} has no port", name)));
    }

    let mut outbound = Map::new();
    outbound.insert("tag".to_string(), Value::String(name.clone()));
    outbound.insert("server".to_string(), Value::String(server.clone()));
    outbound.insert(
        "server_port".to_string(),
        Value::Number(Number::from(server_port)),
    );

    let result = match proxy_type.as_str() {
        "ss" | "shadowsocks" => {
            outbound.insert("type".to_string(), Value::String("shadowsocks".to_string()));
            copy_string(&mut proxy, &mut outbound, "cipher", "method");
            copy_string(&mut proxy, &mut outbound, "method", "method");
            copy_string(&mut proxy, &mut outbound, "password", "password");
            Ok(Value::Object(outbound))
        }
        "trojan" => {
            outbound.insert("type".to_string(), Value::String("trojan".to_string()));
            copy_string(&mut proxy, &mut outbound, "password", "password");
            apply_tls_from_clash(&mut proxy, &mut outbound, &server, true);
            Ok(Value::Object(outbound))
        }
        "vmess" => {
            outbound.insert("type".to_string(), Value::String("vmess".to_string()));
            copy_string(&mut proxy, &mut outbound, "uuid", "uuid");
            copy_string(&mut proxy, &mut outbound, "alterId", "alter_id");
            copy_string(&mut proxy, &mut outbound, "alter-id", "alter_id");
            copy_string(&mut proxy, &mut outbound, "cipher", "security");
            apply_tls_from_clash(&mut proxy, &mut outbound, &server, false);
            Ok(Value::Object(outbound))
        }
        "vless" => {
            outbound.insert("type".to_string(), Value::String("vless".to_string()));
            copy_string(&mut proxy, &mut outbound, "uuid", "uuid");
            copy_string(&mut proxy, &mut outbound, "flow", "flow");
            apply_tls_from_clash(&mut proxy, &mut outbound, &server, false);
            Ok(Value::Object(outbound))
        }
        "socks" | "socks5" => {
            outbound.insert("type".to_string(), Value::String("socks".to_string()));
            copy_string(&mut proxy, &mut outbound, "username", "username");
            copy_string(&mut proxy, &mut outbound, "password", "password");
            Ok(Value::Object(outbound))
        }
        "http" => {
            outbound.insert("type".to_string(), Value::String("http".to_string()));
            copy_string(&mut proxy, &mut outbound, "username", "username");
            copy_string(&mut proxy, &mut outbound, "password", "password");
            Ok(Value::Object(outbound))
        }
        _ => Err(anyhow!(
            "unsupported clash proxy type {} for {}",
            proxy_type,
            name
        )),
    };
    Some(result)
}

fn parse_uri_lines(content: &str) -> anyhow::Result<Vec<Value>> {
    let mut outbounds = Vec::new();
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let outbound = parse_proxy_uri(trimmed)
            .with_context(|| format!("failed to parse subscription line {}", trimmed))?;
        outbounds.push(outbound);
    }
    if outbounds.is_empty() {
        bail!("no proxy nodes found")
    }
    Ok(outbounds)
}

fn parse_proxy_uri(input: &str) -> anyhow::Result<Value> {
    if input.starts_with("ss://") {
        return parse_ss_uri(input);
    }
    if let Some(payload) = input.strip_prefix("vmess://") {
        return parse_vmess_uri(payload);
    }
    if input.starts_with("trojan://") {
        return parse_trojan_or_vless_uri(input, "trojan");
    }
    if input.starts_with("vless://") {
        return parse_trojan_or_vless_uri(input, "vless");
    }
    bail!("unsupported proxy uri scheme")
}

fn parse_ss_uri(input: &str) -> anyhow::Result<Value> {
    let without_scheme = input.trim_start_matches("ss://");
    let (without_fragment, fragment) = split_once(without_scheme, '#');
    let tag = decode_component(fragment.unwrap_or("shadowsocks"));
    let (body, _) = split_once(without_fragment, '?');
    let decoded_body = if body.contains('@') {
        body.to_string()
    } else {
        String::from_utf8(decode_base64_relaxed(body)?)?
    };
    let (method_password, server_port) = decoded_body
        .split_once('@')
        .ok_or_else(|| anyhow!("invalid ss uri, missing @"))?;
    let (method, password) = method_password
        .split_once(':')
        .ok_or_else(|| anyhow!("invalid ss uri, missing method/password"))?;
    let (server, port) = split_host_port(server_port)?;
    Ok(json!({
        "type": "shadowsocks",
        "tag": tag,
        "server": server,
        "server_port": port,
        "method": decode_component(method),
        "password": decode_component(password)
    }))
}

fn parse_vmess_uri(payload: &str) -> anyhow::Result<Value> {
    let text = String::from_utf8(decode_base64_relaxed(payload)?)?;
    let value: Value = serde_json::from_str(&text)?;
    let object = value
        .as_object()
        .ok_or_else(|| anyhow!("vmess payload is not an object"))?;
    let tag = object
        .get("ps")
        .or_else(|| object.get("name"))
        .and_then(Value::as_str)
        .unwrap_or("vmess");
    let server = object
        .get("add")
        .or_else(|| object.get("server"))
        .and_then(Value::as_str)
        .ok_or_else(|| anyhow!("vmess missing server"))?;
    let port = object
        .get("port")
        .and_then(|value| {
            value
                .as_str()
                .and_then(|raw| raw.parse::<u16>().ok())
                .or_else(|| value.as_u64().map(|raw| raw as u16))
        })
        .ok_or_else(|| anyhow!("vmess missing port"))?;
    let uuid = object
        .get("id")
        .or_else(|| object.get("uuid"))
        .and_then(Value::as_str)
        .ok_or_else(|| anyhow!("vmess missing uuid"))?;
    let mut outbound = json!({
        "type": "vmess",
        "tag": tag,
        "server": server,
        "server_port": port,
        "uuid": uuid
    });
    if let Some(cipher) = object.get("scy").and_then(Value::as_str) {
        outbound["security"] = Value::String(cipher.to_string());
    }
    if object
        .get("tls")
        .and_then(Value::as_str)
        .is_some_and(|value| value == "tls")
    {
        outbound["tls"] = json!({
            "enabled": true,
            "server_name": object.get("sni").and_then(Value::as_str).unwrap_or(server)
        });
    }
    Ok(outbound)
}

fn parse_trojan_or_vless_uri(input: &str, kind: &str) -> anyhow::Result<Value> {
    let url = Url::parse(input)?;
    let server = url
        .host_str()
        .ok_or_else(|| anyhow!("{} uri missing server", kind))?;
    let port = url
        .port()
        .ok_or_else(|| anyhow!("{} uri missing port", kind))?;
    let tag = url
        .fragment()
        .map(decode_component)
        .unwrap_or_else(|| kind.to_string());
    let mut outbound = Map::new();
    outbound.insert("type".to_string(), Value::String(kind.to_string()));
    outbound.insert("tag".to_string(), Value::String(tag));
    outbound.insert("server".to_string(), Value::String(server.to_string()));
    outbound.insert("server_port".to_string(), Value::Number(Number::from(port)));
    if kind == "trojan" {
        outbound.insert(
            "password".to_string(),
            Value::String(decode_component(url.username())),
        );
    } else {
        outbound.insert(
            "uuid".to_string(),
            Value::String(decode_component(url.username())),
        );
    }
    let query: std::collections::HashMap<_, _> = url.query_pairs().into_owned().collect();
    if let Some(flow) = query.get("flow") {
        outbound.insert("flow".to_string(), Value::String(flow.clone()));
    }
    let security = query.get("security").map(String::as_str).unwrap_or("");
    if security == "tls" || security == "reality" {
        let mut tls = Map::new();
        tls.insert("enabled".to_string(), Value::Bool(true));
        if let Some(sni) = query.get("sni").or_else(|| query.get("peer")) {
            tls.insert("server_name".to_string(), Value::String(sni.clone()));
        } else {
            tls.insert("server_name".to_string(), Value::String(server.to_string()));
        }
        if security == "reality" {
            let mut reality = Map::new();
            reality.insert("enabled".to_string(), Value::Bool(true));
            if let Some(public_key) = query.get("pbk") {
                reality.insert("public_key".to_string(), Value::String(public_key.clone()));
            }
            if let Some(short_id) = query.get("sid") {
                reality.insert("short_id".to_string(), Value::String(short_id.clone()));
            }
            tls.insert("reality".to_string(), Value::Object(reality));
        }
        outbound.insert("tls".to_string(), Value::Object(tls));
    }
    Ok(Value::Object(outbound))
}

fn apply_tls_from_clash(
    proxy: &mut Map<String, Value>,
    outbound: &mut Map<String, Value>,
    server: &str,
    default_enabled: bool,
) {
    let enabled = take_bool(proxy, "tls").unwrap_or(default_enabled);
    if !enabled {
        return;
    }
    let mut tls = Map::new();
    tls.insert("enabled".to_string(), Value::Bool(true));
    if let Some(sni) = take_string(proxy, "sni").or_else(|| take_string(proxy, "servername")) {
        tls.insert("server_name".to_string(), Value::String(sni));
    } else {
        tls.insert("server_name".to_string(), Value::String(server.to_string()));
    }
    if take_bool(proxy, "skip-cert-verify").unwrap_or(false) {
        tls.insert("insecure".to_string(), Value::Bool(true));
    }
    outbound.insert("tls".to_string(), Value::Object(tls));
}

fn copy_string(
    proxy: &mut Map<String, Value>,
    outbound: &mut Map<String, Value>,
    from: &str,
    to: &str,
) {
    if let Some(value) = take_string(proxy, from) {
        outbound.insert(to.to_string(), Value::String(value));
    }
}

fn take_string(object: &mut Map<String, Value>, key: &str) -> Option<String> {
    object.remove(key).and_then(|value| match value {
        Value::String(value) => Some(value),
        Value::Number(value) => Some(value.to_string()),
        Value::Bool(value) => Some(value.to_string()),
        _ => None,
    })
}

fn take_u16(object: &mut Map<String, Value>, key: &str) -> Option<u16> {
    object.remove(key).and_then(|value| match value {
        Value::Number(value) => value.as_u64().and_then(|value| u16::try_from(value).ok()),
        Value::String(value) => value.parse::<u16>().ok(),
        _ => None,
    })
}

fn take_bool(object: &mut Map<String, Value>, key: &str) -> Option<bool> {
    object.remove(key).and_then(|value| match value {
        Value::Bool(value) => Some(value),
        Value::String(value) => value.parse::<bool>().ok(),
        _ => None,
    })
}

fn split_host_port(input: &str) -> anyhow::Result<(String, u16)> {
    let (host, port) = input
        .rsplit_once(':')
        .ok_or_else(|| anyhow!("missing host port delimiter"))?;
    let port = port.parse::<u16>()?;
    Ok((host.trim_matches(['[', ']']).to_string(), port))
}

fn split_once<'a>(input: &'a str, delimiter: char) -> (&'a str, Option<&'a str>) {
    input
        .split_once(delimiter)
        .map_or((input, None), |(left, right)| (left, Some(right)))
}

fn decode_component(input: &str) -> String {
    urlencoding::decode(input)
        .map(|value| value.into_owned())
        .unwrap_or_else(|_| input.to_string())
}

fn decode_base64_relaxed(input: &str) -> anyhow::Result<Vec<u8>> {
    let compact: String = input.chars().filter(|c| !c.is_whitespace()).collect();
    let padded = match compact.len() % 4 {
        0 => compact.clone(),
        remainder => format!("{}{}", compact, "=".repeat(4 - remainder)),
    };
    general_purpose::STANDARD
        .decode(&padded)
        .or_else(|_| general_purpose::URL_SAFE.decode(&padded))
        .map_err(Into::into)
}
