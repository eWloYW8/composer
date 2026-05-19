import {
  Bot,
  Braces,
  ChevronDown,
  ChevronRight,
  Code2,
  Download,
  ExternalLink,
  FileCode2,
  History,
  Layers3,
  Plus,
  RefreshCw,
  RotateCcw,
  Route,
  Save,
  Server,
  Settings,
  SlidersHorizontal,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type * as React from "react";
import YAML from "yaml";

import { AgentSidebar } from "./AgentSidebar";
import { Badge } from "./components/ui/Badge";
import { Button } from "./components/ui/Button";
import { CheckField, Field } from "./components/ui/Field";
import { Input, Select, Textarea } from "./components/ui/Input";
import { fetchJson } from "./lib/api";
import {
  EMPTY_COMPOSER_SCHEMA,
  changeCertificateProviderType,
  changeDnsRuleType,
  changeDnsServerType,
  changeEndpointType,
  changeInboundType,
  changeOutboundType,
  changeRouteRuleSetType,
  changeRouteRuleType,
  changeServiceType,
  changeTypedListItemType,
  createCertificateProvider as createTypedCertificateProvider,
  createInbound as createTypedInbound,
  createDnsRule,
  createDnsServer,
  createEndpoint as createTypedEndpoint,
  createOutboundNode as createTypedOutboundNode,
  createRouteRule,
  createRouteRuleSet,
  createService as createTypedService,
  createTypedListItem,
  defaultValueForField,
  getDnsRuleSchema,
  getDnsRuleTypeOptions,
  getDnsServerSchema,
  getDnsServerTypeOptions,
  getEndpointSchema,
  getEndpointTypeOptions,
  getCertificateProviderSchema,
  getCertificateProviderTypeOptions,
  getInboundSchema,
  getInboundTypeOptions,
  getOutboundSchema,
  getOutboundTypeOptions,
  getRouteRuleSetSchema,
  getRouteRuleSetTypeOptions,
  getRouteRuleSchema,
  getRouteRuleTypeOptions,
  getServiceSchema,
  getServiceTypeOptions,
  getTypedListDefaultType,
  getTypedListItemSchema,
  getTypedListTypeOptions,
  isFlattenedField,
  isFieldVisible,
  normalizeComposerSchema,
  sanitizeDnsRule,
  sanitizeDnsServer,
  sanitizeEndpoint,
  sanitizeCertificateProvider,
  sanitizeInbound,
  sanitizeRouteRuleSet,
  sanitizeRouteRule,
  sanitizeService,
  sanitizeFields,
  sanitizeTypedListItem,
  sanitizeOutboundNode,
  validateDnsRule,
  validateDnsServer,
  validateEndpoint,
  validateCertificateProvider,
  validateInbound,
  validateRouteRuleSet,
  validateRouteRule,
  validateService,
  validateFields,
  validateOutboundNode,
  validateTypedListItem,
  type ComposerSchema,
  type JsonObject,
  type SchemaField,
} from "./singboxSchema";
import type {
  ComposerState,
  AppSettings,
  GlobalConfig,
  NameRewriteRule,
  ProxyGroup,
  ProxySource,
  RefreshResponse,
  ResolvedState,
  TargetEntry,
  TargetEntryKind,
  TargetGroup,
  DnsConfig,
  RouteConfig,
  VersionSummary,
} from "./types";

type Page =
  | "sources"
  | "groups"
  | "targets"
  | "global"
  | "endpoints"
  | "http_clients"
  | "certificates"
  | "services"
  | "extra_routes"
  | "inbounds"
  | "dns"
  | "base"
  | "output";
type LocalMode = "form" | "json" | "yaml";
type Status = { kind: "ok" | "error" | "info"; message: string } | null;

const defaultAppSettings: AppSettings = {
  network: {
    proxy: {
      enabled: false,
      url: "",
    },
    github: {
      api_url: "https://api.github.com",
      token: "",
    },
  },
};

const pages: Array<{ key: Page; label: string; icon: typeof Layers3 }> = [
  { key: "sources", label: "代理源", icon: UploadCloud },
  { key: "groups", label: "代理组", icon: Layers3 },
  { key: "targets", label: "出站目标", icon: Route },
  { key: "extra_routes", label: "额外路由规则", icon: Route },
  { key: "dns", label: "DNS", icon: Server },
  { key: "inbounds", label: "入站配置", icon: Server },
  { key: "endpoints", label: "端点配置", icon: Server },
  { key: "http_clients", label: "HTTP 客户端", icon: Server },
  { key: "certificates", label: "证书配置", icon: Server },
  { key: "services", label: "服务配置", icon: Server },
  { key: "global", label: "全局配置", icon: SlidersHorizontal },
  { key: "base", label: "基础配置", icon: SlidersHorizontal },
  { key: "output", label: "生成配置", icon: FileCode2 },
];

const targetKinds: TargetEntryKind[] = [
  "domain",
  "domain_suffix",
  "domain_keyword",
  "domain_regex",
  "geosite",
  "ip_cidr",
  "ip_is_private",
  "geoip",
  "source_ip_cidr",
  "source_ip_is_private",
  "port",
  "port_range",
  "process_name",
  "process_path",
  "process_path_regex",
  "package_name",
  "package_name_regex",
  "rule_set",
  "raw",
];

const targetKindSpecs: Record<
  TargetEntryKind,
  {
    label: string;
    valueKind: "string-list" | "number-list" | "boolean" | "raw";
  }
> = {
  domain: { label: "完整域名", valueKind: "string-list" },
  domain_suffix: { label: "域名后缀", valueKind: "string-list" },
  domain_keyword: { label: "域名关键词", valueKind: "string-list" },
  domain_regex: { label: "域名正则", valueKind: "string-list" },
  geosite: { label: "Geosite", valueKind: "string-list" },
  ip_cidr: { label: "目标 CIDR", valueKind: "string-list" },
  ip_is_private: { label: "私有目标 IP", valueKind: "boolean" },
  geoip: { label: "GeoIP", valueKind: "string-list" },
  source_ip_cidr: { label: "来源 CIDR", valueKind: "string-list" },
  source_ip_is_private: { label: "私有来源 IP", valueKind: "boolean" },
  port: { label: "目标端口", valueKind: "number-list" },
  port_range: { label: "目标端口范围", valueKind: "string-list" },
  process_name: { label: "进程名", valueKind: "string-list" },
  process_path: { label: "进程路径", valueKind: "string-list" },
  process_path_regex: { label: "进程路径正则", valueKind: "string-list" },
  package_name: { label: "包名", valueKind: "string-list" },
  package_name_regex: { label: "包名正则", valueKind: "string-list" },
  rule_set: { label: "规则集 tag", valueKind: "string-list" },
  raw: { label: "原始 rule", valueKind: "raw" },
};

const formGridClass = "grid gap-4 md:grid-cols-2";
const twoColumnGridClass = "grid gap-4 md:grid-cols-2";
const composerName = "Composer";
const composerDescription = "The foundation that lets you sing";

function withFixedMetadata(state: ComposerState): ComposerState {
  const metadata = (isRecord(state.metadata) ? state.metadata : {}) as JsonObject;
  const dns = (isRecord(state.dns) ? state.dns : {}) as JsonObject;
  const global = (isRecord(state.global) ? state.global : {}) as JsonObject;
  const route = (isRecord(state.route) ? state.route : {}) as JsonObject;
  return {
    ...state,
    version: typeof state.version === "number" ? state.version : 1,
    base_config: isRecord(state.base_config) ? state.base_config : {},
    dns: {
      enabled: dns.enabled === true,
      options: isRecord(dns.options) ? dns.options : {},
      servers: asObjectArray(dns.servers),
      rules: asObjectArray(dns.rules),
    },
    global: {
      log: isRecord(global.log) ? global.log : {},
      ntp: isRecord(global.ntp) ? global.ntp : {},
      experimental: isRecord(global.experimental) ? global.experimental : {},
    },
    route: {
      options: isRecord(route.options) ? route.options : {},
      rule_sets: asObjectArray(route.rule_sets),
    },
    inbounds: asObjectArray(state.inbounds),
    endpoints: asObjectArray(state.endpoints),
    http_clients: asObjectArray(state.http_clients),
    certificate: isRecord(state.certificate) ? state.certificate : {},
    certificate_providers: asObjectArray(state.certificate_providers),
    services: asObjectArray(state.services),
    extra_route_rules: asObjectArray(state.extra_route_rules),
    proxy_sources: normalizeProxySources(state.proxy_sources),
    proxy_groups: normalizeProxyGroups(state.proxy_groups),
    target_groups: normalizeTargetGroups(state.target_groups),
    metadata: {
      ...metadata,
      name: composerName,
      description: composerDescription,
    },
  };
}

function normalizeProxySources(value: unknown): ProxySource[] {
  return Array.isArray(value)
    ? value.filter(isRecord).map((source, index) => {
        const subscription = isRecord(source.subscription)
          ? source.subscription
          : {};
        return {
          id: asString(source.id, `source-${index + 1}`),
          name: asString(source.name, `Source ${index + 1}`),
          enabled: source.enabled !== false,
          kind: source.kind === "subscription" ? "subscription" : "manual",
          prefix: asString(source.prefix, ""),
          name_rewrites: Array.isArray(source.name_rewrites)
            ? source.name_rewrites.filter(isRecord).map((rule) => ({
                pattern: asString(rule.pattern, ""),
                replacement: asString(rule.replacement, ""),
              }))
            : [],
          subscription: {
            url: asString(subscription.url, ""),
            user_agent: asString(subscription.user_agent, "composer/0.1"),
            skip_tls_verify: subscription.skip_tls_verify === true,
            last_fetch_at:
              typeof subscription.last_fetch_at === "string"
                ? subscription.last_fetch_at
                : null,
          },
          nodes: asObjectArray(source.nodes),
        };
      })
    : [];
}

function normalizeProxyGroups(value: unknown): ProxyGroup[] {
  return Array.isArray(value)
    ? value.filter(isRecord).map((group, index) => ({
        id: asString(group.id, `group-${index + 1}`),
        tag: asString(group.tag, `Group ${index + 1}`),
        enabled: group.enabled !== false,
        group_type: group.group_type === "url_test" ? "url_test" : "selector",
        source_ids: asStringArray(group.source_ids),
        match_regexes: asStringArray(group.match_regexes),
        include_groups: asStringArray(group.include_groups),
        include_special: asSpecialArray(group.include_special),
        default: asString(group.default, ""),
        url: asString(group.url, "https://www.gstatic.com/generate_204"),
        interval: asString(group.interval, "3m"),
        tolerance:
          typeof group.tolerance === "number" && Number.isFinite(group.tolerance)
            ? group.tolerance
            : 50,
        idle_timeout: asString(group.idle_timeout, "30m"),
        interrupt_exist_connections:
          group.interrupt_exist_connections === true,
      }))
    : [];
}

function normalizeTargetGroups(value: unknown): TargetGroup[] {
  return Array.isArray(value)
    ? value.filter(isRecord).map((target, index) => ({
        id: asString(target.id, `target-${index + 1}`),
        name: asString(target.name, `Target ${index + 1}`),
        enabled: target.enabled !== false,
        outbound: asString(target.outbound, ""),
        entries: normalizeTargetEntries(target.entries),
      }))
    : [];
}

function normalizeTargetEntries(value: unknown): TargetEntry[] {
  return Array.isArray(value)
    ? value.filter(isRecord).map((entry, index) => {
        const kind = targetKinds.includes(entry.kind as TargetEntryKind)
          ? (entry.kind as TargetEntryKind)
          : "domain_suffix";
        return {
          id: asString(entry.id, `entry-${index + 1}`),
          label: asString(entry.label, ""),
          kind,
          values: asStringArray(entry.values),
          invert: entry.invert === true,
          raw: isRecord(entry.raw) ? entry.raw : {},
        };
      })
    : [];
}

function asObjectArray(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function asSpecialArray(value: unknown): Array<"DIRECT" | "REJECT"> {
  return Array.isArray(value)
    ? value.filter((item): item is "DIRECT" | "REJECT" =>
        item === "DIRECT" || item === "REJECT",
      )
    : [];
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function normalizeAppSettings(value: unknown): AppSettings {
  const raw = isRecord(value) ? value : {};
  const network = isRecord(raw.network) ? raw.network : {};
  const proxy = isRecord(network.proxy) ? network.proxy : {};
  const github = isRecord(network.github) ? network.github : {};
  return {
    network: {
      proxy: {
        enabled:
          typeof proxy.enabled === "boolean"
            ? proxy.enabled
            : defaultAppSettings.network.proxy.enabled,
        url:
          typeof proxy.url === "string"
            ? proxy.url
            : defaultAppSettings.network.proxy.url,
      },
      github: {
        api_url:
          typeof github.api_url === "string"
            ? github.api_url
            : defaultAppSettings.network.github.api_url,
        token:
          typeof github.token === "string"
            ? github.token
            : defaultAppSettings.network.github.token,
      },
    },
  };
}

function githubTokenCreationUrl(apiUrl: string): string {
  const baseUrl = githubWebUrlFromApi(apiUrl);
  const params = new URLSearchParams({
    name: `Composer sing-box docs ${new Date().toISOString().slice(0, 10)}`,
    description: "Composer reads sing-box documentation from GitHub.",
    expires_in: "90",
    contents: "read",
    metadata: "read",
  });
  return `${baseUrl}/settings/personal-access-tokens/new?${params.toString()}`;
}

function githubWebUrlFromApi(apiUrl: string): string {
  try {
    const url = new URL(apiUrl.trim() || "https://api.github.com");
    if (url.hostname === "api.github.com") {
      return "https://github.com";
    }
    url.pathname = url.pathname
      .replace(/\/api\/v3\/?$/, "")
      .replace(/\/api\/?$/, "")
      .replace(/\/+$/, "");
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "https://github.com";
  }
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export default function App() {
  const headerRef = useRef<HTMLElement | null>(null);
  const [state, setState] = useState<ComposerState | null>(null);
  const [schema, setSchema] = useState<ComposerSchema>(EMPTY_COMPOSER_SCHEMA);
  const [baseline, setBaseline] = useState("");
  const [page, setPage] = useState<Page>("sources");
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const [versionDialogOpen, setVersionDialogOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(defaultAppSettings);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [versionName, setVersionName] = useState("");
  const [versionDescription, setVersionDescription] = useState("");
  const [versionBusy, setVersionBusy] = useState(false);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [selectedNodeIndex, setSelectedNodeIndex] = useState(0);
  const [selectedEntryIndex, setSelectedEntryIndex] = useState(0);
  const [selectedInboundIndex, setSelectedInboundIndex] = useState(0);
  const [selectedEndpointIndex, setSelectedEndpointIndex] = useState(0);
  const [selectedHttpClientIndex, setSelectedHttpClientIndex] = useState(0);
  const [selectedCertificateProviderIndex, setSelectedCertificateProviderIndex] =
    useState(0);
  const [selectedServiceIndex, setSelectedServiceIndex] = useState(0);
  const [selectedRouteRuleSetIndex, setSelectedRouteRuleSetIndex] =
    useState(0);
  const [selectedExtraRouteRuleIndex, setSelectedExtraRouteRuleIndex] =
    useState(0);
  const [selectedDnsServerIndex, setSelectedDnsServerIndex] = useState(0);
  const [selectedDnsRuleIndex, setSelectedDnsRuleIndex] = useState(0);
  const [output, setOutput] = useState("");
  const [resolved, setResolved] = useState<ResolvedState | null>(null);

  const hasHeader = state !== null;
  const dirty = state ? JSON.stringify(state) !== baseline : false;

  const adoptState = useCallback((next: ComposerState) => {
    const fixed = withFixedMetadata(next);
    setState(fixed);
    setBaseline(JSON.stringify(fixed));
    setSelectedSourceId((current) =>
      current && next.proxy_sources.some((source) => source.id === current)
        ? current
        : (next.proxy_sources[0]?.id ?? null),
    );
    setSelectedGroupId((current) =>
      current && next.proxy_groups.some((group) => group.id === current)
        ? current
        : (next.proxy_groups[0]?.id ?? null),
    );
    setSelectedTargetId((current) =>
      current && next.target_groups.some((target) => target.id === current)
        ? current
        : (next.target_groups[0]?.id ?? null),
    );
  }, []);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [nextSchema, next] = await Promise.all([
        fetchJson<ComposerSchema>("/api/schema"),
        fetchJson<ComposerState>("/api/state"),
      ]);
      setSchema(normalizeComposerSchema(nextSchema));
      adoptState(next);
      setStatus({ kind: "ok", message: "已加载" });
    } catch (error) {
      setStatus({ kind: "error", message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }, [adoptState]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!hasHeader) {
      document.documentElement.style.setProperty(
        "--composer-sticky-top",
        "0px",
      );
      return;
    }

    const header = headerRef.current;
    if (!header) {
      return;
    }
    const updateStickyTop = () => {
      document.documentElement.style.setProperty(
        "--composer-sticky-top",
        `${header.offsetHeight}px`,
      );
    };
    updateStickyTop();
    const animationFrame = requestAnimationFrame(updateStickyTop);
    const observer = new ResizeObserver(updateStickyTop);
    observer.observe(header);
    window.addEventListener("resize", updateStickyTop);
    return () => {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
      window.removeEventListener("resize", updateStickyTop);
    };
  }, [hasHeader]);

  useEffect(() => {
    if (!dirty) {
      return;
    }
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  const updateState = (recipe: (draft: ComposerState) => void) => {
    setState((current) => {
      if (!current) {
        return current;
      }
      const draft = structuredClone(current);
      recipe(draft);
      return draft;
    });
  };

  const persistState = async (
    payload = state,
  ): Promise<ComposerState | null> => {
    if (!payload) {
      return null;
    }
    const next = await fetchJson<ComposerState>("/api/state", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    adoptState(next);
    return next;
  };

  const save = async () => {
    setBusy(true);
    try {
      await persistState();
      setStatus({ kind: "ok", message: "已保存" });
    } catch (error) {
      setStatus({ kind: "error", message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const discard = async () => {
    if (!dirty || window.confirm("Discard unsaved changes?")) {
      await load();
    }
  };

  const loadVersions = async () => {
    setVersionBusy(true);
    try {
      setVersions(await fetchJson<VersionSummary[]>("/api/versions"));
    } catch (error) {
      setStatus({ kind: "error", message: errorMessage(error) });
    } finally {
      setVersionBusy(false);
    }
  };

  const openVersions = () => {
    setVersionDialogOpen(true);
    void loadVersions();
  };

  const loadSettings = async () => {
    setSettingsBusy(true);
    try {
      setSettings(normalizeAppSettings(await fetchJson<AppSettings>("/api/settings")));
    } catch (error) {
      setStatus({ kind: "error", message: errorMessage(error) });
    } finally {
      setSettingsBusy(false);
    }
  };

  const openSettings = () => {
    setSettingsDialogOpen(true);
    void loadSettings();
  };

  const saveSettings = async () => {
    setSettingsBusy(true);
    try {
      const next = await fetchJson<AppSettings>("/api/settings", {
        method: "PUT",
        body: JSON.stringify(settings),
      });
      setSettings(normalizeAppSettings(next));
      setStatus({ kind: "ok", message: "设置已保存" });
      setSettingsDialogOpen(false);
    } catch (error) {
      setStatus({ kind: "error", message: errorMessage(error) });
    } finally {
      setSettingsBusy(false);
    }
  };

  const createVersion = async () => {
    setVersionBusy(true);
    try {
      await persistState();
      const nextVersions = await fetchJson<VersionSummary[]>("/api/versions", {
        method: "POST",
        body: JSON.stringify({
          name: versionName,
          description: versionDescription,
        }),
      });
      setVersions(nextVersions);
      setVersionName("");
      setVersionDescription("");
      setStatus({ kind: "ok", message: "已创建版本" });
    } catch (error) {
      setStatus({ kind: "error", message: errorMessage(error) });
    } finally {
      setVersionBusy(false);
    }
  };

  const deleteVersion = async (id: string) => {
    if (!window.confirm("删除这个版本？")) {
      return;
    }
    setVersionBusy(true);
    try {
      setVersions(
        await fetchJson<VersionSummary[]>(`/api/versions/${id}`, {
          method: "DELETE",
        }),
      );
      setStatus({ kind: "ok", message: "已删除版本" });
    } catch (error) {
      setStatus({ kind: "error", message: errorMessage(error) });
    } finally {
      setVersionBusy(false);
    }
  };

  const restoreVersion = async (id: string) => {
    if (dirty && !window.confirm("恢复这个版本并丢弃未保存修改？")) {
      return;
    }
    setVersionBusy(true);
    try {
      const restored = await fetchJson<ComposerState>(
        `/api/versions/${id}/restore`,
        {
          method: "POST",
        },
      );
      adoptState(restored);
      setOutput("");
      setResolved(null);
      setStatus({ kind: "ok", message: "已恢复版本" });
    } catch (error) {
      setStatus({ kind: "error", message: errorMessage(error) });
    } finally {
      setVersionBusy(false);
    }
  };

  const switchPage = (next: Page) => {
    if (next === page) {
      return;
    }
    setPage(next);
    if (next === "output") {
      void refreshOutput();
    }
  };

  const refreshAll = async () => {
    setBusy(true);
    try {
      await persistState();
      const response = await fetchJson<RefreshResponse>(
        "/api/sources/refresh",
        {
          method: "POST",
        },
      );
      adoptState(response.state);
      setStatus({
        kind: "ok",
        message: `已刷新 ${response.refreshed.length} 个代理源`,
      });
    } catch (error) {
      setStatus({ kind: "error", message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const refreshSource = async (sourceId: string) => {
    setBusy(true);
    try {
      await persistState();
      const response = await fetchJson<RefreshResponse>(
        `/api/sources/${sourceId}/refresh`,
        {
          method: "POST",
        },
      );
      adoptState(response.state);
      const count = response.refreshed[0]?.count ?? 0;
      setStatus({ kind: "ok", message: `已刷新 ${count} 个节点` });
    } catch (error) {
      setStatus({ kind: "error", message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const refreshOutput = async () => {
    setBusy(true);
    try {
      const [config, resolvedState] = await Promise.all([
        fetchJson<JsonObject>("/api/config"),
        fetchJson<ResolvedState>("/api/resolved"),
      ]);
      setOutput(JSON.stringify(config, null, 2));
      setResolved(resolvedState);
      setStatus({ kind: "ok", message: "已生成 sing-box 配置" });
    } catch (error) {
      setStatus({ kind: "error", message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const replaceWorkingState = (next: ComposerState): ComposerState => {
    const fixed = withFixedMetadata(next);
    setState(fixed);
    return fixed;
  };

  const adoptSavedState = (next: ComposerState): ComposerState => {
    const fixed = withFixedMetadata(next);
    adoptState(fixed);
    return fixed;
  };

  const reloadForAgent = async (): Promise<ComposerState | null> => {
    setBusy(true);
    try {
      const [nextSchema, next] = await Promise.all([
        fetchJson<ComposerSchema>("/api/schema"),
        fetchJson<ComposerState>("/api/state"),
      ]);
      setSchema(normalizeComposerSchema(nextSchema));
      const fixed = withFixedMetadata(next);
      adoptState(fixed);
      setStatus({ kind: "ok", message: "Agent 已重新加载状态" });
      return fixed;
    } catch (error) {
      setStatus({ kind: "error", message: errorMessage(error) });
      return null;
    } finally {
      setBusy(false);
    }
  };

  const setGeneratedForAgent = (
    config: JsonObject,
    resolvedState: ResolvedState,
  ) => {
    setOutput(JSON.stringify(config, null, 2));
    setResolved(resolvedState);
    setStatus({ kind: "ok", message: "Agent 已生成 sing-box 配置" });
  };

  const downloadHref = useMemo(() => {
    if (!output) {
      return "";
    }
    return URL.createObjectURL(
      new Blob([output], { type: "application/json" }),
    );
  }, [output]);

  const agentSelection = useMemo(
    () => ({
      page,
      selectedSourceId,
      selectedGroupId,
      selectedTargetId,
      selectedNodeIndex,
      selectedEntryIndex,
      selectedInboundIndex,
      selectedEndpointIndex,
      selectedHttpClientIndex,
      selectedCertificateProviderIndex,
      selectedServiceIndex,
      selectedRouteRuleSetIndex,
      selectedExtraRouteRuleIndex,
      selectedDnsServerIndex,
      selectedDnsRuleIndex,
    }),
    [
      page,
      selectedSourceId,
      selectedGroupId,
      selectedTargetId,
      selectedNodeIndex,
      selectedEntryIndex,
      selectedInboundIndex,
      selectedEndpointIndex,
      selectedHttpClientIndex,
      selectedCertificateProviderIndex,
      selectedServiceIndex,
      selectedRouteRuleSetIndex,
      selectedExtraRouteRuleIndex,
      selectedDnsServerIndex,
      selectedDnsRuleIndex,
    ],
  );

  if (!state) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading composer...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header
        ref={headerRef}
        className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur"
      >
        <div className="mx-auto flex max-w-[1440px] flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Layers3 size={20} />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold">{composerName}</h1>
              <p className="truncate text-sm text-muted-foreground">
                {composerDescription}
                {dirty ? " · unsaved" : ""}
              </p>
            </div>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2 lg:justify-end">
            <Button variant="secondary" onClick={load} disabled={busy}>
              <RefreshCw size={16} />
              Reload
            </Button>
            <Button variant="secondary" onClick={refreshAll} disabled={busy}>
              <UploadCloud size={16} />
              Refresh
            </Button>
            <Button variant="secondary" onClick={openVersions} disabled={busy}>
              <History size={16} />
              版本
            </Button>
            <Button variant="secondary" onClick={openSettings} disabled={busy}>
              <Settings size={16} />
              设置
            </Button>
            <Button
              variant={agentOpen ? "primary" : "secondary"}
              onClick={() => setAgentOpen((current) => !current)}
            >
              <Bot size={16} />
              Agent
            </Button>
            <Button variant="ghost" onClick={discard} disabled={busy || !dirty}>
              Discard
            </Button>
            <Button onClick={save} disabled={busy || !dirty}>
              <Save size={16} />
              Save
            </Button>
          </div>
        </div>
      </header>
      {status ? (
        <StatusBadge status={status} onClose={() => setStatus(null)} />
      ) : null}
      {versionDialogOpen ? (
        <VersionManagerDialog
          versions={versions}
          name={versionName}
          description={versionDescription}
          busy={versionBusy}
          onNameChange={setVersionName}
          onDescriptionChange={setVersionDescription}
          onCreate={createVersion}
          onDelete={deleteVersion}
          onRestore={restoreVersion}
          onRefresh={loadVersions}
          onClose={() => setVersionDialogOpen(false)}
        />
      ) : null}
      {settingsDialogOpen ? (
        <NetworkSettingsDialog
          settings={settings}
          busy={settingsBusy}
          onChange={setSettings}
          onReload={loadSettings}
          onSave={saveSettings}
          onClose={() => setSettingsDialogOpen(false)}
        />
      ) : null}
      <AgentSidebar
        open={agentOpen}
        state={state}
        schema={schema}
        page={page}
        dirty={dirty}
        selection={agentSelection}
        output={output}
        resolved={resolved}
        onClose={() => setAgentOpen(false)}
        onReplaceState={replaceWorkingState}
        onAdoptSavedState={adoptSavedState}
        onSaveState={(next) => persistState(next)}
        onReloadState={reloadForAgent}
        onGeneratedConfig={setGeneratedForAgent}
        onStatus={setStatus}
      />

      <div className="mx-auto grid max-w-[1440px] grid-cols-[56px_minmax(0,1fr)] gap-3 px-3 py-4 sm:grid-cols-[200px_minmax(0,1fr)] sm:gap-4 sm:px-4 sm:py-5 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-5">
        <aside className="sticky top-[calc(var(--composer-sticky-top)+0.75rem)] min-w-0 max-h-[calc(100vh-var(--composer-sticky-top)-1.5rem)] sm:top-[calc(var(--composer-sticky-top)+1rem)] sm:max-h-[calc(100vh-var(--composer-sticky-top)-2rem)]">
          <nav className="grid max-h-[inherit] min-w-0 content-start gap-1 overflow-y-auto rounded-md border border-border bg-white p-1 sm:p-2">
            {pages.map((item) => {
              const Icon = item.icon;
              const active = item.key === page;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => switchPage(item.key)}
                  className={
                    active
                      ? "inline-flex min-h-10 w-full min-w-0 items-center justify-center gap-2 rounded-md bg-primary px-0 text-left text-sm font-medium text-primary-foreground sm:justify-start sm:px-3"
                      : "inline-flex min-h-10 w-full min-w-0 items-center justify-center gap-2 rounded-md px-0 text-left text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground sm:justify-start sm:px-3"
                  }
                >
                  <Icon className="shrink-0" size={16} />
                  <span className="hidden truncate sm:block">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>
        <div className="min-w-0">
          {page === "sources" ? (
            <ProxySourcesPage
              schema={schema}
              state={state}
              selectedId={selectedSourceId}
              selectedNodeIndex={selectedNodeIndex}
              setSelectedId={setSelectedSourceId}
              setSelectedNodeIndex={setSelectedNodeIndex}
              updateState={updateState}
              refreshSource={refreshSource}
            />
          ) : null}
          {page === "groups" ? (
            <ProxyGroupsPage
              state={state}
              selectedId={selectedGroupId}
              setSelectedId={setSelectedGroupId}
              updateState={updateState}
            />
          ) : null}
          {page === "targets" ? (
            <TargetGroupsPage
              state={state}
              selectedId={selectedTargetId}
              selectedEntryIndex={selectedEntryIndex}
              setSelectedId={setSelectedTargetId}
              setSelectedEntryIndex={setSelectedEntryIndex}
              updateState={updateState}
            />
          ) : null}
          {page === "global" ? (
            <GlobalConfigPage
              schema={schema}
              global={state.global}
              updateState={updateState}
            />
          ) : null}
          {page === "endpoints" ? (
            <EndpointsPage
              schema={schema}
              state={state}
              selectedIndex={selectedEndpointIndex}
              setSelectedIndex={setSelectedEndpointIndex}
              updateState={updateState}
            />
          ) : null}
          {page === "http_clients" ? (
            <HttpClientsPage
              schema={schema}
              state={state}
              selectedIndex={selectedHttpClientIndex}
              setSelectedIndex={setSelectedHttpClientIndex}
              updateState={updateState}
            />
          ) : null}
          {page === "certificates" ? (
            <CertificatesPage
              schema={schema}
              state={state}
              selectedIndex={selectedCertificateProviderIndex}
              setSelectedIndex={setSelectedCertificateProviderIndex}
              updateState={updateState}
            />
          ) : null}
          {page === "services" ? (
            <ServicesPage
              schema={schema}
              state={state}
              selectedIndex={selectedServiceIndex}
              setSelectedIndex={setSelectedServiceIndex}
              updateState={updateState}
            />
          ) : null}
          {page === "extra_routes" ? (
            <ExtraRouteRulesPage
              schema={schema}
              state={state}
              selectedRuleSetIndex={selectedRouteRuleSetIndex}
              selectedIndex={selectedExtraRouteRuleIndex}
              setSelectedRuleSetIndex={setSelectedRouteRuleSetIndex}
              setSelectedIndex={setSelectedExtraRouteRuleIndex}
              updateState={updateState}
            />
          ) : null}
          {page === "inbounds" ? (
            <InboundsPage
              schema={schema}
              state={state}
              selectedIndex={selectedInboundIndex}
              setSelectedIndex={setSelectedInboundIndex}
              updateState={updateState}
            />
          ) : null}
          {page === "dns" ? (
            <DnsPage
              schema={schema}
              state={state}
              selectedServerIndex={selectedDnsServerIndex}
              selectedRuleIndex={selectedDnsRuleIndex}
              setSelectedServerIndex={setSelectedDnsServerIndex}
              setSelectedRuleIndex={setSelectedDnsRuleIndex}
              updateState={updateState}
            />
          ) : null}
          {page === "base" ? (
            <BaseConfigPage state={state} updateState={updateState} />
          ) : null}
          {page === "output" ? (
            <OutputPage
              output={output}
              resolved={resolved}
              downloadHref={downloadHref}
              onRefresh={refreshOutput}
            />
          ) : null}
        </div>
      </div>
    </main>
  );
}

function NetworkSettingsDialog({
  settings,
  busy,
  onChange,
  onReload,
  onSave,
  onClose,
}: {
  settings: AppSettings;
  busy: boolean;
  onChange: (settings: AppSettings) => void;
  onReload: () => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const updateProxy = (patch: Partial<AppSettings["network"]["proxy"]>) => {
    onChange({
      ...settings,
      network: {
        ...settings.network,
        proxy: {
          ...settings.network.proxy,
          ...patch,
        },
      },
    });
  };
  const updateGithub = (patch: Partial<AppSettings["network"]["github"]>) => {
    onChange({
      ...settings,
      network: {
        ...settings.network,
        github: {
          ...settings.network.github,
          ...patch,
        },
      },
    });
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/30 px-4 py-8"
      role="dialog"
      aria-modal="true"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="grid w-full max-w-2xl gap-4 rounded-md border border-border bg-white p-4 shadow-xl">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">设置</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={onReload} disabled={busy}>
              <RefreshCw size={16} />
              重新加载
            </Button>
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              关闭
            </Button>
          </div>
        </div>

        <section className="grid gap-3 rounded-md border border-border bg-muted/20 p-3">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <h3 className="truncate text-sm font-semibold">后端代理</h3>
            <CheckField
              label="启用"
              checked={settings.network.proxy.enabled}
              onChange={(enabled) => updateProxy({ enabled })}
            />
          </div>
          <Field label="代理 URL">
            <Input
              value={settings.network.proxy.url}
              placeholder="http://user:pass@127.0.0.1:7890"
              onChange={(event) => updateProxy({ url: event.target.value })}
            />
          </Field>
        </section>

        <section className="grid gap-3 rounded-md border border-border bg-muted/20 p-3">
          <h3 className="text-sm font-semibold">GitHub API</h3>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <Field label="API URL">
              <Input
                value={settings.network.github.api_url}
                placeholder="https://api.github.com"
                onChange={(event) =>
                  updateGithub({ api_url: event.target.value })
                }
              />
            </Field>
            <Field label="Token">
              <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <Input
                  type="password"
                  value={settings.network.github.token}
                  onChange={(event) =>
                    updateGithub({ token: event.target.value })
                  }
                />
                <a
                  className="inline-flex h-9 max-w-full items-center justify-center gap-2 whitespace-nowrap rounded-md bg-secondary px-3 text-sm font-medium text-secondary-foreground transition hover:bg-secondary/80"
                  href={githubTokenCreationUrl(settings.network.github.api_url)}
                  target="_blank"
                  rel="noreferrer"
                  title="打开 GitHub 并预填 Composer 所需的只读 Token 权限"
                >
                  <ExternalLink size={15} />
                  生成
                </a>
              </div>
            </Field>
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button onClick={onSave} disabled={busy}>
            <Save size={16} />
            保存
          </Button>
        </div>
      </div>
    </div>
  );
}

function VersionManagerDialog({
  versions,
  name,
  description,
  busy,
  onNameChange,
  onDescriptionChange,
  onCreate,
  onDelete,
  onRestore,
  onRefresh,
  onClose,
}: {
  versions: VersionSummary[];
  name: string;
  description: string;
  busy: boolean;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onRestore: (id: string) => void;
  onRefresh: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/30 px-4 py-8"
      role="dialog"
      aria-modal="true"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="grid w-full max-w-3xl gap-4 rounded-md border border-border bg-white p-4 shadow-xl">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">版本管理</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={onRefresh} disabled={busy}>
              <RefreshCw size={16} />
              刷新
            </Button>
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              关闭
            </Button>
          </div>
        </div>

        <div className="grid gap-3 rounded-md border border-border bg-muted/20 p-3">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <Field label="版本名称">
              <Input
                value={name}
                placeholder="留空使用当前时间"
                onChange={(event) => onNameChange(event.target.value)}
              />
            </Field>
            <Field label="说明">
              <Input
                value={description}
                placeholder="可选"
                onChange={(event) => onDescriptionChange(event.target.value)}
              />
            </Field>
            <Button className="self-end" onClick={onCreate} disabled={busy}>
              <Plus size={16} />
              创建
            </Button>
          </div>
        </div>

        <div className="grid max-h-[55vh] content-start gap-2 overflow-y-auto pr-1">
          {versions.map((version) => (
            <div
              key={version.id}
              className="grid min-w-0 gap-3 rounded-md border border-border bg-background p-3 md:grid-cols-[minmax(0,1fr)_auto]"
            >
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <h3 className="truncate text-sm font-semibold">
                    {version.name}
                  </h3>
                  <Badge>{formatTimestamp(version.created_at)}</Badge>
                </div>
                {version.description ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {version.description}
                  </p>
                ) : null}
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  State updated:{" "}
                  {version.state_updated_at
                    ? formatTimestamp(version.state_updated_at)
                    : "unknown"}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  variant="secondary"
                  onClick={() => onRestore(version.id)}
                  disabled={busy}
                >
                  <RotateCcw size={16} />
                  恢复
                </Button>
                <Button
                  variant="danger"
                  onClick={() => onDelete(version.id)}
                  disabled={busy}
                >
                  <Trash2 size={16} />
                  删除
                </Button>
              </div>
            </div>
          ))}
          {versions.length === 0 ? <EmptyState label="No versions" /> : null}
        </div>
      </div>
    </div>
  );
}

function ProxySourcesPage({
  schema,
  state,
  selectedId,
  selectedNodeIndex,
  setSelectedId,
  setSelectedNodeIndex,
  updateState,
  refreshSource,
}: {
  schema: ComposerSchema;
  state: ComposerState;
  selectedId: string | null;
  selectedNodeIndex: number;
  setSelectedId: (id: string | null) => void;
  setSelectedNodeIndex: (index: number) => void;
  updateState: (recipe: (draft: ComposerState) => void) => void;
  refreshSource: (id: string) => Promise<void>;
}) {
  const selected =
    state.proxy_sources.find((source) => source.id === selectedId) ??
    state.proxy_sources[0] ??
    null;
  const selectedIndex = selected
    ? state.proxy_sources.findIndex((source) => source.id === selected.id)
    : -1;

  const addSource = () => {
    const source = newSource(schema);
    updateState((draft) => {
      draft.proxy_sources.push(source);
    });
    setSelectedId(source.id);
    setSelectedNodeIndex(0);
  };

  return (
    <TwoPane
      title="代理源"
      description={`${state.proxy_sources.length} sources`}
      action={
        <Button variant="secondary" onClick={addSource}>
          <Plus size={16} />
          New
        </Button>
      }
      list={
        <ItemList
          items={state.proxy_sources.map((source) => ({
            id: source.id,
            title: source.name || source.id,
            subtitle: `${source.kind} · ${source.nodes.length} nodes`,
            active: source.id === selected?.id,
            dirty: false,
          }))}
          onSelect={(id) => {
            setSelectedId(id);
            setSelectedNodeIndex(0);
          }}
        />
      }
    >
      {selected && selectedIndex >= 0 ? (
        <SourceDetail
          schema={schema}
          source={selected}
          selectedNodeIndex={selectedNodeIndex}
          setSelectedNodeIndex={setSelectedNodeIndex}
          update={(recipe) =>
            updateState((draft) => recipe(draft.proxy_sources[selectedIndex]))
          }
          replace={(next) =>
            updateState(
              (draft) => void (draft.proxy_sources[selectedIndex] = next),
            )
          }
          remove={() => {
            updateState((draft) => {
              draft.proxy_sources.splice(selectedIndex, 1);
            });
            setSelectedId(
              state.proxy_sources[selectedIndex + 1]?.id ??
                state.proxy_sources[selectedIndex - 1]?.id ??
                null,
            );
          }}
          refresh={() => refreshSource(selected.id)}
        />
      ) : (
        <EmptyState label="No source selected" />
      )}
    </TwoPane>
  );
}

function SourceDetail({
  schema,
  source,
  selectedNodeIndex,
  setSelectedNodeIndex,
  update,
  replace,
  remove,
  refresh,
}: {
  schema: ComposerSchema;
  source: ProxySource;
  selectedNodeIndex: number;
  setSelectedNodeIndex: (index: number) => void;
  update: (recipe: (source: ProxySource) => void) => void;
  replace: (source: ProxySource) => void;
  remove: () => void;
  refresh: () => Promise<void>;
}) {
  const [mode, setMode] = useState<LocalMode>("form");
  const safeNodeIndex = Math.min(
    selectedNodeIndex,
    Math.max(0, source.nodes.length - 1),
  );
  const selectedNode = source.nodes[safeNodeIndex] ?? null;
  const nodesReadOnly = source.kind === "subscription";

  return (
    <section className="grid gap-4">
      <DetailHeader
        title={source.name || source.id}
        subtitle={source.kind}
        mode={mode}
        setMode={setMode}
        actions={
          <>
            <CheckField
              className="self-center"
              label="启用"
              checked={source.enabled}
              onChange={(value) =>
                update((draft) => void (draft.enabled = value))
              }
            />
            {source.kind === "subscription" ? (
              <Button variant="secondary" onClick={() => void refresh()}>
                <RefreshCw size={16} />
                Refresh
              </Button>
            ) : null}
            <Button variant="danger" onClick={remove}>
              <Trash2 size={16} />
              Delete
            </Button>
          </>
        }
      />

      {mode === "form" ? (
        <>
          <Panel>
            <div className={formGridClass}>
              <Field label="ID">
                <Input
                  value={source.id}
                  onChange={(event) =>
                    update((draft) => void (draft.id = event.target.value))
                  }
                />
              </Field>
              <Field label="名称">
                <Input
                  value={source.name}
                  onChange={(event) =>
                    update((draft) => void (draft.name = event.target.value))
                  }
                />
              </Field>
              <Field label="类型">
                <Select
                  value={source.kind}
                  onChange={(event) =>
                    update(
                      (draft) =>
                        void (draft.kind = event.target
                          .value as ProxySource["kind"]),
                    )
                  }
                >
                  <option value="manual">manual</option>
                  <option value="subscription">subscription</option>
                </Select>
              </Field>
              <Field label="节点名前缀">
                <Input
                  value={source.prefix}
                  onChange={(event) =>
                    update((draft) => void (draft.prefix = event.target.value))
                  }
                />
              </Field>
            </div>
          </Panel>

          {source.kind === "subscription" ? (
            <Panel>
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                <Field label="订阅 URL">
                  <Input
                    value={source.subscription.url}
                    onChange={(event) =>
                      update(
                        (draft) =>
                          void (draft.subscription.url = event.target.value),
                      )
                    }
                  />
                </Field>
                <Field label="User-Agent">
                  <Input
                    value={source.subscription.user_agent}
                    onChange={(event) =>
                      update(
                        (draft) =>
                          void (draft.subscription.user_agent =
                            event.target.value),
                      )
                    }
                  />
                </Field>
                <CheckField
                  label="跳过订阅 TLS 校验"
                  checked={source.subscription.skip_tls_verify}
                  onChange={(value) =>
                    update(
                      (draft) =>
                        void (draft.subscription.skip_tls_verify = value),
                    )
                  }
                />
              </div>
              <div className="mt-3 text-sm text-muted-foreground">
                Last fetch: {source.subscription.last_fetch_at ?? "never"}
              </div>
            </Panel>
          ) : null}

          <RewriteEditor rewrites={source.name_rewrites} update={update} />

          <Panel>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">代理条目</h3>
                {nodesReadOnly ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    订阅节点由刷新结果管理，列表只读
                  </p>
                ) : null}
              </div>
              {nodesReadOnly ? (
                <Badge>只读</Badge>
              ) : (
                <Button
                  variant="secondary"
                  onClick={() => {
                    update((draft) => {
                      draft.nodes.push(
                        newOutboundNode(schema, draft.nodes.length + 1),
                      );
                    });
                    setSelectedNodeIndex(source.nodes.length);
                  }}
                >
                  <Plus size={16} />
                  Add
                </Button>
              )}
            </div>
            <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
              <aside className="sticky top-[calc(var(--composer-sticky-top)+1rem)] z-10 min-w-0 rounded-md border border-border bg-muted/20 p-3 max-h-[calc(100vh-var(--composer-sticky-top)-2rem)] overflow-hidden">
                <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold">节点列表</h4>
                  <Badge>{source.nodes.length}</Badge>
                </div>
                <div className="grid max-h-[calc(100vh-var(--composer-sticky-top)-7rem)] min-w-0 content-start gap-2 overflow-y-auto pr-1">
                  {source.nodes.map((node, index) => {
                    const tag =
                      typeof node.tag === "string"
                        ? node.tag
                        : `node-${index + 1}`;
                    const active = index === safeNodeIndex;
                    return (
                      <button
                        key={`${tag}-${index}`}
                        type="button"
                        onClick={() => setSelectedNodeIndex(index)}
                        className={
                          active
                            ? "rounded-md border border-primary bg-primary/10 px-3 py-2 text-left text-sm font-medium"
                            : "rounded-md border border-border bg-background px-3 py-2 text-left text-sm hover:border-primary/50"
                        }
                      >
                        <span className="block truncate">{tag}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {String(node.type ?? "unknown")}
                          {nodesReadOnly ? " · 只读" : ""}
                        </span>
                      </button>
                    );
                  })}
                  {source.nodes.length === 0 ? (
                    <EmptyState
                      label={
                        nodesReadOnly
                          ? "刷新订阅后显示代理节点"
                          : "No proxy nodes"
                      }
                    />
                  ) : null}
                </div>
              </aside>
              <div className="min-w-0">
                {selectedNode ? (
                  <ProxyNodeEditor
                    schemaRoot={schema}
                    node={selectedNode}
                    scopeKey={`${source.id}-${safeNodeIndex}`}
                    readOnly={nodesReadOnly}
                    onChange={(next) =>
                      update(
                        (draft) => void (draft.nodes[safeNodeIndex] = next),
                      )
                    }
                    onDelete={() => {
                      update((draft) => {
                        draft.nodes.splice(safeNodeIndex, 1);
                      });
                      setSelectedNodeIndex(Math.max(0, safeNodeIndex - 1));
                    }}
                  />
                ) : (
                  <EmptyState
                    label={
                      nodesReadOnly
                        ? "选择一个订阅代理节点"
                        : "Select or add a proxy node"
                    }
                  />
                )}
              </div>
            </div>
          </Panel>
        </>
      ) : (
        <Panel>
          <StructuredCodeEditor
            language={mode}
            scopeKey={`${source.id}-${mode}`}
            value={source as unknown as JsonObject}
            onApply={(value) => replace(value as unknown as ProxySource)}
          />
        </Panel>
      )}
    </section>
  );
}

function ProxyNodeEditor({
  schemaRoot,
  node,
  scopeKey,
  readOnly = false,
  onChange,
  onDelete,
}: {
  schemaRoot: ComposerSchema;
  node: JsonObject;
  scopeKey: string;
  readOnly?: boolean;
  onChange: (node: JsonObject) => void;
  onDelete: () => void;
}) {
  const [mode, setMode] = useState<LocalMode>("form");
  const schema = getOutboundSchema(schemaRoot, node.type);
  const errors = validateOutboundNode(schemaRoot, node);
  return (
    <div className="grid min-w-0 gap-3">
      <DetailHeader
        title={String(node.tag ?? "proxy node")}
        subtitle={String(node.type ?? "unknown")}
        mode={mode}
        setMode={setMode}
        embedded
        actions={
          readOnly ? (
            <Badge>只读</Badge>
          ) : (
            <Button variant="danger" onClick={onDelete}>
              <Trash2 size={16} />
              Delete
            </Button>
          )
        }
      />
      {mode === "form" ? (
        schema ? (
          <ProxySchemaEditor
            schemaRoot={schemaRoot}
            node={node}
            schema={schema}
            errors={errors}
            onChange={onChange}
            readOnly={readOnly}
          />
        ) : (
          <Panel>
            <fieldset className="m-0 grid gap-3 border-0 p-0" disabled={readOnly}>
              <div className="text-sm text-destructive">
                不支持的 sing-box 出站类型：{String(node.type ?? "")}
              </div>
              <Field label="类型">
                <Select
                  value=""
                  onChange={(event) =>
                    onChange(
                      changeOutboundType(schemaRoot, node, event.target.value),
                    )
                  }
                >
                  <option value="">选择支持的类型</option>
                  {getOutboundTypeOptions(schemaRoot).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <ObjectFormEditor value={node} onChange={onChange} />
            </fieldset>
          </Panel>
        )
      ) : (
        <StructuredCodeEditor
          language={mode}
          scopeKey={`${scopeKey}-${mode}`}
          value={node}
          onApply={onChange}
          readOnly={readOnly}
        />
      )}
    </div>
  );
}

function ProxySchemaEditor({
  schemaRoot,
  node,
  schema,
  errors,
  onChange,
  readOnly = false,
}: {
  schemaRoot: ComposerSchema;
  node: JsonObject;
  schema: { type: string; label: string; fields: SchemaField[] };
  errors: string[];
  onChange: (node: JsonObject) => void;
  readOnly?: boolean;
}) {
  const updateNode = (next: JsonObject) => {
    onChange(sanitizeOutboundNode(schemaRoot, { type: schema.type, ...next }));
  };

  return (
    <Panel>
      <fieldset className="m-0 grid min-w-0 gap-4 border-0 p-0" disabled={readOnly}>
        <div className={formGridClass}>
          <Field label="类型">
            <Select
              value={schema.type}
              disabled={readOnly}
              onChange={(event) =>
                onChange(
                  changeOutboundType(schemaRoot, node, event.target.value),
                )
              }
            >
              {getOutboundTypeOptions(schemaRoot).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="self-end rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            schema: sing-box outbound/{schema.type}
          </div>
        </div>
        {errors.length > 0 ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {errors.map((error) => (
              <div key={error}>{error}</div>
            ))}
          </div>
        ) : null}
        <SchemaFieldsEditor
          schemaRoot={schemaRoot}
          value={node}
          fields={schema.fields}
          onChange={updateNode}
        />
      </fieldset>
    </Panel>
  );
}

function SchemaFieldsEditor({
  schemaRoot,
  value,
  fields,
  onChange,
}: {
  schemaRoot?: ComposerSchema;
  value: JsonObject;
  fields: SchemaField[];
  onChange: (value: JsonObject) => void;
}) {
  const updateField = (field: SchemaField, nextValue: unknown) => {
    const next = { ...value };
    if (nextValue === undefined) {
      delete next[field.key];
    } else {
      next[field.key] = nextValue;
    }
    onChange(next);
  };

  const updateFlattenedFields = (
    nestedFields: SchemaField[],
    nextValue: JsonObject,
  ) => {
    const next = { ...value };
    for (const key of fieldKeys(nestedFields)) {
      delete next[key];
    }
    Object.assign(next, sanitizeFields(nextValue, nestedFields, schemaRoot));
    onChange(next);
  };

  return (
    <div className="grid gap-4">
      <div className={formGridClass}>
        {fields.map((field) =>
          field.kind === "constraint" ||
          isFlattenedField(field) ||
          !isFieldVisible(field, value) ? null : (
            <SchemaFieldEditor
              key={field.key}
              schemaRoot={schemaRoot}
              field={field}
              value={value[field.key]}
              onChange={(nextValue) => updateField(field, nextValue)}
            />
          ),
        )}
      </div>
      {fields
        .filter(
          (field) => isFlattenedField(field) && isFieldVisible(field, value),
        )
        .map((field) => (
          <NestedBox key={field.key} title={field.label}>
            <SchemaFieldsEditor
              schemaRoot={schemaRoot}
              value={pickFields(value, field.fields ?? [])}
              fields={field.fields ?? []}
              onChange={(nextValue) =>
                updateFlattenedFields(field.fields ?? [], nextValue)
              }
            />
          </NestedBox>
        ))}
    </div>
  );
}

function SchemaFieldEditor({
  schemaRoot,
  field,
  value,
  onChange,
}: {
  schemaRoot?: ComposerSchema;
  field: SchemaField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const label = schemaFieldLabel(field);
  const wideClass = field.wide ? "md:col-span-2" : undefined;

  if (field.kind === "boolean") {
    return (
      <CheckField
        label={label}
        checked={value === true}
        onChange={(checked) => onChange(checked ? true : undefined)}
      />
    );
  }

  if (field.kind === "number") {
    return (
      <Field label={label} className={wideClass}>
        <Input
          type="number"
          value={value === undefined || value === null ? "" : String(value)}
          onChange={(event) =>
            onChange(
              event.target.value === ""
                ? undefined
                : Number(event.target.value),
            )
          }
        />
      </Field>
    );
  }

  if (field.kind === "string-or-number") {
    return (
      <Field label={label} className={wideClass}>
        <Input
          value={value === undefined || value === null ? "" : String(value)}
          placeholder={field.placeholder}
          onChange={(event) =>
            onChange(parseStringOrNumberInput(event.target.value))
          }
        />
      </Field>
    );
  }

  if (field.kind === "select") {
    const currentValue =
      value === undefined || value === null ? "" : String(value);
    return (
      <Field label={label} className={wideClass}>
        <Select
          value={currentValue}
          onChange={(event) =>
            onChange(
              event.target.value === ""
                ? undefined
                : field.valueType === "number"
                  ? Number(event.target.value)
                  : event.target.value,
            )
          }
        >
          {fieldSelectOptions(field, currentValue).map((option) => (
            <option key={option || "empty"} value={option}>
              {option || "default"}
            </option>
          ))}
        </Select>
      </Field>
    );
  }

  if (
    field.kind === "string-list" ||
    field.kind === "number-list" ||
    field.kind === "string-or-number-list"
  ) {
    return (
      <Field label={label} className={wideClass}>
        <LineListTextarea
          value={arrayInputItems(value)}
          placeholder="每行一个值"
          onChange={(values) => {
            onChange(
              values.length === 0
                ? undefined
                : field.kind === "number-list"
                  ? values.map(Number).filter(Number.isFinite)
                  : field.kind === "string-or-number-list"
                    ? values.map(parseStringOrNumberListItem)
                  : values,
            );
          }}
        />
      </Field>
    );
  }

  if (field.kind === "map") {
    return (
      <div className={wideClass}>
        <MapFieldEditor
          label={label}
          value={isJsonObject(value) ? value : {}}
          valueType={field.valueType}
          onChange={(next) =>
            onChange(Object.keys(next).length === 0 ? undefined : next)
          }
        />
      </div>
    );
  }

  if (field.kind === "object-list") {
    return (
      <div className="md:col-span-2">
        <ObjectListField
          schemaRoot={schemaRoot}
          field={field}
          value={objectListInputItems(value)}
          onChange={onChange}
        />
      </div>
    );
  }

  if (field.kind === "object-map") {
    return (
      <div className="md:col-span-2">
        <ObjectMapField
          schemaRoot={schemaRoot}
          field={field}
          value={isJsonObject(value) ? value : {}}
          onChange={onChange}
        />
      </div>
    );
  }

  if (field.kind === "object") {
    return (
      <div className="md:col-span-2">
        <OptionalObjectField
          schemaRoot={schemaRoot}
          field={field}
          value={isJsonObject(value) ? value : null}
          onChange={onChange}
        />
      </div>
    );
  }

  if (field.kind === "variant-object") {
    return (
      <div className="md:col-span-2">
        <VariantObjectField
          schemaRoot={schemaRoot}
          field={field}
          value={isJsonObject(value) ? value : null}
          onChange={onChange}
        />
      </div>
    );
  }

  if (field.kind === "string-or-object") {
    return (
      <div className="md:col-span-2">
        <StringOrObjectField
          schemaRoot={schemaRoot}
          field={field}
          value={value}
          onChange={onChange}
        />
      </div>
    );
  }

  if (field.kind === "string-or-object-list") {
    return (
      <div className="md:col-span-2">
        <StringOrObjectListField
          schemaRoot={schemaRoot}
          field={field}
          value={value}
          onChange={onChange}
        />
      </div>
    );
  }

  if (field.kind === "number-or-object") {
    return (
      <div className="md:col-span-2">
        <NumberOrObjectField
          schemaRoot={schemaRoot}
          field={field}
          value={value}
          onChange={onChange}
        />
      </div>
    );
  }

  if (field.kind === "boolean-or-object") {
    return (
      <div className="md:col-span-2">
        <BooleanOrObjectField
          schemaRoot={schemaRoot}
          field={field}
          value={value}
          onChange={onChange}
        />
      </div>
    );
  }

  if (field.kind === "typed-list") {
    return (
      <div className="md:col-span-2">
        <TypedListField
          schemaRoot={schemaRoot}
          field={field}
          value={Array.isArray(value) ? value : []}
          onChange={onChange}
        />
      </div>
    );
  }

  if (field.kind === "json") {
    return (
      <Field label={label} className={field.wide ? "md:col-span-2" : wideClass}>
        <JsonValueEditor
          value={value}
          placeholder={field.placeholder}
          onChange={onChange}
        />
      </Field>
    );
  }

  return (
    <Field label={label} className={wideClass}>
      <Input
        value={value === undefined || value === null ? "" : String(value)}
        placeholder={field.placeholder}
        onChange={(event) =>
          onChange(event.target.value === "" ? undefined : event.target.value)
        }
      />
    </Field>
  );
}

function schemaFieldLabel(field: SchemaField): string {
  return field.required ? field.label : `${field.label}（选填）`;
}

function fieldSelectOptions(field: SchemaField, currentValue: string): string[] {
  const options = field.options ?? [];
  if (currentValue === "" || options.includes(currentValue)) {
    return options;
  }
  return [currentValue, ...options];
}

function schemaNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function headerEnabledField(fields: SchemaField[]): SchemaField | undefined {
  return fields.find(
    (field) => field.key === "enabled" && field.kind === "boolean",
  );
}

function bodyFields(fields: SchemaField[]): SchemaField[] {
  return fields.filter(
    (field) =>
      field.kind !== "constraint" &&
      !(field.key === "enabled" && field.kind === "boolean"),
  );
}

function setObjectBoolean(
  value: JsonObject,
  field: SchemaField,
  checked: boolean,
): JsonObject {
  const next = { ...value };
  if (checked) {
    next[field.key] = true;
  } else {
    delete next[field.key];
  }
  return next;
}

function HeaderEnabledSwitch({
  field,
  value,
  onChange,
}: {
  field?: SchemaField;
  value: JsonObject;
  onChange: (checked: boolean) => void;
}) {
  if (!field || !isFieldVisible(field, value)) {
    return null;
  }

  return (
    <CheckField
      className="self-center"
      label={field.label}
      checked={value[field.key] === true}
      onChange={onChange}
    />
  );
}

function OptionalObjectField({
  schemaRoot,
  field,
  value,
  onChange,
}: {
  schemaRoot?: ComposerSchema;
  field: SchemaField;
  value: JsonObject | null;
  onChange: (value: unknown) => void;
}) {
  const fields = field.fields ?? [];
  const enabledField = headerEnabledField(fields);
  const contentFields = bodyFields(fields);

  if (!value) {
    return (
      <NestedBox
        title={schemaFieldLabel(field)}
        action={
          <Button
            variant="secondary"
            onClick={() =>
              onChange(
                (defaultValueForField(field) as JsonObject | undefined) ?? {},
              )
            }
          >
            <Plus size={16} />
            Add
          </Button>
        }
      >
        <EmptyState label={field.required ? "未填写" : "未启用"} />
      </NestedBox>
    );
  }

  return (
    <NestedBox
      title={schemaFieldLabel(field)}
      action={
        <div className="flex flex-wrap gap-2">
          <HeaderEnabledSwitch
            field={enabledField}
            value={value}
            onChange={(checked) => {
              const next = setObjectBoolean(value, enabledField!, checked);
              const sanitized = sanitizeFields(next, fields, schemaRoot);
              onChange(
                Object.keys(sanitized).length === 0 ? undefined : sanitized,
              );
            }}
          />
          <Button variant="ghost" onClick={() => onChange(undefined)}>
            <Trash2 size={16} />
            Remove
          </Button>
        </div>
      }
    >
      {contentFields.length > 0 ? (
        <SchemaFieldsEditor
          schemaRoot={schemaRoot}
          value={value}
          fields={contentFields}
          onChange={(next) => {
            const sanitized = sanitizeFields(next, fields, schemaRoot);
            onChange(
              Object.keys(sanitized).length === 0 ? undefined : sanitized,
            );
          }}
        />
      ) : (
        <EmptyState label="没有额外字段" />
      )}
      {validateFields(value, fields, schemaRoot, `${field.label}.`).map(
        (error) => (
          <div key={error} className="text-sm text-destructive">
            {error}
          </div>
        ),
      )}
    </NestedBox>
  );
}

function VariantObjectField({
  schemaRoot,
  field,
  value,
  onChange,
}: {
  schemaRoot?: ComposerSchema;
  field: SchemaField;
  value: JsonObject | null;
  onChange: (value: unknown) => void;
}) {
  const defaultType = field.variantOptions?.[0] ?? "";
  if (!value) {
    return (
      <NestedBox
        title={schemaFieldLabel(field)}
        action={
          <Button
            variant="secondary"
            onClick={() =>
              onChange(
                (defaultValueForField(field) as JsonObject | undefined) ?? {
                  type: defaultType,
                },
              )
            }
          >
            <Plus size={16} />
            Add
          </Button>
        }
      >
        <EmptyState label="未启用" />
      </NestedBox>
    );
  }

  const type =
    typeof value.type === "string" && field.variantOptions?.includes(value.type)
      ? value.type
      : defaultType;
  const fields = field.variants?.[type] ?? [];
  const enabledField = headerEnabledField(fields);
  const contentFields = bodyFields(fields);

  const updateVariant = (nextType: string) => {
    onChange({ type: nextType });
  };

  return (
    <NestedBox
      title={schemaFieldLabel(field)}
      action={
        <div className="flex flex-wrap gap-2">
          <HeaderEnabledSwitch
            field={enabledField}
            value={value}
            onChange={(checked) =>
              onChange(setObjectBoolean(value, enabledField!, checked))
            }
          />
          <Button variant="ghost" onClick={() => onChange(undefined)}>
            <Trash2 size={16} />
            Remove
          </Button>
        </div>
      }
    >
      <div className="grid gap-4">
        <Field label="类型">
          <Select
            value={type}
            onChange={(event) => updateVariant(event.target.value)}
          >
            {(field.variantOptions ?? []).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </Field>
        {contentFields.length > 0 ? (
          <SchemaFieldsEditor
            schemaRoot={schemaRoot}
            value={value}
            fields={contentFields}
            onChange={(next) => {
              const sanitized = sanitizeFields(next, fields, schemaRoot);
              onChange({ type, ...sanitized });
            }}
          />
        ) : (
          <EmptyState label="该类型没有额外字段" />
        )}
      </div>
    </NestedBox>
  );
}

function StringOrObjectField({
  schemaRoot,
  field,
  value,
  onChange,
}: {
  schemaRoot?: ComposerSchema;
  field: SchemaField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const label = schemaFieldLabel(field);
  const objectValue = isJsonObject(value) ? value : null;
  const stringValue = typeof value === "string" ? value : "";
  const fields = field.fields ?? [];
  const enabledField = headerEnabledField(fields);
  const contentFields = bodyFields(fields);

  if (!objectValue && stringValue === "") {
    return (
      <NestedBox
        title={label}
        action={
          <Button
            variant="secondary"
            onClick={() =>
              onChange(
                (defaultValueForField(field) as JsonObject | undefined) ?? {},
              )
            }
          >
            <Plus size={16} />
            Object
          </Button>
        }
      >
        <Field label="Tag">
          <Input
            value=""
            onChange={(event) =>
              onChange(
                event.target.value === "" ? undefined : event.target.value,
              )
            }
          />
        </Field>
      </NestedBox>
    );
  }

  if (objectValue) {
    return (
      <NestedBox
        title={label}
        action={
          <div className="flex flex-wrap gap-2">
            <HeaderEnabledSwitch
              field={enabledField}
              value={objectValue}
              onChange={(checked) => {
                const next = setObjectBoolean(
                  objectValue,
                  enabledField!,
                  checked,
                );
                const sanitized = sanitizeFields(next, fields, schemaRoot);
                onChange(
                  Object.keys(sanitized).length === 0 ? undefined : sanitized,
                );
              }}
            />
            <Button variant="ghost" onClick={() => onChange("")}>
              Tag
            </Button>
            <Button variant="ghost" onClick={() => onChange(undefined)}>
              <Trash2 size={16} />
              Remove
            </Button>
          </div>
        }
      >
        {contentFields.length > 0 ? (
          <SchemaFieldsEditor
            schemaRoot={schemaRoot}
            value={objectValue}
            fields={contentFields}
            onChange={(next) => {
              const sanitized = sanitizeFields(next, fields, schemaRoot);
              onChange(
                Object.keys(sanitized).length === 0 ? undefined : sanitized,
              );
            }}
          />
        ) : (
          <EmptyState label="没有额外字段" />
        )}
        {validateFields(objectValue, fields, schemaRoot, `${field.label}.`).map(
          (error) => (
            <div key={error} className="text-sm text-destructive">
              {error}
            </div>
          ),
        )}
      </NestedBox>
    );
  }

  return (
    <NestedBox
      title={label}
      action={
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => onChange({})}>
            Object
          </Button>
          <Button variant="ghost" onClick={() => onChange(undefined)}>
            <Trash2 size={16} />
            Remove
          </Button>
        </div>
      }
    >
      <Field label="Tag">
        <Input
          value={stringValue}
          onChange={(event) =>
            onChange(event.target.value === "" ? undefined : event.target.value)
          }
        />
      </Field>
  </NestedBox>
  );
}

function NumberOrObjectField({
  schemaRoot,
  field,
  value,
  onChange,
}: {
  schemaRoot?: ComposerSchema;
  field: SchemaField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const label = schemaFieldLabel(field);
  const objectValue = isJsonObject(value) ? value : null;
  const numberValue = numericInputValue(value);
  const fields = field.fields ?? [];
  const enabledField = headerEnabledField(fields);
  const contentFields = bodyFields(fields);

  if (!objectValue && numberValue === "") {
    return (
      <NestedBox
        title={label}
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => onChange(schemaNumber(field.min) ?? 0)}
            >
              <Plus size={16} />
              Number
            </Button>
            <Button variant="ghost" onClick={() => onChange({})}>
              Object
            </Button>
          </div>
        }
      >
        <EmptyState label={field.required ? "未填写" : "未启用"} />
      </NestedBox>
    );
  }

  if (!objectValue) {
    return (
      <NestedBox
        title={label}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => onChange({})}>
              Object
            </Button>
            <Button variant="ghost" onClick={() => onChange(undefined)}>
              <Trash2 size={16} />
              Remove
            </Button>
          </div>
        }
      >
        <Field label="Number">
          <Input
            type="number"
            value={numberValue}
            onChange={(event) =>
              onChange(
                event.target.value === ""
                  ? undefined
                  : Number(event.target.value),
              )
            }
          />
        </Field>
      </NestedBox>
    );
  }

  return (
    <NestedBox
      title={label}
      action={
        <div className="flex flex-wrap gap-2">
          <HeaderEnabledSwitch
            field={enabledField}
            value={objectValue}
            onChange={(checked) => {
              const next = setObjectBoolean(objectValue, enabledField!, checked);
              const sanitized = sanitizeFields(next, fields, schemaRoot);
              onChange(
                Object.keys(sanitized).length === 0 ? undefined : sanitized,
              );
            }}
          />
          <Button
            variant="ghost"
            onClick={() => onChange(schemaNumber(field.min) ?? 0)}
          >
            Number
          </Button>
          <Button variant="ghost" onClick={() => onChange(undefined)}>
            <Trash2 size={16} />
            Remove
          </Button>
        </div>
      }
    >
      {contentFields.length > 0 ? (
        <SchemaFieldsEditor
          schemaRoot={schemaRoot}
          value={objectValue}
          fields={contentFields}
          onChange={(next) => {
            const sanitized = sanitizeFields(next, fields, schemaRoot);
            onChange(
              Object.keys(sanitized).length === 0 ? undefined : sanitized,
            );
          }}
        />
      ) : (
        <EmptyState label="没有额外字段" />
      )}
      {validateFields(objectValue, fields, schemaRoot, `${field.label}.`).map(
        (error) => (
          <div key={error} className="text-sm text-destructive">
            {error}
          </div>
        ),
      )}
    </NestedBox>
  );
}

function BooleanOrObjectField({
  schemaRoot,
  field,
  value,
  onChange,
}: {
  schemaRoot?: ComposerSchema;
  field: SchemaField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const label = schemaFieldLabel(field);
  const objectValue = isJsonObject(value) ? value : null;
  const booleanValue = value === true;
  const fields = field.fields ?? [];
  const enabledField = headerEnabledField(fields);
  const contentFields = bodyFields(fields);

  if (!objectValue && !booleanValue) {
    return (
      <NestedBox
        title={label}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => onChange(true)}>
              <Plus size={16} />
              Enable
            </Button>
            <Button variant="ghost" onClick={() => onChange({})}>
              Object
            </Button>
          </div>
        }
      >
        <EmptyState label={field.required ? "未填写" : "未启用"} />
      </NestedBox>
    );
  }

  if (booleanValue) {
    return (
      <NestedBox
        title={label}
        action={
          <div className="flex flex-wrap gap-2">
            <CheckField
              className="self-center"
              label="启用"
              checked
              onChange={(checked) => onChange(checked ? true : undefined)}
            />
            <Button variant="ghost" onClick={() => onChange({ enabled: true })}>
              Object
            </Button>
          </div>
        }
      >
        <EmptyState label="true" />
      </NestedBox>
    );
  }

  return (
    <NestedBox
      title={label}
      action={
        <div className="flex flex-wrap gap-2">
          <HeaderEnabledSwitch
            field={enabledField}
            value={objectValue ?? {}}
            onChange={(checked) => {
              const next = setObjectBoolean(
                objectValue ?? {},
                enabledField!,
                checked,
              );
              const sanitized = sanitizeFields(next, fields, schemaRoot);
              onChange(
                Object.keys(sanitized).length === 0 ? undefined : sanitized,
              );
            }}
          />
          <Button variant="ghost" onClick={() => onChange(true)}>
            Bool
          </Button>
          <Button variant="ghost" onClick={() => onChange(undefined)}>
            <Trash2 size={16} />
            Remove
          </Button>
        </div>
      }
    >
      {contentFields.length > 0 ? (
        <SchemaFieldsEditor
          schemaRoot={schemaRoot}
          value={objectValue ?? {}}
          fields={contentFields}
          onChange={(next) => {
            const sanitized = sanitizeFields(next, fields, schemaRoot);
            onChange(
              Object.keys(sanitized).length === 0 ? undefined : sanitized,
            );
          }}
        />
      ) : (
        <EmptyState label="没有额外字段" />
      )}
      {validateFields(
        objectValue ?? {},
        fields,
        schemaRoot,
        `${field.label}.`,
      ).map((error) => (
        <div key={error} className="text-sm text-destructive">
          {error}
        </div>
      ))}
    </NestedBox>
  );
}

function TypedListField({
  schemaRoot,
  field,
  value,
  onChange,
}: {
  schemaRoot?: ComposerSchema;
  field: SchemaField;
  value: unknown[];
  onChange: (value: unknown) => void;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const items = value.filter(isJsonObject);
  const safeIndex = Math.min(selectedIndex, Math.max(0, items.length - 1));
  const selected = items[safeIndex] ?? null;
  const typeOptions = schemaRoot
    ? getTypedListTypeOptions(schemaRoot, field)
    : [];
  const defaultType = schemaRoot
    ? getTypedListDefaultType(schemaRoot, field)
    : "";

  const replaceItems = (nextItems: JsonObject[]) => {
    onChange(nextItems.length === 0 ? undefined : nextItems);
  };

  const addItem = () => {
    if (!schemaRoot || !defaultType) {
      return;
    }
    const next = createTypedListItem(schemaRoot, field, defaultType);
    replaceItems([...items, next]);
    setSelectedIndex(items.length);
  };

  return (
    <NestedBox
      title={schemaFieldLabel(field)}
      action={
        <Button
          variant="secondary"
          onClick={addItem}
          disabled={!schemaRoot || typeOptions.length === 0}
        >
          <Plus size={16} />
          Add
        </Button>
      }
    >
      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="min-w-0 rounded-md border border-border bg-muted/20 p-3">
          <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">{field.label}</h4>
            <Badge>{items.length}</Badge>
          </div>
          <div className="grid max-h-72 min-w-0 content-start gap-2 overflow-y-auto pr-1">
            {items.map((item, index) => {
              const active = index === safeIndex;
              return (
                <button
                  key={`${String(item.type ?? "default")}-${index}`}
                  type="button"
                  onClick={() => setSelectedIndex(index)}
                  className={
                    active
                      ? "rounded-md border border-primary bg-primary/10 px-3 py-2 text-left text-sm font-medium"
                      : "rounded-md border border-border bg-background px-3 py-2 text-left text-sm hover:border-primary/50"
                  }
                >
                  <span className="block truncate">
                    {summarizeTypedListItem(field, item, index)}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {String(item.type ?? "default")}
                  </span>
                </button>
              );
            })}
            {items.length === 0 ? <EmptyState label="Empty" /> : null}
          </div>
        </aside>
        <div className="min-w-0">
          {schemaRoot && selected ? (
            <TypedListItemEditor
              schemaRoot={schemaRoot}
              field={field}
              item={selected}
              onChange={(next) => {
                const nextItems = [...items];
                nextItems[safeIndex] = next;
                replaceItems(nextItems);
              }}
              onDelete={() => {
                const nextItems = items.filter(
                  (_, index) => index !== safeIndex,
                );
                replaceItems(nextItems);
                setSelectedIndex(Math.max(0, safeIndex - 1));
              }}
            />
          ) : (
            <EmptyState label="Select or add a child rule" />
          )}
        </div>
      </div>
    </NestedBox>
  );
}

function TypedListItemEditor({
  schemaRoot,
  field,
  item,
  onChange,
  onDelete,
}: {
  schemaRoot: ComposerSchema;
  field: SchemaField;
  item: JsonObject;
  onChange: (value: JsonObject) => void;
  onDelete: () => void;
}) {
  const itemSchema = getTypedListItemSchema(schemaRoot, field, item.type);
  const errors = validateTypedListItem(schemaRoot, field, item);
  if (!itemSchema) {
    return (
      <div className="grid gap-3">
        <div className="text-sm text-destructive">
          不支持的子规则类型：{String(item.type ?? "")}
        </div>
        <Field label="类型">
          <Select
            value=""
            onChange={(event) =>
              onChange(
                changeTypedListItemType(
                  schemaRoot,
                  field,
                  item,
                  event.target.value,
                ),
              )
            }
          >
            <option value="">选择支持的类型</option>
            {getTypedListTypeOptions(schemaRoot, field).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <ObjectFormEditor value={item} onChange={onChange} />
      </div>
    );
  }

  return (
    <div className="grid min-w-0 gap-3">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div className="min-w-0">
          <h4 className="truncate text-sm font-semibold">
            {summarizeTypedListItem(field, item, 0)}
          </h4>
          <p className="truncate text-xs text-muted-foreground">
            {itemSchema.label}
          </p>
        </div>
        <Button variant="danger" onClick={onDelete}>
          <Trash2 size={16} />
          Delete
        </Button>
      </div>
      <div className={formGridClass}>
        <Field label="类型">
          <Select
            value={itemSchema.type}
            onChange={(event) =>
              onChange(
                changeTypedListItemType(
                  schemaRoot,
                  field,
                  item,
                  event.target.value,
                ),
              )
            }
          >
            {getTypedListTypeOptions(schemaRoot, field).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="self-end rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          schema: {field.schemaNamespace}/{itemSchema.type}
        </div>
      </div>
      {errors.length > 0 ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {errors.map((error) => (
            <div key={error}>{error}</div>
          ))}
        </div>
      ) : null}
      <SchemaFieldsEditor
        schemaRoot={schemaRoot}
        value={item}
        fields={itemSchema.fields}
        onChange={(next) =>
          onChange(sanitizeTypedListItem(schemaRoot, field, next))
        }
      />
    </div>
  );
}

function JsonValueEditor({
  value,
  placeholder,
  onChange,
}: {
  value: unknown;
  placeholder?: string;
  onChange: (value: unknown) => void;
}) {
  const serialized = value === undefined ? "" : JSON.stringify(value, null, 2);
  const [draft, setDraft] = useState(serialized);
  const [error, setError] = useState("");

  useEffect(() => {
    setDraft(serialized);
    setError("");
  }, [serialized]);

  const apply = () => {
    if (draft.trim() === "") {
      onChange(undefined);
      setError("");
      return;
    }
    try {
      onChange(JSON.parse(draft));
      setError("");
    } catch (parseError) {
      setError(errorMessage(parseError));
    }
  };

  return (
    <div className="grid gap-2">
      <Textarea
        expandable={false}
        textareaClassName="min-h-24 resize-y"
        value={draft}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
      />
      <div className="flex items-center justify-between gap-2">
        {error ? (
          <div className="min-w-0 text-sm text-destructive">{error}</div>
        ) : (
          <div />
        )}
        <Button variant="secondary" onClick={apply}>
          <Save size={16} />
          Apply
        </Button>
      </div>
    </div>
  );
}

function MapFieldEditor({
  label,
  value,
  valueType,
  onChange,
}: {
  label: string;
  value: JsonObject;
  valueType?: SchemaField["valueType"];
  onChange: (value: JsonObject) => void;
}) {
  const entries = Object.entries(value);
  const updateKey = (oldKey: string, newKey: string) => {
    const clean = newKey.trim();
    if (!clean || clean === oldKey) {
      return;
    }
    const next: JsonObject = {};
    for (const [key, item] of entries) {
      next[key === oldKey ? clean : key] = item;
    }
    onChange(next);
  };
  const updateValue = (key: string, nextValue: string) => {
    const next = { ...value };
    if (nextValue === "") {
      delete next[key];
    } else {
      next[key] = parseMapValue(nextValue, valueType);
    }
    onChange(next);
  };
  return (
    <NestedBox
      title={label}
      action={
        <Button
          variant="secondary"
          onClick={() => {
            let key = "header";
            let index = 1;
            while (key in value) {
              index += 1;
              key = `header_${index}`;
            }
            onChange({ ...value, [key]: "" });
          }}
        >
          <Plus size={16} />
          Add
        </Button>
      }
    >
      <div className="grid gap-2">
        {entries.map(([key, item]) => (
          <div
            key={key}
            className="grid gap-2 md:grid-cols-[220px_minmax(0,1fr)_auto]"
          >
            <Input
              defaultValue={key}
              onBlur={(event) => updateKey(key, event.target.value)}
            />
            {valueType === "string-list" ? (
              <LineListTextarea
                value={mapValueLines(item)}
                onChange={(values) =>
                  updateValue(key, values.length === 0 ? "" : values.join("\n"))
                }
              />
            ) : (
              <Input
                type={valueType === "number" ? "number" : "text"}
                value={mapValueText(item)}
                onChange={(event) => updateValue(key, event.target.value)}
              />
            )}
            <Button
              variant="ghost"
              onClick={() => {
                const next = { ...value };
                delete next[key];
                onChange(next);
              }}
            >
              <Trash2 size={16} />
            </Button>
          </div>
        ))}
        {entries.length === 0 ? <EmptyState label="Empty" /> : null}
      </div>
    </NestedBox>
  );
}

function parseMapValue(
  value: string,
  valueType?: SchemaField["valueType"],
): string | number | string[] {
  if (valueType === "number") {
    const number = Number(value);
    return Number.isFinite(number) ? number : value;
  }
  if (valueType === "string-list") {
    return parseLines(value);
  }
  return value;
}

function mapValueText(value: unknown): string {
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  return String(value ?? "");
}

function mapValueLines(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String);
  }
  if (typeof value === "string" && value.trim() !== "") {
    return [value];
  }
  return [];
}

function ObjectListField({
  schemaRoot,
  field,
  value,
  onChange,
}: {
  schemaRoot?: ComposerSchema;
  field: SchemaField;
  value: unknown[];
  onChange: (value: unknown) => void;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const fields = field.fields ?? [];
  const items = value.filter(isJsonObject);
  const safeIndex = Math.min(selectedIndex, Math.max(0, items.length - 1));
  const selected = items[safeIndex] ?? null;

  const replaceItems = (nextItems: JsonObject[]) => {
    onChange(nextItems.length === 0 ? undefined : nextItems);
  };

  const addItem = () => {
    const next = sanitizeFields(initialObjectFromFields(fields), fields, schemaRoot);
    replaceItems([...items, next]);
    setSelectedIndex(items.length);
  };

  return (
    <NestedBox
      title={schemaFieldLabel(field)}
      action={
        <Button variant="secondary" onClick={addItem}>
          <Plus size={16} />
          Add
        </Button>
      }
    >
      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="min-w-0 rounded-md border border-border bg-muted/20 p-3">
          <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">{field.label}</h4>
            <Badge>{items.length}</Badge>
          </div>
          <div className="grid max-h-72 min-w-0 content-start gap-2 overflow-y-auto pr-1">
            {items.map((item, index) => {
              const active = index === safeIndex;
              return (
                <button
                  key={`object-list-${field.key}-${index}`}
                  type="button"
                  onClick={() => setSelectedIndex(index)}
                  className={
                    active
                      ? "rounded-md border border-primary bg-primary/10 px-3 py-2 text-left text-sm font-medium"
                      : "rounded-md border border-border bg-background px-3 py-2 text-left text-sm hover:border-primary/50"
                  }
                >
                  <span className="block truncate">
                    {summarizeObjectValue(item, index)}
                  </span>
                </button>
              );
            })}
            {items.length === 0 ? <EmptyState label="Empty" /> : null}
          </div>
        </aside>
        <div className="min-w-0">
          {selected ? (
            <ObjectListItemEditor
              schemaRoot={schemaRoot}
              field={field}
              item={selected}
              index={safeIndex}
              onChange={(next) => {
                const nextItems = [...items];
                nextItems[safeIndex] = next;
                replaceItems(nextItems);
              }}
              onDelete={() => {
                const nextItems = items.filter(
                  (_, index) => index !== safeIndex,
                );
                replaceItems(nextItems);
                setSelectedIndex(Math.max(0, safeIndex - 1));
              }}
            />
          ) : (
            <EmptyState label="Select or add an item" />
          )}
        </div>
      </div>
    </NestedBox>
  );
}

function ObjectListItemEditor({
  schemaRoot,
  field,
  item,
  index,
  onChange,
  onDelete,
}: {
  schemaRoot?: ComposerSchema;
  field: SchemaField;
  item: JsonObject;
  index: number;
  onChange: (value: JsonObject) => void;
  onDelete: () => void;
}) {
  const fields = field.fields ?? [];
  const errors = validateFields(item, fields, schemaRoot);
  return (
    <div className="grid min-w-0 gap-3">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div className="min-w-0">
          <h4 className="truncate text-sm font-semibold">
            {summarizeObjectValue(item, index)}
          </h4>
          <p className="truncate text-xs text-muted-foreground">
            {field.label} #{index + 1}
          </p>
        </div>
        <Button variant="danger" onClick={onDelete}>
          <Trash2 size={16} />
          Delete
        </Button>
      </div>
      {errors.length > 0 ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {errors.map((error) => (
            <div key={error}>{error}</div>
          ))}
        </div>
      ) : null}
      {fields.length > 0 ? (
        <SchemaFieldsEditor
          schemaRoot={schemaRoot}
          value={item}
          fields={fields}
          onChange={(next) =>
            onChange(sanitizeFields(next, fields, schemaRoot))
          }
        />
      ) : (
        <EmptyState label="Empty" />
      )}
    </div>
  );
}

function StringOrObjectListField({
  schemaRoot,
  field,
  value,
  onChange,
}: {
  schemaRoot?: ComposerSchema;
  field: SchemaField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const fields = field.fields ?? [];
  const items = stringOrObjectItems(value);
  const safeIndex = Math.min(selectedIndex, Math.max(0, items.length - 1));
  const selected = items[safeIndex] ?? null;

  const replaceItems = (nextItems: Array<string | JsonObject>) => {
    onChange(nextItems.length === 0 ? undefined : nextItems);
  };

  const addString = () => {
    replaceItems([...items, ""]);
    setSelectedIndex(items.length);
  };

  const addObject = () => {
    const next = sanitizeFields(
      initialObjectFromFields(fields),
      fields,
      schemaRoot,
    );
    replaceItems([...items, next]);
    setSelectedIndex(items.length);
  };

  return (
    <NestedBox
      title={schemaFieldLabel(field)}
      action={
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={addString}>
            <Plus size={16} />
            String
          </Button>
          <Button variant="secondary" onClick={addObject}>
            <Plus size={16} />
            Object
          </Button>
        </div>
      }
    >
      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="min-w-0 rounded-md border border-border bg-muted/20 p-3">
          <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">{field.label}</h4>
            <Badge>{items.length}</Badge>
          </div>
          <div className="grid max-h-72 min-w-0 content-start gap-2 overflow-y-auto pr-1">
            {items.map((item, index) => {
              const active = index === safeIndex;
              return (
                <button
                  key={`string-object-list-${field.key}-${index}`}
                  type="button"
                  onClick={() => setSelectedIndex(index)}
                  className={
                    active
                      ? "rounded-md border border-primary bg-primary/10 px-3 py-2 text-left text-sm font-medium"
                      : "rounded-md border border-border bg-background px-3 py-2 text-left text-sm hover:border-primary/50"
                  }
                >
                  <span className="block truncate">
                    {summarizeStringOrObjectItem(item, index)}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {typeof item === "string" ? "string" : "object"}
                  </span>
                </button>
              );
            })}
            {items.length === 0 ? <EmptyState label="Empty" /> : null}
          </div>
        </aside>
        <div className="min-w-0">
          {selected !== null ? (
            <StringOrObjectListItemEditor
              schemaRoot={schemaRoot}
              field={field}
              item={selected}
              index={safeIndex}
              onChange={(next) => {
                const nextItems = [...items];
                nextItems[safeIndex] = next;
                replaceItems(nextItems);
              }}
              onDelete={() => {
                const nextItems = items.filter(
                  (_, index) => index !== safeIndex,
                );
                replaceItems(nextItems);
                setSelectedIndex(Math.max(0, safeIndex - 1));
              }}
            />
          ) : (
            <EmptyState label="Select or add an item" />
          )}
        </div>
      </div>
    </NestedBox>
  );
}

function StringOrObjectListItemEditor({
  schemaRoot,
  field,
  item,
  index,
  onChange,
  onDelete,
}: {
  schemaRoot?: ComposerSchema;
  field: SchemaField;
  item: string | JsonObject;
  index: number;
  onChange: (value: string | JsonObject) => void;
  onDelete: () => void;
}) {
  const fields = field.fields ?? [];
  const objectValue = isJsonObject(item) ? item : null;
  const stringValue = typeof item === "string" ? item : "";
  const errors = objectValue ? validateFields(objectValue, fields, schemaRoot) : [];

  return (
    <div className="grid min-w-0 gap-3">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div className="min-w-0">
          <h4 className="truncate text-sm font-semibold">
            {summarizeStringOrObjectItem(item, index)}
          </h4>
          <p className="truncate text-xs text-muted-foreground">
            {field.label} #{index + 1}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {objectValue ? (
            <Button variant="ghost" onClick={() => onChange("")}>
              String
            </Button>
          ) : (
            <Button
              variant="ghost"
              onClick={() =>
                onChange(
                  sanitizeFields(
                    initialObjectFromFields(fields),
                    fields,
                    schemaRoot,
                  ),
                )
              }
            >
              Object
            </Button>
          )}
          <Button variant="danger" onClick={onDelete}>
            <Trash2 size={16} />
            Delete
          </Button>
        </div>
      </div>
      {errors.length > 0 ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {errors.map((error) => (
            <div key={error}>{error}</div>
          ))}
        </div>
      ) : null}
      {objectValue ? (
        fields.length > 0 ? (
          <SchemaFieldsEditor
            schemaRoot={schemaRoot}
            value={objectValue}
            fields={fields}
            onChange={(next) =>
              onChange(sanitizeFields(next, fields, schemaRoot))
            }
          />
        ) : (
          <EmptyState label="Empty" />
        )
      ) : (
        <Field label="Value">
          <Input
            value={stringValue}
            onChange={(event) => onChange(event.target.value)}
          />
        </Field>
      )}
    </div>
  );
}

function ObjectMapField({
  schemaRoot,
  field,
  value,
  onChange,
}: {
  schemaRoot?: ComposerSchema;
  field: SchemaField;
  value: JsonObject;
  onChange: (value: unknown) => void;
}) {
  const fields = field.fields ?? [];
  const entries = Object.entries(value).filter(([, item]) =>
    isJsonObject(item),
  ) as Array<[string, JsonObject]>;
  const [selectedKey, setSelectedKey] = useState<string | null>(
    entries[0]?.[0] ?? null,
  );
  const activeKey =
    selectedKey && entries.some(([key]) => key === selectedKey)
      ? selectedKey
      : (entries[0]?.[0] ?? null);
  const selected = activeKey ? (value[activeKey] as JsonObject) : null;

  const replaceMap = (next: JsonObject) => {
    onChange(Object.keys(next).length === 0 ? undefined : next);
  };

  const addItem = () => {
    let key = "entry";
    let index = 1;
    while (key in value) {
      index += 1;
      key = `entry_${index}`;
    }
    const next = {
      ...value,
      [key]: sanitizeFields(initialObjectFromFields(fields), fields, schemaRoot),
    };
    replaceMap(next);
    setSelectedKey(key);
  };

  const renameKey = (oldKey: string, newKey: string) => {
    const clean = newKey.trim();
    if (!clean || clean === oldKey || clean in value) {
      return;
    }
    const next: JsonObject = {};
    for (const [key, item] of Object.entries(value)) {
      next[key === oldKey ? clean : key] = item;
    }
    replaceMap(next);
    setSelectedKey(clean);
  };

  return (
    <NestedBox
      title={schemaFieldLabel(field)}
      action={
        <Button variant="secondary" onClick={addItem}>
          <Plus size={16} />
          Add
        </Button>
      }
    >
      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="min-w-0 rounded-md border border-border bg-muted/20 p-3">
          <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">{field.label}</h4>
            <Badge>{entries.length}</Badge>
          </div>
          <div className="grid max-h-72 min-w-0 content-start gap-2 overflow-y-auto pr-1">
            {entries.map(([key, item]) => {
              const active = key === activeKey;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedKey(key)}
                  className={
                    active
                      ? "rounded-md border border-primary bg-primary/10 px-3 py-2 text-left text-sm font-medium"
                      : "rounded-md border border-border bg-background px-3 py-2 text-left text-sm hover:border-primary/50"
                  }
                >
                  <span className="block truncate">{key}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {summarizeObjectValue(item, 0)}
                  </span>
                </button>
              );
            })}
            {entries.length === 0 ? <EmptyState label="Empty" /> : null}
          </div>
        </aside>
        <div className="min-w-0">
          {activeKey && selected ? (
            <div className="grid min-w-0 gap-3">
              <div className="flex min-w-0 flex-wrap items-end justify-between gap-3 border-b border-border pb-3">
                <Field label="Key" className="min-w-52 flex-1">
                  <Input
                    defaultValue={activeKey}
                    onBlur={(event) => renameKey(activeKey, event.target.value)}
                  />
                </Field>
                <Button
                  variant="danger"
                  onClick={() => {
                    const next = { ...value };
                    delete next[activeKey];
                    replaceMap(next);
                    setSelectedKey(
                      entries.find(([key]) => key !== activeKey)?.[0] ?? null,
                    );
                  }}
                >
                  <Trash2 size={16} />
                  Delete
                </Button>
              </div>
              {validateFields(selected, fields, schemaRoot).map((error) => (
                <div key={error} className="text-sm text-destructive">
                  {error}
                </div>
              ))}
              {fields.length > 0 ? (
                <SchemaFieldsEditor
                  schemaRoot={schemaRoot}
                  value={selected}
                  fields={fields}
                  onChange={(nextValue) => {
                    replaceMap({
                      ...value,
                      [activeKey]: sanitizeFields(
                        nextValue,
                        fields,
                        schemaRoot,
                      ),
                    });
                  }}
                />
              ) : (
                <EmptyState label="Empty" />
              )}
            </div>
          ) : (
            <EmptyState label="Select or add an entry" />
          )}
        </div>
      </div>
    </NestedBox>
  );
}

function NestedBox({
  title,
  action,
  children,
  defaultCollapsed = true,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  useEffect(() => {
    setCollapsed(defaultCollapsed);
  }, [defaultCollapsed, title]);

  return (
    <div className="rounded-md border border-border bg-muted/20 p-3">
      <div
        className={
          collapsed
            ? "flex flex-wrap items-center justify-between gap-2"
            : "mb-3 flex flex-wrap items-center justify-between gap-2"
        }
      >
        <button
          type="button"
          className="inline-flex min-w-0 items-center gap-2 text-left text-sm font-semibold text-foreground"
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((current) => !current)}
        >
          {collapsed ? (
            <ChevronRight className="shrink-0" size={16} />
          ) : (
            <ChevronDown className="shrink-0" size={16} />
          )}
          <span className="min-w-0 truncate">{title}</span>
        </button>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {action}
        </div>
      </div>
      {collapsed ? null : children}
    </div>
  );
}

function arrayInputItems(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String);
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return [String(value)];
  }
  return [];
}

function numericInputValue(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value)
    ? String(value)
    : "";
}

function parseStringOrNumberListItem(value: string): string | number {
  const trimmed = value.trim();
  const number = Number(trimmed);
  return Number.isInteger(number) && String(number) === trimmed
    ? number
    : trimmed;
}

function parseStringOrNumberInput(value: string): string | number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const number = Number(trimmed);
  return Number.isInteger(number) && String(number) === trimmed
    ? number
    : value;
}

function pickFields(value: JsonObject, fields: SchemaField[]): JsonObject {
  const output: JsonObject = {};
  for (const key of fieldKeys(fields)) {
    if (value[key] !== undefined) {
      output[key] = value[key];
    }
  }
  return output;
}

function fieldKeys(fields: SchemaField[]): string[] {
  const keys: string[] = [];
  for (const field of fields) {
    if (field.kind === "constraint") {
      continue;
    }
    if (isFlattenedField(field)) {
      keys.push(...fieldKeys(field.fields ?? []));
    } else {
      keys.push(field.key);
    }
  }
  return keys;
}

function initialObjectFromFields(fields: SchemaField[]): JsonObject {
  const output: JsonObject = {};
  for (const field of fields) {
    if (field.kind === "constraint") {
      continue;
    }
    if (isFlattenedField(field)) {
      Object.assign(output, initialObjectFromFields(field.fields ?? []));
      continue;
    }
    const value = defaultValueForField(field);
    if (value !== undefined) {
      output[field.key] = value;
    }
  }
  return output;
}

function summarizeObjectValue(value: JsonObject, index: number): string {
  for (const key of ["name", "username", "tag", "server", "password", "uuid"]) {
    const raw = value[key];
    if (typeof raw === "string" && raw.trim() !== "") {
      return raw;
    }
  }
  const server = typeof value.server === "string" ? value.server : "";
  const port =
    typeof value.server_port === "number" || typeof value.server_port === "string"
      ? String(value.server_port)
      : "";
  if (server && port) {
    return `${server}:${port}`;
  }
  return `Item ${index + 1}`;
}

function stringOrObjectItems(value: unknown): Array<string | JsonObject> {
  if (Array.isArray(value)) {
    return value.filter(
      (item): item is string | JsonObject =>
        typeof item === "string" || isJsonObject(item),
    );
  }
  if (typeof value === "string" || isJsonObject(value)) {
    return [value];
  }
  return [];
}

function objectListInputItems(value: unknown): JsonObject[] {
  if (Array.isArray(value)) {
    return value.filter(isJsonObject);
  }
  return isJsonObject(value) ? [value] : [];
}

function summarizeStringOrObjectItem(
  value: string | JsonObject,
  index: number,
): string {
  if (typeof value === "string") {
    return value.trim() || `Item ${index + 1}`;
  }
  return summarizeObjectValue(value, index);
}

function isJsonObject(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function ProxyGroupsPage({
  state,
  selectedId,
  setSelectedId,
  updateState,
}: {
  state: ComposerState;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  updateState: (recipe: (draft: ComposerState) => void) => void;
}) {
  const selected =
    state.proxy_groups.find((group) => group.id === selectedId) ??
    state.proxy_groups[0] ??
    null;
  const selectedIndex = selected
    ? state.proxy_groups.findIndex((group) => group.id === selected.id)
    : -1;

  const addGroup = () => {
    const group = newProxyGroup();
    updateState((draft) => {
      draft.proxy_groups.push(group);
    });
    setSelectedId(group.id);
  };

  return (
    <TwoPane
      title="代理组"
      description={`${state.proxy_groups.length} groups`}
      action={
        <Button variant="secondary" onClick={addGroup}>
          <Plus size={16} />
          New
        </Button>
      }
      list={
        <ItemList
          items={state.proxy_groups.map((group) => ({
            id: group.id,
            title: group.tag,
            subtitle: `${group.group_type} · ${group.match_regexes.length} regex`,
            active: group.id === selected?.id,
            dirty: false,
          }))}
          onSelect={setSelectedId}
        />
      }
    >
      {selected && selectedIndex >= 0 ? (
        <GroupDetail
          group={selected}
          sources={state.proxy_sources}
          groups={state.proxy_groups}
          update={(recipe) =>
            updateState((draft) => recipe(draft.proxy_groups[selectedIndex]))
          }
          replace={(next) =>
            updateState(
              (draft) => void (draft.proxy_groups[selectedIndex] = next),
            )
          }
          remove={() => {
            updateState((draft) => {
              draft.proxy_groups.splice(selectedIndex, 1);
            });
            setSelectedId(
              state.proxy_groups[selectedIndex + 1]?.id ??
                state.proxy_groups[selectedIndex - 1]?.id ??
                null,
            );
          }}
        />
      ) : (
        <EmptyState label="No group selected" />
      )}
    </TwoPane>
  );
}

function GroupDetail({
  group,
  sources,
  groups,
  update,
  replace,
  remove,
}: {
  group: ProxyGroup;
  sources: ProxySource[];
  groups: ProxyGroup[];
  update: (recipe: (group: ProxyGroup) => void) => void;
  replace: (group: ProxyGroup) => void;
  remove: () => void;
}) {
  const [mode, setMode] = useState<LocalMode>("form");
  return (
    <section className="grid gap-4">
      <DetailHeader
        title={group.tag}
        subtitle={group.group_type}
        mode={mode}
        setMode={setMode}
        actions={
          <>
            <CheckField
              className="self-center"
              label="启用"
              checked={group.enabled}
              onChange={(value) =>
                update((draft) => void (draft.enabled = value))
              }
            />
            <Button variant="danger" onClick={remove}>
              <Trash2 size={16} />
              Delete
            </Button>
          </>
        }
      />
      {mode === "form" ? (
        <>
          <Panel>
            <div className={formGridClass}>
              <Field label="ID">
                <Input
                  value={group.id}
                  onChange={(event) =>
                    update((draft) => void (draft.id = event.target.value))
                  }
                />
              </Field>
              <Field label="Tag">
                <Input
                  value={group.tag}
                  onChange={(event) =>
                    update((draft) => void (draft.tag = event.target.value))
                  }
                />
              </Field>
              <Field label="类型">
                <Select
                  value={group.group_type}
                  onChange={(event) =>
                    update(
                      (draft) =>
                        void (draft.group_type = event.target
                          .value as ProxyGroup["group_type"]),
                    )
                  }
                >
                  <option value="selector">selector</option>
                  <option value="url_test">urltest</option>
                </Select>
              </Field>
              {group.group_type === "selector" ? (
                <Field label="默认出站">
                  <Input
                    value={group.default}
                    onChange={(event) =>
                      update(
                        (draft) => void (draft.default = event.target.value),
                      )
                    }
                  />
                </Field>
              ) : null}
            </div>
          </Panel>
          <Panel>
            <div className={twoColumnGridClass}>
              <ChoiceList
                title="代理源"
                items={sources.map((source) => ({
                  value: source.id,
                  label: source.name || source.id,
                }))}
                selected={group.source_ids}
                onChange={(value) =>
                  update((draft) => void (draft.source_ids = value))
                }
              />
              <ChoiceList
                title="包含代理组"
                items={groups
                  .filter((candidate) => candidate.id !== group.id)
                  .map((candidate) => ({
                    value: candidate.tag,
                    label: candidate.tag,
                  }))}
                selected={group.include_groups}
                onChange={(value) =>
                  update((draft) => void (draft.include_groups = value))
                }
              />
              <LineListField
                label="节点匹配正则"
                value={group.match_regexes}
                onChange={(value) =>
                  update((draft) => void (draft.match_regexes = value))
                }
                className="md:col-span-2"
              />
            </div>
          </Panel>
          <Panel>
            <div className={formGridClass}>
              {group.group_type === "url_test" ? (
                <>
                  <Field label="测试 URL">
                    <Input
                      value={group.url}
                      onChange={(event) =>
                        update((draft) => void (draft.url = event.target.value))
                      }
                    />
                  </Field>
                  <Field label="测试间隔">
                    <Input
                      value={group.interval}
                      onChange={(event) =>
                        update(
                          (draft) => void (draft.interval = event.target.value),
                        )
                      }
                    />
                  </Field>
                  <Field label="空闲超时">
                    <Input
                      value={group.idle_timeout}
                      onChange={(event) =>
                        update(
                          (draft) =>
                            void (draft.idle_timeout = event.target.value),
                        )
                      }
                    />
                  </Field>
                  <Field label="容差 ms">
                    <Input
                      type="number"
                      min={0}
                      max={65535}
                      value={group.tolerance}
                      onChange={(event) =>
                        update(
                          (draft) =>
                            void (draft.tolerance = Number(event.target.value)),
                        )
                      }
                    />
                  </Field>
                </>
              ) : null}
              <CheckField
                label="切换中断连接"
                checked={group.interrupt_exist_connections}
                onChange={(value) =>
                  update(
                    (draft) => void (draft.interrupt_exist_connections = value),
                  )
                }
              />
              <CheckField
                label="DIRECT"
                checked={group.include_special.includes("DIRECT")}
                onChange={(value) =>
                  update((draft) => toggleSpecial(draft, "DIRECT", value))
                }
              />
              <CheckField
                label="REJECT"
                checked={group.include_special.includes("REJECT")}
                onChange={(value) =>
                  update((draft) => toggleSpecial(draft, "REJECT", value))
                }
              />
            </div>
          </Panel>
        </>
      ) : (
        <Panel>
          <StructuredCodeEditor
            language={mode}
            scopeKey={`${group.id}-${mode}`}
            value={group as unknown as JsonObject}
            onApply={(value) => replace(value as unknown as ProxyGroup)}
          />
        </Panel>
      )}
    </section>
  );
}

function TargetGroupsPage({
  state,
  selectedId,
  selectedEntryIndex,
  setSelectedId,
  setSelectedEntryIndex,
  updateState,
}: {
  state: ComposerState;
  selectedId: string | null;
  selectedEntryIndex: number;
  setSelectedId: (id: string | null) => void;
  setSelectedEntryIndex: (index: number) => void;
  updateState: (recipe: (draft: ComposerState) => void) => void;
}) {
  const selected =
    state.target_groups.find((target) => target.id === selectedId) ??
    state.target_groups[0] ??
    null;
  const selectedIndex = selected
    ? state.target_groups.findIndex((target) => target.id === selected.id)
    : -1;
  const outboundOptions = [
    ...state.proxy_groups.map((group) => group.tag),
    "DIRECT",
    "REJECT",
  ];

  const addTarget = () => {
    const target = newTargetGroup();
    updateState((draft) => {
      draft.target_groups.push(target);
    });
    setSelectedId(target.id);
    setSelectedEntryIndex(0);
  };

  return (
    <TwoPane
      title="出站目标组"
      description={`${state.target_groups.length} target groups`}
      action={
        <Button variant="secondary" onClick={addTarget}>
          <Plus size={16} />
          New
        </Button>
      }
      list={
        <ItemList
          items={state.target_groups.map((target) => ({
            id: target.id,
            title: target.name,
            subtitle: `${target.outbound || "no outbound"} · ${target.entries.length} entries`,
            active: target.id === selected?.id,
            dirty: false,
          }))}
          onSelect={(id) => {
            setSelectedId(id);
            setSelectedEntryIndex(0);
          }}
        />
      }
    >
      {selected && selectedIndex >= 0 ? (
        <TargetDetail
          target={selected}
          selectedEntryIndex={selectedEntryIndex}
          setSelectedEntryIndex={setSelectedEntryIndex}
          outboundOptions={outboundOptions}
          update={(recipe) =>
            updateState((draft) => recipe(draft.target_groups[selectedIndex]))
          }
          replace={(next) =>
            updateState(
              (draft) => void (draft.target_groups[selectedIndex] = next),
            )
          }
          remove={() => {
            updateState((draft) => {
              draft.target_groups.splice(selectedIndex, 1);
            });
            setSelectedId(
              state.target_groups[selectedIndex + 1]?.id ??
                state.target_groups[selectedIndex - 1]?.id ??
                null,
            );
          }}
        />
      ) : (
        <EmptyState label="No target group selected" />
      )}
    </TwoPane>
  );
}

function TargetDetail({
  target,
  selectedEntryIndex,
  setSelectedEntryIndex,
  outboundOptions,
  update,
  replace,
  remove,
}: {
  target: TargetGroup;
  selectedEntryIndex: number;
  setSelectedEntryIndex: (index: number) => void;
  outboundOptions: string[];
  update: (recipe: (target: TargetGroup) => void) => void;
  replace: (target: TargetGroup) => void;
  remove: () => void;
}) {
  const [mode, setMode] = useState<LocalMode>("form");
  const safeEntryIndex = Math.min(
    selectedEntryIndex,
    Math.max(0, target.entries.length - 1),
  );
  const selectedEntry = target.entries[safeEntryIndex] ?? null;
  return (
    <section className="grid gap-4">
      <DetailHeader
        title={target.name}
        subtitle={target.outbound || "no outbound"}
        mode={mode}
        setMode={setMode}
        actions={
          <>
            <CheckField
              className="self-center"
              label="启用"
              checked={target.enabled}
              onChange={(value) =>
                update((draft) => void (draft.enabled = value))
              }
            />
            <Button variant="danger" onClick={remove}>
              <Trash2 size={16} />
              Delete
            </Button>
          </>
        }
      />
      {mode === "form" ? (
        <>
          <Panel>
            <div className={formGridClass}>
              <Field label="ID">
                <Input
                  value={target.id}
                  onChange={(event) =>
                    update((draft) => void (draft.id = event.target.value))
                  }
                />
              </Field>
              <Field label="名称">
                <Input
                  value={target.name}
                  onChange={(event) =>
                    update((draft) => void (draft.name = event.target.value))
                  }
                />
              </Field>
              <Field label="出站">
                <Select
                  value={target.outbound}
                  onChange={(event) =>
                    update(
                      (draft) => void (draft.outbound = event.target.value),
                    )
                  }
                >
                  <option value="">select outbound</option>
                  {outboundOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </Panel>
          <Panel>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">目标条目</h3>
              <Button
                variant="secondary"
                onClick={() => {
                  update((draft) => {
                    draft.entries.push(newTargetEntry());
                  });
                  setSelectedEntryIndex(target.entries.length);
                }}
              >
                <Plus size={16} />
                Add
              </Button>
            </div>
            <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
              <aside className="sticky top-[calc(var(--composer-sticky-top)+1rem)] z-10 min-w-0 rounded-md border border-border bg-muted/20 p-3 max-h-[calc(100vh-var(--composer-sticky-top)-2rem)] overflow-hidden">
                <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold">条目列表</h4>
                  <Badge>{target.entries.length}</Badge>
                </div>
                <div className="grid max-h-[calc(100vh-var(--composer-sticky-top)-7rem)] min-w-0 content-start gap-2 overflow-y-auto pr-1">
                  {target.entries.map((entry, index) => {
                    const active = index === safeEntryIndex;
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => setSelectedEntryIndex(index)}
                        className={
                          active
                            ? "rounded-md border border-primary bg-primary/10 px-3 py-2 text-left text-sm font-medium"
                            : "rounded-md border border-border bg-background px-3 py-2 text-left text-sm hover:border-primary/50"
                        }
                      >
                        <span className="block truncate">
                          {entry.label || entry.kind}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {entry.values.join(", ") || "no values"}
                        </span>
                      </button>
                    );
                  })}
                  {target.entries.length === 0 ? (
                    <EmptyState label="No entries" />
                  ) : null}
                </div>
              </aside>
              <div className="min-w-0">
                {selectedEntry ? (
                  <TargetEntryEditor
                    entry={selectedEntry}
                    scopeKey={`${target.id}-${safeEntryIndex}`}
                    update={(recipe) =>
                      update((draft) => recipe(draft.entries[safeEntryIndex]))
                    }
                    replace={(entry) =>
                      update(
                        (draft) => void (draft.entries[safeEntryIndex] = entry),
                      )
                    }
                    remove={() => {
                      update((draft) => {
                        draft.entries.splice(safeEntryIndex, 1);
                      });
                      setSelectedEntryIndex(Math.max(0, safeEntryIndex - 1));
                    }}
                  />
                ) : (
                  <EmptyState label="Select or add an entry" />
                )}
              </div>
            </div>
          </Panel>
        </>
      ) : (
        <Panel>
          <StructuredCodeEditor
            language={mode}
            scopeKey={`${target.id}-${mode}`}
            value={target as unknown as JsonObject}
            onApply={(value) => replace(value as unknown as TargetGroup)}
          />
        </Panel>
      )}
    </section>
  );
}

function TargetEntryEditor({
  entry,
  scopeKey,
  update,
  replace,
  remove,
}: {
  entry: TargetEntry;
  scopeKey: string;
  update: (recipe: (entry: TargetEntry) => void) => void;
  replace: (entry: TargetEntry) => void;
  remove: () => void;
}) {
  const [mode, setMode] = useState<LocalMode>("form");
  const spec = targetKindSpecs[entry.kind];
  const entryErrors = validateTargetEntry(entry);
  return (
    <div className="grid min-w-0 gap-3">
      <DetailHeader
        title={entry.label || entry.kind}
        subtitle={entry.kind}
        mode={mode}
        setMode={setMode}
        embedded
        actions={
          <Button variant="danger" onClick={remove}>
            <Trash2 size={16} />
            Delete
          </Button>
        }
      />
      {mode === "form" ? (
        <div className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_260px_160px]">
            <Field label="标签">
              <Input
                value={entry.label}
                onChange={(event) =>
                  update((draft) => void (draft.label = event.target.value))
                }
              />
            </Field>
            <Field label="类型">
              <Select
                value={entry.kind}
                onChange={(event) =>
                  update((draft) => {
                    const nextKind = event.target.value as TargetEntryKind;
                    draft.kind = nextKind;
                    if (targetKindSpecs[nextKind].valueKind === "boolean") {
                      draft.values = [];
                      draft.raw = {};
                    } else if (targetKindSpecs[nextKind].valueKind === "raw") {
                      draft.values = [];
                      draft.raw = draft.raw ?? {};
                    } else {
                      draft.raw = {};
                    }
                  })
                }
              >
                {targetKinds.map((kind) => (
                  <option key={kind} value={kind}>
                    {kind}
                  </option>
                ))}
              </Select>
            </Field>
            <CheckField
              label="invert"
              checked={entry.invert}
              onChange={(value) =>
                update((draft) => void (draft.invert = value))
              }
            />
          </div>
          {entryErrors.length > 0 ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {entryErrors.map((error) => (
                <div key={error}>{error}</div>
              ))}
            </div>
          ) : null}
          {spec.valueKind === "raw" ? (
            <StructuredCodeEditor
              language="json"
              scopeKey={`${scopeKey}-raw`}
              value={(entry.raw ?? {}) as JsonObject}
              onApply={(value) => update((draft) => void (draft.raw = value))}
            />
          ) : spec.valueKind === "boolean" ? (
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              {spec.label} 使用 sing-box 布尔匹配项，生成规则时会写入{" "}
              <code>{entry.kind}: true</code>，不需要填写值。
            </div>
          ) : (
            <LineListField
              label={
                spec.valueKind === "number-list"
                  ? `${spec.label}（数字）`
                  : spec.label
              }
              value={entry.values}
              onChange={(value) =>
                update((draft) => void (draft.values = value))
              }
            />
          )}
        </div>
      ) : (
        <StructuredCodeEditor
          language={mode}
          scopeKey={`${scopeKey}-${mode}`}
          value={entry as unknown as JsonObject}
          onApply={(value) => replace(value as unknown as TargetEntry)}
        />
      )}
    </div>
  );
}

function GlobalConfigPage({
  schema,
  global,
  updateState,
}: {
  schema: ComposerSchema;
  global: GlobalConfig;
  updateState: (recipe: (draft: ComposerState) => void) => void;
}) {
  const globalSchema = schema.global;

  if (!globalSchema) {
    return <EmptyState label="Global schema unavailable" />;
  }

  return (
    <section className="grid gap-4">
      <GlobalSectionEditor
        schemaRoot={schema}
        title="日志"
        subtitle="log"
        value={global.log}
        fields={globalSchema.log.fields}
        scopeKey="global-log"
        onChange={(next) =>
          updateState((draft) => void (draft.global.log = next))
        }
      />
      <GlobalSectionEditor
        schemaRoot={schema}
        title="NTP"
        subtitle="ntp"
        value={global.ntp}
        fields={globalSchema.ntp.fields}
        scopeKey="global-ntp"
        onChange={(next) =>
          updateState((draft) => void (draft.global.ntp = next))
        }
      />
      <GlobalSectionEditor
        schemaRoot={schema}
        title="实验性功能"
        subtitle="experimental"
        value={global.experimental}
        fields={globalSchema.experimental.fields}
        scopeKey="global-experimental"
        onChange={(next) =>
          updateState((draft) => void (draft.global.experimental = next))
        }
      />
    </section>
  );
}

function GlobalSectionEditor({
  schemaRoot,
  title,
  subtitle,
  value,
  fields,
  scopeKey,
  onChange,
}: {
  schemaRoot: ComposerSchema;
  title: string;
  subtitle: string;
  value: JsonObject;
  fields: SchemaField[];
  scopeKey: string;
  onChange: (value: JsonObject) => void;
}) {
  const [mode, setMode] = useState<LocalMode>("form");
  const errors = validateFields(value, fields, schemaRoot);

  return (
    <Panel>
      <div className="grid gap-4">
        <DetailHeader
          title={title}
          subtitle={subtitle}
          mode={mode}
          setMode={setMode}
          embedded
        />
        {mode === "form" ? (
          <>
            {errors.length > 0 ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {errors.map((error) => (
                  <div key={error}>{error}</div>
                ))}
              </div>
            ) : null}
            <SchemaFieldsEditor
              schemaRoot={schemaRoot}
              value={value}
              fields={fields}
              onChange={(next) =>
                onChange(sanitizeFields(next, fields, schemaRoot))
              }
            />
          </>
        ) : (
          <StructuredCodeEditor
            language={mode}
            scopeKey={`${scopeKey}-${mode}`}
            value={value}
            onApply={onChange}
          />
        )}
      </div>
    </Panel>
  );
}

function ExtraRouteRulesPage({
  schema,
  state,
  selectedRuleSetIndex,
  selectedIndex,
  setSelectedRuleSetIndex,
  setSelectedIndex,
  updateState,
}: {
  schema: ComposerSchema;
  state: ComposerState;
  selectedRuleSetIndex: number;
  selectedIndex: number;
  setSelectedRuleSetIndex: (index: number) => void;
  setSelectedIndex: (index: number) => void;
  updateState: (recipe: (draft: ComposerState) => void) => void;
}) {
  const route = state.route;
  const ruleSets = route.rule_sets ?? [];
  const rules = state.extra_route_rules ?? [];
  const safeRuleSetIndex = Math.min(
    selectedRuleSetIndex,
    Math.max(0, ruleSets.length - 1),
  );
  const safeIndex = Math.min(selectedIndex, Math.max(0, rules.length - 1));
  const selectedRuleSet = ruleSets[safeRuleSetIndex] ?? null;
  const selected = rules[safeIndex] ?? null;

  const addRuleSet = () => {
    const ruleSet = newRouteRuleSet(schema, route);
    updateState((draft) => {
      draft.route.rule_sets.push(ruleSet);
    });
    setSelectedRuleSetIndex(ruleSets.length);
  };

  const addRule = () => {
    const rule = newRouteRule(schema, state);
    updateState((draft) => {
      draft.extra_route_rules.push(rule);
    });
    setSelectedIndex(rules.length);
  };

  if (!schema.route) {
    return <EmptyState label="Route schema unavailable" />;
  }

  return (
    <section className="grid gap-4">
      <Panel>
        <RouteOptionsEditor
          schema={schema}
          route={route}
          update={(recipe) => updateState((draft) => recipe(draft.route))}
        />
      </Panel>

      <Panel>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">路由规则集</h2>
            <p className="text-sm text-muted-foreground">
              {ruleSets.length} rule sets
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={addRuleSet}
            disabled={getRouteRuleSetTypeOptions(schema).length === 0}
          >
            <Plus size={16} />
            Add
          </Button>
        </div>
        <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="sticky top-[calc(var(--composer-sticky-top)+1rem)] z-10 min-w-0 rounded-md border border-border bg-muted/20 p-3 max-h-[calc(100vh-var(--composer-sticky-top)-2rem)] overflow-hidden">
            <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">规则集列表</h3>
              <Badge>{ruleSets.length}</Badge>
            </div>
            <div className="grid max-h-[calc(100vh-var(--composer-sticky-top)-7rem)] min-w-0 content-start gap-2 overflow-y-auto pr-1">
              {ruleSets.map((ruleSet, index) => {
                const active = index === safeRuleSetIndex;
                return (
                  <button
                    key={`route-rule-set-${index}`}
                    type="button"
                    onClick={() => setSelectedRuleSetIndex(index)}
                    className={
                      active
                        ? "rounded-md border border-primary bg-primary/10 px-3 py-2 text-left text-sm font-medium"
                        : "rounded-md border border-border bg-background px-3 py-2 text-left text-sm hover:border-primary/50"
                    }
                  >
                    <span className="block truncate">
                      {summarizeRouteRuleSet(ruleSet, index)}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {String(ruleSet.type ?? "inline")}
                    </span>
                  </button>
                );
              })}
              {ruleSets.length === 0 ? (
                <EmptyState label="No rule sets" />
              ) : null}
            </div>
          </aside>
          <div className="min-w-0">
            {selectedRuleSet ? (
              <RouteRuleSetEditor
                schemaRoot={schema}
                ruleSet={selectedRuleSet}
                scopeKey={`route-rule-set-${safeRuleSetIndex}`}
                onChange={(next) =>
                  updateState(
                    (draft) =>
                      void (draft.route.rule_sets[safeRuleSetIndex] = next),
                  )
                }
                onDelete={() => {
                  updateState((draft) => {
                    draft.route.rule_sets.splice(safeRuleSetIndex, 1);
                  });
                  setSelectedRuleSetIndex(Math.max(0, safeRuleSetIndex - 1));
                }}
              />
            ) : (
              <EmptyState label="Select or add a route rule set" />
            )}
          </div>
        </div>
      </Panel>

      <Panel>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">额外路由规则</h2>
            <p className="text-sm text-muted-foreground">
              {rules.length} route rules
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={addRule}
            disabled={getRouteRuleTypeOptions(schema).length === 0}
          >
            <Plus size={16} />
            New
          </Button>
        </div>
        <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="sticky top-[calc(var(--composer-sticky-top)+1rem)] z-10 min-w-0 rounded-md border border-border bg-muted/20 p-3 max-h-[calc(100vh-var(--composer-sticky-top)-2rem)] overflow-hidden">
            <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">规则列表</h3>
              <Badge>{rules.length}</Badge>
            </div>
            <div className="grid max-h-[calc(100vh-var(--composer-sticky-top)-7rem)] min-w-0 content-start gap-2 overflow-y-auto pr-1">
              {rules.map((rule, index) => {
                const active = index === safeIndex;
                return (
                  <button
                    key={`extra-route-rule-${index}`}
                    type="button"
                    onClick={() => setSelectedIndex(index)}
                    className={
                      active
                        ? "rounded-md border border-primary bg-primary/10 px-3 py-2 text-left text-sm font-medium"
                        : "rounded-md border border-border bg-background px-3 py-2 text-left text-sm hover:border-primary/50"
                    }
                  >
                    <span className="block truncate">
                      {summarizeRouteRule(rule, index)}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {String(rule.type ?? "default")} ·{" "}
                      {String(rule.action ?? "route")}
                    </span>
                  </button>
                );
              })}
              {rules.length === 0 ? (
                <EmptyState label="No route rules" />
              ) : null}
            </div>
          </aside>
          <div className="min-w-0">
            {selected ? (
              <RouteRuleEditor
                schemaRoot={schema}
                rule={selected}
                scopeKey={`extra-route-rule-${safeIndex}`}
                onChange={(next) =>
                  updateState(
                    (draft) => void (draft.extra_route_rules[safeIndex] = next),
                  )
                }
                onDelete={() => {
                  updateState((draft) => {
                    draft.extra_route_rules.splice(safeIndex, 1);
                  });
                  setSelectedIndex(Math.max(0, safeIndex - 1));
                }}
              />
            ) : (
              <EmptyState label="Select or add a route rule" />
            )}
          </div>
        </div>
      </Panel>
    </section>
  );
}

function RouteOptionsEditor({
  schema,
  route,
  update,
}: {
  schema: ComposerSchema;
  route: RouteConfig;
  update: (recipe: (route: RouteConfig) => void) => void;
}) {
  const fields = schema.route?.options.fields ?? [];
  const options = (route.options ?? {}) as JsonObject;
  const errors = validateFields(options, fields, schema);

  return (
    <div className="grid min-w-0 gap-3">
      <div className="border-b border-border pb-3">
        <h3 className="text-sm font-semibold">路由基础选项</h3>
        <p className="text-sm text-muted-foreground">route options</p>
      </div>
      {errors.length > 0 ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {errors.map((error) => (
            <div key={error}>{error}</div>
          ))}
        </div>
      ) : null}
      <SchemaFieldsEditor
        schemaRoot={schema}
        value={options}
        fields={fields}
        onChange={(next) =>
          update(
            (draft) =>
              void (draft.options = sanitizeFields(next, fields, schema)),
          )
        }
      />
    </div>
  );
}

function RouteRuleSetEditor({
  schemaRoot,
  ruleSet,
  scopeKey,
  onChange,
  onDelete,
}: {
  schemaRoot: ComposerSchema;
  ruleSet: JsonObject;
  scopeKey: string;
  onChange: (ruleSet: JsonObject) => void;
  onDelete: () => void;
}) {
  const [mode, setMode] = useState<LocalMode>("form");
  const schema = getRouteRuleSetSchema(schemaRoot, ruleSet.type);
  const errors = validateRouteRuleSet(schemaRoot, ruleSet);

  return (
    <div className="grid min-w-0 gap-3">
      <DetailHeader
        title={summarizeRouteRuleSet(ruleSet, 0)}
        subtitle={String(ruleSet.type ?? "inline")}
        mode={mode}
        setMode={setMode}
        embedded
        actions={
          <Button variant="danger" onClick={onDelete}>
            <Trash2 size={16} />
            Delete
          </Button>
        }
      />
      {mode === "form" ? (
        schema ? (
          <RouteRuleSetTypedSchemaEditor
            schemaRoot={schemaRoot}
            value={ruleSet}
            schema={schema}
            errors={errors}
            onTypeChange={(type) =>
              onChange(changeRouteRuleSetType(schemaRoot, ruleSet, type))
            }
            onChange={(next) =>
              onChange(
                sanitizeRouteRuleSet(schemaRoot, {
                  type: schema.type,
                  ...next,
                }),
              )
            }
          />
        ) : (
          <Panel>
            <div className="grid gap-3">
              <div className="text-sm text-destructive">
                不支持的路由规则集类型：{String(ruleSet.type ?? "")}
              </div>
              <Field label="类型">
                <Select
                  value=""
                  onChange={(event) =>
                    onChange(
                      changeRouteRuleSetType(
                        schemaRoot,
                        ruleSet,
                        event.target.value,
                      ),
                    )
                  }
                >
                  <option value="">选择支持的类型</option>
                  {getRouteRuleSetTypeOptions(schemaRoot).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <ObjectFormEditor value={ruleSet} onChange={onChange} />
            </div>
          </Panel>
        )
      ) : (
        <StructuredCodeEditor
          language={mode}
          scopeKey={`${scopeKey}-${mode}`}
          value={ruleSet}
          onApply={onChange}
        />
      )}
    </div>
  );
}

function RouteRuleSetTypedSchemaEditor({
  schemaRoot,
  value,
  schema,
  errors,
  onTypeChange,
  onChange,
}: {
  schemaRoot: ComposerSchema;
  value: JsonObject;
  schema: { type: string; label: string; fields: SchemaField[] };
  errors: string[];
  onTypeChange: (type: string) => void;
  onChange: (value: JsonObject) => void;
}) {
  return (
    <Panel>
      <div className="grid gap-4">
        <div className={formGridClass}>
          <Field label="类型">
            <Select
              value={schema.type}
              onChange={(event) => onTypeChange(event.target.value)}
            >
              {getRouteRuleSetTypeOptions(schemaRoot).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="self-end rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            schema: sing-box route/rule-sets/{schema.type}
          </div>
        </div>
        {errors.length > 0 ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {errors.map((error) => (
              <div key={error}>{error}</div>
            ))}
          </div>
        ) : null}
        <SchemaFieldsEditor
          schemaRoot={schemaRoot}
          value={value}
          fields={schema.fields}
          onChange={onChange}
        />
      </div>
    </Panel>
  );
}

function RouteRuleEditor({
  schemaRoot,
  rule,
  scopeKey,
  onChange,
  onDelete,
}: {
  schemaRoot: ComposerSchema;
  rule: JsonObject;
  scopeKey: string;
  onChange: (rule: JsonObject) => void;
  onDelete: () => void;
}) {
  const [mode, setMode] = useState<LocalMode>("form");
  const schema = getRouteRuleSchema(schemaRoot, rule.type);
  const errors = validateRouteRule(schemaRoot, rule);

  return (
    <div className="grid min-w-0 gap-3">
      <DetailHeader
        title={summarizeRouteRule(rule, 0)}
        subtitle={String(rule.type ?? "default")}
        mode={mode}
        setMode={setMode}
        embedded
        actions={
          <Button variant="danger" onClick={onDelete}>
            <Trash2 size={16} />
            Delete
          </Button>
        }
      />
      {mode === "form" ? (
        schema ? (
          <RouteTypedSchemaEditor
            schemaRoot={schemaRoot}
            value={rule}
            schema={schema}
            errors={errors}
            onTypeChange={(type) =>
              onChange(changeRouteRuleType(schemaRoot, rule, type))
            }
            onChange={(next) =>
              onChange(
                sanitizeRouteRule(schemaRoot, { type: schema.type, ...next }),
              )
            }
          />
        ) : (
          <Panel>
            <div className="grid gap-3">
              <div className="text-sm text-destructive">
                不支持的路由规则类型：{String(rule.type ?? "")}
              </div>
              <Field label="类型">
                <Select
                  value=""
                  onChange={(event) =>
                    onChange(
                      changeRouteRuleType(
                        schemaRoot,
                        rule,
                        event.target.value,
                      ),
                    )
                  }
                >
                  <option value="">选择支持的类型</option>
                  {getRouteRuleTypeOptions(schemaRoot).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <ObjectFormEditor value={rule} onChange={onChange} />
            </div>
          </Panel>
        )
      ) : (
        <StructuredCodeEditor
          language={mode}
          scopeKey={`${scopeKey}-${mode}`}
          value={rule}
          onApply={onChange}
        />
      )}
    </div>
  );
}

function RouteTypedSchemaEditor({
  schemaRoot,
  value,
  schema,
  errors,
  onTypeChange,
  onChange,
}: {
  schemaRoot: ComposerSchema;
  value: JsonObject;
  schema: { type: string; label: string; fields: SchemaField[] };
  errors: string[];
  onTypeChange: (type: string) => void;
  onChange: (value: JsonObject) => void;
}) {
  return (
    <Panel>
      <div className="grid gap-4">
        <div className={formGridClass}>
          <Field label="类型">
            <Select
              value={schema.type}
              onChange={(event) => onTypeChange(event.target.value)}
            >
              {getRouteRuleTypeOptions(schemaRoot).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="self-end rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            schema: sing-box route/rules/{schema.type}
          </div>
        </div>
        {errors.length > 0 ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {errors.map((error) => (
              <div key={error}>{error}</div>
            ))}
          </div>
        ) : null}
        <SchemaFieldsEditor
          schemaRoot={schemaRoot}
          value={value}
          fields={schema.fields}
          onChange={onChange}
        />
      </div>
    </Panel>
  );
}

function HttpClientsPage({
  schema,
  state,
  selectedIndex,
  setSelectedIndex,
  updateState,
}: {
  schema: ComposerSchema;
  state: ComposerState;
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  updateState: (recipe: (draft: ComposerState) => void) => void;
}) {
  const clients = state.http_clients;
  const safeIndex = Math.min(selectedIndex, Math.max(0, clients.length - 1));
  const selected = clients[safeIndex] ?? null;

  const addClient = () => {
    const client = newHttpClient(state);
    updateState((draft) => {
      draft.http_clients.push(client);
    });
    setSelectedIndex(clients.length);
  };

  return (
    <Panel>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">HTTP 客户端</h2>
          <p className="text-sm text-muted-foreground">
            {clients.length} clients
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={addClient}
          disabled={(schema.http_client?.fields ?? []).length === 0}
        >
          <Plus size={16} />
          New
        </Button>
      </div>
      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="sticky top-[calc(var(--composer-sticky-top)+1rem)] z-10 min-w-0 rounded-md border border-border bg-muted/20 p-3 max-h-[calc(100vh-var(--composer-sticky-top)-2rem)] overflow-hidden">
          <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">客户端列表</h3>
            <Badge>{clients.length}</Badge>
          </div>
          <div className="grid max-h-[calc(100vh-var(--composer-sticky-top)-7rem)] min-w-0 content-start gap-2 overflow-y-auto pr-1">
            {clients.map((client, index) => {
              const tag =
                typeof client.tag === "string" ? client.tag : `http-${index + 1}`;
              const active = index === safeIndex;
              return (
                <button
                  key={`${tag}-${index}`}
                  type="button"
                  onClick={() => setSelectedIndex(index)}
                  className={
                    active
                      ? "rounded-md border border-primary bg-primary/10 px-3 py-2 text-left text-sm font-medium"
                      : "rounded-md border border-border bg-background px-3 py-2 text-left text-sm hover:border-primary/50"
                  }
                >
                  <span className="block truncate">{tag}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    HTTP/{String(client.version ?? "2")}
                  </span>
                </button>
              );
            })}
            {clients.length === 0 ? (
              <EmptyState label="No HTTP clients" />
            ) : null}
          </div>
        </aside>
        <div className="min-w-0">
          {selected ? (
            <HttpClientEditor
              schemaRoot={schema}
              client={selected}
              scopeKey={`http-client-${safeIndex}`}
              onChange={(next) =>
                updateState(
                  (draft) => void (draft.http_clients[safeIndex] = next),
                )
              }
              onDelete={() => {
                updateState((draft) => {
                  draft.http_clients.splice(safeIndex, 1);
                });
                setSelectedIndex(Math.max(0, safeIndex - 1));
              }}
            />
          ) : (
            <EmptyState label="Select or add an HTTP client" />
          )}
        </div>
      </div>
    </Panel>
  );
}

function HttpClientEditor({
  schemaRoot,
  client,
  scopeKey,
  onChange,
  onDelete,
}: {
  schemaRoot: ComposerSchema;
  client: JsonObject;
  scopeKey: string;
  onChange: (client: JsonObject) => void;
  onDelete: () => void;
}) {
  const [mode, setMode] = useState<LocalMode>("form");
  const fields = schemaRoot.http_client?.fields ?? [];
  const errors = validateFields(client, fields, schemaRoot);
  const title = typeof client.tag === "string" ? client.tag : "http-client";

  return (
    <div className="grid min-w-0 gap-3">
      <DetailHeader
        title={title}
        subtitle="http_client"
        mode={mode}
        setMode={setMode}
        embedded
        actions={
          <Button variant="danger" onClick={onDelete}>
            <Trash2 size={16} />
            Delete
          </Button>
        }
      />
      {mode === "form" ? (
        <Panel>
          <div className="grid gap-4">
            {errors.length > 0 ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {errors.map((error) => (
                  <div key={error}>{error}</div>
                ))}
              </div>
            ) : null}
            <SchemaFieldsEditor
              schemaRoot={schemaRoot}
              value={client}
              fields={fields}
              onChange={(next) =>
                onChange(sanitizeFields(next, fields, schemaRoot))
              }
            />
          </div>
        </Panel>
      ) : (
        <StructuredCodeEditor
          language={mode}
          scopeKey={`${scopeKey}-${mode}`}
          value={client}
          onApply={onChange}
        />
      )}
    </div>
  );
}

function CertificatesPage({
  schema,
  state,
  selectedIndex,
  setSelectedIndex,
  updateState,
}: {
  schema: ComposerSchema;
  state: ComposerState;
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  updateState: (recipe: (draft: ComposerState) => void) => void;
}) {
  const providers = state.certificate_providers;
  const safeIndex = Math.min(selectedIndex, Math.max(0, providers.length - 1));
  const selected = providers[safeIndex] ?? null;

  const addProvider = () => {
    const provider = newCertificateProvider(schema, state);
    updateState((draft) => {
      draft.certificate_providers.push(provider);
    });
    setSelectedIndex(providers.length);
  };

  return (
    <section className="grid gap-4">
      <GlobalSectionEditor
        schemaRoot={schema}
        title="证书基础选项"
        subtitle="certificate"
        value={state.certificate}
        fields={schema.certificate?.fields ?? []}
        scopeKey="certificate"
        onChange={(next) =>
          updateState((draft) => void (draft.certificate = next))
        }
      />

      <Panel>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">证书提供者</h2>
            <p className="text-sm text-muted-foreground">
              {providers.length} providers
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={addProvider}
            disabled={getCertificateProviderTypeOptions(schema).length === 0}
          >
            <Plus size={16} />
            New
          </Button>
        </div>
        <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="sticky top-[calc(var(--composer-sticky-top)+1rem)] z-10 min-w-0 rounded-md border border-border bg-muted/20 p-3 max-h-[calc(100vh-var(--composer-sticky-top)-2rem)] overflow-hidden">
            <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">提供者列表</h3>
              <Badge>{providers.length}</Badge>
            </div>
            <div className="grid max-h-[calc(100vh-var(--composer-sticky-top)-7rem)] min-w-0 content-start gap-2 overflow-y-auto pr-1">
              {providers.map((provider, index) => {
                const active = index === safeIndex;
                return (
                  <button
                    key={`${String(provider.tag ?? "certificate-provider")}-${index}`}
                    type="button"
                    onClick={() => setSelectedIndex(index)}
                    className={
                      active
                        ? "rounded-md border border-primary bg-primary/10 px-3 py-2 text-left text-sm font-medium"
                        : "rounded-md border border-border bg-background px-3 py-2 text-left text-sm hover:border-primary/50"
                    }
                  >
                    <span className="block truncate">
                      {summarizeCertificateProvider(provider, index)}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {String(provider.type ?? "unknown")}
                    </span>
                  </button>
                );
              })}
              {providers.length === 0 ? (
                <EmptyState label="No certificate providers" />
              ) : null}
            </div>
          </aside>
          <div className="min-w-0">
            {selected ? (
              <CertificateProviderEditor
                schemaRoot={schema}
                provider={selected}
                scopeKey={`certificate-provider-${safeIndex}`}
                onChange={(next) =>
                  updateState(
                    (draft) =>
                      void (draft.certificate_providers[safeIndex] = next),
                  )
                }
                onDelete={() => {
                  updateState((draft) => {
                    draft.certificate_providers.splice(safeIndex, 1);
                  });
                  setSelectedIndex(Math.max(0, safeIndex - 1));
                }}
              />
            ) : (
              <EmptyState label="Select or add a certificate provider" />
            )}
          </div>
        </div>
      </Panel>
    </section>
  );
}

function CertificateProviderEditor({
  schemaRoot,
  provider,
  scopeKey,
  onChange,
  onDelete,
}: {
  schemaRoot: ComposerSchema;
  provider: JsonObject;
  scopeKey: string;
  onChange: (provider: JsonObject) => void;
  onDelete: () => void;
}) {
  const [mode, setMode] = useState<LocalMode>("form");
  const schema = getCertificateProviderSchema(schemaRoot, provider.type);
  const errors = validateCertificateProvider(schemaRoot, provider);
  const title = summarizeCertificateProvider(provider, 0);

  return (
    <div className="grid min-w-0 gap-3">
      <DetailHeader
        title={title}
        subtitle={String(provider.type ?? "unknown")}
        mode={mode}
        setMode={setMode}
        embedded
        actions={
          <Button variant="danger" onClick={onDelete}>
            <Trash2 size={16} />
            Delete
          </Button>
        }
      />
      {mode === "form" ? (
        schema ? (
          <CertificateProviderTypedSchemaEditor
            schemaRoot={schemaRoot}
            value={provider}
            schema={schema}
            errors={errors}
            onTypeChange={(type) =>
              onChange(changeCertificateProviderType(schemaRoot, provider, type))
            }
            onChange={(next) =>
              onChange(
                sanitizeCertificateProvider(schemaRoot, {
                  type: schema.type,
                  ...next,
                }),
              )
            }
          />
        ) : (
          <Panel>
            <div className="grid gap-3">
              <div className="text-sm text-destructive">
                不支持的证书提供者类型：{String(provider.type ?? "")}
              </div>
              <Field label="类型">
                <Select
                  value=""
                  onChange={(event) =>
                    onChange(
                      changeCertificateProviderType(
                        schemaRoot,
                        provider,
                        event.target.value,
                      ),
                    )
                  }
                >
                  <option value="">选择支持的类型</option>
                  {getCertificateProviderTypeOptions(schemaRoot).map(
                    (option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ),
                  )}
                </Select>
              </Field>
              <ObjectFormEditor value={provider} onChange={onChange} />
            </div>
          </Panel>
        )
      ) : (
        <StructuredCodeEditor
          language={mode}
          scopeKey={`${scopeKey}-${mode}`}
          value={provider}
          onApply={onChange}
        />
      )}
    </div>
  );
}

function CertificateProviderTypedSchemaEditor({
  schemaRoot,
  value,
  schema,
  errors,
  onTypeChange,
  onChange,
}: {
  schemaRoot: ComposerSchema;
  value: JsonObject;
  schema: { type: string; label: string; fields: SchemaField[] };
  errors: string[];
  onTypeChange: (type: string) => void;
  onChange: (value: JsonObject) => void;
}) {
  return (
    <Panel>
      <div className="grid gap-4">
        <div className={formGridClass}>
          <Field label="类型">
            <Select
              value={schema.type}
              onChange={(event) => onTypeChange(event.target.value)}
            >
              {getCertificateProviderTypeOptions(schemaRoot).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="self-end rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            schema: sing-box certificate/provider/{schema.type}
          </div>
        </div>
        {errors.length > 0 ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {errors.map((error) => (
              <div key={error}>{error}</div>
            ))}
          </div>
        ) : null}
        <SchemaFieldsEditor
          schemaRoot={schemaRoot}
          value={value}
          fields={schema.fields}
          onChange={onChange}
        />
      </div>
    </Panel>
  );
}

function ServicesPage({
  schema,
  state,
  selectedIndex,
  setSelectedIndex,
  updateState,
}: {
  schema: ComposerSchema;
  state: ComposerState;
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  updateState: (recipe: (draft: ComposerState) => void) => void;
}) {
  const services = state.services;
  const safeIndex = Math.min(selectedIndex, Math.max(0, services.length - 1));
  const selected = services[safeIndex] ?? null;

  const addService = () => {
    const service = newService(schema, state);
    updateState((draft) => {
      draft.services.push(service);
    });
    setSelectedIndex(services.length);
  };

  return (
    <Panel>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">服务配置</h2>
          <p className="text-sm text-muted-foreground">
            {services.length} services
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={addService}
          disabled={getServiceTypeOptions(schema).length === 0}
        >
          <Plus size={16} />
          New
        </Button>
      </div>
      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="sticky top-[calc(var(--composer-sticky-top)+1rem)] z-10 min-w-0 rounded-md border border-border bg-muted/20 p-3 max-h-[calc(100vh-var(--composer-sticky-top)-2rem)] overflow-hidden">
          <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">服务列表</h3>
            <Badge>{services.length}</Badge>
          </div>
          <div className="grid max-h-[calc(100vh-var(--composer-sticky-top)-7rem)] min-w-0 content-start gap-2 overflow-y-auto pr-1">
            {services.map((service, index) => {
              const active = index === safeIndex;
              return (
                <button
                  key={`${String(service.tag ?? "service")}-${index}`}
                  type="button"
                  onClick={() => setSelectedIndex(index)}
                  className={
                    active
                      ? "rounded-md border border-primary bg-primary/10 px-3 py-2 text-left text-sm font-medium"
                      : "rounded-md border border-border bg-background px-3 py-2 text-left text-sm hover:border-primary/50"
                  }
                >
                  <span className="block truncate">
                    {summarizeService(service, index)}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {String(service.type ?? "unknown")}
                  </span>
                </button>
              );
            })}
            {services.length === 0 ? <EmptyState label="No services" /> : null}
          </div>
        </aside>
        <div className="min-w-0">
          {selected ? (
            <ServiceEditor
              schemaRoot={schema}
              service={selected}
              scopeKey={`service-${safeIndex}`}
              onChange={(next) =>
                updateState((draft) => void (draft.services[safeIndex] = next))
              }
              onDelete={() => {
                updateState((draft) => {
                  draft.services.splice(safeIndex, 1);
                });
                setSelectedIndex(Math.max(0, safeIndex - 1));
              }}
            />
          ) : (
            <EmptyState label="Select or add a service" />
          )}
        </div>
      </div>
    </Panel>
  );
}

function ServiceEditor({
  schemaRoot,
  service,
  scopeKey,
  onChange,
  onDelete,
}: {
  schemaRoot: ComposerSchema;
  service: JsonObject;
  scopeKey: string;
  onChange: (service: JsonObject) => void;
  onDelete: () => void;
}) {
  const [mode, setMode] = useState<LocalMode>("form");
  const schema = getServiceSchema(schemaRoot, service.type);
  const errors = validateService(schemaRoot, service);
  const title = summarizeService(service, 0);

  return (
    <div className="grid min-w-0 gap-3">
      <DetailHeader
        title={title}
        subtitle={String(service.type ?? "unknown")}
        mode={mode}
        setMode={setMode}
        embedded
        actions={
          <Button variant="danger" onClick={onDelete}>
            <Trash2 size={16} />
            Delete
          </Button>
        }
      />
      {mode === "form" ? (
        schema ? (
          <ServiceTypedSchemaEditor
            schemaRoot={schemaRoot}
            value={service}
            schema={schema}
            errors={errors}
            onTypeChange={(type) =>
              onChange(changeServiceType(schemaRoot, service, type))
            }
            onChange={(next) =>
              onChange(sanitizeService(schemaRoot, { type: schema.type, ...next }))
            }
          />
        ) : (
          <Panel>
            <div className="grid gap-3">
              <div className="text-sm text-destructive">
                不支持的服务类型：{String(service.type ?? "")}
              </div>
              <Field label="类型">
                <Select
                  value=""
                  onChange={(event) =>
                    onChange(
                      changeServiceType(schemaRoot, service, event.target.value),
                    )
                  }
                >
                  <option value="">选择支持的类型</option>
                  {getServiceTypeOptions(schemaRoot).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <ObjectFormEditor value={service} onChange={onChange} />
            </div>
          </Panel>
        )
      ) : (
        <StructuredCodeEditor
          language={mode}
          scopeKey={`${scopeKey}-${mode}`}
          value={service}
          onApply={onChange}
        />
      )}
    </div>
  );
}

function ServiceTypedSchemaEditor({
  schemaRoot,
  value,
  schema,
  errors,
  onTypeChange,
  onChange,
}: {
  schemaRoot: ComposerSchema;
  value: JsonObject;
  schema: { type: string; label: string; fields: SchemaField[] };
  errors: string[];
  onTypeChange: (type: string) => void;
  onChange: (value: JsonObject) => void;
}) {
  return (
    <Panel>
      <div className="grid gap-4">
        <div className={formGridClass}>
          <Field label="类型">
            <Select
              value={schema.type}
              onChange={(event) => onTypeChange(event.target.value)}
            >
              {getServiceTypeOptions(schemaRoot).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="self-end rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            schema: sing-box service/{schema.type}
          </div>
        </div>
        {errors.length > 0 ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {errors.map((error) => (
              <div key={error}>{error}</div>
            ))}
          </div>
        ) : null}
        <SchemaFieldsEditor
          schemaRoot={schemaRoot}
          value={value}
          fields={schema.fields}
          onChange={onChange}
        />
      </div>
    </Panel>
  );
}

function EndpointsPage({
  schema,
  state,
  selectedIndex,
  setSelectedIndex,
  updateState,
}: {
  schema: ComposerSchema;
  state: ComposerState;
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  updateState: (recipe: (draft: ComposerState) => void) => void;
}) {
  const safeIndex = Math.min(
    selectedIndex,
    Math.max(0, state.endpoints.length - 1),
  );
  const selected = state.endpoints[safeIndex] ?? null;

  const addEndpoint = () => {
    const endpoint = newEndpoint(schema, state);
    updateState((draft) => {
      draft.endpoints.push(endpoint);
    });
    setSelectedIndex(state.endpoints.length);
  };

  return (
    <Panel>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">端点配置</h2>
          <p className="text-sm text-muted-foreground">
            {state.endpoints.length} endpoints
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={addEndpoint}
          disabled={getEndpointTypeOptions(schema).length === 0}
        >
          <Plus size={16} />
          New
        </Button>
      </div>
      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="sticky top-[calc(var(--composer-sticky-top)+1rem)] z-10 min-w-0 rounded-md border border-border bg-muted/20 p-3 max-h-[calc(100vh-var(--composer-sticky-top)-2rem)] overflow-hidden">
          <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">端点列表</h3>
            <Badge>{state.endpoints.length}</Badge>
          </div>
          <div className="grid max-h-[calc(100vh-var(--composer-sticky-top)-7rem)] min-w-0 content-start gap-2 overflow-y-auto pr-1">
            {state.endpoints.map((endpoint, index) => {
              const tag =
                typeof endpoint.tag === "string"
                  ? endpoint.tag
                  : `endpoint-${index + 1}`;
              const active = index === safeIndex;
              return (
                <button
                  key={`${tag}-${index}`}
                  type="button"
                  onClick={() => setSelectedIndex(index)}
                  className={
                    active
                      ? "rounded-md border border-primary bg-primary/10 px-3 py-2 text-left text-sm font-medium"
                      : "rounded-md border border-border bg-background px-3 py-2 text-left text-sm hover:border-primary/50"
                  }
                >
                  <span className="block truncate">{tag}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {String(endpoint.type ?? "unknown")}
                  </span>
                </button>
              );
            })}
            {state.endpoints.length === 0 ? (
              <EmptyState label="No endpoints" />
            ) : null}
          </div>
        </aside>
        <div className="min-w-0">
          {selected ? (
            <EndpointEditor
              schemaRoot={schema}
              endpoint={selected}
              scopeKey={`endpoint-${safeIndex}`}
              onChange={(next) =>
                updateState(
                  (draft) => void (draft.endpoints[safeIndex] = next),
                )
              }
              onDelete={() => {
                updateState((draft) => {
                  draft.endpoints.splice(safeIndex, 1);
                });
                setSelectedIndex(Math.max(0, safeIndex - 1));
              }}
            />
          ) : (
            <EmptyState label="Select or add an endpoint" />
          )}
        </div>
      </div>
    </Panel>
  );
}

function EndpointEditor({
  schemaRoot,
  endpoint,
  scopeKey,
  onChange,
  onDelete,
}: {
  schemaRoot: ComposerSchema;
  endpoint: JsonObject;
  scopeKey: string;
  onChange: (endpoint: JsonObject) => void;
  onDelete: () => void;
}) {
  const [mode, setMode] = useState<LocalMode>("form");
  const schema = getEndpointSchema(schemaRoot, endpoint.type);
  const errors = validateEndpoint(schemaRoot, endpoint);
  const title = typeof endpoint.tag === "string" ? endpoint.tag : "endpoint";

  return (
    <div className="grid min-w-0 gap-3">
      <DetailHeader
        title={title}
        subtitle={String(endpoint.type ?? "unknown")}
        mode={mode}
        setMode={setMode}
        embedded
        actions={
          <Button variant="danger" onClick={onDelete}>
            <Trash2 size={16} />
            Delete
          </Button>
        }
      />
      {mode === "form" ? (
        schema ? (
          <EndpointTypedSchemaEditor
            schemaRoot={schemaRoot}
            value={endpoint}
            schema={schema}
            errors={errors}
            onTypeChange={(type) =>
              onChange(changeEndpointType(schemaRoot, endpoint, type))
            }
            onChange={(next) =>
              onChange(
                sanitizeEndpoint(schemaRoot, { type: schema.type, ...next }),
              )
            }
          />
        ) : (
          <Panel>
            <div className="grid gap-3">
              <div className="text-sm text-destructive">
                不支持的端点类型：{String(endpoint.type ?? "")}
              </div>
              <Field label="类型">
                <Select
                  value=""
                  onChange={(event) =>
                    onChange(
                      changeEndpointType(
                        schemaRoot,
                        endpoint,
                        event.target.value,
                      ),
                    )
                  }
                >
                  <option value="">选择支持的类型</option>
                  {getEndpointTypeOptions(schemaRoot).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <ObjectFormEditor value={endpoint} onChange={onChange} />
            </div>
          </Panel>
        )
      ) : (
        <StructuredCodeEditor
          language={mode}
          scopeKey={`${scopeKey}-${mode}`}
          value={endpoint}
          onApply={onChange}
        />
      )}
    </div>
  );
}

function EndpointTypedSchemaEditor({
  schemaRoot,
  value,
  schema,
  errors,
  onTypeChange,
  onChange,
}: {
  schemaRoot: ComposerSchema;
  value: JsonObject;
  schema: { type: string; label: string; fields: SchemaField[] };
  errors: string[];
  onTypeChange: (type: string) => void;
  onChange: (value: JsonObject) => void;
}) {
  return (
    <Panel>
      <div className="grid gap-4">
        <div className={formGridClass}>
          <Field label="类型">
            <Select
              value={schema.type}
              onChange={(event) => onTypeChange(event.target.value)}
            >
              {getEndpointTypeOptions(schemaRoot).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="self-end rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            schema: sing-box endpoint/{schema.type}
          </div>
        </div>
        {errors.length > 0 ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {errors.map((error) => (
              <div key={error}>{error}</div>
            ))}
          </div>
        ) : null}
        <SchemaFieldsEditor
          schemaRoot={schemaRoot}
          value={value}
          fields={schema.fields}
          onChange={onChange}
        />
      </div>
    </Panel>
  );
}

function InboundsPage({
  schema,
  state,
  selectedIndex,
  setSelectedIndex,
  updateState,
}: {
  schema: ComposerSchema;
  state: ComposerState;
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  updateState: (recipe: (draft: ComposerState) => void) => void;
}) {
  const safeIndex = Math.min(
    selectedIndex,
    Math.max(0, state.inbounds.length - 1),
  );
  const selected = state.inbounds[safeIndex] ?? null;

  const addInbound = () => {
    const inbound = newInbound(schema, state);
    updateState((draft) => {
      draft.inbounds.push(inbound);
    });
    setSelectedIndex(state.inbounds.length);
  };

  return (
    <Panel>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">入站配置</h2>
          <p className="text-sm text-muted-foreground">
            {state.inbounds.length} inbounds
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={addInbound}
          disabled={getInboundTypeOptions(schema).length === 0}
        >
          <Plus size={16} />
          New
        </Button>
      </div>
      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="sticky top-[calc(var(--composer-sticky-top)+1rem)] z-10 min-w-0 rounded-md border border-border bg-muted/20 p-3 max-h-[calc(100vh-var(--composer-sticky-top)-2rem)] overflow-hidden">
          <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">入站列表</h3>
            <Badge>{state.inbounds.length}</Badge>
          </div>
          <div className="grid max-h-[calc(100vh-var(--composer-sticky-top)-7rem)] min-w-0 content-start gap-2 overflow-y-auto pr-1">
            {state.inbounds.map((inbound, index) => {
              const tag =
                typeof inbound.tag === "string"
                  ? inbound.tag
                  : `inbound-${index + 1}`;
              const active = index === safeIndex;
              return (
                <button
                  key={`${tag}-${index}`}
                  type="button"
                  onClick={() => setSelectedIndex(index)}
                  className={
                    active
                      ? "rounded-md border border-primary bg-primary/10 px-3 py-2 text-left text-sm font-medium"
                      : "rounded-md border border-border bg-background px-3 py-2 text-left text-sm hover:border-primary/50"
                  }
                >
                  <span className="block truncate">{tag}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {String(inbound.type ?? "unknown")}
                  </span>
                </button>
              );
            })}
            {state.inbounds.length === 0 ? (
              <EmptyState label="No inbounds" />
            ) : null}
          </div>
        </aside>
        <div className="min-w-0">
          {selected ? (
            <InboundEditor
              schemaRoot={schema}
              inbound={selected}
              scopeKey={`inbound-${safeIndex}`}
              onChange={(next) =>
                updateState(
                  (draft) => void (draft.inbounds[safeIndex] = next),
                )
              }
              onDelete={() => {
                updateState((draft) => {
                  draft.inbounds.splice(safeIndex, 1);
                });
                setSelectedIndex(Math.max(0, safeIndex - 1));
              }}
            />
          ) : (
            <EmptyState label="Select or add an inbound" />
          )}
        </div>
      </div>
    </Panel>
  );
}

function InboundEditor({
  schemaRoot,
  inbound,
  scopeKey,
  onChange,
  onDelete,
}: {
  schemaRoot: ComposerSchema;
  inbound: JsonObject;
  scopeKey: string;
  onChange: (inbound: JsonObject) => void;
  onDelete: () => void;
}) {
  const [mode, setMode] = useState<LocalMode>("form");
  const schema = getInboundSchema(schemaRoot, inbound.type);
  const errors = validateInbound(schemaRoot, inbound);
  const title = typeof inbound.tag === "string" ? inbound.tag : "inbound";

  return (
    <div className="grid min-w-0 gap-3">
      <DetailHeader
        title={title}
        subtitle={String(inbound.type ?? "unknown")}
        mode={mode}
        setMode={setMode}
        embedded
        actions={
          <Button variant="danger" onClick={onDelete}>
            <Trash2 size={16} />
            Delete
          </Button>
        }
      />
      {mode === "form" ? (
        schema ? (
          <InboundTypedSchemaEditor
            schemaRoot={schemaRoot}
            value={inbound}
            schema={schema}
            errors={errors}
            onTypeChange={(type) =>
              onChange(changeInboundType(schemaRoot, inbound, type))
            }
            onChange={(next) =>
              onChange(
                sanitizeInbound(schemaRoot, { type: schema.type, ...next }),
              )
            }
          />
        ) : (
          <Panel>
            <div className="grid gap-3">
              <div className="text-sm text-destructive">
                不支持的入站类型：{String(inbound.type ?? "")}
              </div>
              <Field label="类型">
                <Select
                  value=""
                  onChange={(event) =>
                    onChange(
                      changeInboundType(
                        schemaRoot,
                        inbound,
                        event.target.value,
                      ),
                    )
                  }
                >
                  <option value="">选择支持的类型</option>
                  {getInboundTypeOptions(schemaRoot).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <ObjectFormEditor value={inbound} onChange={onChange} />
            </div>
          </Panel>
        )
      ) : (
        <StructuredCodeEditor
          language={mode}
          scopeKey={`${scopeKey}-${mode}`}
          value={inbound}
          onApply={onChange}
        />
      )}
    </div>
  );
}

function InboundTypedSchemaEditor({
  schemaRoot,
  value,
  schema,
  errors,
  onTypeChange,
  onChange,
}: {
  schemaRoot: ComposerSchema;
  value: JsonObject;
  schema: { type: string; label: string; fields: SchemaField[] };
  errors: string[];
  onTypeChange: (type: string) => void;
  onChange: (value: JsonObject) => void;
}) {
  return (
    <Panel>
      <div className="grid gap-4">
        <div className={formGridClass}>
          <Field label="类型">
            <Select
              value={schema.type}
              onChange={(event) => onTypeChange(event.target.value)}
            >
              {getInboundTypeOptions(schemaRoot).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="self-end rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            schema: sing-box inbound/{schema.type}
          </div>
        </div>
        {errors.length > 0 ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {errors.map((error) => (
              <div key={error}>{error}</div>
            ))}
          </div>
        ) : null}
        <SchemaFieldsEditor
          schemaRoot={schemaRoot}
          value={value}
          fields={schema.fields}
          onChange={onChange}
        />
      </div>
    </Panel>
  );
}

function DnsPage({
  schema,
  state,
  selectedServerIndex,
  selectedRuleIndex,
  setSelectedServerIndex,
  setSelectedRuleIndex,
  updateState,
}: {
  schema: ComposerSchema;
  state: ComposerState;
  selectedServerIndex: number;
  selectedRuleIndex: number;
  setSelectedServerIndex: (index: number) => void;
  setSelectedRuleIndex: (index: number) => void;
  updateState: (recipe: (draft: ComposerState) => void) => void;
}) {
  const dns = state.dns;
  const dnsSchema = schema.dns;
  const safeServerIndex = Math.min(
    selectedServerIndex,
    Math.max(0, dns.servers.length - 1),
  );
  const safeRuleIndex = Math.min(
    selectedRuleIndex,
    Math.max(0, dns.rules.length - 1),
  );
  const selectedServer = dns.servers[safeServerIndex] ?? null;
  const selectedRule = dns.rules[safeRuleIndex] ?? null;

  const addServer = () => {
    const server = newDnsServer(schema, dns);
    updateState((draft) => {
      draft.dns.servers.push(server);
    });
    setSelectedServerIndex(dns.servers.length);
  };

  const addRule = () => {
    const rule = newDnsRule(schema, dns);
    updateState((draft) => {
      draft.dns.rules.push(rule);
    });
    setSelectedRuleIndex(dns.rules.length);
  };

  if (!dnsSchema) {
    return <EmptyState label="DNS schema unavailable" />;
  }

  return (
    <section className="grid gap-4">
      <Panel>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">DNS</h2>
            <p className="text-sm text-muted-foreground">
              {dns.servers.length} servers · {dns.rules.length} rules
            </p>
          </div>
          <CheckField
            className="self-center"
            label="启用"
            checked={dns.enabled}
            onChange={(value) =>
              updateState((draft) => void (draft.dns.enabled = value))
            }
          />
        </div>
        <DnsOptionsEditor
          schema={schema}
          dns={dns}
          update={(recipe) => updateState((draft) => recipe(draft.dns))}
        />
      </Panel>

      <Panel>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">DNS 服务器</h3>
          <Button
            variant="secondary"
            onClick={addServer}
            disabled={getDnsServerTypeOptions(schema).length === 0}
          >
            <Plus size={16} />
            Add
          </Button>
        </div>
        <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="sticky top-[calc(var(--composer-sticky-top)+1rem)] z-10 min-w-0 rounded-md border border-border bg-muted/20 p-3 max-h-[calc(100vh-var(--composer-sticky-top)-2rem)] overflow-hidden">
            <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
              <h4 className="text-sm font-semibold">服务器列表</h4>
              <Badge>{dns.servers.length}</Badge>
            </div>
            <div className="grid max-h-[calc(100vh-var(--composer-sticky-top)-7rem)] min-w-0 content-start gap-2 overflow-y-auto pr-1">
              {dns.servers.map((server, index) => {
                const tag =
                  typeof server.tag === "string"
                    ? server.tag
                    : `dns-${index + 1}`;
                const active = index === safeServerIndex;
                return (
                  <button
                    key={`${tag}-${index}`}
                    type="button"
                    onClick={() => setSelectedServerIndex(index)}
                    className={
                      active
                        ? "rounded-md border border-primary bg-primary/10 px-3 py-2 text-left text-sm font-medium"
                        : "rounded-md border border-border bg-background px-3 py-2 text-left text-sm hover:border-primary/50"
                    }
                  >
                    <span className="block truncate">{tag}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {String(server.type ?? "unknown")}
                    </span>
                  </button>
                );
              })}
              {dns.servers.length === 0 ? (
                <EmptyState label="No DNS servers" />
              ) : null}
            </div>
          </aside>
          <div className="min-w-0">
            {selectedServer ? (
              <DnsServerEditor
                schemaRoot={schema}
                server={selectedServer}
                scopeKey={`dns-server-${safeServerIndex}`}
                onChange={(next) =>
                  updateState(
                    (draft) => void (draft.dns.servers[safeServerIndex] = next),
                  )
                }
                onDelete={() => {
                  updateState((draft) => {
                    draft.dns.servers.splice(safeServerIndex, 1);
                  });
                  setSelectedServerIndex(Math.max(0, safeServerIndex - 1));
                }}
              />
            ) : (
              <EmptyState label="Select or add a DNS server" />
            )}
          </div>
        </div>
      </Panel>

      <Panel>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">DNS 解析规则</h3>
          <Button
            variant="secondary"
            onClick={addRule}
            disabled={getDnsRuleTypeOptions(schema).length === 0}
          >
            <Plus size={16} />
            Add
          </Button>
        </div>
        <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="sticky top-[calc(var(--composer-sticky-top)+1rem)] z-10 min-w-0 rounded-md border border-border bg-muted/20 p-3 max-h-[calc(100vh-var(--composer-sticky-top)-2rem)] overflow-hidden">
            <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
              <h4 className="text-sm font-semibold">规则列表</h4>
              <Badge>{dns.rules.length}</Badge>
            </div>
            <div className="grid max-h-[calc(100vh-var(--composer-sticky-top)-7rem)] min-w-0 content-start gap-2 overflow-y-auto pr-1">
              {dns.rules.map((rule, index) => {
                const active = index === safeRuleIndex;
                return (
                  <button
                    key={`dns-rule-${index}`}
                    type="button"
                    onClick={() => setSelectedRuleIndex(index)}
                    className={
                      active
                        ? "rounded-md border border-primary bg-primary/10 px-3 py-2 text-left text-sm font-medium"
                        : "rounded-md border border-border bg-background px-3 py-2 text-left text-sm hover:border-primary/50"
                    }
                  >
                    <span className="block truncate">
                      {summarizeDnsRule(rule, index)}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {String(rule.type ?? "default")} ·{" "}
                      {String(rule.action ?? "route")}
                    </span>
                  </button>
                );
              })}
              {dns.rules.length === 0 ? (
                <EmptyState label="No DNS rules" />
              ) : null}
            </div>
          </aside>
          <div className="min-w-0">
            {selectedRule ? (
              <DnsRuleEditor
                schemaRoot={schema}
                rule={selectedRule}
                scopeKey={`dns-rule-${safeRuleIndex}`}
                onChange={(next) =>
                  updateState(
                    (draft) => void (draft.dns.rules[safeRuleIndex] = next),
                  )
                }
                onDelete={() => {
                  updateState((draft) => {
                    draft.dns.rules.splice(safeRuleIndex, 1);
                  });
                  setSelectedRuleIndex(Math.max(0, safeRuleIndex - 1));
                }}
              />
            ) : (
              <EmptyState label="Select or add a DNS rule" />
            )}
          </div>
        </div>
      </Panel>
    </section>
  );
}

function DnsOptionsEditor({
  schema,
  dns,
  update,
}: {
  schema: ComposerSchema;
  dns: DnsConfig;
  update: (recipe: (dns: DnsConfig) => void) => void;
}) {
  const fields = schema.dns?.options.fields ?? [];
  const options = (dns.options ?? {}) as JsonObject;
  const errors = validateFields(options, fields, schema);

  return (
    <div className="grid min-w-0 gap-3">
      <div className="border-b border-border pb-3">
        <h3 className="text-sm font-semibold">DNS 基础选项</h3>
        <p className="text-sm text-muted-foreground">dns options</p>
      </div>
      {errors.length > 0 ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {errors.map((error) => (
            <div key={error}>{error}</div>
          ))}
        </div>
      ) : null}
      <SchemaFieldsEditor
        schemaRoot={schema}
        value={options}
        fields={fields}
        onChange={(next) =>
          update(
            (draft) =>
              void (draft.options = sanitizeFields(next, fields, schema)),
          )
        }
      />
    </div>
  );
}

function DnsServerEditor({
  schemaRoot,
  server,
  scopeKey,
  onChange,
  onDelete,
}: {
  schemaRoot: ComposerSchema;
  server: JsonObject;
  scopeKey: string;
  onChange: (server: JsonObject) => void;
  onDelete: () => void;
}) {
  const [mode, setMode] = useState<LocalMode>("form");
  const schema = getDnsServerSchema(schemaRoot, server.type);
  const errors = validateDnsServer(schemaRoot, server);
  const title = typeof server.tag === "string" ? server.tag : "dns server";

  return (
    <div className="grid min-w-0 gap-3">
      <DetailHeader
        title={title}
        subtitle={String(server.type ?? "unknown")}
        mode={mode}
        setMode={setMode}
        embedded
        actions={
          <Button variant="danger" onClick={onDelete}>
            <Trash2 size={16} />
            Delete
          </Button>
        }
      />
      {mode === "form" ? (
        schema ? (
          <DnsTypedSchemaEditor
            kind="server"
            schemaRoot={schemaRoot}
            value={server}
            schema={schema}
            errors={errors}
            onTypeChange={(type) =>
              onChange(changeDnsServerType(schemaRoot, server, type))
            }
            onChange={(next) =>
              onChange(
                sanitizeDnsServer(schemaRoot, { type: schema.type, ...next }),
              )
            }
          />
        ) : (
          <Panel>
            <div className="grid gap-3">
              <div className="text-sm text-destructive">
                不支持的 DNS 服务器类型：{String(server.type ?? "")}
              </div>
              <Field label="类型">
                <Select
                  value=""
                  onChange={(event) =>
                    onChange(
                      changeDnsServerType(
                        schemaRoot,
                        server,
                        event.target.value,
                      ),
                    )
                  }
                >
                  <option value="">选择支持的类型</option>
                  {getDnsServerTypeOptions(schemaRoot).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <ObjectFormEditor value={server} onChange={onChange} />
            </div>
          </Panel>
        )
      ) : (
        <StructuredCodeEditor
          language={mode}
          scopeKey={`${scopeKey}-${mode}`}
          value={server}
          onApply={onChange}
        />
      )}
    </div>
  );
}

function DnsRuleEditor({
  schemaRoot,
  rule,
  scopeKey,
  onChange,
  onDelete,
}: {
  schemaRoot: ComposerSchema;
  rule: JsonObject;
  scopeKey: string;
  onChange: (rule: JsonObject) => void;
  onDelete: () => void;
}) {
  const [mode, setMode] = useState<LocalMode>("form");
  const schema = getDnsRuleSchema(schemaRoot, rule.type);
  const errors = validateDnsRule(schemaRoot, rule);

  return (
    <div className="grid min-w-0 gap-3">
      <DetailHeader
        title={summarizeDnsRule(rule, 0)}
        subtitle={String(rule.type ?? "default")}
        mode={mode}
        setMode={setMode}
        embedded
        actions={
          <Button variant="danger" onClick={onDelete}>
            <Trash2 size={16} />
            Delete
          </Button>
        }
      />
      {mode === "form" ? (
        schema ? (
          <DnsTypedSchemaEditor
            kind="rule"
            schemaRoot={schemaRoot}
            value={rule}
            schema={schema}
            errors={errors}
            onTypeChange={(type) =>
              onChange(changeDnsRuleType(schemaRoot, rule, type))
            }
            onChange={(next) =>
              onChange(
                sanitizeDnsRule(schemaRoot, { type: schema.type, ...next }),
              )
            }
          />
        ) : (
          <Panel>
            <div className="grid gap-3">
              <div className="text-sm text-destructive">
                不支持的 DNS 规则类型：{String(rule.type ?? "")}
              </div>
              <Field label="类型">
                <Select
                  value=""
                  onChange={(event) =>
                    onChange(
                      changeDnsRuleType(schemaRoot, rule, event.target.value),
                    )
                  }
                >
                  <option value="">选择支持的类型</option>
                  {getDnsRuleTypeOptions(schemaRoot).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <ObjectFormEditor value={rule} onChange={onChange} />
            </div>
          </Panel>
        )
      ) : (
        <StructuredCodeEditor
          language={mode}
          scopeKey={`${scopeKey}-${mode}`}
          value={rule}
          onApply={onChange}
        />
      )}
    </div>
  );
}

function DnsTypedSchemaEditor({
  kind,
  schemaRoot,
  value,
  schema,
  errors,
  onTypeChange,
  onChange,
}: {
  kind: "server" | "rule";
  schemaRoot: ComposerSchema;
  value: JsonObject;
  schema: { type: string; label: string; fields: SchemaField[] };
  errors: string[];
  onTypeChange: (type: string) => void;
  onChange: (value: JsonObject) => void;
}) {
  const typeOptions =
    kind === "server"
      ? getDnsServerTypeOptions(schemaRoot)
      : getDnsRuleTypeOptions(schemaRoot);

  return (
    <Panel>
      <div className="grid gap-4">
        <div className={formGridClass}>
          <Field label="类型">
            <Select
              value={schema.type}
              onChange={(event) => onTypeChange(event.target.value)}
            >
              {typeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="self-end rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            schema: sing-box dns/{kind}/{schema.type}
          </div>
        </div>
        {errors.length > 0 ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {errors.map((error) => (
              <div key={error}>{error}</div>
            ))}
          </div>
        ) : null}
        <SchemaFieldsEditor
          schemaRoot={schemaRoot}
          value={value}
          fields={schema.fields}
          onChange={onChange}
        />
      </div>
    </Panel>
  );
}

function BaseConfigPage({
  state,
  updateState,
}: {
  state: ComposerState;
  updateState: (recipe: (draft: ComposerState) => void) => void;
}) {
  const [baseMode, setBaseMode] = useState<"json" | "yaml">("json");
  return (
    <section className="grid gap-4">
      <Panel>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">base_config</h2>
          <div className="flex gap-1 rounded-md border border-border bg-muted p-1">
            <MiniTab
              active={baseMode === "json"}
              onClick={() => setBaseMode("json")}
              icon={<Braces size={15} />}
            >
              JSON
            </MiniTab>
            <MiniTab
              active={baseMode === "yaml"}
              onClick={() => setBaseMode("yaml")}
              icon={<Code2 size={15} />}
            >
              YAML
            </MiniTab>
          </div>
        </div>
        <StructuredCodeEditor
          language={baseMode}
          scopeKey={`base-${baseMode}`}
          value={state.base_config}
          onApply={(value) =>
            updateState((draft) => void (draft.base_config = value))
          }
          textareaExpandable={false}
        />
      </Panel>
    </section>
  );
}

function OutputPage({
  output,
  resolved,
  downloadHref,
  onRefresh,
}: {
  output: string;
  resolved: ResolvedState | null;
  downloadHref: string;
  onRefresh: () => Promise<void>;
}) {
  return (
    <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_360px]">
      <Panel>
        <div className="mb-3 flex flex-wrap gap-2">
          <Button onClick={() => void onRefresh()}>
            <RefreshCw size={16} />
            Generate
          </Button>
          {downloadHref ? (
            <a
              className="inline-flex h-9 items-center gap-2 rounded-md bg-secondary px-3 text-sm font-medium text-secondary-foreground"
              href={downloadHref}
              download="sing-box.json"
            >
              <Download size={16} />
              Download
            </a>
          ) : null}
        </div>
        <Textarea
          value={output}
          readOnly
          expandable={false}
          textareaClassName="min-h-[66vh] resize-none"
        />
      </Panel>
      <aside className="grid content-start gap-3">
        <ResolvedBlock
          title="Proxies"
          items={
            resolved?.proxies.map(
              (proxy) => `${proxy.tag} (${proxy.outbound_type})`,
            ) ?? []
          }
        />
        <ResolvedBlock
          title="Groups"
          items={
            resolved?.groups.map(
              (group) => `${group.tag}: ${group.outbounds.join(", ")}`,
            ) ?? []
          }
        />
        <ResolvedBlock
          title="Rules"
          items={
            resolved?.rules.map(
              (rule, index) => `${index + 1}. ${JSON.stringify(rule)}`,
            ) ?? []
          }
        />
      </aside>
    </div>
  );
}

function RewriteEditor({
  rewrites,
  update,
}: {
  rewrites: NameRewriteRule[];
  update: (recipe: (source: ProxySource) => void) => void;
}) {
  return (
    <Panel>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">名称批处理</h3>
        <Button
          variant="secondary"
          onClick={() =>
            update(
              (draft) =>
                void draft.name_rewrites.push({ pattern: "", replacement: "" }),
            )
          }
        >
          <Plus size={16} />
          Add
        </Button>
      </div>
      <div className="grid gap-2">
        {rewrites.map((rule, index) => (
          <div
            key={index}
            className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
          >
            <Input
              value={rule.pattern}
              placeholder="regex"
              onChange={(event) =>
                update(
                  (draft) =>
                    void (draft.name_rewrites[index].pattern =
                      event.target.value),
                )
              }
            />
            <Input
              value={rule.replacement}
              placeholder="replacement"
              onChange={(event) =>
                update(
                  (draft) =>
                    void (draft.name_rewrites[index].replacement =
                      event.target.value),
                )
              }
            />
            <Button
              className="justify-self-start xl:justify-self-auto"
              variant="ghost"
              onClick={() =>
                update((draft) => void draft.name_rewrites.splice(index, 1))
              }
            >
              <Trash2 size={16} />
            </Button>
          </div>
        ))}
        {rewrites.length === 0 ? <EmptyState label="No rewrite rules" /> : null}
      </div>
    </Panel>
  );
}

function ObjectFormEditor({
  value,
  onChange,
}: {
  value: JsonObject;
  onChange: (value: JsonObject) => void;
}) {
  const entries = Object.entries(value);
  const updateKey = (oldKey: string, newKey: string) => {
    if (!newKey || oldKey === newKey) {
      return;
    }
    const next: JsonObject = {};
    for (const [key, val] of Object.entries(value)) {
      next[key === oldKey ? newKey : key] = val;
    }
    onChange(next);
  };
  const updateValue = (key: string, raw: string) => {
    onChange({ ...value, [key]: parseLocalFieldValue(value[key], raw) });
  };
  const removeKey = (key: string) => {
    const next = { ...value };
    delete next[key];
    onChange(next);
  };
  return (
    <div className="grid gap-2">
      {entries.map(([key, val]) => (
        <div
          key={key}
          className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2 xl:grid-cols-[minmax(150px,200px)_minmax(0,1fr)_auto]"
        >
          <Input
            defaultValue={key}
            onBlur={(event) => updateKey(key, event.target.value.trim())}
          />
          {typeof val === "object" && val !== null ? (
            <Textarea
              className="col-span-2 xl:col-span-1"
              defaultValue={formatLocalFieldValue(val)}
              onBlur={(event) => updateValue(key, event.target.value)}
            />
          ) : (
            <Input
              className="col-span-2 xl:col-span-1"
              defaultValue={formatLocalFieldValue(val)}
              onBlur={(event) => updateValue(key, event.target.value)}
            />
          )}
          <Button
            className="col-start-2 row-start-1 justify-self-end xl:col-start-auto xl:row-start-auto"
            variant="ghost"
            onClick={() => removeKey(key)}
          >
            <Trash2 size={16} />
          </Button>
        </div>
      ))}
      <Button
        variant="secondary"
        onClick={() => {
          let key = "new_field";
          let index = 1;
          while (key in value) {
            index += 1;
            key = `new_field_${index}`;
          }
          onChange({ ...value, [key]: "" });
        }}
      >
        <Plus size={16} />
        Add field
      </Button>
    </div>
  );
}

function StructuredCodeEditor({
  language,
  scopeKey,
  readOnly = false,
  textareaExpandable = false,
  value,
  onApply,
}: {
  language: "json" | "yaml";
  scopeKey: string;
  readOnly?: boolean;
  textareaExpandable?: boolean;
  value: JsonObject;
  onApply: (value: JsonObject) => void;
}) {
  const [draft, setDraft] = useState(() => serializeObject(value, language));
  const [error, setError] = useState("");

  useEffect(() => {
    setDraft(serializeObject(value, language));
    setError("");
  }, [scopeKey, language]);

  const apply = () => {
    if (readOnly) {
      return;
    }
    try {
      const parsed =
        language === "json" ? JSON.parse(draft) : YAML.parse(draft);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Object expected");
      }
      onApply(parsed as JsonObject);
      setDraft(serializeObject(parsed as JsonObject, language));
      setError("");
    } catch (parseError) {
      setError(errorMessage(parseError));
    }
  };

  return (
    <div className="grid gap-2">
      <Textarea
        expandedClassName="min-h-80"
        expandable={textareaExpandable}
        readOnly={readOnly}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        {error ? (
          <div className="text-sm text-destructive">{error}</div>
        ) : (
          <div />
        )}
        <Button onClick={apply} disabled={readOnly}>
          <Save size={16} />
          {readOnly ? "只读" : "Apply"}
        </Button>
      </div>
    </div>
  );
}

function TwoPane({
  title,
  description,
  action,
  list,
  children,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  list: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]">
      <div className="sticky top-[calc(var(--composer-sticky-top)+1rem)] z-10 min-w-0 max-h-[calc(100vh-var(--composer-sticky-top)-2rem)] overflow-y-auto">
        <Panel>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-semibold">{title}</h2>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
            {action}
          </div>
          {list}
        </Panel>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function ItemList({
  items,
  onSelect,
}: {
  items: Array<{
    id: string;
    title: string;
    subtitle: string;
    active: boolean;
    dirty: boolean;
  }>;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="grid min-w-0 gap-2">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect(item.id)}
          className={
            item.active
              ? "rounded-md border border-primary bg-primary/10 px-3 py-3 text-left"
              : "rounded-md border border-border bg-background px-3 py-3 text-left hover:border-primary/50"
          }
        >
          <div className="flex min-w-0 items-center justify-between gap-2">
            <span className="truncate text-sm font-medium">{item.title}</span>
            {item.dirty ? <Badge>Unsaved</Badge> : null}
          </div>
          <span className="mt-1 block truncate text-xs text-muted-foreground">
            {item.subtitle}
          </span>
        </button>
      ))}
      {items.length === 0 ? <EmptyState label="Empty" /> : null}
    </div>
  );
}

function DetailHeader({
  title,
  subtitle,
  mode,
  setMode,
  actions,
  embedded = false,
}: {
  title: string;
  subtitle: string;
  mode: LocalMode;
  setMode: (mode: LocalMode) => void;
  actions?: React.ReactNode;
  embedded?: boolean;
}) {
  return (
    <div
      className={
        embedded
          ? "flex min-w-0 flex-col gap-3 border-b border-border pb-3 sm:flex-row sm:items-start sm:justify-between"
          : "flex min-w-0 flex-col gap-3 rounded-md border border-border bg-white p-4 sm:flex-row sm:items-start sm:justify-between"
      }
    >
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-lg font-semibold">{title}</h2>
        <p className="truncate text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <div className="flex w-full min-w-0 flex-wrap items-center justify-start gap-2 sm:w-auto sm:justify-end">
        <div className="flex shrink-0 gap-1 rounded-md border border-border bg-muted p-1">
          <MiniTab
            active={mode === "form"}
            onClick={() => setMode("form")}
            icon={<Layers3 size={15} />}
          >
            Form
          </MiniTab>
          <MiniTab
            active={mode === "json"}
            onClick={() => setMode("json")}
            icon={<Braces size={15} />}
          >
            JSON
          </MiniTab>
          <MiniTab
            active={mode === "yaml"}
            onClick={() => setMode("yaml")}
            icon={<Code2 size={15} />}
          >
            YAML
          </MiniTab>
        </div>
        {actions}
      </div>
    </div>
  );
}

function MiniTab({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "inline-flex h-8 shrink-0 items-center gap-1 rounded-sm bg-white px-2 text-xs font-medium text-foreground shadow-sm"
          : "inline-flex h-8 shrink-0 items-center gap-1 rounded-sm px-2 text-xs font-medium text-muted-foreground hover:bg-white/70"
      }
    >
      {icon}
      {children}
    </button>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-md border border-border bg-white p-4">
      {children}
    </section>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex min-h-9 items-center rounded-md border border-dashed border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
      {label}
    </div>
  );
}

function StatusBadge({
  status,
  onClose,
}: {
  status: Exclude<Status, null>;
  onClose: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const className =
    status.kind === "error"
      ? "border-destructive/30 bg-destructive text-destructive-foreground"
      : "border-border bg-secondary text-secondary-foreground";

  useEffect(() => {
    if (hovered) {
      return;
    }
    const timeout = window.setTimeout(onClose, 3000);
    return () => window.clearTimeout(timeout);
  }, [hovered, onClose, status]);

  return (
    <div className="pointer-events-none fixed left-3 right-3 top-[calc(var(--composer-sticky-top)+0.75rem)] z-50 flex justify-center">
      <div
        className={`pointer-events-auto flex max-w-[min(920px,calc(100vw-1.5rem))] min-w-0 items-start gap-3 rounded-md border px-3 py-2 text-sm shadow-lg ${className}`}
        role={status.kind === "error" ? "alert" : "status"}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div className="min-w-0 flex-1 whitespace-pre-wrap break-words">
          {status.message}
        </div>
        <button
          type="button"
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm transition hover:bg-black/10"
          aria-label="关闭"
          title="关闭"
          onClick={onClose}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

function ChoiceList({
  title,
  items,
  selected,
  onChange,
}: {
  title: string;
  items: Array<{ value: string; label: string }>;
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const toggle = (value: string, checked: boolean) => {
    if (checked) {
      onChange(selected.includes(value) ? selected : [...selected, value]);
    } else {
      onChange(selected.filter((item) => item !== value));
    }
  };
  return (
    <div className="grid min-w-0 gap-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="grid max-h-64 gap-2 overflow-y-auto rounded-md border border-border p-2">
        {items.map((item) => (
          <label
            key={item.value}
            className="flex min-w-0 items-center justify-between gap-3 rounded-sm px-2 py-1 text-sm hover:bg-muted"
          >
            <span className="min-w-0 truncate">{item.label}</span>
            <input
              className="h-4 w-4 accent-primary"
              type="checkbox"
              checked={selected.includes(item.value)}
              onChange={(event) => toggle(item.value, event.target.checked)}
            />
          </label>
        ))}
        {items.length === 0 ? <EmptyState label="Empty" /> : null}
      </div>
    </div>
  );
}

function LineListField({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  className?: string;
}) {
  return (
    <Field label={label} className={className}>
      <LineListTextarea value={value} onChange={onChange} />
    </Field>
  );
}

function LineListTextarea({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(() => value.join("\n"));
  const serialized = value.join("\n");

  useEffect(() => {
    if (!sameStringArray(parseLines(draft), value)) {
      setDraft(serialized);
    }
  }, [serialized, value]);

  return (
    <Textarea
      value={draft}
      placeholder={placeholder}
      onChange={(event) => {
        const next = event.target.value;
        setDraft(next);
        onChange(parseLines(next));
      }}
    />
  );
}

function sameStringArray(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((item, index) => item === right[index])
  );
}

function ResolvedBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <Panel>
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      <div className="grid gap-2">
        {items.length ? (
          items.map((item, index) => (
            <pre key={index} className="rounded-sm bg-muted p-2 text-xs">
              {item}
            </pre>
          ))
        ) : (
          <EmptyState label="Empty" />
        )}
      </div>
    </Panel>
  );
}

function newSource(schema: ComposerSchema): ProxySource {
  return {
    id: makeId("source"),
    name: "New Source",
    enabled: true,
    kind: "manual",
    prefix: "",
    name_rewrites: [],
    subscription: {
      url: "",
      user_agent: "composer/0.1",
      skip_tls_verify: false,
      last_fetch_at: null,
    },
    nodes: [newOutboundNode(schema, 1)],
  };
}

function newOutboundNode(schema: ComposerSchema, index: number): JsonObject {
  return createTypedOutboundNode(schema, schema.default_outbound_type, {
    tag: `proxy-${index}`,
    server: "example.com",
    server_port: 443,
    tls: {
      enabled: true,
      server_name: "example.com",
    },
  });
}

function newProxyGroup(): ProxyGroup {
  return {
    id: makeId("group"),
    tag: "New Group",
    enabled: true,
    group_type: "selector",
    source_ids: [],
    match_regexes: [".*"],
    include_groups: [],
    include_special: ["DIRECT"],
    default: "",
    url: "https://www.gstatic.com/generate_204",
    interval: "3m",
    tolerance: 50,
    idle_timeout: "30m",
    interrupt_exist_connections: true,
  };
}

function newTargetGroup(): TargetGroup {
  return {
    id: makeId("target"),
    name: "New Target",
    enabled: true,
    outbound: "",
    entries: [newTargetEntry()],
  };
}

function newTargetEntry(): TargetEntry {
  return {
    id: makeId("entry"),
    label: "",
    kind: "domain_suffix",
    values: [],
    invert: false,
    raw: {},
  };
}

function newInbound(schema: ComposerSchema, state: ComposerState): JsonObject {
  const tag = uniqueInboundTag(state, "inbound");
  return createTypedInbound(
    schema,
    schema.default_inbound_type ?? "mixed",
    {
      tag,
      listen: "127.0.0.1",
      listen_port: 2080,
    },
  );
}

function newEndpoint(schema: ComposerSchema, state: ComposerState): JsonObject {
  const tag = uniqueEndpointTag(state, "endpoint");
  return createTypedEndpoint(
    schema,
    schema.default_endpoint_type ?? "wireguard",
    {
      tag,
      name: tag,
      address: ["10.0.0.1/32"],
      private_key: "",
      peers: [],
    },
  );
}

function newHttpClient(state: ComposerState): JsonObject {
  return {
    tag: uniqueHttpClientTag(state, "http"),
    version: 2,
  };
}

function newCertificateProvider(
  schema: ComposerSchema,
  state: ComposerState,
): JsonObject {
  const tag = uniqueCertificateProviderTag(state, "certificate-provider");
  return createTypedCertificateProvider(
    schema,
    schema.default_certificate_provider_type ?? "acme",
    {
      tag,
      domain: ["example.com"],
      endpoint: firstEndpointTag(state),
    },
  );
}

function newService(schema: ComposerSchema, state: ComposerState): JsonObject {
  const tag = uniqueServiceTag(state, "service");
  return createTypedService(schema, schema.default_service_type || "resolved", {
    tag,
    listen: "127.0.0.1",
    listen_port: 8080,
    servers: { "/": "" },
    users: [],
    config_path: "",
  });
}

function newDnsServer(schema: ComposerSchema, dns: DnsConfig): JsonObject {
  const tag = uniqueDnsTag(dns, "dns");
  return createDnsServer(schema, schema.dns?.default_server_type ?? "udp", {
    tag,
    server: "1.1.1.1",
    server_port: 53,
  });
}

function newDnsRule(schema: ComposerSchema, dns: DnsConfig): JsonObject {
  const server = dns.servers.find((item) => typeof item.tag === "string")?.tag;
  return createDnsRule(schema, schema.dns?.default_rule_type ?? "default", {
    action: "route",
    server,
  });
}

function newRouteRule(schema: ComposerSchema, state: ComposerState): JsonObject {
  return createRouteRule(schema, schema.route?.default_rule_type ?? "default", {
    action: "route",
    outbound: defaultRouteOutbound(state),
    domain_suffix: ["example.com"],
  });
}

function newRouteRuleSet(schema: ComposerSchema, route: RouteConfig): JsonObject {
  return createRouteRuleSet(
    schema,
    schema.route?.default_rule_set_type ?? "inline",
    {
      tag: uniqueRouteRuleSetTag(route, "rule-set"),
      rules: [],
    },
  );
}

function defaultRouteOutbound(state: ComposerState): string {
  return (
    state.proxy_groups.find((group) => group.enabled && group.tag.trim() !== "")
      ?.tag ?? "DIRECT"
  );
}

function uniqueInboundTag(state: ComposerState, base: string): string {
  const tags = new Set(
    state.inbounds
      .map((inbound) => inbound.tag)
      .filter((tag): tag is string => typeof tag === "string"),
  );
  let index = state.inbounds.length + 1;
  let tag = `${base}-${index}`;
  while (tags.has(tag)) {
    index += 1;
    tag = `${base}-${index}`;
  }
  return tag;
}

function uniqueEndpointTag(state: ComposerState, base: string): string {
  const tags = new Set(
    state.endpoints
      .map((endpoint) => endpoint.tag)
      .filter((tag): tag is string => typeof tag === "string"),
  );
  let index = state.endpoints.length + 1;
  let tag = `${base}-${index}`;
  while (tags.has(tag)) {
    index += 1;
    tag = `${base}-${index}`;
  }
  return tag;
}

function uniqueHttpClientTag(state: ComposerState, base: string): string {
  const tags = new Set(
    state.http_clients
      .map((client) => client.tag)
      .filter((tag): tag is string => typeof tag === "string"),
  );
  let index = state.http_clients.length + 1;
  let tag = `${base}-${index}`;
  while (tags.has(tag)) {
    index += 1;
    tag = `${base}-${index}`;
  }
  return tag;
}

function uniqueCertificateProviderTag(
  state: ComposerState,
  base: string,
): string {
  const tags = new Set(
    state.certificate_providers
      .map((provider) => provider.tag)
      .filter((tag): tag is string => typeof tag === "string"),
  );
  let index = state.certificate_providers.length + 1;
  let tag = `${base}-${index}`;
  while (tags.has(tag)) {
    index += 1;
    tag = `${base}-${index}`;
  }
  return tag;
}

function uniqueServiceTag(state: ComposerState, base: string): string {
  const tags = new Set(
    state.services
      .map((service) => service.tag)
      .filter((tag): tag is string => typeof tag === "string"),
  );
  let index = state.services.length + 1;
  let tag = `${base}-${index}`;
  while (tags.has(tag)) {
    index += 1;
    tag = `${base}-${index}`;
  }
  return tag;
}

function uniqueDnsTag(dns: DnsConfig, base: string): string {
  const tags = new Set(
    dns.servers
      .map((server) => server.tag)
      .filter((tag): tag is string => typeof tag === "string"),
  );
  let index = dns.servers.length + 1;
  let tag = `${base}-${index}`;
  while (tags.has(tag)) {
    index += 1;
    tag = `${base}-${index}`;
  }
  return tag;
}

function uniqueRouteRuleSetTag(route: RouteConfig, base: string): string {
  const tags = new Set(
    route.rule_sets
      .map((ruleSet) => ruleSet.tag)
      .filter((tag): tag is string => typeof tag === "string"),
  );
  let index = route.rule_sets.length + 1;
  let tag = `${base}-${index}`;
  while (tags.has(tag)) {
    index += 1;
    tag = `${base}-${index}`;
  }
  return tag;
}

function firstEndpointTag(state: ComposerState): string | undefined {
  return state.endpoints.find((endpoint) => typeof endpoint.tag === "string")
    ?.tag as string | undefined;
}

function summarizeDnsRule(rule: JsonObject, index: number): string {
  if (rule.type === "logical") {
    return `logical ${String(rule.mode ?? "and")}`;
  }
  for (const key of ["domain", "domain_suffix", "domain_keyword", "rule_set"]) {
    const value = rule[key];
    if (Array.isArray(value) && value.length > 0) {
      return `${key}: ${value.slice(0, 2).join(", ")}`;
    }
    if (typeof value === "string" && value.trim() !== "") {
      return `${key}: ${value}`;
    }
  }
  const server = typeof rule.server === "string" ? rule.server : "";
  const action = typeof rule.action === "string" ? rule.action : "route";
  return server ? `${action} -> ${server}` : `DNS rule ${index + 1}`;
}

function summarizeCertificateProvider(provider: JsonObject, index: number): string {
  const tag = typeof provider.tag === "string" ? provider.tag.trim() : "";
  if (tag) {
    return tag;
  }
  const domain = provider.domain;
  if (Array.isArray(domain) && domain.length > 0) {
    return domain.slice(0, 2).join(", ");
  }
  if (typeof provider.endpoint === "string" && provider.endpoint.trim() !== "") {
    return provider.endpoint;
  }
  return `Certificate provider ${index + 1}`;
}

function summarizeService(service: JsonObject, index: number): string {
  const tag = typeof service.tag === "string" ? service.tag.trim() : "";
  if (tag) {
    return tag;
  }
  if (typeof service.listen === "string" && service.listen.trim() !== "") {
    return `${service.listen}:${String(service.listen_port ?? "")}`;
  }
  return `Service ${index + 1}`;
}

function summarizeRouteRule(rule: JsonObject, index: number): string {
  if (rule.type === "logical") {
    return `logical ${String(rule.mode ?? "and")}`;
  }
  for (const key of [
    "domain",
    "domain_suffix",
    "domain_keyword",
    "domain_regex",
    "ip_cidr",
    "geoip",
    "rule_set",
  ]) {
    const value = rule[key];
    if (Array.isArray(value) && value.length > 0) {
      return `${key}: ${value.slice(0, 2).join(", ")}`;
    }
    if (typeof value === "string" && value.trim() !== "") {
      return `${key}: ${value}`;
    }
  }
  const action = typeof rule.action === "string" ? rule.action : "route";
  const outbound = typeof rule.outbound === "string" ? rule.outbound : "";
  return outbound ? `${action} -> ${outbound}` : `Route rule ${index + 1}`;
}

function summarizeRouteRuleSet(ruleSet: JsonObject, index: number): string {
  const tag = typeof ruleSet.tag === "string" ? ruleSet.tag.trim() : "";
  if (tag) {
    return tag;
  }
  if (typeof ruleSet.url === "string" && ruleSet.url.trim() !== "") {
    return ruleSet.url;
  }
  if (typeof ruleSet.path === "string" && ruleSet.path.trim() !== "") {
    return ruleSet.path;
  }
  return `Route rule set ${index + 1}`;
}

function summarizeTypedListItem(
  field: SchemaField,
  item: JsonObject,
  index: number,
): string {
  return field.schemaNamespace?.startsWith("route.")
    ? summarizeRouteRule(item, index)
    : summarizeDnsRule(item, index);
}

function toggleSpecial(
  group: ProxyGroup,
  value: "DIRECT" | "REJECT",
  enabled: boolean,
) {
  if (enabled && !group.include_special.includes(value)) {
    group.include_special.push(value);
  }
  if (!enabled) {
    group.include_special = group.include_special.filter(
      (item) => item !== value,
    );
  }
}

function validateTargetEntry(entry: TargetEntry): string[] {
  const spec = targetKindSpecs[entry.kind];
  if (spec.valueKind === "raw") {
    return entry.raw &&
      typeof entry.raw === "object" &&
      !Array.isArray(entry.raw)
      ? []
      : ["原始规则必须是 JSON object"];
  }
  if (spec.valueKind === "boolean") {
    return [];
  }
  if (entry.values.length === 0) {
    return [`${spec.label} 至少需要一个值`];
  }
  if (spec.valueKind === "number-list") {
    return entry.values
      .filter((value) => {
        const number = Number(value);
        return !Number.isInteger(number) || number < 0 || number > 65535;
      })
      .map((value) => `端口必须是 0-65535 的整数: ${value}`);
  }
  if (
    entry.kind === "domain_regex" ||
    entry.kind === "process_path_regex" ||
    entry.kind === "package_name_regex"
  ) {
    return entry.values.flatMap((value) => {
      try {
        new RegExp(value);
        return [];
      } catch {
        return [`正则表达式无效: ${value}`];
      }
    });
  }
  return [];
}

function parseLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function serializeObject(value: JsonObject, language: "json" | "yaml"): string {
  return language === "json"
    ? JSON.stringify(value, null, 2)
    : YAML.stringify(value);
}

function formatLocalFieldValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return YAML.stringify(value).trim();
}

function parseLocalFieldValue(previous: unknown, raw: string): unknown {
  if (previous === null) {
    return raw === "" ? null : raw;
  }
  if (typeof previous === "number") {
    const number = Number(raw);
    return Number.isFinite(number) ? number : raw;
  }
  if (typeof previous === "boolean") {
    if (raw.toLowerCase() === "true") {
      return true;
    }
    if (raw.toLowerCase() === "false") {
      return false;
    }
    return raw;
  }
  if (typeof previous === "object" && previous !== null) {
    try {
      return YAML.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 14)}`;
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
