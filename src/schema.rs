use std::{
    fs,
    path::{Path, PathBuf},
};

use anyhow::{Context, bail};
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::model::{ComposerState, ProxySourceKind};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComposerSchema {
    pub schema_version: u32,
    pub default_outbound_type: String,
    #[serde(default)]
    pub outbounds: Map<String, Value>,
    #[serde(default)]
    pub outbound_type_options: Vec<OutboundTypeOption>,
    #[serde(default)]
    pub default_inbound_type: String,
    #[serde(default)]
    pub inbounds: Map<String, Value>,
    #[serde(default)]
    pub inbound_type_options: Vec<OutboundTypeOption>,
    #[serde(default)]
    pub default_endpoint_type: String,
    #[serde(default)]
    pub endpoints: Map<String, Value>,
    #[serde(default)]
    pub endpoint_type_options: Vec<OutboundTypeOption>,
    #[serde(default)]
    pub http_client: ObjectSchema,
    #[serde(default)]
    pub certificate: ObjectSchema,
    #[serde(default)]
    pub default_certificate_provider_type: String,
    #[serde(default)]
    pub certificate_providers: Map<String, Value>,
    #[serde(default)]
    pub certificate_provider_type_options: Vec<OutboundTypeOption>,
    #[serde(default)]
    pub default_service_type: String,
    #[serde(default)]
    pub services: Map<String, Value>,
    #[serde(default)]
    pub service_type_options: Vec<OutboundTypeOption>,
    #[serde(default)]
    pub global: Option<GlobalSchema>,
    #[serde(default)]
    pub dns: Option<DnsSchema>,
    #[serde(default)]
    pub route: Option<RouteSchema>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutboundTypeOption {
    pub value: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutboundSchema {
    pub r#type: String,
    pub label: String,
    #[serde(default)]
    pub fields: Vec<SchemaField>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GlobalSchema {
    #[serde(default)]
    pub log: ObjectSchema,
    #[serde(default)]
    pub ntp: ObjectSchema,
    #[serde(default)]
    pub experimental: ObjectSchema,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DnsSchema {
    #[serde(default)]
    pub options: ObjectSchema,
    pub default_server_type: String,
    #[serde(default)]
    pub servers: Map<String, Value>,
    #[serde(default)]
    pub server_type_options: Vec<OutboundTypeOption>,
    pub default_rule_type: String,
    #[serde(default)]
    pub rules: Map<String, Value>,
    #[serde(default)]
    pub rule_type_options: Vec<OutboundTypeOption>,
    #[serde(default)]
    pub default_nested_rule_type: String,
    #[serde(default)]
    pub nested_rules: Map<String, Value>,
    #[serde(default)]
    pub nested_rule_type_options: Vec<OutboundTypeOption>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RouteSchema {
    #[serde(default)]
    pub options: ObjectSchema,
    pub default_rule_type: String,
    #[serde(default)]
    pub rules: Map<String, Value>,
    #[serde(default)]
    pub rule_type_options: Vec<OutboundTypeOption>,
    #[serde(default)]
    pub default_nested_rule_type: String,
    #[serde(default)]
    pub nested_rules: Map<String, Value>,
    #[serde(default)]
    pub nested_rule_type_options: Vec<OutboundTypeOption>,
    #[serde(default)]
    pub default_rule_set_type: String,
    #[serde(default)]
    pub rule_sets: Map<String, Value>,
    #[serde(default)]
    pub rule_set_type_options: Vec<OutboundTypeOption>,
    #[serde(default)]
    pub default_headless_rule_type: String,
    #[serde(default)]
    pub headless_rules: Map<String, Value>,
    #[serde(default)]
    pub headless_rule_type_options: Vec<OutboundTypeOption>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ObjectSchema {
    #[serde(default)]
    pub fields: Vec<SchemaField>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaField {
    pub key: String,
    pub label: String,
    pub kind: FieldKind,
    #[serde(default)]
    pub required: bool,
    #[serde(default)]
    pub placeholder: Option<String>,
    #[serde(default)]
    pub default_value: Option<Value>,
    #[serde(default)]
    pub options: Vec<String>,
    #[serde(default)]
    pub value_type: Option<FieldValueType>,
    #[serde(default)]
    pub allowed_values: Vec<String>,
    #[serde(default)]
    pub min: Option<f64>,
    #[serde(default)]
    pub max: Option<f64>,
    #[serde(default)]
    pub min_length: Option<usize>,
    #[serde(default)]
    pub max_length: Option<usize>,
    #[serde(default)]
    pub pattern: Option<String>,
    #[serde(default)]
    pub integer: bool,
    #[serde(default)]
    pub wide: bool,
    #[serde(default)]
    pub fields: Vec<SchemaField>,
    #[serde(default)]
    pub variants: Map<String, Value>,
    #[serde(default)]
    pub variant_options: Vec<String>,
    #[serde(default)]
    pub visible_when: Vec<FieldCondition>,
    #[serde(default, rename = "ref")]
    pub ref_path: Option<String>,
    #[serde(default)]
    pub flatten: bool,
    #[serde(default)]
    pub schema_namespace: Option<String>,
    #[serde(default)]
    pub default_type: Option<String>,
    #[serde(default)]
    pub type_options: Vec<OutboundTypeOption>,
    #[serde(default)]
    pub schemas: Map<String, Value>,
    #[serde(default)]
    pub requires_any: Vec<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum FieldKind {
    String,
    Number,
    Boolean,
    Select,
    StringOrNumber,
    StringList,
    NumberList,
    StringOrNumberList,
    Map,
    Object,
    ObjectList,
    ObjectMap,
    VariantObject,
    StringOrObject,
    StringOrObjectList,
    NumberOrObject,
    BooleanOrObject,
    TypedList,
    Json,
    Constraint,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FieldValueType {
    String,
    Number,
    #[serde(rename = "string-list")]
    StringList,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FieldCondition {
    pub key: String,
    pub op: ConditionOp,
    #[serde(default)]
    pub value: Option<Value>,
    #[serde(default)]
    pub values: Vec<Value>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ConditionOp {
    Empty,
    Present,
    Equals,
    NotEquals,
    OneOf,
    NotOneOf,
}

pub async fn load_schema(path: &Path) -> anyhow::Result<ComposerSchema> {
    let mut schema = if path.is_dir() {
        load_schema_directory(path).await?
    } else {
        read_json_file::<ComposerSchema>(path).await?
    };
    let base_path = if path.is_dir() {
        path.to_path_buf()
    } else {
        path.parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| PathBuf::from("."))
    };
    resolve_schema_refs(&mut schema, &base_path)?;
    if schema.outbound_type_options.is_empty() {
        schema.outbound_type_options = outbound_schemas(&schema)?
            .into_iter()
            .map(|(_, outbound)| OutboundTypeOption {
                value: outbound.r#type,
                label: outbound.label,
            })
            .collect();
    }
    if schema.inbound_type_options.is_empty() && !schema.inbounds.is_empty() {
        schema.inbound_type_options = inbound_schemas(&schema)?
            .into_iter()
            .map(|(_, inbound)| OutboundTypeOption {
                value: inbound.r#type,
                label: inbound.label,
            })
            .collect();
    }
    if schema.endpoint_type_options.is_empty() && !schema.endpoints.is_empty() {
        schema.endpoint_type_options = endpoint_schemas(&schema)?
            .into_iter()
            .map(|(_, endpoint)| OutboundTypeOption {
                value: endpoint.r#type,
                label: endpoint.label,
            })
            .collect();
    }
    if schema.certificate_provider_type_options.is_empty()
        && !schema.certificate_providers.is_empty()
    {
        schema.certificate_provider_type_options = certificate_provider_schemas(&schema)?
            .into_iter()
            .map(|(_, provider)| OutboundTypeOption {
                value: provider.r#type,
                label: provider.label,
            })
            .collect();
    }
    if schema.service_type_options.is_empty() && !schema.services.is_empty() {
        schema.service_type_options = service_schemas(&schema)?
            .into_iter()
            .map(|(_, service)| OutboundTypeOption {
                value: service.r#type,
                label: service.label,
            })
            .collect();
    }
    validate_schema_shape(&schema)?;
    Ok(schema)
}

fn resolve_schema_refs(schema: &mut ComposerSchema, base_path: &Path) -> anyhow::Result<()> {
    for (key, value) in &mut schema.outbounds {
        let mut outbound: OutboundSchema = serde_json::from_value(value.clone())
            .with_context(|| format!("invalid outbound schema {key}"))?;
        resolve_field_refs(&mut outbound.fields, base_path)?;
        *value = serde_json::to_value(outbound)?;
    }

    for (key, value) in &mut schema.inbounds {
        let mut inbound: OutboundSchema = serde_json::from_value(value.clone())
            .with_context(|| format!("invalid inbound schema {key}"))?;
        resolve_field_refs(&mut inbound.fields, base_path)?;
        *value = serde_json::to_value(inbound)?;
    }

    for (key, value) in &mut schema.endpoints {
        let mut endpoint: OutboundSchema = serde_json::from_value(value.clone())
            .with_context(|| format!("invalid endpoint schema {key}"))?;
        resolve_field_refs(&mut endpoint.fields, base_path)?;
        *value = serde_json::to_value(endpoint)?;
    }

    resolve_field_refs(&mut schema.http_client.fields, base_path)?;
    resolve_field_refs(&mut schema.certificate.fields, base_path)?;
    for (key, value) in &mut schema.certificate_providers {
        let mut provider: OutboundSchema = serde_json::from_value(value.clone())
            .with_context(|| format!("invalid certificate provider schema {key}"))?;
        resolve_field_refs(&mut provider.fields, base_path)?;
        *value = serde_json::to_value(provider)?;
    }
    for (key, value) in &mut schema.services {
        let mut service: OutboundSchema = serde_json::from_value(value.clone())
            .with_context(|| format!("invalid service schema {key}"))?;
        resolve_field_refs(&mut service.fields, base_path)?;
        *value = serde_json::to_value(service)?;
    }

    if let Some(dns) = &mut schema.dns {
        resolve_field_refs(&mut dns.options.fields, base_path)?;
        for (key, value) in &mut dns.servers {
            let mut server: OutboundSchema = serde_json::from_value(value.clone())
                .with_context(|| format!("invalid DNS server schema {key}"))?;
            resolve_field_refs(&mut server.fields, base_path)?;
            *value = serde_json::to_value(server)?;
        }
        for (key, value) in &mut dns.rules {
            let mut rule: OutboundSchema = serde_json::from_value(value.clone())
                .with_context(|| format!("invalid DNS rule schema {key}"))?;
            resolve_field_refs(&mut rule.fields, base_path)?;
            *value = serde_json::to_value(rule)?;
        }
        for (key, value) in &mut dns.nested_rules {
            let mut rule: OutboundSchema = serde_json::from_value(value.clone())
                .with_context(|| format!("invalid nested DNS rule schema {key}"))?;
            resolve_field_refs(&mut rule.fields, base_path)?;
            *value = serde_json::to_value(rule)?;
        }
    }

    if let Some(global) = &mut schema.global {
        resolve_field_refs(&mut global.log.fields, base_path)?;
        resolve_field_refs(&mut global.ntp.fields, base_path)?;
        resolve_field_refs(&mut global.experimental.fields, base_path)?;
    }

    if let Some(route) = &mut schema.route {
        resolve_field_refs(&mut route.options.fields, base_path)?;
        for (key, value) in &mut route.rules {
            let mut rule: OutboundSchema = serde_json::from_value(value.clone())
                .with_context(|| format!("invalid route rule schema {key}"))?;
            resolve_field_refs(&mut rule.fields, base_path)?;
            *value = serde_json::to_value(rule)?;
        }
        for (key, value) in &mut route.nested_rules {
            let mut rule: OutboundSchema = serde_json::from_value(value.clone())
                .with_context(|| format!("invalid nested route rule schema {key}"))?;
            resolve_field_refs(&mut rule.fields, base_path)?;
            *value = serde_json::to_value(rule)?;
        }
        for (key, value) in &mut route.rule_sets {
            let mut rule_set: OutboundSchema = serde_json::from_value(value.clone())
                .with_context(|| format!("invalid route rule-set schema {key}"))?;
            resolve_field_refs(&mut rule_set.fields, base_path)?;
            *value = serde_json::to_value(rule_set)?;
        }
        for (key, value) in &mut route.headless_rules {
            let mut rule: OutboundSchema = serde_json::from_value(value.clone())
                .with_context(|| format!("invalid route headless rule schema {key}"))?;
            resolve_field_refs(&mut rule.fields, base_path)?;
            *value = serde_json::to_value(rule)?;
        }
    }

    Ok(())
}

fn resolve_field_refs(fields: &mut Vec<SchemaField>, base_path: &Path) -> anyhow::Result<()> {
    for field in fields {
        if let Some(ref_path) = field.ref_path.clone() {
            let mut referenced = read_field_ref(base_path, &ref_path)?;
            resolve_field_refs(&mut referenced, base_path)?;
            field.fields = referenced;
        }
        resolve_field_refs(&mut field.fields, base_path)?;
        for (variant, value) in &mut field.variants {
            let mut variant_fields: Vec<SchemaField> = serde_json::from_value(value.clone())
                .with_context(|| format!("invalid variant field ref {}", variant))?;
            resolve_field_refs(&mut variant_fields, base_path)?;
            *value = serde_json::to_value(variant_fields)?;
        }
        for (key, value) in &mut field.schemas {
            let mut schema: OutboundSchema = serde_json::from_value(value.clone())
                .with_context(|| format!("invalid typed-list schema {key}"))?;
            resolve_field_refs(&mut schema.fields, base_path)?;
            *value = serde_json::to_value(schema)?;
        }
    }
    Ok(())
}

fn read_field_ref(base_path: &Path, ref_path: &str) -> anyhow::Result<Vec<SchemaField>> {
    let path = base_path.join(ref_path);
    let content = fs::read_to_string(&path)
        .with_context(|| format!("failed to read schema ref {}", path.display()))?;
    if let Ok(fields) = serde_json::from_str::<Vec<SchemaField>>(&content) {
        return Ok(fields);
    }
    let object = serde_json::from_str::<ObjectSchema>(&content)
        .with_context(|| format!("failed to parse schema ref {}", path.display()))?;
    Ok(object.fields)
}

async fn load_schema_directory(path: &Path) -> anyhow::Result<ComposerSchema> {
    let index_path = path.join("index.json");
    let mut schema = read_json_file::<ComposerSchema>(&index_path).await?;

    let outbounds_path = path.join("outbounds");
    if outbounds_path.exists() {
        for file_path in json_files(&outbounds_path).await? {
            let outbound = read_json_file::<OutboundSchema>(&file_path).await?;
            let key = outbound.r#type.clone();
            if schema
                .outbounds
                .insert(key.clone(), serde_json::to_value(outbound)?)
                .is_some()
            {
                bail!("duplicate outbound schema {key}");
            }
        }
    }

    let inbounds_path = path.join("inbounds");
    if inbounds_path.exists() {
        for file_path in json_files(&inbounds_path).await? {
            let inbound = read_json_file::<OutboundSchema>(&file_path).await?;
            let key = inbound.r#type.clone();
            if schema
                .inbounds
                .insert(key.clone(), serde_json::to_value(inbound)?)
                .is_some()
            {
                bail!("duplicate inbound schema {key}");
            }
        }
    }

    let endpoints_path = path.join("endpoints");
    if endpoints_path.exists() {
        for file_path in json_files(&endpoints_path).await? {
            let endpoint = read_json_file::<OutboundSchema>(&file_path).await?;
            let key = endpoint.r#type.clone();
            if schema
                .endpoints
                .insert(key.clone(), serde_json::to_value(endpoint)?)
                .is_some()
            {
                bail!("duplicate endpoint schema {key}");
            }
        }
    }

    let global_path = path.join("global");
    if global_path.exists() {
        schema.global = Some(load_global_schema_directory(&global_path).await?);
        let http_client_path = global_path.join("http-client.json");
        if http_client_path.exists() {
            schema.http_client = read_json_file::<ObjectSchema>(&http_client_path).await?;
        }
    }

    let certificate_path = path.join("certificate");
    if certificate_path.exists() {
        schema.certificate =
            read_json_file::<ObjectSchema>(&certificate_path.join("index.json")).await?;
        let providers_path = certificate_path.join("providers");
        if providers_path.exists() {
            for file_path in json_files(&providers_path).await? {
                let provider = read_json_file::<OutboundSchema>(&file_path).await?;
                let key = provider.r#type.clone();
                if schema
                    .certificate_providers
                    .insert(key.clone(), serde_json::to_value(provider)?)
                    .is_some()
                {
                    bail!("duplicate certificate provider schema {key}");
                }
            }
        }
    }

    let dns_path = path.join("dns");
    if dns_path.exists() {
        schema.dns = Some(load_dns_schema_directory(&dns_path).await?);
    }

    let services_path = path.join("services");
    if services_path.exists() {
        for file_path in json_files(&services_path).await? {
            let service = read_json_file::<OutboundSchema>(&file_path).await?;
            let key = service.r#type.clone();
            if schema
                .services
                .insert(key.clone(), serde_json::to_value(service)?)
                .is_some()
            {
                bail!("duplicate service schema {key}");
            }
        }
    }

    let route_path = path.join("route");
    if route_path.exists() {
        schema.route = Some(load_route_schema_directory(&route_path).await?);
    }

    Ok(schema)
}

async fn load_global_schema_directory(path: &Path) -> anyhow::Result<GlobalSchema> {
    Ok(GlobalSchema {
        log: read_json_file::<ObjectSchema>(&path.join("log.json")).await?,
        ntp: read_json_file::<ObjectSchema>(&path.join("ntp.json")).await?,
        experimental: read_json_file::<ObjectSchema>(&path.join("experimental.json")).await?,
    })
}

async fn load_dns_schema_directory(path: &Path) -> anyhow::Result<DnsSchema> {
    let mut dns = read_json_file::<DnsSchema>(&path.join("index.json")).await?;

    let servers_path = path.join("servers");
    if servers_path.exists() {
        for file_path in json_files(&servers_path).await? {
            let server = read_json_file::<OutboundSchema>(&file_path).await?;
            let key = server.r#type.clone();
            if dns
                .servers
                .insert(key.clone(), serde_json::to_value(server)?)
                .is_some()
            {
                bail!("duplicate DNS server schema {key}");
            }
        }
    }

    let rules_path = path.join("rules");
    if rules_path.exists() {
        for file_path in json_files(&rules_path).await? {
            let rule = read_json_file::<OutboundSchema>(&file_path).await?;
            let key = rule.r#type.clone();
            if dns
                .rules
                .insert(key.clone(), serde_json::to_value(rule)?)
                .is_some()
            {
                bail!("duplicate DNS rule schema {key}");
            }
        }
    }

    let nested_rules_path = path.join("nested-rules");
    if nested_rules_path.exists() {
        for file_path in json_files(&nested_rules_path).await? {
            let rule = read_json_file::<OutboundSchema>(&file_path).await?;
            let key = rule.r#type.clone();
            if dns
                .nested_rules
                .insert(key.clone(), serde_json::to_value(rule)?)
                .is_some()
            {
                bail!("duplicate nested DNS rule schema {key}");
            }
        }
    }

    Ok(dns)
}

async fn load_route_schema_directory(path: &Path) -> anyhow::Result<RouteSchema> {
    let mut route = read_json_file::<RouteSchema>(&path.join("index.json")).await?;

    let rules_path = path.join("rules");
    if rules_path.exists() {
        for file_path in json_files(&rules_path).await? {
            let rule = read_json_file::<OutboundSchema>(&file_path).await?;
            let key = rule.r#type.clone();
            if route
                .rules
                .insert(key.clone(), serde_json::to_value(rule)?)
                .is_some()
            {
                bail!("duplicate route rule schema {key}");
            }
        }
    }

    let nested_rules_path = path.join("nested-rules");
    if nested_rules_path.exists() {
        for file_path in json_files(&nested_rules_path).await? {
            let rule = read_json_file::<OutboundSchema>(&file_path).await?;
            let key = rule.r#type.clone();
            if route
                .nested_rules
                .insert(key.clone(), serde_json::to_value(rule)?)
                .is_some()
            {
                bail!("duplicate nested route rule schema {key}");
            }
        }
    }

    let rule_sets_path = path.join("rule-sets");
    if rule_sets_path.exists() {
        for file_path in json_files(&rule_sets_path).await? {
            let rule_set = read_json_file::<OutboundSchema>(&file_path).await?;
            let key = rule_set.r#type.clone();
            if route
                .rule_sets
                .insert(key.clone(), serde_json::to_value(rule_set)?)
                .is_some()
            {
                bail!("duplicate route rule-set schema {key}");
            }
        }
    }

    let headless_rules_path = path.join("headless-rules");
    if headless_rules_path.exists() {
        for file_path in json_files(&headless_rules_path).await? {
            let rule = read_json_file::<OutboundSchema>(&file_path).await?;
            let key = rule.r#type.clone();
            if route
                .headless_rules
                .insert(key.clone(), serde_json::to_value(rule)?)
                .is_some()
            {
                bail!("duplicate route headless rule schema {key}");
            }
        }
    }

    Ok(route)
}

async fn json_files(path: &Path) -> anyhow::Result<Vec<PathBuf>> {
    let mut entries = tokio::fs::read_dir(path)
        .await
        .with_context(|| format!("failed to read schema directory {}", path.display()))?;
    let mut files = Vec::new();
    while let Some(entry) = entries.next_entry().await? {
        let file_path = entry.path();
        if file_path.extension().and_then(|value| value.to_str()) == Some("json") {
            files.push(file_path);
        }
    }
    files.sort();
    Ok(files)
}

async fn read_json_file<T>(path: &Path) -> anyhow::Result<T>
where
    T: for<'de> Deserialize<'de>,
{
    let content = tokio::fs::read_to_string(path)
        .await
        .with_context(|| format!("failed to read schema {}", path.display()))?;
    serde_json::from_str(&content)
        .with_context(|| format!("failed to parse schema {}", path.display()))
}

pub fn validate_composer_state(
    schema: &ComposerSchema,
    state: &ComposerState,
) -> anyhow::Result<()> {
    validate_global_config(schema, state)?;
    validate_http_clients(schema, state)?;
    validate_certificate_config(schema, state)?;
    validate_services_config(schema, state)?;
    let outbounds = outbound_schemas(schema)?;
    let inbounds = inbound_schemas(schema)?;
    let endpoints = endpoint_schemas(schema)?;
    for source in &state.proxy_sources {
        if source.kind != ProxySourceKind::Manual {
            continue;
        }
        for (index, node) in source.nodes.iter().enumerate() {
            validate_outbound_node(
                schema,
                &outbounds,
                node,
                &format!("proxy_sources[{}].nodes[{}]", source.id, index),
            )?;
        }
    }
    if !state.inbounds.is_empty() {
        if inbounds.is_empty() {
            bail!("state has inbounds but schema has no inbound definitions");
        }
        for (index, inbound) in state.inbounds.iter().enumerate() {
            validate_typed_node(
                schema,
                &inbounds,
                inbound,
                &format!("inbounds[{index}]"),
                "type",
            )?;
        }
    }
    if !state.endpoints.is_empty() {
        if endpoints.is_empty() {
            bail!("state has endpoints but schema has no endpoint definitions");
        }
        for (index, endpoint) in state.endpoints.iter().enumerate() {
            validate_typed_node(
                schema,
                &endpoints,
                endpoint,
                &format!("endpoints[{index}]"),
                "type",
            )?;
        }
    }
    if state.dns.enabled {
        validate_dns_config(schema, state)?;
    }
    validate_route_config(schema, state)?;
    if !state.extra_route_rules.is_empty() {
        validate_extra_route_rules(schema, state)?;
    }
    Ok(())
}

fn validate_schema_shape(schema: &ComposerSchema) -> anyhow::Result<()> {
    if schema.schema_version == 0 {
        bail!("schema_version must be greater than 0");
    }
    if schema.outbounds.is_empty() {
        bail!("schema outbounds cannot be empty");
    }
    if !schema.outbounds.contains_key(&schema.default_outbound_type) {
        bail!(
            "default_outbound_type {} is not present in outbounds",
            schema.default_outbound_type
        );
    }
    let outbounds = outbound_schemas(schema)?;
    for (key, outbound) in outbounds {
        if outbound.r#type != key {
            bail!(
                "outbound schema key {} does not match type {}",
                key,
                outbound.r#type
            );
        }
        validate_fields_shape(&outbound.fields, &format!("outbounds.{key}"))?;
    }
    if !schema.inbounds.is_empty() {
        if schema.default_inbound_type.is_empty() {
            bail!("default_inbound_type is required when inbounds are defined");
        }
        validate_typed_schema_map(&schema.inbounds, &schema.default_inbound_type, "inbounds")?;
    } else if !schema.default_inbound_type.is_empty() {
        bail!("default_inbound_type is set but no inbound schemas are defined");
    }
    if !schema.endpoints.is_empty() {
        if schema.default_endpoint_type.is_empty() {
            bail!("default_endpoint_type is required when endpoints are defined");
        }
        validate_typed_schema_map(
            &schema.endpoints,
            &schema.default_endpoint_type,
            "endpoints",
        )?;
    } else if !schema.default_endpoint_type.is_empty() {
        bail!("default_endpoint_type is set but no endpoint schemas are defined");
    }
    validate_fields_shape(&schema.http_client.fields, "http_client")?;
    validate_fields_shape(&schema.certificate.fields, "certificate")?;
    if !schema.certificate_providers.is_empty() {
        validate_typed_schema_map(
            &schema.certificate_providers,
            &schema.default_certificate_provider_type,
            "certificate_providers",
        )?;
    } else if !schema.default_certificate_provider_type.is_empty() {
        bail!(
            "default_certificate_provider_type is set but no certificate provider schemas are defined"
        );
    }
    if !schema.services.is_empty() {
        validate_typed_schema_map(&schema.services, &schema.default_service_type, "services")?;
    } else if !schema.default_service_type.is_empty() {
        bail!("default_service_type is set but no service schemas are defined");
    }
    if let Some(dns) = &schema.dns {
        validate_fields_shape(&dns.options.fields, "dns.options")?;
        validate_typed_schema_map(&dns.servers, &dns.default_server_type, "dns.servers")?;
        validate_typed_schema_map(&dns.rules, &dns.default_rule_type, "dns.rules")?;
        if !dns.nested_rules.is_empty() {
            validate_typed_schema_map(
                &dns.nested_rules,
                &dns.default_nested_rule_type,
                "dns.nested_rules",
            )?;
        }
    }
    if let Some(global) = &schema.global {
        validate_fields_shape(&global.log.fields, "global.log")?;
        validate_fields_shape(&global.ntp.fields, "global.ntp")?;
        validate_fields_shape(&global.experimental.fields, "global.experimental")?;
    }
    if let Some(route) = &schema.route {
        validate_fields_shape(&route.options.fields, "route.options")?;
        validate_typed_schema_map(&route.rules, &route.default_rule_type, "route.rules")?;
        if !route.nested_rules.is_empty() {
            validate_typed_schema_map(
                &route.nested_rules,
                &route.default_nested_rule_type,
                "route.nested_rules",
            )?;
        }
        if !route.rule_sets.is_empty() {
            validate_typed_schema_map(
                &route.rule_sets,
                &route.default_rule_set_type,
                "route.rule_sets",
            )?;
        }
        if !route.headless_rules.is_empty() {
            validate_typed_schema_map(
                &route.headless_rules,
                &route.default_headless_rule_type,
                "route.headless_rules",
            )?;
        }
    }
    Ok(())
}

fn validate_typed_schema_map(
    values: &Map<String, Value>,
    default_type: &str,
    path: &str,
) -> anyhow::Result<()> {
    if values.is_empty() {
        bail!("{path} cannot be empty");
    }
    if !values.contains_key(default_type) {
        bail!("{path} missing default type {default_type}");
    }
    for (key, value) in values {
        let schema: OutboundSchema = serde_json::from_value(value.clone())
            .with_context(|| format!("invalid schema {path}.{key}"))?;
        if schema.r#type != *key {
            bail!("{path}.{key} schema type mismatch: {}", schema.r#type);
        }
        validate_fields_shape(&schema.fields, &format!("{path}.{key}"))?;
    }
    Ok(())
}

fn validate_global_config(schema: &ComposerSchema, state: &ComposerState) -> anyhow::Result<()> {
    let log = state
        .global
        .log
        .as_object()
        .ok_or_else(|| anyhow::anyhow!("global.log must be an object"))?;
    let ntp = state
        .global
        .ntp
        .as_object()
        .ok_or_else(|| anyhow::anyhow!("global.ntp must be an object"))?;
    let experimental = state
        .global
        .experimental
        .as_object()
        .ok_or_else(|| anyhow::anyhow!("global.experimental must be an object"))?;
    if log.is_empty() && ntp.is_empty() && experimental.is_empty() && schema.global.is_none() {
        return Ok(());
    }
    let global_schema = schema.global.as_ref().ok_or_else(|| {
        anyhow::anyhow!("global config is present but schema has no global section")
    })?;
    validate_object_against_fields(
        schema,
        log,
        &global_schema.log.fields,
        "global.log",
        &[],
        true,
    )?;
    validate_object_against_fields(
        schema,
        ntp,
        &global_schema.ntp.fields,
        "global.ntp",
        &[],
        true,
    )?;
    validate_object_against_fields(
        schema,
        experimental,
        &global_schema.experimental.fields,
        "global.experimental",
        &[],
        true,
    )?;
    Ok(())
}

fn validate_http_clients(schema: &ComposerSchema, state: &ComposerState) -> anyhow::Result<()> {
    if state.http_clients.is_empty() {
        return Ok(());
    }
    if schema.http_client.fields.is_empty() {
        bail!("state has http_clients but schema has no http_client definition");
    }
    for (index, client) in state.http_clients.iter().enumerate() {
        let object = client
            .as_object()
            .ok_or_else(|| anyhow::anyhow!("http_clients[{index}] must be an object"))?;
        validate_object_against_fields(
            schema,
            object,
            &schema.http_client.fields,
            &format!("http_clients[{index}]"),
            &[],
            true,
        )?;
    }
    Ok(())
}

fn validate_certificate_config(
    schema: &ComposerSchema,
    state: &ComposerState,
) -> anyhow::Result<()> {
    let certificate = state
        .certificate
        .as_object()
        .ok_or_else(|| anyhow::anyhow!("certificate must be an object"))?;
    if !certificate.is_empty() {
        if schema.certificate.fields.is_empty() {
            bail!("state has certificate but schema has no certificate definition");
        }
        validate_object_against_fields(
            schema,
            certificate,
            &schema.certificate.fields,
            "certificate",
            &[],
            true,
        )?;
    }
    if state.certificate_providers.is_empty() {
        return Ok(());
    }
    let providers = certificate_provider_schemas(schema)?;
    if providers.is_empty() {
        bail!("state has certificate_providers but schema has no provider definitions");
    }
    for (index, provider) in state.certificate_providers.iter().enumerate() {
        validate_typed_node(
            schema,
            &providers,
            provider,
            &format!("certificate_providers[{index}]"),
            "type",
        )?;
    }
    Ok(())
}

fn validate_services_config(schema: &ComposerSchema, state: &ComposerState) -> anyhow::Result<()> {
    if state.services.is_empty() {
        return Ok(());
    }
    let services = service_schemas(schema)?;
    if services.is_empty() {
        bail!("state has services but schema has no service definitions");
    }
    for (index, service) in state.services.iter().enumerate() {
        validate_typed_node(
            schema,
            &services,
            service,
            &format!("services[{index}]"),
            "type",
        )?;
    }
    Ok(())
}

fn validate_dns_config(schema: &ComposerSchema, state: &ComposerState) -> anyhow::Result<()> {
    let dns_schema = schema
        .dns
        .as_ref()
        .ok_or_else(|| anyhow::anyhow!("DNS is enabled but schema has no dns section"))?;
    let options = state
        .dns
        .options
        .as_object()
        .ok_or_else(|| anyhow::anyhow!("dns.options must be an object"))?;
    validate_object_against_fields(
        schema,
        options,
        &dns_schema.options.fields,
        "dns.options",
        &[],
        true,
    )?;
    let servers = typed_schemas(&dns_schema.servers, "dns.servers")?;
    for (index, server) in state.dns.servers.iter().enumerate() {
        validate_typed_node(
            schema,
            &servers,
            server,
            &format!("dns.servers[{index}]"),
            "type",
        )?;
    }
    let rules = typed_schemas(&dns_schema.rules, "dns.rules")?;
    for (index, rule) in state.dns.rules.iter().enumerate() {
        validate_typed_node(schema, &rules, rule, &format!("dns.rules[{index}]"), "type")?;
    }
    Ok(())
}

fn validate_extra_route_rules(
    schema: &ComposerSchema,
    state: &ComposerState,
) -> anyhow::Result<()> {
    let route_schema = schema.route.as_ref().ok_or_else(|| {
        anyhow::anyhow!("extra route rules are configured but schema has no route section")
    })?;
    let rules = typed_schemas(&route_schema.rules, "route.rules")?;
    for (index, rule) in state.extra_route_rules.iter().enumerate() {
        validate_typed_node(
            schema,
            &rules,
            rule,
            &format!("extra_route_rules[{index}]"),
            "type",
        )?;
    }
    Ok(())
}

fn validate_route_config(schema: &ComposerSchema, state: &ComposerState) -> anyhow::Result<()> {
    let empty_options = state
        .route
        .options
        .as_object()
        .map(|object| object.is_empty())
        .unwrap_or(false);
    if empty_options && state.route.rule_sets.is_empty() && schema.route.is_none() {
        return Ok(());
    }
    let route_schema = schema.route.as_ref().ok_or_else(|| {
        anyhow::anyhow!("route config is present but schema has no route section")
    })?;
    let options = state
        .route
        .options
        .as_object()
        .ok_or_else(|| anyhow::anyhow!("route.options must be an object"))?;
    validate_object_against_fields(
        schema,
        options,
        &route_schema.options.fields,
        "route.options",
        &[],
        true,
    )?;
    if !state.route.rule_sets.is_empty() {
        let rule_sets = typed_schemas(&route_schema.rule_sets, "route.rule_sets")?;
        for (index, rule_set) in state.route.rule_sets.iter().enumerate() {
            validate_typed_node(
                schema,
                &rule_sets,
                rule_set,
                &format!("route.rule_sets[{index}]"),
                "type",
            )?;
        }
    }
    Ok(())
}

fn typed_schemas(
    values: &Map<String, Value>,
    path: &str,
) -> anyhow::Result<Vec<(String, OutboundSchema)>> {
    values
        .iter()
        .map(|(key, value)| {
            let schema: OutboundSchema = serde_json::from_value(value.clone())
                .with_context(|| format!("invalid schema {path}.{key}"))?;
            Ok((key.clone(), schema))
        })
        .collect()
}

fn validate_typed_node(
    root_schema: &ComposerSchema,
    schemas: &[(String, OutboundSchema)],
    node: &Value,
    path: &str,
    type_key: &str,
) -> anyhow::Result<()> {
    let object = node
        .as_object()
        .ok_or_else(|| anyhow::anyhow!("{path} must be an object"))?;
    let node_type = object
        .get(type_key)
        .and_then(Value::as_str)
        .ok_or_else(|| anyhow::anyhow!("{path}.{type_key} is required"))?;
    let Some(schema) = schemas
        .iter()
        .find_map(|(key, schema)| (key == node_type).then_some(schema))
    else {
        return Ok(());
    };
    validate_object_against_fields(root_schema, object, &schema.fields, path, &[type_key], true)?;
    Ok(())
}

fn outbound_schemas(schema: &ComposerSchema) -> anyhow::Result<Vec<(String, OutboundSchema)>> {
    schema
        .outbounds
        .iter()
        .map(|(key, value)| {
            let outbound: OutboundSchema = serde_json::from_value(value.clone())
                .with_context(|| format!("invalid outbound schema {key}"))?;
            Ok((key.clone(), outbound))
        })
        .collect()
}

fn inbound_schemas(schema: &ComposerSchema) -> anyhow::Result<Vec<(String, OutboundSchema)>> {
    schema
        .inbounds
        .iter()
        .map(|(key, value)| {
            let inbound: OutboundSchema = serde_json::from_value(value.clone())
                .with_context(|| format!("invalid inbound schema {key}"))?;
            Ok((key.clone(), inbound))
        })
        .collect()
}

fn endpoint_schemas(schema: &ComposerSchema) -> anyhow::Result<Vec<(String, OutboundSchema)>> {
    schema
        .endpoints
        .iter()
        .map(|(key, value)| {
            let endpoint: OutboundSchema = serde_json::from_value(value.clone())
                .with_context(|| format!("invalid endpoint schema {key}"))?;
            Ok((key.clone(), endpoint))
        })
        .collect()
}

fn certificate_provider_schemas(
    schema: &ComposerSchema,
) -> anyhow::Result<Vec<(String, OutboundSchema)>> {
    schema
        .certificate_providers
        .iter()
        .map(|(key, value)| {
            let provider: OutboundSchema = serde_json::from_value(value.clone())
                .with_context(|| format!("invalid certificate provider schema {key}"))?;
            Ok((key.clone(), provider))
        })
        .collect()
}

fn service_schemas(schema: &ComposerSchema) -> anyhow::Result<Vec<(String, OutboundSchema)>> {
    schema
        .services
        .iter()
        .map(|(key, value)| {
            let service: OutboundSchema = serde_json::from_value(value.clone())
                .with_context(|| format!("invalid service schema {key}"))?;
            Ok((key.clone(), service))
        })
        .collect()
}

fn typed_list_schemas(
    root_schema: &ComposerSchema,
    field: &SchemaField,
    path: &str,
) -> anyhow::Result<Vec<(String, OutboundSchema)>> {
    if !field.schemas.is_empty() {
        return typed_schemas(&field.schemas, &format!("{path}.schemas"));
    }
    let namespace = field
        .schema_namespace
        .as_deref()
        .ok_or_else(|| anyhow::anyhow!("{path} has no schema namespace"))?;
    match namespace {
        "dns.rules" => {
            let dns = root_schema
                .dns
                .as_ref()
                .ok_or_else(|| anyhow::anyhow!("{path} references dns.rules without dns schema"))?;
            typed_schemas(&dns.rules, "dns.rules")
        }
        "dns.nested_rules" => {
            let dns = root_schema.dns.as_ref().ok_or_else(|| {
                anyhow::anyhow!("{path} references dns.nested_rules without dns schema")
            })?;
            typed_schemas(&dns.nested_rules, "dns.nested_rules")
        }
        "route.rules" => {
            let route = root_schema.route.as_ref().ok_or_else(|| {
                anyhow::anyhow!("{path} references route.rules without route schema")
            })?;
            typed_schemas(&route.rules, "route.rules")
        }
        "route.nested_rules" => {
            let route = root_schema.route.as_ref().ok_or_else(|| {
                anyhow::anyhow!("{path} references route.nested_rules without route schema")
            })?;
            typed_schemas(&route.nested_rules, "route.nested_rules")
        }
        "route.rule_sets" => {
            let route = root_schema.route.as_ref().ok_or_else(|| {
                anyhow::anyhow!("{path} references route.rule_sets without route schema")
            })?;
            typed_schemas(&route.rule_sets, "route.rule_sets")
        }
        "route.headless_rules" => {
            let route = root_schema.route.as_ref().ok_or_else(|| {
                anyhow::anyhow!("{path} references route.headless_rules without route schema")
            })?;
            typed_schemas(&route.headless_rules, "route.headless_rules")
        }
        other => Err(anyhow::anyhow!(
            "{path} references unsupported schema namespace {other}"
        )),
    }
}

fn validate_fields_shape(fields: &[SchemaField], path: &str) -> anyhow::Result<()> {
    for field in fields {
        if field.key.is_empty() {
            bail!("{path} contains an empty field key");
        }
        if let Some(pattern) = &field.pattern {
            Regex::new(pattern)
                .with_context(|| format!("{path}.{} has invalid pattern", field.key))?;
        }
        match field.kind {
            FieldKind::Object
            | FieldKind::ObjectList
            | FieldKind::ObjectMap
            | FieldKind::StringOrObject
            | FieldKind::StringOrObjectList
            | FieldKind::NumberOrObject
            | FieldKind::BooleanOrObject => {
                validate_fields_shape(&field.fields, &format!("{path}.{}", field.key))?;
            }
            FieldKind::TypedList => {
                if field.schema_namespace.is_none() && field.schemas.is_empty() {
                    bail!(
                        "{path}.{} typed-list missing schemaNamespace or schemas",
                        field.key
                    );
                }
                if !field.schemas.is_empty() {
                    let default_type = field.default_type.as_deref().unwrap_or("");
                    validate_typed_schema_map(
                        &field.schemas,
                        default_type,
                        &format!("{path}.{}.schemas", field.key),
                    )?;
                }
            }
            FieldKind::VariantObject => {
                for option in &field.variant_options {
                    let value = field.variants.get(option).ok_or_else(|| {
                        anyhow::anyhow!(
                            "{path}.{} missing variant definition for {}",
                            field.key,
                            option
                        )
                    })?;
                    let variant_fields: Vec<SchemaField> = serde_json::from_value(value.clone())
                        .with_context(|| {
                            format!("{path}.{} variant {} is invalid", field.key, option)
                        })?;
                    validate_fields_shape(
                        &variant_fields,
                        &format!("{path}.{}.{}", field.key, option),
                    )?;
                }
            }
            FieldKind::Constraint => {
                if field.requires_any.is_empty() {
                    bail!("{path}.{} constraint has no requiresAny fields", field.key);
                }
            }
            _ => {}
        }
    }
    Ok(())
}

fn validate_outbound_node(
    root_schema: &ComposerSchema,
    outbounds: &[(String, OutboundSchema)],
    node: &Value,
    path: &str,
) -> anyhow::Result<()> {
    let object = node
        .as_object()
        .ok_or_else(|| anyhow::anyhow!("{path} must be an object"))?;
    let outbound_type = object
        .get("type")
        .and_then(Value::as_str)
        .ok_or_else(|| anyhow::anyhow!("{path}.type is required"))?;
    let Some(outbound) = outbounds
        .iter()
        .find_map(|(key, schema)| (key == outbound_type).then_some(schema))
    else {
        return Ok(());
    };
    validate_object_against_fields(root_schema, object, &outbound.fields, path, &["type"], true)?;
    Ok(())
}

fn validate_object_against_fields(
    root_schema: &ComposerSchema,
    object: &Map<String, Value>,
    fields: &[SchemaField],
    path: &str,
    _base_keys: &[&str],
    _check_unknown: bool,
) -> anyhow::Result<()> {
    for field in fields {
        if field.flatten || field.key == "_dialer" {
            if !is_field_visible(field, object) {
                continue;
            }
            validate_object_against_fields(root_schema, object, &field.fields, path, &[], false)?;
            continue;
        }

        if field.kind == FieldKind::Constraint {
            continue;
        }

        let raw = object.get(&field.key);
        let visible = is_field_visible(field, object);
        if !visible {
            continue;
        }

        let Some(raw) = raw else {
            continue;
        };
        if !has_field_content(Some(raw), field.kind) {
            continue;
        }
        validate_value(root_schema, raw, field, &format!("{path}.{}", field.key))?;
    }

    Ok(())
}

fn validate_value(
    root_schema: &ComposerSchema,
    value: &Value,
    field: &SchemaField,
    path: &str,
) -> anyhow::Result<()> {
    match field.kind {
        FieldKind::String
        | FieldKind::Number
        | FieldKind::Boolean
        | FieldKind::Select
        | FieldKind::StringOrNumber
        | FieldKind::StringList
        | FieldKind::NumberList
        | FieldKind::StringOrNumberList
        | FieldKind::Map
        | FieldKind::Json
        | FieldKind::Constraint => {}
        FieldKind::ObjectList => {
            if let Some(nested) = value.as_object() {
                validate_object_against_fields(
                    root_schema,
                    nested,
                    &field.fields,
                    path,
                    &[],
                    true,
                )?;
            } else if let Some(items) = value.as_array() {
                for (index, item) in items.iter().enumerate() {
                    let Some(nested) = item.as_object() else {
                        continue;
                    };
                    validate_object_against_fields(
                        root_schema,
                        nested,
                        &field.fields,
                        &format!("{path}[{index}]"),
                        &[],
                        true,
                    )?;
                }
            }
        }
        FieldKind::ObjectMap => {
            if let Some(items) = value.as_object() {
                for (key, item) in items {
                    let Some(nested) = item.as_object() else {
                        continue;
                    };
                    validate_object_against_fields(
                        root_schema,
                        nested,
                        &field.fields,
                        &format!("{path}.{key}"),
                        &[],
                        true,
                    )?;
                }
            }
        }
        FieldKind::Object => {
            if let Some(nested) = value.as_object() {
                validate_object_against_fields(
                    root_schema,
                    nested,
                    &field.fields,
                    path,
                    &[],
                    true,
                )?;
            }
        }
        FieldKind::StringOrObject => {
            if let Some(nested) = value.as_object() {
                validate_object_against_fields(
                    root_schema,
                    nested,
                    &field.fields,
                    path,
                    &[],
                    true,
                )?;
            }
        }
        FieldKind::StringOrObjectList => {
            validate_string_or_object_list(root_schema, value, field, path)?;
        }
        FieldKind::NumberOrObject => {
            if let Some(nested) = value.as_object() {
                validate_object_against_fields(
                    root_schema,
                    nested,
                    &field.fields,
                    path,
                    &[],
                    true,
                )?;
            }
        }
        FieldKind::BooleanOrObject => {
            if let Some(nested) = value.as_object() {
                validate_object_against_fields(
                    root_schema,
                    nested,
                    &field.fields,
                    path,
                    &[],
                    true,
                )?;
            }
        }
        FieldKind::TypedList => {
            if let Some(items) = value.as_array() {
                if let Ok(item_schemas) = typed_list_schemas(root_schema, field, path) {
                    for (index, item) in items.iter().enumerate() {
                        if item
                            .as_object()
                            .and_then(|object| object.get("type"))
                            .and_then(Value::as_str)
                            .is_none()
                        {
                            continue;
                        }
                        validate_typed_node(
                            root_schema,
                            &item_schemas,
                            item,
                            &format!("{path}[{index}]"),
                            "type",
                        )?;
                    }
                }
            }
        }
        FieldKind::VariantObject => {
            if let Some(nested) = value.as_object() {
                let Some(variant_type) = nested.get("type").and_then(Value::as_str) else {
                    return Ok(());
                };
                let Some(variant_value) = field.variants.get(variant_type) else {
                    return Ok(());
                };
                let variant_fields: Vec<SchemaField> =
                    serde_json::from_value(variant_value.clone())?;
                validate_object_against_fields(
                    root_schema,
                    nested,
                    &variant_fields,
                    path,
                    &["type"],
                    true,
                )?;
            }
        }
    }
    Ok(())
}

fn validate_string_or_object_list(
    root_schema: &ComposerSchema,
    value: &Value,
    field: &SchemaField,
    path: &str,
) -> anyhow::Result<()> {
    if value.is_string() || value.is_object() {
        return validate_string_or_object_list_item(root_schema, value, field, path);
    }
    let Some(items) = value.as_array() else {
        return Ok(());
    };
    for (index, item) in items.iter().enumerate() {
        validate_string_or_object_list_item(root_schema, item, field, &format!("{path}[{index}]"))?;
    }
    Ok(())
}

fn validate_string_or_object_list_item(
    root_schema: &ComposerSchema,
    value: &Value,
    field: &SchemaField,
    path: &str,
) -> anyhow::Result<()> {
    if let Some(value) = value.as_str() {
        let _ = (value, field, path);
        return Ok(());
    }
    let Some(nested) = value.as_object() else {
        return Ok(());
    };
    validate_object_against_fields(root_schema, nested, &field.fields, path, &[], true)
}

fn is_field_visible(field: &SchemaField, object: &Map<String, Value>) -> bool {
    field
        .visible_when
        .iter()
        .all(|condition| condition_matches(object, condition))
}

fn condition_matches(object: &Map<String, Value>, condition: &FieldCondition) -> bool {
    let raw = condition_value(object, &condition.key);
    match condition.op {
        ConditionOp::Empty => !has_any_content(raw),
        ConditionOp::Present => has_any_content(raw),
        ConditionOp::Equals => raw
            .zip(condition.value.as_ref())
            .is_some_and(|(left, right)| value_eq(left, right)),
        ConditionOp::NotEquals => !raw
            .zip(condition.value.as_ref())
            .is_some_and(|(left, right)| value_eq(left, right)),
        ConditionOp::OneOf => {
            raw.is_some_and(|left| condition.values.iter().any(|right| value_eq(left, right)))
        }
        ConditionOp::NotOneOf => {
            !raw.is_some_and(|left| condition.values.iter().any(|right| value_eq(left, right)))
        }
    }
}

fn condition_value<'a>(object: &'a Map<String, Value>, key: &str) -> Option<&'a Value> {
    let mut parts = key.split('.');
    let first = parts.next()?;
    let mut current = object.get(first)?;
    for part in parts {
        current = current.as_object()?.get(part)?;
    }
    Some(current)
}

fn has_field_content(value: Option<&Value>, kind: FieldKind) -> bool {
    let Some(value) = value else {
        return false;
    };
    match kind {
        FieldKind::Boolean => value.as_bool() == Some(true),
        FieldKind::Number => value.is_number(),
        FieldKind::StringOrNumber => {
            value.is_number()
                || value
                    .as_str()
                    .map(|item| !item.trim().is_empty())
                    .unwrap_or(false)
        }
        FieldKind::String | FieldKind::Select => value
            .as_str()
            .map(|item| !item.trim().is_empty())
            .unwrap_or(true),
        FieldKind::StringList | FieldKind::NumberList | FieldKind::StringOrNumberList => {
            match value {
                Value::Array(items) => !items.is_empty(),
                Value::String(item) => !item.trim().is_empty(),
                Value::Number(_) => true,
                _ => false,
            }
        }
        FieldKind::TypedList => value.as_array().is_some_and(|items| !items.is_empty()),
        FieldKind::ObjectList => value
            .as_array()
            .map(|items| !items.is_empty())
            .unwrap_or_else(|| value.is_object()),
        FieldKind::Map | FieldKind::ObjectMap => {
            value.as_object().is_some_and(|object| !object.is_empty())
        }
        FieldKind::Object | FieldKind::VariantObject => value.is_object(),
        FieldKind::StringOrObject => value
            .as_str()
            .map(|item| !item.trim().is_empty())
            .unwrap_or_else(|| value.is_object()),
        FieldKind::StringOrObjectList => match value {
            Value::Array(items) => !items.is_empty(),
            Value::String(item) => !item.trim().is_empty(),
            Value::Object(_) => true,
            _ => false,
        },
        FieldKind::NumberOrObject => value.is_number() || value.is_object(),
        FieldKind::BooleanOrObject => value.as_bool() == Some(true) || value.is_object(),
        FieldKind::Json => !value.is_null(),
        FieldKind::Constraint => false,
    }
}

fn has_any_content(value: Option<&Value>) -> bool {
    let Some(value) = value else {
        return false;
    };
    match value {
        Value::Null => false,
        Value::Bool(value) => *value,
        Value::String(value) => !value.trim().is_empty(),
        Value::Array(value) => !value.is_empty(),
        Value::Object(_) => true,
        Value::Number(_) => true,
    }
}

fn value_eq(left: &Value, right: &Value) -> bool {
    left == right || render_scalar(left) == render_scalar(right)
}

fn render_scalar(value: &Value) -> String {
    match value {
        Value::String(value) => value.clone(),
        Value::Number(value) => value.to_string(),
        Value::Bool(value) => value.to_string(),
        other => other.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn empty_schema() -> ComposerSchema {
        serde_json::from_value(json!({
            "schema_version": 1,
            "default_outbound_type": "",
            "outbounds": {}
        }))
        .expect("test schema should deserialize")
    }

    fn field(value: Value) -> SchemaField {
        serde_json::from_value(value).expect("test field should deserialize")
    }

    #[test]
    fn integer_number_accepts_fractional_values() {
        let schema = empty_schema();
        let field = field(json!({
            "key": "port",
            "label": "Port",
            "kind": "number",
            "integer": true
        }));

        validate_value(&schema, &json!(443), &field, "port").expect("integer should validate");
        validate_value(&schema, &json!(443.5), &field, "port")
            .expect("integer is a UI hint, not a save blocker");
    }

    #[test]
    fn integer_number_list_accepts_fractional_values() {
        let schema = empty_schema();
        let field = field(json!({
            "key": "ports",
            "label": "Ports",
            "kind": "number-list",
            "integer": true
        }));

        validate_value(&schema, &json!([80, 443]), &field, "ports")
            .expect("integer list should validate");
        validate_value(&schema, &json!([80, 443.5]), &field, "ports")
            .expect("integer is a UI hint, not a save blocker");
    }

    #[test]
    fn nested_visible_when_reads_dot_paths() {
        let field = field(json!({
            "key": "reality",
            "label": "Reality",
            "kind": "object",
            "visibleWhen": [
                {
                    "key": "ech.enabled",
                    "op": "not-equals",
                    "value": true
                }
            ]
        }));
        let visible_object = json!({
            "ech": {
                "enabled": false
            }
        });
        let hidden_object = json!({
            "ech": {
                "enabled": true
            }
        });

        assert!(is_field_visible(
            &field,
            visible_object.as_object().expect("object")
        ));
        assert!(!is_field_visible(
            &field,
            hidden_object.as_object().expect("object")
        ));
    }

    #[test]
    fn string_constraints_are_non_blocking() {
        let schema = empty_schema();
        let field = field(json!({
            "key": "realm_id",
            "label": "Realm ID",
            "kind": "string",
            "minLength": 1,
            "maxLength": 64,
            "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$"
        }));

        validate_value(&schema, &json!("realm-1"), &field, "realm_id")
            .expect("matching string should validate");
        validate_value(&schema, &json!(""), &field, "realm_id")
            .expect("length is a UI hint, not a save blocker");
        validate_value(&schema, &json!("-realm"), &field, "realm_id")
            .expect("pattern is a UI hint, not a save blocker");
        validate_value(&schema, &json!("a".repeat(65)), &field, "realm_id")
            .expect("length is a UI hint, not a save blocker");
    }

    #[test]
    fn string_list_constraints_are_non_blocking() {
        let schema = empty_schema();
        let field = field(json!({
            "key": "short_id",
            "label": "Short ID",
            "kind": "string-list",
            "maxLength": 16,
            "pattern": "^([0-9A-Fa-f]{2}){0,8}$"
        }));

        validate_value(
            &schema,
            &json!(["", "0123456789abcdef"]),
            &field,
            "short_id",
        )
        .expect("empty and 8-byte hex short IDs should validate");
        validate_value(&schema, &json!(["abc"]), &field, "short_id")
            .expect("pattern is a UI hint, not a save blocker");
        validate_value(&schema, &json!(["0123456789abcdef00"]), &field, "short_id")
            .expect("length is a UI hint, not a save blocker");
    }

    #[test]
    fn string_or_object_list_accepts_scalar_and_array_forms() {
        let schema = empty_schema();
        let field = field(json!({
            "key": "verify_client_url",
            "label": "Verify client URL",
            "kind": "string-or-object-list",
            "fields": [
                {
                    "key": "url",
                    "label": "URL",
                    "kind": "string"
                }
            ]
        }));

        validate_value(
            &schema,
            &json!("https://example.com"),
            &field,
            "verify_client_url",
        )
        .expect("string scalar should validate");
        validate_value(
            &schema,
            &json!({"url": "https://example.com"}),
            &field,
            "verify_client_url",
        )
        .expect("object scalar should validate");
        validate_value(
            &schema,
            &json!(["https://example.com", {"url": "https://example.net"}]),
            &field,
            "verify_client_url",
        )
        .expect("mixed array should validate");
        validate_value(&schema, &json!([1]), &field, "verify_client_url")
            .expect("schema type gaps should not block saves");
    }

    #[test]
    fn object_list_accepts_single_object_for_listable_fields() {
        let schema = empty_schema();
        let field = field(json!({
            "key": "mesh_with",
            "label": "Mesh with",
            "kind": "object-list",
            "fields": [
                {
                    "key": "server",
                    "label": "Server",
                    "kind": "string"
                }
            ]
        }));

        validate_value(
            &schema,
            &json!({"server": "derp.example"}),
            &field,
            "mesh_with",
        )
        .expect("single object should validate");
        validate_value(
            &schema,
            &json!([{"server": "derp-a.example"}, {"server": "derp-b.example"}]),
            &field,
            "mesh_with",
        )
        .expect("object array should validate");
        validate_value(&schema, &json!("derp.example"), &field, "mesh_with")
            .expect("schema type gaps should not block saves");
    }

    #[test]
    fn string_or_number_constraints_are_non_blocking() {
        let schema = empty_schema();
        let field = field(json!({
            "key": "rcode",
            "label": "RCODE",
            "kind": "string-or-number",
            "allowedValues": ["NOERROR", "REFUSED"],
            "integer": true,
            "min": 0,
            "max": 65535
        }));

        validate_value(&schema, &json!("NOERROR"), &field, "rcode")
            .expect("allowed rcode string should validate");
        validate_value(&schema, &json!(3), &field, "rcode").expect("numeric rcode should validate");
        validate_value(&schema, &json!("BADRCODE"), &field, "rcode")
            .expect("allowed values are UI hints, not save blockers");
        validate_value(&schema, &json!(-1), &field, "rcode")
            .expect("bounds are UI hints, not save blockers");
        validate_value(&schema, &json!(1.5), &field, "rcode")
            .expect("integer is a UI hint, not a save blocker");
    }

    #[test]
    fn constraint_fields_are_non_blocking() {
        let schema = empty_schema();
        let fields: Vec<SchemaField> = serde_json::from_value(json!([
            {
                "key": "action",
                "label": "Action",
                "kind": "select",
                "options": ["route", "route-options"]
            },
            {
                "key": "_route_options_requires_any",
                "label": "route-options requires one option",
                "kind": "constraint",
                "requiresAny": ["override_address", "tls_fragment"],
                "visibleWhen": [
                    {
                        "key": "action",
                        "op": "equals",
                        "value": "route-options"
                    }
                ]
            },
            {
                "key": "override_address",
                "label": "Override Address",
                "kind": "string"
            },
            {
                "key": "tls_fragment",
                "label": "TLS Fragment",
                "kind": "boolean"
            }
        ]))
        .expect("test fields should deserialize");

        let empty = json!({
            "action": "route-options"
        });
        validate_object_against_fields(
            &schema,
            empty.as_object().expect("object"),
            &fields,
            "rule",
            &[],
            true,
        )
        .expect("constraints are UI hints, not save blockers");

        let with_option = json!({
            "action": "route-options",
            "tls_fragment": true
        });
        validate_object_against_fields(
            &schema,
            with_option.as_object().expect("object"),
            &fields,
            "rule",
            &[],
            true,
        )
        .expect("constraint should accept one populated option");
    }

    #[test]
    fn duplicate_key_fields_do_not_block_raw_overrides() {
        let schema = empty_schema();
        let fields: Vec<SchemaField> = serde_json::from_value(json!([
            {
                "key": "engine",
                "label": "Engine",
                "kind": "select",
                "options": ["", "go", "apple"]
            },
            {
                "key": "tls",
                "label": "Apple TLS",
                "kind": "object",
                "visibleWhen": [
                    {
                        "key": "engine",
                        "op": "equals",
                        "value": "apple"
                    }
                ],
                "fields": [
                    {
                        "key": "server_name",
                        "label": "Server Name",
                        "kind": "string"
                    }
                ]
            },
            {
                "key": "tls",
                "label": "Go TLS",
                "kind": "object",
                "visibleWhen": [
                    {
                        "key": "engine",
                        "op": "not-equals",
                        "value": "apple"
                    }
                ],
                "fields": [
                    {
                        "key": "enabled",
                        "label": "Enabled",
                        "kind": "boolean"
                    }
                ]
            }
        ]))
        .expect("test fields should deserialize");

        let apple_value = json!({
            "engine": "apple",
            "tls": {
                "server_name": "example.com"
            }
        });
        validate_object_against_fields(
            &schema,
            apple_value.as_object().expect("object"),
            &fields,
            "http_client",
            &[],
            true,
        )
        .expect("apple branch should validate");

        let apple_conflict = json!({
            "engine": "apple",
            "tls": {
                "enabled": true
            }
        });
        validate_object_against_fields(
            &schema,
            apple_conflict.as_object().expect("object"),
            &fields,
            "http_client",
            &[],
            true,
        )
        .expect("raw branch overrides are preserved instead of blocked");

        let go_value = json!({
            "engine": "go",
            "tls": {
                "enabled": true
            }
        });
        validate_object_against_fields(
            &schema,
            go_value.as_object().expect("object"),
            &fields,
            "http_client",
            &[],
            true,
        )
        .expect("go branch should validate");
    }
}
