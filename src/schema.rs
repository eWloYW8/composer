use std::{
    collections::BTreeSet,
    fs,
    path::{Path, PathBuf},
};

use anyhow::{Context, bail};
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
    pub dns: Option<DnsSchema>,
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
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum FieldKind {
    String,
    Number,
    Boolean,
    Select,
    StringList,
    NumberList,
    Map,
    Object,
    ObjectList,
    ObjectMap,
    VariantObject,
    StringOrObject,
    BooleanOrObject,
    TypedList,
    Json,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FieldValueType {
    String,
    Number,
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

    let dns_path = path.join("dns");
    if dns_path.exists() {
        schema.dns = Some(load_dns_schema_directory(&dns_path).await?);
    }

    Ok(schema)
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
    let outbounds = outbound_schemas(schema)?;
    let inbounds = inbound_schemas(schema)?;
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
    if state.dns.enabled {
        validate_dns_config(schema, state)?;
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
    let schema = schemas
        .iter()
        .find_map(|(key, schema)| (key == node_type).then_some(schema))
        .ok_or_else(|| anyhow::anyhow!("{path}.{type_key} is not supported: {node_type}"))?;
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
        match field.kind {
            FieldKind::Object
            | FieldKind::ObjectList
            | FieldKind::ObjectMap
            | FieldKind::StringOrObject
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
    let outbound = outbounds
        .iter()
        .find_map(|(key, schema)| (key == outbound_type).then_some(schema))
        .ok_or_else(|| anyhow::anyhow!("{path}.type is not supported: {outbound_type}"))?;
    validate_object_against_fields(root_schema, object, &outbound.fields, path, &["type"], true)?;
    Ok(())
}

fn validate_object_against_fields(
    root_schema: &ComposerSchema,
    object: &Map<String, Value>,
    fields: &[SchemaField],
    path: &str,
    base_keys: &[&str],
    check_unknown: bool,
) -> anyhow::Result<()> {
    let mut known_keys: BTreeSet<String> = base_keys.iter().map(|key| (*key).to_string()).collect();
    collect_field_keys(fields, &mut known_keys);

    if check_unknown {
        for key in object.keys() {
            if !known_keys.contains(key) {
                bail!("{path}.{key} is not defined by schema");
            }
        }
    }

    let base_key_set: BTreeSet<String> = base_keys.iter().map(|key| (*key).to_string()).collect();
    let mut visible_keys = BTreeSet::new();

    for field in fields {
        if field.flatten || field.key == "_dialer" {
            if !is_field_visible(field, object) {
                continue;
            }
            validate_object_against_fields(root_schema, object, &field.fields, path, &[], false)?;
            collect_visible_field_keys(&field.fields, object, &mut visible_keys);
            continue;
        }

        let raw = object.get(&field.key);
        let visible = is_field_visible(field, object);
        if !visible {
            continue;
        }
        visible_keys.insert(field.key.clone());

        if field.required && !has_field_content(raw, field.kind) {
            bail!("{path}.{} is required", field.key);
        }
        let Some(raw) = raw else {
            continue;
        };
        if !has_field_content(Some(raw), field.kind) {
            continue;
        }
        validate_value(root_schema, raw, field, &format!("{path}.{}", field.key))?;
    }

    if check_unknown {
        for key in object.keys() {
            if base_key_set.contains(key) || !known_keys.contains(key) || visible_keys.contains(key)
            {
                continue;
            }
            if has_any_content(object.get(key)) {
                bail!("{path}.{key} conflicts with current field selection");
            }
        }
    }

    Ok(())
}

fn collect_field_keys(fields: &[SchemaField], output: &mut BTreeSet<String>) {
    for field in fields {
        if field.flatten || field.key == "_dialer" {
            collect_field_keys(&field.fields, output);
        } else {
            output.insert(field.key.clone());
        }
    }
}

fn collect_visible_field_keys(
    fields: &[SchemaField],
    object: &Map<String, Value>,
    output: &mut BTreeSet<String>,
) {
    for field in fields {
        if !is_field_visible(field, object) {
            continue;
        }
        if field.flatten || field.key == "_dialer" {
            collect_visible_field_keys(&field.fields, object, output);
        } else {
            output.insert(field.key.clone());
        }
    }
}

fn validate_value(
    root_schema: &ComposerSchema,
    value: &Value,
    field: &SchemaField,
    path: &str,
) -> anyhow::Result<()> {
    match field.kind {
        FieldKind::String => {
            if !value.is_string() {
                bail!("{path} must be a string");
            }
        }
        FieldKind::Number => {
            let number = value
                .as_f64()
                .ok_or_else(|| anyhow::anyhow!("{path} must be a number"))?;
            if let Some(min) = field.min {
                if number < min {
                    bail!("{path} must be >= {min}");
                }
            }
            if let Some(max) = field.max {
                if number > max {
                    bail!("{path} must be <= {max}");
                }
            }
        }
        FieldKind::Boolean => {
            if !value.is_boolean() {
                bail!("{path} must be a boolean");
            }
        }
        FieldKind::Select => {
            match field.value_type {
                Some(FieldValueType::Number) => {
                    if !value.is_number() {
                        bail!("{path} must be a number");
                    }
                }
                _ => {
                    if !value.is_string() {
                        bail!("{path} must be a string");
                    }
                }
            }
            let rendered = render_scalar(value);
            if !field.options.is_empty() && !field.options.contains(&rendered) {
                bail!("{path} has unsupported value {rendered}");
            }
        }
        FieldKind::StringList => {
            validate_listable(value, path, |item| item.is_string(), "string")?;
            validate_allowed_list(value, &field.allowed_values, path)?;
        }
        FieldKind::NumberList => {
            validate_listable(value, path, |item| item.is_number(), "number")?;
            validate_number_list_bounds(value, field, path)?;
        }
        FieldKind::Map => {
            if !value.is_object() {
                bail!("{path} must be an object");
            }
        }
        FieldKind::ObjectList => {
            let items = value
                .as_array()
                .ok_or_else(|| anyhow::anyhow!("{path} must be an array"))?;
            for (index, item) in items.iter().enumerate() {
                let nested = item
                    .as_object()
                    .ok_or_else(|| anyhow::anyhow!("{path}[{index}] must be an object"))?;
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
        FieldKind::ObjectMap => {
            let items = value
                .as_object()
                .ok_or_else(|| anyhow::anyhow!("{path} must be an object"))?;
            for (key, item) in items {
                let nested = item
                    .as_object()
                    .ok_or_else(|| anyhow::anyhow!("{path}.{key} must be an object"))?;
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
        FieldKind::Object => {
            let nested = value
                .as_object()
                .ok_or_else(|| anyhow::anyhow!("{path} must be an object"))?;
            validate_object_against_fields(root_schema, nested, &field.fields, path, &[], true)?;
        }
        FieldKind::StringOrObject => {
            if value.is_string() {
                return Ok(());
            }
            let nested = value
                .as_object()
                .ok_or_else(|| anyhow::anyhow!("{path} must be a string or object"))?;
            validate_object_against_fields(root_schema, nested, &field.fields, path, &[], true)?;
        }
        FieldKind::BooleanOrObject => {
            if value.is_boolean() {
                return Ok(());
            }
            let nested = value
                .as_object()
                .ok_or_else(|| anyhow::anyhow!("{path} must be a boolean or object"))?;
            validate_object_against_fields(root_schema, nested, &field.fields, path, &[], true)?;
        }
        FieldKind::TypedList => {
            let items = value
                .as_array()
                .ok_or_else(|| anyhow::anyhow!("{path} must be an array"))?;
            let item_schemas = typed_list_schemas(root_schema, field, path)?;
            for (index, item) in items.iter().enumerate() {
                validate_typed_node(
                    root_schema,
                    &item_schemas,
                    item,
                    &format!("{path}[{index}]"),
                    "type",
                )?;
            }
        }
        FieldKind::Json => {}
        FieldKind::VariantObject => {
            let nested = value
                .as_object()
                .ok_or_else(|| anyhow::anyhow!("{path} must be an object"))?;
            let variant_type = nested
                .get("type")
                .and_then(Value::as_str)
                .ok_or_else(|| anyhow::anyhow!("{path}.type is required"))?;
            if !field
                .variant_options
                .iter()
                .any(|item| item == variant_type)
            {
                bail!("{path}.type has unsupported value {variant_type}");
            }
            let variant_value = field.variants.get(variant_type).ok_or_else(|| {
                anyhow::anyhow!("{path}.type has no schema for value {variant_type}")
            })?;
            let variant_fields: Vec<SchemaField> = serde_json::from_value(variant_value.clone())?;
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
    Ok(())
}

fn validate_listable(
    value: &Value,
    path: &str,
    predicate: impl Fn(&Value) -> bool,
    expected: &str,
) -> anyhow::Result<()> {
    if predicate(value) {
        return Ok(());
    }
    let Some(items) = value.as_array() else {
        bail!("{path} must be a {expected} or {expected} array");
    };
    for item in items {
        if !predicate(item) {
            bail!("{path} must contain only {expected} values");
        }
    }
    Ok(())
}

fn validate_allowed_list(value: &Value, allowed: &[String], path: &str) -> anyhow::Result<()> {
    if allowed.is_empty() {
        return Ok(());
    }
    let mut values = Vec::new();
    if let Some(value) = value.as_str() {
        values.push(value.to_string());
    } else if let Some(items) = value.as_array() {
        values.extend(items.iter().filter_map(Value::as_str).map(str::to_string));
    }
    for item in values {
        if !allowed.contains(&item) {
            bail!("{path} contains unsupported value {item}");
        }
    }
    Ok(())
}

fn validate_number_list_bounds(
    value: &Value,
    field: &SchemaField,
    path: &str,
) -> anyhow::Result<()> {
    let values: Vec<&Value> = if let Some(items) = value.as_array() {
        items.iter().collect()
    } else {
        vec![value]
    };
    for item in values {
        let number = item
            .as_f64()
            .ok_or_else(|| anyhow::anyhow!("{path} must contain only number values"))?;
        if let Some(min) = field.min {
            if number < min {
                bail!("{path} values must be >= {min}");
            }
        }
        if let Some(max) = field.max {
            if number > max {
                bail!("{path} values must be <= {max}");
            }
        }
    }
    Ok(())
}

fn is_field_visible(field: &SchemaField, object: &Map<String, Value>) -> bool {
    field
        .visible_when
        .iter()
        .all(|condition| condition_matches(object, condition))
}

fn condition_matches(object: &Map<String, Value>, condition: &FieldCondition) -> bool {
    let raw = object.get(&condition.key);
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

fn has_field_content(value: Option<&Value>, kind: FieldKind) -> bool {
    let Some(value) = value else {
        return false;
    };
    match kind {
        FieldKind::Boolean => value.as_bool() == Some(true),
        FieldKind::Number => value.is_number(),
        FieldKind::String | FieldKind::Select => value
            .as_str()
            .map(|item| !item.trim().is_empty())
            .unwrap_or(true),
        FieldKind::StringList
        | FieldKind::NumberList
        | FieldKind::TypedList
        | FieldKind::ObjectList => match value {
            Value::Array(items) => !items.is_empty(),
            Value::String(item) => !item.trim().is_empty(),
            Value::Number(_) => true,
            _ => false,
        },
        FieldKind::Map | FieldKind::ObjectMap => {
            value.as_object().is_some_and(|object| !object.is_empty())
        }
        FieldKind::Object | FieldKind::VariantObject => value.is_object(),
        FieldKind::StringOrObject => value
            .as_str()
            .map(|item| !item.trim().is_empty())
            .unwrap_or_else(|| value.is_object()),
        FieldKind::BooleanOrObject => value.as_bool() == Some(true) || value.is_object(),
        FieldKind::Json => !value.is_null(),
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
