export type ComposerState = {
  version: number;
  metadata: Metadata;
  base_config: Record<string, unknown>;
  dns: DnsConfig;
  inbounds: Array<Record<string, unknown>>;
  proxy_sources: ProxySource[];
  proxy_groups: ProxyGroup[];
  target_groups: TargetGroup[];
};

export type DnsConfig = {
  enabled: boolean;
  options: Record<string, unknown>;
  servers: Array<Record<string, unknown>>;
  rules: Array<Record<string, unknown>>;
};

export type Metadata = {
  name: string;
  description: string;
  updated_at?: string | null;
};

export type ProxySource = {
  id: string;
  name: string;
  enabled: boolean;
  kind: "manual" | "subscription";
  prefix: string;
  name_rewrites: NameRewriteRule[];
  subscription: SubscriptionSource;
  nodes: Array<Record<string, unknown>>;
};

export type SubscriptionSource = {
  url: string;
  user_agent: string;
  skip_tls_verify: boolean;
  last_fetch_at?: string | null;
};

export type NameRewriteRule = {
  pattern: string;
  replacement: string;
};

export type ProxyGroup = {
  id: string;
  tag: string;
  enabled: boolean;
  group_type: "selector" | "url_test";
  source_ids: string[];
  match_regexes: string[];
  include_groups: string[];
  include_special: Array<"DIRECT" | "REJECT">;
  default: string;
  url: string;
  interval: string;
  tolerance: number;
  idle_timeout: string;
  interrupt_exist_connections: boolean;
};

export type TargetGroup = {
  id: string;
  name: string;
  enabled: boolean;
  outbound: string;
  entries: TargetEntry[];
};

export type TargetEntry = {
  id: string;
  label: string;
  kind: TargetEntryKind;
  values: string[];
  invert: boolean;
  raw: Record<string, unknown> | null;
};

export type TargetEntryKind =
  | "domain"
  | "domain_suffix"
  | "domain_keyword"
  | "domain_regex"
  | "geosite"
  | "ip_cidr"
  | "ip_is_private"
  | "geoip"
  | "source_ip_cidr"
  | "source_ip_is_private"
  | "port"
  | "port_range"
  | "process_name"
  | "process_path"
  | "process_path_regex"
  | "package_name"
  | "package_name_regex"
  | "rule_set"
  | "raw";

export type ResolvedState = {
  proxies: Array<{
    source_id: string;
    source_name: string;
    original_tag: string;
    tag: string;
    outbound_type: string;
  }>;
  groups: Array<{
    tag: string;
    group_type: "selector" | "url_test";
    outbounds: string[];
  }>;
  rules: Array<Record<string, unknown>>;
};

export type RefreshResponse = {
  ok: boolean;
  refreshed: Array<{ id: string; count: number }>;
  state: ComposerState;
};

export type VersionSummary = {
  id: string;
  name: string;
  description: string;
  created_at: string;
  state_updated_at?: string | null;
};
