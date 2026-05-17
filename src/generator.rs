use std::collections::BTreeSet;

use anyhow::{Context, anyhow, bail};
use regex::Regex;
use serde_json::{Map, Number, Value, json};

use crate::model::{
    ComposerState, DnsConfig, ProxyGroup, ProxyGroupType, ProxySource, ResolvedGroup,
    ResolvedProxy, ResolvedState, SpecialOutbound, TargetEntry, TargetEntryKind,
};

pub fn generate_sing_box_config(state: &ComposerState) -> anyhow::Result<Value> {
    let resolved = resolve_state(state)?;
    let mut root = object_or_default(state.base_config.clone());
    root.remove("dns");
    let base_inbounds = root
        .remove("inbounds")
        .and_then(|value| value.as_array().cloned())
        .unwrap_or_default();
    let base_outbounds = root
        .remove("outbounds")
        .and_then(|value| value.as_array().cloned())
        .unwrap_or_default();

    let mut inbounds = Vec::new();
    let mut inbound_tags = BTreeSet::new();
    for inbound in base_inbounds {
        insert_inbound(&mut inbounds, &mut inbound_tags, inbound)?;
    }
    for inbound in &state.inbounds {
        insert_inbound(&mut inbounds, &mut inbound_tags, inbound.clone())?;
    }

    let mut outbounds = Vec::new();
    let mut tags = BTreeSet::new();
    for outbound in base_outbounds {
        insert_outbound(&mut outbounds, &mut tags, outbound)?;
    }

    for proxy in state.proxy_sources.iter().filter(|source| source.enabled) {
        for outbound in transformed_source_nodes(proxy)? {
            insert_outbound(&mut outbounds, &mut tags, outbound)?;
        }
    }

    ensure_special_outbounds(&mut outbounds, &mut tags);

    for group in state.proxy_groups.iter().filter(|group| group.enabled) {
        let resolved_group = resolved
            .groups
            .iter()
            .find(|candidate| candidate.tag == group.tag)
            .ok_or_else(|| anyhow!("missing resolved group {}", group.tag))?;
        let outbound = build_group_outbound(group, &resolved_group.outbounds);
        insert_outbound(&mut outbounds, &mut tags, outbound)?;
    }

    let mut route = object_or_default(root.remove("route").unwrap_or_else(|| json!({})));
    let base_rules = route
        .remove("rules")
        .and_then(|value| value.as_array().cloned())
        .unwrap_or_default();
    let mut rules = base_rules;
    rules.extend(build_target_rules(state, &tags)?);
    route.insert("rules".to_string(), Value::Array(rules));
    route
        .entry("final".to_string())
        .or_insert_with(|| Value::String("DIRECT".to_string()));

    if !inbounds.is_empty() {
        root.insert("inbounds".to_string(), Value::Array(inbounds));
    }
    root.insert("outbounds".to_string(), Value::Array(outbounds));
    root.insert("route".to_string(), Value::Object(route));
    if state.dns.enabled {
        root.insert("dns".to_string(), build_dns_config(&state.dns)?);
    }
    Ok(Value::Object(root))
}

pub fn resolve_state(state: &ComposerState) -> anyhow::Result<ResolvedState> {
    validate_state_shape(state)?;
    let proxies = resolve_proxies(state)?;
    let known_sources: BTreeSet<_> = state
        .proxy_sources
        .iter()
        .map(|source| source.id.clone())
        .collect();
    let mut groups = Vec::new();

    for group in state.proxy_groups.iter().filter(|group| group.enabled) {
        let regexes = compile_group_regexes(group)?;
        let mut outbounds = Vec::new();
        let selected_sources: BTreeSet<_> = group.source_ids.iter().cloned().collect();

        for proxy in &proxies {
            if !selected_sources.is_empty() && !selected_sources.contains(&proxy.source_id) {
                continue;
            }
            let matched =
                regexes.is_empty() || regexes.iter().any(|regex| regex.is_match(&proxy.tag));
            if matched {
                outbounds.push(proxy.tag.clone());
            }
        }

        for source_id in &group.source_ids {
            if !known_sources.contains(source_id) {
                bail!(
                    "proxy group {} references unknown source {}",
                    group.tag,
                    source_id
                );
            }
        }

        outbounds.extend(group.include_groups.iter().cloned());
        outbounds.extend(group.include_special.iter().map(special_tag));
        dedup_preserving_order(&mut outbounds);

        groups.push(ResolvedGroup {
            tag: group.tag.clone(),
            group_type: group.group_type.clone(),
            outbounds,
        });
    }

    let mut generated_tags = BTreeSet::new();
    for proxy in &proxies {
        if !generated_tags.insert(proxy.tag.clone()) {
            bail!("duplicate generated proxy tag {}", proxy.tag);
        }
    }
    for group in &groups {
        if !generated_tags.insert(group.tag.clone()) {
            bail!("duplicate generated outbound tag {}", group.tag);
        }
    }

    let group_tags: BTreeSet<_> = groups.iter().map(|group| group.tag.clone()).collect();
    let known_proxy_tags: BTreeSet<_> = proxies.iter().map(|proxy| proxy.tag.clone()).collect();
    for group in &groups {
        for outbound in &group.outbounds {
            if !group_tags.contains(outbound)
                && !known_proxy_tags.contains(outbound)
                && outbound != "DIRECT"
                && outbound != "REJECT"
            {
                bail!(
                    "proxy group {} references unknown outbound {}",
                    group.tag,
                    outbound
                );
            }
        }
    }

    let rules = build_target_rules(
        state,
        &generated_tags
            .into_iter()
            .chain(["DIRECT".to_string(), "REJECT".to_string()])
            .collect(),
    )?;

    Ok(ResolvedState {
        proxies,
        groups,
        rules,
    })
}

fn resolve_proxies(state: &ComposerState) -> anyhow::Result<Vec<ResolvedProxy>> {
    let mut proxies = Vec::new();
    for source in state.proxy_sources.iter().filter(|source| source.enabled) {
        for outbound in transformed_source_nodes(source)? {
            let tag = outbound_tag(&outbound)?;
            let outbound_type = outbound
                .get("type")
                .and_then(Value::as_str)
                .unwrap_or("unknown")
                .to_string();
            proxies.push(ResolvedProxy {
                source_id: source.id.clone(),
                source_name: source.name.clone(),
                original_tag: outbound
                    .get("_composer_original_tag")
                    .and_then(Value::as_str)
                    .unwrap_or(&tag)
                    .to_string(),
                tag,
                outbound_type,
            });
        }
    }
    Ok(proxies)
}

fn transformed_source_nodes(source: &ProxySource) -> anyhow::Result<Vec<Value>> {
    let rewrites = source
        .name_rewrites
        .iter()
        .filter(|rule| !rule.pattern.is_empty())
        .map(|rule| {
            Regex::new(&rule.pattern)
                .map(|regex| (regex, rule.replacement.clone()))
                .with_context(|| format!("invalid rewrite regex in source {}", source.name))
        })
        .collect::<anyhow::Result<Vec<_>>>()?;

    let mut outbounds = Vec::new();
    for (index, node) in source.nodes.iter().enumerate() {
        let mut outbound = object_or_default(node.clone());
        let original = outbound
            .get("tag")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned)
            .unwrap_or_else(|| format!("{}-{}", source.name, index + 1));
        let mut tag = original.clone();
        for (regex, replacement) in &rewrites {
            tag = regex.replace_all(&tag, replacement.as_str()).to_string();
        }
        if !source.prefix.is_empty() {
            tag = format!("{}{}", source.prefix, tag);
        }
        outbound.insert("tag".to_string(), Value::String(tag));
        outbound.insert(
            "_composer_original_tag".to_string(),
            Value::String(original),
        );
        outbounds.push(Value::Object(outbound));
    }
    Ok(outbounds)
}

fn build_group_outbound(group: &ProxyGroup, outbounds: &[String]) -> Value {
    match group.group_type {
        ProxyGroupType::Selector => {
            let mut object = Map::new();
            object.insert("type".to_string(), Value::String("selector".to_string()));
            object.insert("tag".to_string(), Value::String(group.tag.clone()));
            object.insert(
                "outbounds".to_string(),
                Value::Array(outbounds.iter().cloned().map(Value::String).collect()),
            );
            if !group.default.is_empty() {
                object.insert("default".to_string(), Value::String(group.default.clone()));
            }
            if group.interrupt_exist_connections {
                object.insert("interrupt_exist_connections".to_string(), Value::Bool(true));
            }
            Value::Object(object)
        }
        ProxyGroupType::UrlTest => {
            let mut object = Map::new();
            object.insert("type".to_string(), Value::String("urltest".to_string()));
            object.insert("tag".to_string(), Value::String(group.tag.clone()));
            object.insert(
                "outbounds".to_string(),
                Value::Array(outbounds.iter().cloned().map(Value::String).collect()),
            );
            if !group.url.is_empty() {
                object.insert("url".to_string(), Value::String(group.url.clone()));
            }
            if !group.interval.is_empty() {
                object.insert(
                    "interval".to_string(),
                    Value::String(group.interval.clone()),
                );
            }
            if group.tolerance > 0 {
                object.insert(
                    "tolerance".to_string(),
                    Value::Number(Number::from(group.tolerance)),
                );
            }
            if !group.idle_timeout.is_empty() {
                object.insert(
                    "idle_timeout".to_string(),
                    Value::String(group.idle_timeout.clone()),
                );
            }
            if group.interrupt_exist_connections {
                object.insert("interrupt_exist_connections".to_string(), Value::Bool(true));
            }
            Value::Object(object)
        }
    }
}

fn build_target_rules(
    state: &ComposerState,
    generated_tags: &BTreeSet<String>,
) -> anyhow::Result<Vec<Value>> {
    let mut rules = Vec::new();
    for group in state.target_groups.iter().filter(|group| group.enabled) {
        if group.outbound.is_empty() {
            bail!("target group {} has no outbound", group.name);
        }
        if !generated_tags.contains(&group.outbound) {
            bail!(
                "target group {} references unknown outbound {}",
                group.name,
                group.outbound
            );
        }
        for entry in &group.entries {
            rules.push(build_rule(entry, &group.outbound)?);
        }
    }
    Ok(rules)
}

fn build_rule(entry: &TargetEntry, outbound: &str) -> anyhow::Result<Value> {
    let mut rule = if entry.kind == TargetEntryKind::Raw {
        object_or_default(entry.raw.clone())
    } else {
        let mut object = Map::new();
        match entry.kind {
            TargetEntryKind::Domain => {
                object.insert("domain".to_string(), string_array(&entry.values));
            }
            TargetEntryKind::DomainSuffix => {
                object.insert("domain_suffix".to_string(), string_array(&entry.values));
            }
            TargetEntryKind::DomainKeyword => {
                object.insert("domain_keyword".to_string(), string_array(&entry.values));
            }
            TargetEntryKind::DomainRegex => {
                for value in &entry.values {
                    Regex::new(value)
                        .with_context(|| format!("invalid target domain regex {}", value))?;
                }
                object.insert("domain_regex".to_string(), string_array(&entry.values));
            }
            TargetEntryKind::Geosite => {
                object.insert("geosite".to_string(), string_array(&entry.values));
            }
            TargetEntryKind::IpCidr => {
                object.insert("ip_cidr".to_string(), string_array(&entry.values));
            }
            TargetEntryKind::IpIsPrivate => {
                object.insert("ip_is_private".to_string(), Value::Bool(true));
            }
            TargetEntryKind::Geoip => {
                object.insert("geoip".to_string(), string_array(&entry.values));
            }
            TargetEntryKind::SourceIpCidr => {
                object.insert("source_ip_cidr".to_string(), string_array(&entry.values));
            }
            TargetEntryKind::SourceIpIsPrivate => {
                object.insert("source_ip_is_private".to_string(), Value::Bool(true));
            }
            TargetEntryKind::Port => {
                object.insert("port".to_string(), number_array(&entry.values)?);
            }
            TargetEntryKind::PortRange => {
                object.insert("port_range".to_string(), string_array(&entry.values));
            }
            TargetEntryKind::ProcessName => {
                object.insert("process_name".to_string(), string_array(&entry.values));
            }
            TargetEntryKind::ProcessPath => {
                object.insert("process_path".to_string(), string_array(&entry.values));
            }
            TargetEntryKind::ProcessPathRegex => {
                object.insert(
                    "process_path_regex".to_string(),
                    string_array(&entry.values),
                );
            }
            TargetEntryKind::PackageName => {
                object.insert("package_name".to_string(), string_array(&entry.values));
            }
            TargetEntryKind::PackageNameRegex => {
                object.insert(
                    "package_name_regex".to_string(),
                    string_array(&entry.values),
                );
            }
            TargetEntryKind::RuleSet => {
                object.insert("rule_set".to_string(), string_array(&entry.values));
            }
            TargetEntryKind::Raw => unreachable!(),
        }
        object
    };

    if entry.invert {
        rule.insert("invert".to_string(), Value::Bool(true));
    }
    rule.insert("action".to_string(), Value::String("route".to_string()));
    rule.insert("outbound".to_string(), Value::String(outbound.to_string()));
    Ok(Value::Object(rule))
}

fn validate_state_shape(state: &ComposerState) -> anyhow::Result<()> {
    let mut ids = BTreeSet::new();
    for source in &state.proxy_sources {
        if source.id.is_empty() {
            bail!("proxy source id cannot be empty");
        }
        if !ids.insert(source.id.clone()) {
            bail!("duplicate proxy source id {}", source.id);
        }
    }

    let mut group_tags = BTreeSet::new();
    for group in &state.proxy_groups {
        if group.tag.is_empty() {
            bail!("proxy group tag cannot be empty");
        }
        if group.enabled && !group_tags.insert(group.tag.clone()) {
            bail!("duplicate proxy group tag {}", group.tag);
        }
        compile_group_regexes(group)?;
    }
    validate_dns_shape(&state.dns)?;
    validate_inbound_shape(state)?;
    Ok(())
}

fn build_dns_config(dns: &DnsConfig) -> anyhow::Result<Value> {
    if dns.servers.is_empty() {
        bail!("DNS is enabled but no DNS server is configured");
    }

    let mut object = object_or_default(dns.options.clone());
    let mut server_tags = BTreeSet::new();
    let mut servers = Vec::new();
    for server in &dns.servers {
        let server_object = object_or_default(server.clone());
        let tag = server_object
            .get("tag")
            .and_then(Value::as_str)
            .filter(|tag| !tag.is_empty())
            .ok_or_else(|| anyhow!("DNS server is missing a non-empty tag"))?;
        if !server_tags.insert(tag.to_string()) {
            bail!("duplicate DNS server tag {}", tag);
        }
        servers.push(Value::Object(server_object));
    }

    if let Some(final_server) = object.get("final").and_then(Value::as_str) {
        if !final_server.is_empty() && !server_tags.contains(final_server) {
            bail!("DNS final references unknown server {}", final_server);
        }
    }

    let mut rules = Vec::new();
    for rule in &dns.rules {
        let rule = strip_dns_rule_type(object_or_default(rule.clone()));
        validate_dns_rule_servers(&rule, &server_tags)?;
        rules.push(Value::Object(rule));
    }

    object.insert("servers".to_string(), Value::Array(servers));
    if !rules.is_empty() {
        object.insert("rules".to_string(), Value::Array(rules));
    }
    Ok(Value::Object(object))
}

fn validate_dns_shape(dns: &DnsConfig) -> anyhow::Result<()> {
    if !dns.enabled {
        return Ok(());
    }
    if !dns.options.is_object() {
        bail!("DNS options must be an object");
    }
    for (index, server) in dns.servers.iter().enumerate() {
        let object = server
            .as_object()
            .ok_or_else(|| anyhow!("DNS server {} must be an object", index + 1))?;
        if object
            .get("type")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .is_none()
        {
            bail!("DNS server {} is missing type", index + 1);
        }
        if object
            .get("tag")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .is_none()
        {
            bail!("DNS server {} is missing tag", index + 1);
        }
    }
    for (index, rule) in dns.rules.iter().enumerate() {
        if !rule.is_object() {
            bail!("DNS rule {} must be an object", index + 1);
        }
    }
    Ok(())
}

fn strip_dns_rule_type(mut rule: Map<String, Value>) -> Map<String, Value> {
    if let Some(children) = rule.get_mut("rules").and_then(Value::as_array_mut) {
        for child in children {
            if let Value::Object(child_object) = child {
                let stripped = strip_dns_rule_type(std::mem::take(child_object));
                *child_object = stripped;
            }
        }
    }
    if rule.get("type").and_then(Value::as_str) == Some("default") {
        rule.remove("type");
    }
    rule
}

fn validate_dns_rule_servers(
    rule: &Map<String, Value>,
    server_tags: &BTreeSet<String>,
) -> anyhow::Result<()> {
    if let Some(server) = rule.get("server").and_then(Value::as_str) {
        if !server.is_empty() && !server_tags.contains(server) {
            bail!("DNS rule references unknown server {}", server);
        }
    }
    if let Some(children) = rule.get("rules").and_then(Value::as_array) {
        for child in children {
            validate_dns_rule_servers(&object_or_default(child.clone()), server_tags)?;
        }
    }
    Ok(())
}

fn compile_group_regexes(group: &ProxyGroup) -> anyhow::Result<Vec<Regex>> {
    group
        .match_regexes
        .iter()
        .filter(|pattern| !pattern.is_empty())
        .map(|pattern| {
            Regex::new(pattern)
                .with_context(|| format!("invalid regex {} in group {}", pattern, group.tag))
        })
        .collect()
}

fn insert_outbound(
    outbounds: &mut Vec<Value>,
    tags: &mut BTreeSet<String>,
    outbound: Value,
) -> anyhow::Result<()> {
    let tag = outbound_tag(&outbound)?;
    if !tags.insert(tag.clone()) {
        bail!("duplicate outbound tag {}", tag);
    }
    outbounds.push(strip_internal_fields(outbound));
    Ok(())
}

fn insert_inbound(
    inbounds: &mut Vec<Value>,
    tags: &mut BTreeSet<String>,
    inbound: Value,
) -> anyhow::Result<()> {
    let tag = inbound_tag(&inbound)?;
    if !tags.insert(tag.clone()) {
        bail!("duplicate inbound tag {}", tag);
    }
    inbounds.push(strip_internal_fields(inbound));
    Ok(())
}

fn ensure_special_outbounds(outbounds: &mut Vec<Value>, tags: &mut BTreeSet<String>) {
    if tags.insert("DIRECT".to_string()) {
        outbounds.push(json!({"type": "direct", "tag": "DIRECT"}));
    }
    if tags.insert("REJECT".to_string()) {
        outbounds.push(json!({"type": "block", "tag": "REJECT"}));
    }
}

fn outbound_tag(outbound: &Value) -> anyhow::Result<String> {
    outbound
        .get("tag")
        .and_then(Value::as_str)
        .filter(|tag| !tag.is_empty())
        .map(ToOwned::to_owned)
        .ok_or_else(|| anyhow!("outbound is missing a non-empty tag"))
}

fn inbound_tag(inbound: &Value) -> anyhow::Result<String> {
    inbound
        .get("tag")
        .and_then(Value::as_str)
        .filter(|tag| !tag.is_empty())
        .map(ToOwned::to_owned)
        .ok_or_else(|| anyhow!("inbound is missing a non-empty tag"))
}

fn validate_inbound_shape(state: &ComposerState) -> anyhow::Result<()> {
    let mut tags = BTreeSet::new();
    for (index, inbound) in state.inbounds.iter().enumerate() {
        let object = inbound
            .as_object()
            .ok_or_else(|| anyhow!("inbound {} must be an object", index + 1))?;
        if object
            .get("type")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .is_none()
        {
            bail!("inbound {} is missing type", index + 1);
        }
        let tag = object
            .get("tag")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| anyhow!("inbound {} is missing tag", index + 1))?;
        if !tags.insert(tag.to_string()) {
            bail!("duplicate inbound tag {}", tag);
        }
    }
    Ok(())
}

fn strip_internal_fields(outbound: Value) -> Value {
    match outbound {
        Value::Object(mut object) => {
            object.remove("_composer_original_tag");
            Value::Object(object)
        }
        other => other,
    }
}

fn object_or_default(value: Value) -> Map<String, Value> {
    match value {
        Value::Object(object) => object,
        _ => Map::new(),
    }
}

fn string_array(values: &[String]) -> Value {
    Value::Array(values.iter().cloned().map(Value::String).collect())
}

fn number_array(values: &[String]) -> anyhow::Result<Value> {
    let mut numbers = Vec::new();
    for value in values {
        let parsed = value
            .parse::<u16>()
            .with_context(|| format!("invalid port {}", value))?;
        numbers.push(Value::Number(Number::from(parsed)));
    }
    Ok(Value::Array(numbers))
}

fn special_tag(special: &SpecialOutbound) -> String {
    match special {
        SpecialOutbound::Direct => "DIRECT".to_string(),
        SpecialOutbound::Reject => "REJECT".to_string(),
    }
}

fn dedup_preserving_order(items: &mut Vec<String>) {
    let mut seen = BTreeSet::new();
    items.retain(|item| seen.insert(item.clone()));
}
