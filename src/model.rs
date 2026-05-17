use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ComposerState {
    pub version: u32,
    pub metadata: Metadata,
    pub base_config: Value,
    pub dns: DnsConfig,
    pub inbounds: Vec<Value>,
    pub proxy_sources: Vec<ProxySource>,
    pub proxy_groups: Vec<ProxyGroup>,
    pub target_groups: Vec<TargetGroup>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComposerVersion {
    pub id: String,
    pub name: String,
    pub description: String,
    pub created_at: DateTime<Utc>,
    pub state: ComposerState,
}

impl ComposerVersion {
    pub fn new(name: String, description: String, state: ComposerState) -> Self {
        Self {
            id: Uuid::new_v4().simple().to_string(),
            name,
            description,
            created_at: Utc::now(),
            state,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComposerVersionSummary {
    pub id: String,
    pub name: String,
    pub description: String,
    pub created_at: DateTime<Utc>,
    pub state_updated_at: Option<DateTime<Utc>>,
}

impl From<&ComposerVersion> for ComposerVersionSummary {
    fn from(version: &ComposerVersion) -> Self {
        Self {
            id: version.id.clone(),
            name: version.name.clone(),
            description: version.description.clone(),
            created_at: version.created_at,
            state_updated_at: version.state.metadata.updated_at,
        }
    }
}

impl Default for ComposerState {
    fn default() -> Self {
        Self {
            version: 1,
            metadata: Metadata::default(),
            base_config: default_base_config(),
            dns: DnsConfig::default(),
            inbounds: Vec::new(),
            proxy_sources: vec![ProxySource::sample()],
            proxy_groups: vec![ProxyGroup::sample()],
            target_groups: vec![TargetGroup::sample()],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct DnsConfig {
    pub enabled: bool,
    pub options: Value,
    pub servers: Vec<Value>,
    pub rules: Vec<Value>,
}

impl Default for DnsConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            options: Value::Object(Map::new()),
            servers: Vec::new(),
            rules: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Metadata {
    pub name: String,
    pub description: String,
    pub updated_at: Option<DateTime<Utc>>,
}

impl Default for Metadata {
    fn default() -> Self {
        Self {
            name: "Composer".to_string(),
            description: "The foundation that lets you sing".to_string(),
            updated_at: Some(Utc::now()),
        }
    }
}

impl Metadata {
    pub fn normalize_fixed_fields(&mut self) {
        self.name = "Composer".to_string();
        self.description = "The foundation that lets you sing".to_string();
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ProxySource {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub kind: ProxySourceKind,
    pub prefix: String,
    pub name_rewrites: Vec<NameRewriteRule>,
    pub subscription: SubscriptionSource,
    pub nodes: Vec<Value>,
}

impl ProxySource {
    pub fn sample() -> Self {
        Self {
            id: "local".to_string(),
            name: "Local".to_string(),
            enabled: true,
            kind: ProxySourceKind::Manual,
            prefix: "local-".to_string(),
            name_rewrites: Vec::new(),
            subscription: SubscriptionSource::default(),
            nodes: vec![sample_outbound("hk", "hk.example.com", 443)],
        }
    }
}

impl Default for ProxySource {
    fn default() -> Self {
        Self {
            id: Uuid::new_v4().simple().to_string(),
            name: "New Source".to_string(),
            enabled: true,
            kind: ProxySourceKind::Manual,
            prefix: String::new(),
            name_rewrites: Vec::new(),
            subscription: SubscriptionSource::default(),
            nodes: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ProxySourceKind {
    Manual,
    Subscription,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct SubscriptionSource {
    pub url: String,
    pub user_agent: String,
    pub skip_tls_verify: bool,
    pub last_fetch_at: Option<DateTime<Utc>>,
}

impl Default for SubscriptionSource {
    fn default() -> Self {
        Self {
            url: String::new(),
            user_agent: "composer/0.1".to_string(),
            skip_tls_verify: false,
            last_fetch_at: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct NameRewriteRule {
    pub pattern: String,
    pub replacement: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ProxyGroup {
    pub id: String,
    pub tag: String,
    pub enabled: bool,
    pub group_type: ProxyGroupType,
    pub source_ids: Vec<String>,
    pub match_regexes: Vec<String>,
    pub include_groups: Vec<String>,
    pub include_special: Vec<SpecialOutbound>,
    pub default: String,
    pub url: String,
    pub interval: String,
    pub tolerance: u16,
    pub idle_timeout: String,
    pub interrupt_exist_connections: bool,
}

impl ProxyGroup {
    pub fn sample() -> Self {
        Self {
            id: "proxy".to_string(),
            tag: "Proxy".to_string(),
            enabled: true,
            group_type: ProxyGroupType::Selector,
            source_ids: Vec::new(),
            match_regexes: vec![".*".to_string()],
            include_groups: Vec::new(),
            include_special: vec![SpecialOutbound::Direct, SpecialOutbound::Reject],
            default: String::new(),
            url: "https://www.gstatic.com/generate_204".to_string(),
            interval: "3m".to_string(),
            tolerance: 50,
            idle_timeout: "30m".to_string(),
            interrupt_exist_connections: true,
        }
    }
}

impl Default for ProxyGroup {
    fn default() -> Self {
        Self {
            id: Uuid::new_v4().simple().to_string(),
            tag: "New Group".to_string(),
            enabled: true,
            group_type: ProxyGroupType::Selector,
            source_ids: Vec::new(),
            match_regexes: Vec::new(),
            include_groups: Vec::new(),
            include_special: Vec::new(),
            default: String::new(),
            url: String::new(),
            interval: String::new(),
            tolerance: 0,
            idle_timeout: String::new(),
            interrupt_exist_connections: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ProxyGroupType {
    Selector,
    UrlTest,
}

impl Default for ProxyGroupType {
    fn default() -> Self {
        Self::Selector
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "UPPERCASE")]
pub enum SpecialOutbound {
    Direct,
    Reject,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct TargetGroup {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub outbound: String,
    pub entries: Vec<TargetEntry>,
}

impl TargetGroup {
    pub fn sample() -> Self {
        Self {
            id: "google".to_string(),
            name: "Google".to_string(),
            enabled: true,
            outbound: "Proxy".to_string(),
            entries: vec![TargetEntry {
                id: "google-domain".to_string(),
                label: "google domains".to_string(),
                kind: TargetEntryKind::DomainSuffix,
                values: vec!["google.com".to_string(), "googleapis.com".to_string()],
                invert: false,
                raw: Value::Null,
            }],
        }
    }
}

impl Default for TargetGroup {
    fn default() -> Self {
        Self {
            id: Uuid::new_v4().simple().to_string(),
            name: "New Target".to_string(),
            enabled: true,
            outbound: String::new(),
            entries: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct TargetEntry {
    pub id: String,
    pub label: String,
    pub kind: TargetEntryKind,
    pub values: Vec<String>,
    pub invert: bool,
    pub raw: Value,
}

impl Default for TargetEntry {
    fn default() -> Self {
        Self {
            id: Uuid::new_v4().simple().to_string(),
            label: String::new(),
            kind: TargetEntryKind::DomainSuffix,
            values: Vec::new(),
            invert: false,
            raw: Value::Null,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TargetEntryKind {
    Domain,
    DomainSuffix,
    DomainKeyword,
    DomainRegex,
    Geosite,
    IpCidr,
    IpIsPrivate,
    Geoip,
    SourceIpCidr,
    SourceIpIsPrivate,
    Port,
    PortRange,
    ProcessName,
    ProcessPath,
    ProcessPathRegex,
    PackageName,
    PackageNameRegex,
    RuleSet,
    Raw,
}

impl Default for TargetEntryKind {
    fn default() -> Self {
        Self::DomainSuffix
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct ResolvedState {
    pub proxies: Vec<ResolvedProxy>,
    pub groups: Vec<ResolvedGroup>,
    pub rules: Vec<Value>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ResolvedProxy {
    pub source_id: String,
    pub source_name: String,
    pub original_tag: String,
    pub tag: String,
    pub outbound_type: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ResolvedGroup {
    pub tag: String,
    pub group_type: ProxyGroupType,
    pub outbounds: Vec<String>,
}

pub fn default_base_config() -> Value {
    let mut log = Map::new();
    log.insert("level".to_string(), Value::String("info".to_string()));

    let mut route = Map::new();
    route.insert("final".to_string(), Value::String("DIRECT".to_string()));
    route.insert("auto_detect_interface".to_string(), Value::Bool(true));

    let mut root = Map::new();
    root.insert("log".to_string(), Value::Object(log));
    root.insert("route".to_string(), Value::Object(route));
    Value::Object(root)
}

pub fn sample_outbound(tag: &str, server: &str, port: u16) -> Value {
    serde_json::json!({
        "type": "trojan",
        "tag": tag,
        "server": server,
        "server_port": port,
        "password": "change-me",
        "tls": {
            "enabled": true,
            "server_name": server
        }
    })
}
