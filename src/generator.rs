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
    let base_endpoints = root
        .remove("endpoints")
        .and_then(|value| value.as_array().cloned())
        .unwrap_or_default();
    let base_http_clients = root
        .remove("http_clients")
        .and_then(|value| value.as_array().cloned())
        .unwrap_or_default();
    let base_certificate_providers = root
        .remove("certificate_providers")
        .and_then(|value| value.as_array().cloned())
        .unwrap_or_default();
    let base_services = root
        .remove("services")
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

    let mut http_clients = base_http_clients;
    append_http_clients(&mut http_clients, state)?;

    let mut certificate_providers = base_certificate_providers;
    append_certificate_providers(&mut certificate_providers, state)?;

    let mut services = base_services;
    append_services(&mut services, state)?;

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

    let mut endpoints = Vec::new();
    for endpoint in base_endpoints {
        insert_endpoint(&mut endpoints, &mut tags, endpoint)?;
    }
    for endpoint in &state.endpoints {
        insert_endpoint(&mut endpoints, &mut tags, endpoint.clone())?;
    }

    let mut route = object_or_default(root.remove("route").unwrap_or_else(|| json!({})));
    let base_rules = route
        .remove("rules")
        .and_then(|value| value.as_array().cloned())
        .unwrap_or_default();
    let base_rule_sets = route
        .remove("rule_set")
        .and_then(|value| value.as_array().cloned())
        .unwrap_or_default();
    let mut rule_set_tags = route_rule_set_tags(&base_rule_sets)?;
    merge_object_fields(&mut route, object_or_default(state.route.options.clone()));
    let mut rule_sets = base_rule_sets;
    rule_sets.extend(build_route_rule_sets(state, &mut rule_set_tags)?);
    if !rule_sets.is_empty() {
        route.insert("rule_set".to_string(), Value::Array(rule_sets));
    }
    let mut rules = base_rules;
    rules.extend(build_extra_route_rules(state, &tags, &rule_set_tags)?);
    rules.extend(build_target_rules(state, &tags)?);
    route.insert("rules".to_string(), Value::Array(rules));
    route
        .entry("final".to_string())
        .or_insert_with(|| Value::String("DIRECT".to_string()));
    validate_route_final(&route, &tags)?;

    if !inbounds.is_empty() {
        root.insert("inbounds".to_string(), Value::Array(inbounds));
    }
    if !endpoints.is_empty() {
        root.insert("endpoints".to_string(), Value::Array(endpoints));
    }
    if !http_clients.is_empty() {
        root.insert("http_clients".to_string(), Value::Array(http_clients));
    }
    insert_top_level_object(&mut root, "certificate", state.certificate.clone())?;
    if !certificate_providers.is_empty() {
        root.insert(
            "certificate_providers".to_string(),
            Value::Array(certificate_providers),
        );
    }
    if !services.is_empty() {
        root.insert("services".to_string(), Value::Array(services));
    }
    root.insert("outbounds".to_string(), Value::Array(outbounds));
    root.insert("route".to_string(), Value::Object(route));
    if state.dns.enabled {
        root.insert("dns".to_string(), build_dns_config(&state.dns)?);
    }
    insert_top_level_object(&mut root, "log", state.global.log.clone())?;
    insert_top_level_object(&mut root, "ntp", state.global.ntp.clone())?;
    insert_top_level_object(&mut root, "experimental", state.global.experimental.clone())?;
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
    let endpoint_tags = endpoint_tags(state)?;
    for endpoint_tag in &endpoint_tags {
        if !generated_tags.insert(endpoint_tag.clone()) {
            bail!("duplicate generated outbound/endpoint tag {}", endpoint_tag);
        }
    }

    let group_tags: BTreeSet<_> = groups.iter().map(|group| group.tag.clone()).collect();
    let known_proxy_tags: BTreeSet<_> = proxies.iter().map(|proxy| proxy.tag.clone()).collect();
    for group in &groups {
        for outbound in &group.outbounds {
            if !group_tags.contains(outbound)
                && !known_proxy_tags.contains(outbound)
                && !endpoint_tags.contains(outbound)
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

fn endpoint_tags(state: &ComposerState) -> anyhow::Result<BTreeSet<String>> {
    let mut tags = BTreeSet::new();
    for (index, endpoint) in state.endpoints.iter().enumerate() {
        let tag = endpoint_tag(endpoint)
            .with_context(|| format!("endpoint {} is missing a non-empty tag", index + 1))?;
        if !tags.insert(tag.clone()) {
            bail!("duplicate endpoint tag {}", tag);
        }
    }
    Ok(tags)
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

fn build_extra_route_rules(
    state: &ComposerState,
    generated_tags: &BTreeSet<String>,
    rule_set_tags: &BTreeSet<String>,
) -> anyhow::Result<Vec<Value>> {
    let mut rules = Vec::new();
    for (index, rule) in state.extra_route_rules.iter().enumerate() {
        let mut rule = strip_route_rule_type(object_or_default(rule.clone()));
        validate_route_rule_references(&rule, generated_tags, rule_set_tags, false)
            .with_context(|| format!("extra route rule {}", index + 1))?;
        if rule.get("type").and_then(Value::as_str) == Some("default") {
            rule.remove("type");
        }
        rules.push(Value::Object(rule));
    }
    Ok(rules)
}

fn build_route_rule_sets(
    state: &ComposerState,
    tags: &mut BTreeSet<String>,
) -> anyhow::Result<Vec<Value>> {
    let mut rule_sets = Vec::new();
    for (index, rule_set) in state.route.rule_sets.iter().enumerate() {
        let mut rule_set = object_or_default(rule_set.clone());
        let tag = rule_set
            .get("tag")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| anyhow!("route rule-set {} is missing tag", index + 1))?;
        if !tags.insert(tag.to_string()) {
            bail!("duplicate route rule-set tag {}", tag);
        }
        strip_headless_rule_set_types(&mut rule_set);
        if rule_set.get("type").and_then(Value::as_str) == Some("inline") {
            rule_set.remove("type");
        }
        rule_sets.push(Value::Object(rule_set));
    }
    Ok(rule_sets)
}

fn route_rule_set_tags(rule_sets: &[Value]) -> anyhow::Result<BTreeSet<String>> {
    let mut tags = BTreeSet::new();
    for (index, rule_set) in rule_sets.iter().enumerate() {
        let object = rule_set
            .as_object()
            .ok_or_else(|| anyhow!("base route rule-set {} must be an object", index + 1))?;
        let tag = object
            .get("tag")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| anyhow!("base route rule-set {} is missing tag", index + 1))?;
        if !tags.insert(tag.to_string()) {
            bail!("duplicate route rule-set tag {}", tag);
        }
    }
    Ok(tags)
}

fn strip_headless_rule_set_types(rule_set: &mut Map<String, Value>) {
    if let Some(rules) = rule_set.get_mut("rules").and_then(Value::as_array_mut) {
        for rule in rules {
            if let Value::Object(rule_object) = rule {
                let stripped = strip_headless_rule_type(std::mem::take(rule_object));
                *rule_object = stripped;
            }
        }
    }
}

fn strip_headless_rule_type(mut rule: Map<String, Value>) -> Map<String, Value> {
    if let Some(children) = rule.get_mut("rules").and_then(Value::as_array_mut) {
        for child in children {
            if let Value::Object(child_object) = child {
                let stripped = strip_headless_rule_type(std::mem::take(child_object));
                *child_object = stripped;
            }
        }
    }
    if rule.get("type").and_then(Value::as_str) == Some("default") {
        rule.remove("type");
    }
    rule
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

fn strip_route_rule_type(mut rule: Map<String, Value>) -> Map<String, Value> {
    if let Some(children) = rule.get_mut("rules").and_then(Value::as_array_mut) {
        for child in children {
            if let Value::Object(child_object) = child {
                let stripped = strip_route_rule_type(std::mem::take(child_object));
                *child_object = stripped;
            }
        }
    }
    if rule.get("type").and_then(Value::as_str) == Some("default") {
        rule.remove("type");
    }
    rule
}

fn validate_route_rule_references(
    rule: &Map<String, Value>,
    generated_tags: &BTreeSet<String>,
    rule_set_tags: &BTreeSet<String>,
    nested: bool,
) -> anyhow::Result<()> {
    if nested {
        for key in ROUTE_RULE_ACTION_KEYS {
            if rule.contains_key(*key) {
                bail!(
                    "nested route rule contains unsupported action field {}",
                    key
                );
            }
        }
    } else {
        let action = rule
            .get("action")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .unwrap_or("route");
        match action {
            "route" => {
                let outbound = rule
                    .get("outbound")
                    .and_then(Value::as_str)
                    .filter(|value| !value.is_empty())
                    .ok_or_else(|| anyhow!("route action is missing outbound"))?;
                if !generated_tags.contains(outbound) {
                    bail!("route action references unknown outbound {}", outbound);
                }
            }
            "bypass" => {
                if let Some(outbound) = rule
                    .get("outbound")
                    .and_then(Value::as_str)
                    .filter(|value| !value.is_empty())
                {
                    if !generated_tags.contains(outbound) {
                        bail!("bypass action references unknown outbound {}", outbound);
                    }
                }
            }
            _ => {}
        }
    }

    if let Some(rule_sets) = rule.get("rule_set").and_then(Value::as_array) {
        for rule_set in rule_sets {
            let Some(tag) = rule_set.as_str().filter(|value| !value.is_empty()) else {
                continue;
            };
            if !rule_set_tags.contains(tag) {
                bail!("route rule references unknown rule-set {}", tag);
            }
        }
    }

    if let Some(children) = rule.get("rules").and_then(Value::as_array) {
        for child in children {
            validate_route_rule_references(
                &object_or_default(child.clone()),
                generated_tags,
                rule_set_tags,
                true,
            )?;
        }
    }
    Ok(())
}

fn validate_route_final(
    route: &Map<String, Value>,
    generated_tags: &BTreeSet<String>,
) -> anyhow::Result<()> {
    if let Some(final_outbound) = route
        .get("final")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
    {
        if !generated_tags.contains(final_outbound) {
            bail!("route final references unknown outbound {}", final_outbound);
        }
    }
    Ok(())
}

const ROUTE_RULE_ACTION_KEYS: &[&str] = &[
    "action",
    "outbound",
    "override_address",
    "override_port",
    "network_strategy",
    "fallback_delay",
    "udp_disable_domain_unmapping",
    "udp_connect",
    "udp_timeout",
    "tls_fragment",
    "tls_fragment_fallback_delay",
    "tls_record_fragment",
    "tls_spoof",
    "tls_spoof_method",
    "method",
    "no_drop",
    "sniffer",
    "timeout",
    "server",
    "strategy",
    "disable_cache",
    "disable_optimistic_cache",
    "rewrite_ttl",
    "client_subnet",
];

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
    validate_global_shape(state)?;
    validate_http_clients_shape(state)?;
    validate_certificate_shape(state)?;
    validate_services_shape(state)?;
    validate_route_shape(state)?;
    validate_inbound_shape(state)?;
    validate_endpoint_shape(state)?;
    validate_extra_route_rules_shape(state)?;
    Ok(())
}

fn validate_global_shape(state: &ComposerState) -> anyhow::Result<()> {
    if !state.global.log.is_object() {
        bail!("global log must be an object");
    }
    if !state.global.ntp.is_object() {
        bail!("global ntp must be an object");
    }
    if !state.global.experimental.is_object() {
        bail!("global experimental must be an object");
    }
    Ok(())
}

fn append_http_clients(clients: &mut Vec<Value>, state: &ComposerState) -> anyhow::Result<()> {
    let mut tags = BTreeSet::new();
    for (index, client) in clients.iter().enumerate() {
        let tag = client
            .get("tag")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| anyhow!("base http client {} is missing tag", index + 1))?;
        if !tags.insert(tag.to_string()) {
            bail!("duplicate http client tag {}", tag);
        }
    }
    for client in &state.http_clients {
        let tag = client
            .get("tag")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| anyhow!("http client is missing tag"))?;
        if !tags.insert(tag.to_string()) {
            bail!("duplicate http client tag {}", tag);
        }
        clients.push(client.clone());
    }
    Ok(())
}

fn append_certificate_providers(
    providers: &mut Vec<Value>,
    state: &ComposerState,
) -> anyhow::Result<()> {
    let mut tags = BTreeSet::new();
    for (index, provider) in providers.iter().enumerate() {
        let tag = provider
            .get("tag")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
            .unwrap_or_else(|| index.to_string());
        if !tags.insert(tag.clone()) {
            bail!("duplicate certificate provider tag {}", tag);
        }
    }
    for provider in &state.certificate_providers {
        let tag = provider
            .get("tag")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| anyhow!("certificate provider is missing tag"))?;
        if !tags.insert(tag.to_string()) {
            bail!("duplicate certificate provider tag {}", tag);
        }
        providers.push(provider.clone());
    }
    Ok(())
}

fn append_services(services: &mut Vec<Value>, state: &ComposerState) -> anyhow::Result<()> {
    let mut tags = BTreeSet::new();
    for (index, service) in services.iter().enumerate() {
        let tag = service
            .get("tag")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
            .unwrap_or_else(|| index.to_string());
        if !tags.insert(tag.clone()) {
            bail!("duplicate service tag {}", tag);
        }
    }
    for service in &state.services {
        let tag = service
            .get("tag")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| anyhow!("service is missing tag"))?;
        if !tags.insert(tag.to_string()) {
            bail!("duplicate service tag {}", tag);
        }
        services.push(service.clone());
    }
    Ok(())
}

fn validate_http_clients_shape(state: &ComposerState) -> anyhow::Result<()> {
    let mut tags = BTreeSet::new();
    for (index, client) in state.http_clients.iter().enumerate() {
        let object = client
            .as_object()
            .ok_or_else(|| anyhow!("http client {} must be an object", index + 1))?;
        let tag = object
            .get("tag")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| anyhow!("http client {} is missing tag", index + 1))?;
        if !tags.insert(tag.to_string()) {
            bail!("duplicate http client tag {}", tag);
        }
    }
    Ok(())
}

fn validate_certificate_shape(state: &ComposerState) -> anyhow::Result<()> {
    if !state.certificate.is_object() {
        bail!("certificate must be an object");
    }
    let mut tags = BTreeSet::new();
    for (index, provider) in state.certificate_providers.iter().enumerate() {
        let object = provider
            .as_object()
            .ok_or_else(|| anyhow!("certificate provider {} must be an object", index + 1))?;
        if object
            .get("type")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .is_none()
        {
            bail!("certificate provider {} is missing type", index + 1);
        }
        let tag = object
            .get("tag")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| anyhow!("certificate provider {} is missing tag", index + 1))?;
        if !tags.insert(tag.to_string()) {
            bail!("duplicate certificate provider tag {}", tag);
        }
    }
    Ok(())
}

fn validate_services_shape(state: &ComposerState) -> anyhow::Result<()> {
    let mut tags = BTreeSet::new();
    for (index, service) in state.services.iter().enumerate() {
        let object = service
            .as_object()
            .ok_or_else(|| anyhow!("service {} must be an object", index + 1))?;
        if object
            .get("type")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .is_none()
        {
            bail!("service {} is missing type", index + 1);
        }
        let tag = object
            .get("tag")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| anyhow!("service {} is missing tag", index + 1))?;
        if !tags.insert(tag.to_string()) {
            bail!("duplicate service tag {}", tag);
        }
    }
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

fn validate_extra_route_rules_shape(state: &ComposerState) -> anyhow::Result<()> {
    for (index, rule) in state.extra_route_rules.iter().enumerate() {
        if !rule.is_object() {
            bail!("extra route rule {} must be an object", index + 1);
        }
    }
    Ok(())
}

fn validate_route_shape(state: &ComposerState) -> anyhow::Result<()> {
    if !state.route.options.is_object() {
        bail!("route options must be an object");
    }
    for (index, rule_set) in state.route.rule_sets.iter().enumerate() {
        let object = rule_set
            .as_object()
            .ok_or_else(|| anyhow!("route rule-set {} must be an object", index + 1))?;
        if object
            .get("type")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .is_none()
        {
            bail!("route rule-set {} is missing type", index + 1);
        }
        if object
            .get("tag")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .is_none()
        {
            bail!("route rule-set {} is missing tag", index + 1);
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

fn insert_endpoint(
    endpoints: &mut Vec<Value>,
    tags: &mut BTreeSet<String>,
    endpoint: Value,
) -> anyhow::Result<()> {
    let tag = endpoint_tag(&endpoint)?;
    if !tags.insert(tag.clone()) {
        bail!("duplicate outbound/endpoint tag {}", tag);
    }
    endpoints.push(endpoint);
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

fn endpoint_tag(endpoint: &Value) -> anyhow::Result<String> {
    endpoint
        .get("tag")
        .and_then(Value::as_str)
        .filter(|tag| !tag.is_empty())
        .map(ToOwned::to_owned)
        .ok_or_else(|| anyhow!("endpoint is missing a non-empty tag"))
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

fn validate_endpoint_shape(state: &ComposerState) -> anyhow::Result<()> {
    let mut tags = BTreeSet::new();
    for (index, endpoint) in state.endpoints.iter().enumerate() {
        let object = endpoint
            .as_object()
            .ok_or_else(|| anyhow!("endpoint {} must be an object", index + 1))?;
        if object
            .get("type")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .is_none()
        {
            bail!("endpoint {} is missing type", index + 1);
        }
        let tag = object
            .get("tag")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| anyhow!("endpoint {} is missing tag", index + 1))?;
        if !tags.insert(tag.to_string()) {
            bail!("duplicate endpoint tag {}", tag);
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

fn merge_object_fields(target: &mut Map<String, Value>, source: Map<String, Value>) {
    for (key, value) in source {
        if has_json_content(&value) {
            target.insert(key, value);
        }
    }
}

fn has_json_content(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::String(value) => !value.trim().is_empty(),
        Value::Array(value) => !value.is_empty(),
        Value::Object(value) => !value.is_empty(),
        Value::Bool(value) => *value,
        Value::Number(_) => true,
    }
}

fn insert_top_level_object(
    root: &mut Map<String, Value>,
    key: &str,
    value: Value,
) -> anyhow::Result<()> {
    let object = object_or_default(value);
    if !object.is_empty() {
        root.insert(key.to_string(), Value::Object(object));
    }
    Ok(())
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extra_logical_route_rule_allows_actionless_nested_rules() {
        let mut state = ComposerState::default();
        state.target_groups.clear();
        state.extra_route_rules = vec![json!({
            "type": "logical",
            "mode": "or",
            "rules": [
                {
                    "type": "default",
                    "domain_suffix": ["example.com"]
                }
            ],
            "action": "route",
            "outbound": "DIRECT"
        })];

        let config = generate_sing_box_config(&state).expect("config should be generated");
        let rules = config
            .pointer("/route/rules")
            .and_then(Value::as_array)
            .expect("route rules should exist");

        assert_eq!(rules.len(), 1);
        assert_eq!(
            rules[0].get("type").and_then(Value::as_str),
            Some("logical")
        );
        assert!(
            rules[0]
                .pointer("/rules/0/type")
                .and_then(Value::as_str)
                .is_none()
        );
    }

    #[test]
    fn extra_route_rule_rejects_nested_action_fields() {
        let mut state = ComposerState::default();
        state.target_groups.clear();
        state.extra_route_rules = vec![json!({
            "type": "logical",
            "mode": "or",
            "rules": [
                {
                    "type": "default",
                    "domain_suffix": ["example.com"],
                    "outbound": "DIRECT"
                }
            ],
            "action": "route",
            "outbound": "DIRECT"
        })];

        let error = generate_sing_box_config(&state).expect_err("nested action must fail");
        assert!(error.to_string().contains("extra route rule 1"));
    }
}
