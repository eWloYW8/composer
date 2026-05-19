import {
  Bot,
  ChevronDown,
  ChevronUp,
  Copy,
  Database,
  Plug,
  RefreshCw,
  Send,
  Square,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "./components/ui/Badge";
import { Button } from "./components/ui/Button";
import { Field } from "./components/ui/Field";
import { Input, Select, Textarea } from "./components/ui/Input";
import { fetchJson } from "./lib/api";
import type { ComposerSchema, JsonObject } from "./singboxSchema";
import type {
  ComposerState,
  RefreshResponse,
  ResolvedState,
} from "./types";

type AgentSelection = Record<string, unknown>;

type AgentProtocol =
  | "responses_text_tools"
  | "responses"
  | "chat_completions";

type AgentConfig = {
  apiUrl: string;
  apiKey: string;
  model: string;
  protocol: AgentProtocol;
  protocolModeVersion: 2;
};

type AgentMessage =
  | {
      id: string;
      role: "user" | "assistant";
      content: string;
      toolCalls?: AgentToolCall[];
    }
  | {
      id: string;
      role: "tool";
      toolCallId: string;
      name: string;
      args: string;
      result: string;
      ok: boolean;
    };

type AgentToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

type OpenAiMessage =
  | {
      role: "system" | "user" | "assistant";
      content: string | null;
      tool_calls?: AgentToolCall[];
    }
  | {
      role: "tool";
      tool_call_id: string;
      content: string;
    };

type OpenAiTool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: JsonObject;
  };
};

type ResponsesTool = {
  type: "function";
  name: string;
  description: string;
  parameters: JsonObject;
};

type StreamResult = {
  content: string;
  toolCalls: AgentToolCall[];
};

type ToolExecution = {
  ok: boolean;
  value: unknown;
};

type DocsCacheStatus = {
  repo: string;
  branch: string;
  ttl_days: number;
  cache_path: string;
  index_fetched_at?: string | null;
  index_expires_at?: string | null;
  index_stale: boolean;
  known_paths: number;
  cached_documents: number;
  stale_documents: number;
};

type DocsRefreshResponse = {
  refreshed_documents: number;
  status: DocsCacheStatus;
};

type DocsIndexResponse = {
  paths: string[];
  status: DocsCacheStatus;
};

type PanelName =
  | "current"
  | "all"
  | "sources"
  | "groups"
  | "targets"
  | "extra_routes"
  | "dns"
  | "inbounds"
  | "endpoints"
  | "http_clients"
  | "certificates"
  | "services"
  | "global"
  | "base"
  | "output";

const CONFIG_STORAGE_KEY = "composer.agent.config";
const HISTORY_STORAGE_KEY = "composer.agent.history";
const REQUEST_HISTORY_LIMIT = 24;
const REQUEST_MESSAGE_CHAR_LIMIT = 12000;
const REQUEST_TOOL_RESULT_CHAR_LIMIT = 20000;
const STORED_HISTORY_LIMIT = 160;
const STORED_MESSAGE_CHAR_LIMIT = 50000;
const STORED_TOOL_RESULT_CHAR_LIMIT = 12000;
const STORED_TOOL_ARGUMENT_CHAR_LIMIT = 12000;

const defaultAgentConfig: AgentConfig = {
  apiUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "",
  protocol: "responses_text_tools",
  protocolModeVersion: 2,
};

const panelNames: PanelName[] = [
  "current",
  "all",
  "sources",
  "groups",
  "targets",
  "extra_routes",
  "dns",
  "inbounds",
  "endpoints",
  "http_clients",
  "certificates",
  "services",
  "global",
  "base",
  "output",
];

const composerStateSchema: JsonObject = {
  proxy_sources: {
    path: "/proxy_sources",
    kind: "array",
    item: {
      id: "string",
      name: "string",
      enabled: "boolean",
      kind: '"manual" | "subscription"',
      prefix: "string",
      name_rewrites: [{ pattern: "regex string", replacement: "string" }],
      subscription: {
        url: "string",
        user_agent: "string",
        skip_tls_verify: "boolean",
        last_fetch_at: "string | null",
      },
      nodes: "array of sing-box outbound objects; editable for manual sources, read-only for subscription sources",
    },
  },
  proxy_groups: {
    path: "/proxy_groups",
    kind: "array",
    item: {
      id: "string",
      tag: "string; generated sing-box outbound tag and UI title",
      enabled: "boolean",
      group_type: '"selector" | "url_test"',
      source_ids: "string[]; empty means all proxy sources",
      match_regexes: "string[]; empty means all node names; a node matches if any regex matches its generated tag",
      include_groups: "string[]; proxy group tags to include as child outbounds",
      include_special: 'Array<"DIRECT" | "REJECT">',
      default: "string; selector default outbound tag",
      url: "string; url_test test URL",
      interval: "string; url_test interval such as 3m",
      tolerance: "number; url_test tolerance",
      idle_timeout: "string; selector/url_test idle timeout",
      interrupt_exist_connections: "boolean",
    },
  },
  target_groups: {
    path: "/target_groups",
    kind: "array",
    item: {
      id: "string",
      name: "string",
      enabled: "boolean",
      outbound: "string; proxy group tag or special outbound",
      entries:
        "array of target entries; kind controls whether values/raw/invert are used",
    },
  },
  extra_route_rules: {
    path: "/extra_route_rules",
    kind: "array",
    item: "sing-box route rule object constrained by /route/rules/* schema",
  },
};

const agentSystemPrompt = `你是 Composer 项目的内置配置助手。

Composer 是 sing-box 配置生成器。Composer 后端持久化用户配置状态、版本、网络设置、订阅刷新结果和 sing-box 文档缓存；前端 WebUI 维护当前草稿，用户保存前的修改只存在于草稿。Agent 必须通过工具读取和修改当前 WebUI 草稿或后端数据，不要声称已经读取、修改、保存、刷新或生成但没有调用对应工具。

Composer 运行模式：
- 代理源 sources：定义出站节点来源。manual 源的 nodes 由 Composer 管理；subscription 源的 url/user_agent/skip_tls_verify 可编辑，nodes 由 refresh_source 从订阅刷新生成，默认只读。
- 代理组 groups：根据代理源、名称正则、包含其他组、DIRECT/REJECT 等特殊出站生成 selector/urltest 等出站组。
- 出站目标 targets：用户维护目标条目，Composer 自动生成 route.rules，将目标匹配到指定代理组。
- 额外路由 extra_routes：维护 route.options、rule_sets 和自动规则之外的额外 route rules。
- DNS：维护 dns.enabled、dns.options、dns.servers、dns.rules 和嵌套 DNS 规则。
- 入站 inbounds：维护 sing-box inbound 列表。
- 端点 endpoints：维护 sing-box endpoint 列表。
- HTTP 客户端 http_clients：维护 shared HTTP client 配置。
- 证书 certificates：维护 certificate 基础配置和 certificate providers。
- 服务 services：维护 sing-box service 列表。
- 全局 global：维护 log、ntp、experimental 等全局配置。
- 基础 base：维护会并入最终 sing-box 配置的 base_config。
- 输出 output：展示 generator 生成的 resolved 状态和最终 sing-box config。

数据规则：
1. 每次请求包含 ComposerContext，其中有当前页面、选择状态、面板摘要、composer_state_schema、sing-box schema_index、sing_box_docs_index、resolved/output 摘要和压缩后的对话历史。
2. composer_state_schema 描述 Composer 自己的抽象层 state 结构，例如 proxy_sources/proxy_groups/target_groups；修改这些抽象层时必须按它的字段名写入。
3. schema_index 覆盖 Composer 当前已加载的 sing-box schema 顶层/类型节点和字段键；它只是索引，不是可直接凭空填写的完整依据。
4. sing_box_docs_index 覆盖后端已获取的 sing-box docs 路径；它只是索引，不是文档正文。
5. 做任何修改前必须先读取将要修改的当前状态，并读取对应 schema 原文。使用 read_panel/read_state_path 获取状态；修改 Composer 抽象层时按 composer_state_schema 操作；修改 sing-box 局部对象时使用 read_schema_path 获取 schema。不得凭记忆猜字段名、结构、类型或必填项。
6. 涉及 sing-box 行为、字段语义、路由/DNS/入站/出站协议细节、废弃项、迁移或示例时，必须先使用 search_sing_box_docs 和 read_sing_box_doc 获取相关文档原文，并按文档操作。
7. 修改已有配置使用 replace_state_path 或 replace_panel；新增数组条目使用 add_state_array_item；删除条目使用 delete_state_path。
8. 除非用户明确要求保存，否则修改只进入当前 WebUI 草稿；需要持久化时调用 save_state。
9. refresh_source 会先保存当前状态再刷新订阅，因为后端刷新基于已保存状态。
10. generate_config 默认读取后端已保存状态；如果用户要生成当前草稿，把 save_current_state 设为 true。
11. subscription 代理源的 nodes 由刷新结果管理；除非用户明确要求，不要直接修改 subscription 源的 nodes。
12. 输出必须简洁说明实际调用工具完成了什么，并指出是否还需要用户保存或刷新。`;

function textToolProtocolPrompt(): string {
  return `当前 API 后端不使用原生 tool calling。需要调用工具时，你必须只输出一个 JSON 对象，不要输出额外文字：
{"tool_calls":[{"name":"read_panel","arguments":{"panel":"current"}}]}

可以一次请求多个工具：
{"tool_calls":[{"name":"read_panel","arguments":{"panel":"sources"}},{"name":"read_state_path","arguments":{"path":"/dns"}}]}

收到工具结果后再继续分析或继续请求工具。如果不需要工具，直接正常回答。可用工具 JSON Schema：
${JSON.stringify(agentTools.map((tool) => tool.function), null, 2)}`;
}

function agentPromptWithContext(context: JsonObject): string {
  return `${agentSystemPrompt}

ComposerContext JSON:
${JSON.stringify(context, null, 2)}`;
}

const agentTools: OpenAiTool[] = [
  {
    type: "function",
    function: {
      name: "read_panel",
      description:
        "读取某个 Composer 面板的数据。panel=current 时读取当前打开页面；panel=all 时读取轻量上下文摘要。读取精确 state/schema 请使用路径工具。",
      parameters: {
        type: "object",
        properties: {
          panel: {
            type: "string",
            enum: panelNames,
            description: "要读取的面板名称。",
          },
        },
        required: ["panel"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_state_path",
      description:
        "使用 JSON Pointer 路径读取 Composer state 中的任意局部值，例如 /proxy_sources/0/nodes/0。",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "JSON Pointer 路径。根路径可用 /。",
          },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_schema_path",
      description:
        "向 Composer 后端请求并读取 sing-box schema 中的任意局部值，例如 /outbounds/vless 或 /dns/rules/default。不要用它读取 Composer 抽象层 proxy_groups/target_groups；这些结构在 ComposerContext.composer_state_schema 中。",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "JSON Pointer 路径。根路径可用 /。",
          },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_sing_box_docs",
      description:
        "向 Composer 后端请求搜索 sing-box GitHub 文档。后端会维护默认 7 天缓存，结果包含文档路径、标题、片段和缓存状态。",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "搜索关键词，例如 fakeip、route rule、domain_resolver。",
          },
          limit: {
            type: "number",
            description: "返回数量，默认 8，最大 30。",
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_sing_box_doc",
      description:
        "向 Composer 后端请求读取指定 sing-box GitHub 文档。path 来自 search_sing_box_docs 结果，例如 configuration/dns/index.md。",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "docs 目录下的文档路径，可省略开头的 docs/。",
          },
          force_refresh: {
            type: "boolean",
            description: "是否忽略缓存并强制从 GitHub 重新获取。",
          },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "replace_state_path",
      description:
        "使用 JSON Pointer 路径替换或设置 Composer state 中的值。用于修改已有字段或对象。",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "JSON Pointer 路径。根路径 / 表示替换整个 state。",
          },
          value: {
            description: "要写入的新值，可以是对象、数组、字符串、数字、布尔值或 null。",
          },
        },
        required: ["path", "value"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_state_array_item",
      description:
        "向 Composer state 中的数组路径新增一个条目，例如 /proxy_sources、/dns/servers、/target_groups/0/entries。",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "指向数组的 JSON Pointer 路径。",
          },
          item: {
            description: "要新增的数组条目。",
          },
          index: {
            type: "number",
            description: "可选插入位置。省略时追加到末尾。",
          },
        },
        required: ["path", "item"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_state_path",
      description:
        "删除 Composer state 中指定 JSON Pointer 路径的字段或数组条目。",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "要删除的 JSON Pointer 路径。",
          },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "replace_panel",
      description:
        "替换某个面板对应的完整数据。适合批量重写代理源、代理组、DNS、入站等面板。",
      parameters: {
        type: "object",
        properties: {
          panel: {
            type: "string",
            enum: panelNames.filter((panel) => panel !== "current"),
            description: "要替换的面板名称。",
          },
          value: {
            description: "面板的新完整值。",
          },
        },
        required: ["panel", "value"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_state",
      description: "保存当前 WebUI 草稿到 Composer 后端。",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "reload_state",
      description: "从 Composer 后端重新加载 state 和 schema，丢弃当前未保存草稿。",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "refresh_source",
      description:
        "刷新订阅代理源。source_id 为空且 all=true 时刷新所有订阅源。会先保存当前草稿。",
      parameters: {
        type: "object",
        properties: {
          source_id: {
            type: "string",
            description: "要刷新的代理源 ID。",
          },
          all: {
            type: "boolean",
            description: "是否刷新所有订阅代理源。",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_config",
      description:
        "生成 sing-box 配置和 resolved 结果。默认基于后端已保存状态；save_current_state=true 时先保存当前草稿。",
      parameters: {
        type: "object",
        properties: {
          save_current_state: {
            type: "boolean",
            description: "生成前是否保存当前 WebUI 草稿。",
          },
        },
        additionalProperties: false,
      },
    },
  },
];

export function AgentSidebar({
  open,
  state,
  schema,
  page,
  dirty,
  selection,
  output,
  resolved,
  onClose,
  onReplaceState,
  onAdoptSavedState,
  onSaveState,
  onReloadState,
  onGeneratedConfig,
  onStatus,
}: {
  open: boolean;
  state: ComposerState;
  schema: ComposerSchema;
  page: string;
  dirty: boolean;
  selection: AgentSelection;
  output: string;
  resolved: ResolvedState | null;
  onClose: () => void;
  onReplaceState: (state: ComposerState) => ComposerState;
  onAdoptSavedState: (state: ComposerState) => ComposerState;
  onSaveState: (state: ComposerState) => Promise<ComposerState | null>;
  onReloadState: () => Promise<ComposerState | null>;
  onGeneratedConfig: (config: JsonObject, resolved: ResolvedState) => void;
  onStatus: (status: { kind: "ok" | "error" | "info"; message: string }) => void;
}) {
  const [config, setConfig] = useState<AgentConfig>(() =>
    normalizeAgentConfig(readStorage(CONFIG_STORAGE_KEY, defaultAgentConfig)),
  );
  const [messages, setMessages] = useState<AgentMessage[]>(() =>
    normalizeAgentMessages(readStorage(HISTORY_STORAGE_KEY, [])),
  );
  const [input, setInput] = useState("");
  const [configOpen, setConfigOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [docsStatus, setDocsStatus] = useState<DocsCacheStatus | null>(null);
  const [docsIndex, setDocsIndex] = useState<string[]>([]);
  const [docsBusy, setDocsBusy] = useState(false);
  const [docsError, setDocsError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef(messages);
  const stateRef = useRef(state);
  const schemaRef = useRef(schema);
  const outputRef = useRef(output);
  const resolvedRef = useRef(resolved);
  const docsIndexRef = useRef(docsIndex);
  const pageRef = useRef(page);
  const selectionRef = useRef(selection);
  const dirtyRef = useRef(dirty);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    schemaRef.current = schema;
  }, [schema]);

  useEffect(() => {
    outputRef.current = output;
  }, [output]);

  useEffect(() => {
    resolvedRef.current = resolved;
  }, [resolved]);

  useEffect(() => {
    docsIndexRef.current = docsIndex;
  }, [docsIndex]);

  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  useEffect(() => {
    writeStorage(CONFIG_STORAGE_KEY, config);
  }, [config]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, busy, open]);

  const configured = config.apiUrl.trim() && config.apiKey && config.model.trim();

  const commitMessages = (next: AgentMessage[]) => {
    messagesRef.current = next;
    setMessages(next);
    writeStorage(HISTORY_STORAGE_KEY, messagesForStorage(next));
  };

  const appendMessages = (items: AgentMessage[]) => {
    commitMessages([...messagesRef.current, ...items]);
  };

  const updateMessage = (id: string, updater: (message: AgentMessage) => AgentMessage) => {
    commitMessages(
      messagesRef.current.map((message) =>
        message.id === id ? updater(message) : message,
      ),
    );
  };

  const updateConfig = (patch: Partial<AgentConfig>) => {
    setConfig((current) => ({ ...current, ...patch }));
  };

  const loadDocsStatus = async () => {
    try {
      setDocsError("");
      const [status, index] = await Promise.all([
        fetchJson<DocsCacheStatus>("/api/sing-box-docs/status"),
        fetchJson<DocsIndexResponse>("/api/sing-box-docs/index"),
      ]);
      setDocsStatus(index.status ?? status);
      setDocsIndex(index.paths);
    } catch (statusError) {
      setDocsError(errorMessage(statusError));
    }
  };

  const refreshDocsCache = async (clear: boolean) => {
    if (docsBusy) {
      return;
    }
    setDocsBusy(true);
    setDocsError("");
    try {
      const response = await fetchJson<DocsRefreshResponse>(
        "/api/sing-box-docs/cache/refresh",
        {
          method: "POST",
          body: JSON.stringify({
            clear,
            fetch_all: !clear,
          }),
        },
      );
      setDocsStatus(response.status);
      if (response.status.known_paths === 0) {
        setDocsIndex([]);
      } else {
        void loadDocsStatus();
      }
      onStatus({
        kind: "ok",
        message: clear
          ? "sing-box 文档缓存已清空并刷新索引"
          : `sing-box 文档缓存已刷新 ${response.refreshed_documents} 个文档`,
      });
    } catch (refreshError) {
      const message = errorMessage(refreshError);
      setDocsError(message);
      onStatus({ kind: "error", message });
    } finally {
      setDocsBusy(false);
    }
  };

  useEffect(() => {
    if (open) {
      void loadDocsStatus();
    }
  }, [open]);

  const clearHistory = () => {
    if (!window.confirm("清空 Agent 对话历史？")) {
      return;
    }
    commitMessages([]);
  };

  const copyHistory = async () => {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(historyForClipboard(messagesRef.current), null, 2),
      );
      onStatus({ kind: "ok", message: "Agent 历史已复制" });
    } catch (copyError) {
      onStatus({ kind: "error", message: errorMessage(copyError) });
    }
  };

  const stop = () => {
    abortRef.current?.abort();
  };

  const send = async () => {
    const content = input.trim();
    if (!content || busy || !configured) {
      return;
    }
    setInput("");
    setError("");
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;

    const userMessage: AgentMessage = {
      id: makeAgentId("msg"),
      role: "user",
      content,
    };
    commitMessages([...messagesRef.current, userMessage]);

    try {
      let workingMessages = messagesRef.current;
      for (let round = 0; round < 8; round += 1) {
        const assistantId = makeAgentId("assistant");
        const requestContext = buildComposerContext({
            state: stateRef.current,
            schema: schemaRef.current,
            page: pageRef.current,
            dirty: dirtyRef.current,
            selection: selectionRef.current,
            output: outputRef.current,
            resolved: resolvedRef.current,
            docsIndex: docsIndexRef.current,
        });
        appendMessages([
          {
            id: assistantId,
            role: "assistant",
            content: "",
          },
        ]);

        const result = await streamAgentChat({
          config,
          history: workingMessages,
          context: requestContext,
          signal: controller.signal,
          onDelta: (delta) => {
            updateMessage(assistantId, (message) =>
              message.role === "assistant"
                ? { ...message, content: message.content + delta }
                : message,
            );
          },
        });

        updateMessage(assistantId, (message) =>
          message.role === "assistant"
            ? {
                ...message,
                content: result.content,
                toolCalls: result.toolCalls,
              }
            : message,
        );
        workingMessages = messagesRef.current;

        if (result.toolCalls.length === 0) {
          break;
        }

        for (const toolCall of result.toolCalls) {
          const execution = await executeTool(toolCall);
          appendMessages([
            {
              id: makeAgentId("tool"),
              role: "tool",
              toolCallId: toolCall.id,
              name: toolCall.function.name,
              args: toolCall.function.arguments,
              result: stringifyForDisplay(execution.value),
              ok: execution.ok,
            },
          ]);
        }
        workingMessages = messagesRef.current;
      }
    } catch (sendError) {
      if ((sendError as Error).name === "AbortError") {
        onStatus({ kind: "info", message: "Agent 请求已停止" });
      } else {
        const message = errorMessage(sendError);
        setError(message);
        onStatus({ kind: "error", message });
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const executeTool = async (toolCall: AgentToolCall): Promise<ToolExecution> => {
    let args: JsonObject;
    try {
      args = toolCall.function.arguments.trim()
        ? (JSON.parse(toolCall.function.arguments) as JsonObject)
        : {};
    } catch (parseError) {
      return {
        ok: false,
        value: {
          error: `invalid tool arguments: ${errorMessage(parseError)}`,
          raw: toolCall.function.arguments,
        },
      };
    }

    try {
      const result = await runTool(toolCall.function.name, args);
      return { ok: true, value: result };
    } catch (toolError) {
      return {
        ok: false,
        value: {
          error: errorMessage(toolError),
        },
      };
    }
  };

  const applyState = (next: ComposerState): ComposerState => {
    const fixed = onReplaceState(next);
    stateRef.current = fixed;
    dirtyRef.current = true;
    return fixed;
  };

  const adoptSavedState = (next: ComposerState): ComposerState => {
    const fixed = onAdoptSavedState(next);
    stateRef.current = fixed;
    dirtyRef.current = false;
    return fixed;
  };

  const runTool = async (name: string, args: JsonObject): Promise<unknown> => {
    switch (name) {
      case "read_panel": {
        const panel = panelName(args.panel, pageRef.current);
        return {
          panel,
          value: readPanel(panel, {
            state: stateRef.current,
            schema: schemaRef.current,
            page: pageRef.current,
            dirty: dirtyRef.current,
            selection: selectionRef.current,
            output: outputRef.current,
            resolved: resolvedRef.current,
            docsIndex: docsIndexRef.current,
          }),
        };
      }
      case "read_state_path": {
        const path = stringArg(args.path, "path");
        return {
          path,
          value: getPathValue(stateRef.current, path),
        };
      }
      case "read_schema_path": {
        const path = stringArg(args.path, "path");
        return fetchJson<JsonObject>(
          `/api/schema/path?path=${encodeURIComponent(path)}`,
        );
      }
      case "search_sing_box_docs": {
        const query = stringArg(args.query, "query");
        const limit =
          typeof args.limit === "number" && Number.isFinite(args.limit)
            ? Math.max(1, Math.min(30, Math.trunc(args.limit)))
            : 8;
        return fetchJson<JsonObject>(
          `/api/sing-box-docs/search?q=${encodeURIComponent(query)}&limit=${limit}`,
        );
      }
      case "read_sing_box_doc": {
        const path = stringArg(args.path, "path");
        const forceRefresh = args.force_refresh === true;
        return fetchJson<JsonObject>(
          `/api/sing-box-docs/document?path=${encodeURIComponent(path)}&force_refresh=${forceRefresh}`,
        );
      }
      case "replace_state_path": {
        const path = stringArg(args.path, "path");
        const next = cloneJson(stateRef.current);
        const replaced = setPathValue(next, path, args.value);
        const fixed = applyState(replaced as ComposerState);
        return {
          path,
          value: getPathValue(fixed, path),
        };
      }
      case "add_state_array_item": {
        const path = stringArg(args.path, "path");
        const next = cloneJson(stateRef.current);
        const array = getPathValue(next, path);
        if (!Array.isArray(array)) {
          throw new Error(`${path} is not an array`);
        }
        const index =
          typeof args.index === "number" && Number.isFinite(args.index)
            ? Math.max(0, Math.min(array.length, Math.trunc(args.index)))
            : array.length;
        array.splice(index, 0, cloneJson(args.item));
        const fixed = applyState(next as ComposerState);
        const updatedArray = getPathValue(fixed, path);
        return {
          path,
          index,
          length: Array.isArray(updatedArray) ? updatedArray.length : null,
          item: Array.isArray(updatedArray) ? updatedArray[index] : null,
        };
      }
      case "delete_state_path": {
        const path = stringArg(args.path, "path");
        const next = cloneJson(stateRef.current);
        const removed = deletePathValue(next, path);
        applyState(next as ComposerState);
        return {
          path,
          removed,
        };
      }
      case "replace_panel": {
        const panel = panelName(args.panel, pageRef.current);
        if (panel === "current") {
          throw new Error("replace_panel does not accept panel=current");
        }
        const next = replacePanel(stateRef.current, panel, args.value);
        const fixed = applyState(next);
        return {
          panel,
          value: readPanel(panel, {
            state: fixed,
            schema: schemaRef.current,
            page: pageRef.current,
            dirty: true,
            selection: selectionRef.current,
            output: outputRef.current,
            resolved: resolvedRef.current,
            docsIndex: docsIndexRef.current,
          }),
        };
      }
      case "save_state": {
        const saved = await onSaveState(stateRef.current);
        if (saved) {
          adoptSavedState(saved);
        }
        return {
          saved: Boolean(saved),
          state: saved,
        };
      }
      case "reload_state": {
        const reloaded = await onReloadState();
        if (reloaded) {
          stateRef.current = reloaded;
          dirtyRef.current = false;
        }
        return {
          reloaded: Boolean(reloaded),
          state: reloaded,
        };
      }
      case "refresh_source": {
        const saved = await onSaveState(stateRef.current);
        if (saved) {
          adoptSavedState(saved);
        }
        const refreshAll = args.all === true;
        const sourceId =
          typeof args.source_id === "string" ? args.source_id.trim() : "";
        if (!refreshAll && !sourceId) {
          throw new Error("source_id is required unless all=true");
        }
        const response = await fetchJson<RefreshResponse>(
          refreshAll
            ? "/api/sources/refresh"
            : `/api/sources/${encodeURIComponent(sourceId)}/refresh`,
          { method: "POST" },
        );
        adoptSavedState(response.state);
        return response;
      }
      case "generate_config": {
        if (args.save_current_state === true) {
          const saved = await onSaveState(stateRef.current);
          if (saved) {
            adoptSavedState(saved);
          }
        }
        const [config, nextResolved] = await Promise.all([
          fetchJson<JsonObject>("/api/config"),
          fetchJson<ResolvedState>("/api/resolved"),
        ]);
        outputRef.current = JSON.stringify(config, null, 2);
        resolvedRef.current = nextResolved;
        onGeneratedConfig(config, nextResolved);
        return {
          config,
          resolved: nextResolved,
        };
      }
      default:
        throw new Error(`unknown tool: ${name}`);
    }
  };

  const renderedMessages = useMemo(() => messages, [messages]);

  if (!open) {
    return null;
  }

  return (
    <aside className="fixed right-0 top-[var(--composer-sticky-top)] z-30 flex h-[calc(100vh-var(--composer-sticky-top))] w-[min(440px,100vw)] flex-col border-l border-border bg-white shadow-xl">
      <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Bot size={15} />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">Agent 助手</h2>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant={configOpen ? "secondary" : "ghost"}
            className="h-8 w-8 px-0"
            onClick={() => {
              setConfigOpen((current) => !current);
              setDocsOpen(false);
            }}
            title="连接配置"
          >
            <Plug size={15} />
          </Button>
          <Button
            variant={docsOpen ? "secondary" : "ghost"}
            className="h-8 w-8 px-0"
            onClick={() => {
              setDocsOpen((current) => !current);
              setConfigOpen(false);
            }}
            title="sing-box 文档缓存"
          >
            <Database size={15} />
          </Button>
          <Button variant="ghost" className="h-8 w-8 px-0" onClick={onClose}>
            <X size={16} />
          </Button>
        </div>
      </div>

      {configOpen ? (
        <div className="grid gap-3 border-b border-border p-3">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_170px]">
              <Field label="API 地址">
                <Input
                  value={config.apiUrl}
                  placeholder="https://api.openai.com/v1"
                  onChange={(event) =>
                    updateConfig({ apiUrl: event.target.value })
                  }
                />
              </Field>
              <Field label="协议">
                <Select
                  value={config.protocol}
                  onChange={(event) =>
                    updateConfig({
                      protocol: event.target.value as AgentProtocol,
                    })
                  }
                >
                  <option value="responses_text_tools">
                    Responses Text Tools
                  </option>
                  <option value="responses">Responses</option>
                  <option value="chat_completions">Chat Completions</option>
                </Select>
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px]">
              <Field label="API Key">
                <Input
                  type="password"
                  value={config.apiKey}
                  onChange={(event) =>
                    updateConfig({ apiKey: event.target.value })
                  }
                />
              </Field>
              <Field label="模型名">
                <Input
                  value={config.model}
                  placeholder="gpt-4.1-mini"
                  onChange={(event) =>
                    updateConfig({ model: event.target.value })
                  }
                />
              </Field>
            </div>
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <Badge className={configured ? undefined : "bg-muted text-muted-foreground"}>
                {configured ? "已配置" : "需要配置"}
              </Badge>
            </div>
        </div>
      ) : null}

      {docsOpen ? (
        <div className="grid gap-3 border-b border-border p-3">
            {docsStatus ? (
              <div className="grid gap-1 rounded-md border border-border bg-muted/20 p-2 text-xs">
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className="text-muted-foreground">来源</span>
                  <span className="truncate font-medium">
                    {docsStatus.repo}@{docsStatus.branch}
                  </span>
                </div>
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className="text-muted-foreground">索引</span>
                  <span className="truncate">
                    {docsStatus.known_paths} 个路径
                    {docsStatus.index_stale ? "，已过期" : ""}
                  </span>
                </div>
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className="text-muted-foreground">文档</span>
                  <span className="truncate">
                    {docsStatus.cached_documents} 已缓存
                    {docsStatus.stale_documents > 0
                      ? `，${docsStatus.stale_documents} 过期`
                      : ""}
                  </span>
                </div>
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className="text-muted-foreground">TTL</span>
                  <span>{docsStatus.ttl_days} 天</span>
                </div>
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className="text-muted-foreground">过期时间</span>
                  <span className="truncate">
                    {formatAgentDate(docsStatus.index_expires_at)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="min-h-9 rounded-md border border-dashed border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                尚未读取缓存状态
              </div>
            )}
            {docsError ? (
              <div className="min-w-0 whitespace-pre-wrap break-words rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {docsError}
              </div>
            ) : null}
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <Button
                variant="ghost"
                className="h-8"
                disabled={docsBusy}
                onClick={() => void loadDocsStatus()}
              >
                <RefreshCw size={15} />
                状态
              </Button>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  className="h-8"
                  disabled={docsBusy}
                  onClick={() => void refreshDocsCache(false)}
                >
                  <RefreshCw size={15} />
                  刷新全部
                </Button>
                <Button
                  variant="ghost"
                  className="h-8"
                  disabled={docsBusy}
                  onClick={() => void refreshDocsCache(true)}
                >
                  清空
                </Button>
              </div>
            </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="grid content-start gap-3">
          {renderedMessages.map((message) =>
            message.role === "tool" ? (
              <ToolCallView key={message.id} message={message} />
            ) : (
              <ChatMessageView key={message.id} message={message} />
            ),
          )}
          {renderedMessages.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              尚无对话
            </div>
          ) : null}
          <div ref={endRef} />
        </div>
      </div>

      <div className="grid gap-2 border-t border-border p-3">
        {error ? (
          <div className="min-w-0 whitespace-pre-wrap break-words rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        <Textarea
          expandable={false}
          textareaClassName="min-h-20 resize-none"
          value={input}
          placeholder={
            configured
              ? "输入请求，Agent 会带上下文摘要并可调用工具..."
              : "先配置 API 地址、Key 和模型名"
          }
          disabled={busy}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0" />
          {busy ? (
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
              <Button
                variant="ghost"
                className="h-8 px-2"
                onClick={() => void copyHistory()}
                disabled={messages.length === 0}
                title="复制历史记录"
              >
                <Copy size={15} />
              </Button>
              <Button
                variant="ghost"
                className="h-8 px-2"
                onClick={clearHistory}
                disabled={messages.length === 0}
                title="清空历史"
              >
                <Trash2 size={15} />
              </Button>
              <Button variant="secondary" className="h-8" onClick={stop}>
                <Square size={15} />
                Stop
              </Button>
            </div>
          ) : (
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
              <Button
                variant="ghost"
                className="h-8 px-2"
                onClick={() => void copyHistory()}
                disabled={messages.length === 0}
                title="复制历史记录"
              >
                <Copy size={15} />
              </Button>
              <Button
                variant="ghost"
                className="h-8 px-2"
                onClick={clearHistory}
                disabled={messages.length === 0}
                title="清空历史"
              >
                <Trash2 size={15} />
              </Button>
              <Button
                className="h-8"
                onClick={() => void send()}
                disabled={!input.trim() || !configured}
              >
                <Send size={15} />
                Send
              </Button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

function ChatMessageView({
  message,
}: {
  message: Extract<AgentMessage, { role: "user" | "assistant" }>;
}) {
  const isUser = message.role === "user";
  if (!message.content.trim()) {
    return null;
  }
  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          isUser
            ? "grid max-w-[88%] gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
            : "grid max-w-[92%] gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm"
        }
      >
        <MarkdownContent content={message.content} inverse={isUser} />
      </div>
    </div>
  );
}

function ToolCallView({
  message,
}: {
  message: Extract<AgentMessage, { role: "tool" }>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={
        open
          ? "rounded-md border border-border bg-muted/25 p-1.5 text-xs"
          : "text-[11px] leading-5 text-muted-foreground"
      }
    >
      <button
        type="button"
        className={
          open
            ? "flex min-h-7 w-full min-w-0 items-center justify-between gap-2 rounded-sm px-1 text-left hover:bg-muted"
            : "flex min-h-5 w-full min-w-0 items-center justify-between gap-2 rounded-sm px-1 text-left hover:bg-muted"
        }
        onClick={() => setOpen((current) => !current)}
      >
        <span className="flex min-w-0 items-center gap-1.5 font-medium">
          {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          <Wrench size={12} />
          <span className="truncate">{message.name}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="max-w-24 truncate text-muted-foreground">
            {toolResultSummary(message.result)}
          </span>
          <Badge
            className={
              (open ? "" : "h-5 px-1.5 text-[10px] ") +
              (message.ok
                ? "bg-secondary text-secondary-foreground"
                : "bg-destructive text-destructive-foreground")
            }
          >
            {message.ok ? "ok" : "error"}
          </Badge>
        </span>
      </button>
      {open ? (
        <div className="mt-1.5 grid gap-2">
          <div>
            <div className="mb-1 font-medium text-muted-foreground">参数</div>
            <pre className="max-h-40 overflow-auto rounded-sm bg-white p-2">
              {prettyJsonString(message.args)}
            </pre>
          </div>
          <div>
            <div className="mb-1 font-medium text-muted-foreground">结果</div>
            <pre className="max-h-56 overflow-auto rounded-sm bg-white p-2">
              {message.result}
            </pre>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function toolResultSummary(result: string): string {
  const trimmed = result.trim();
  if (!trimmed) {
    return "无结果";
  }
  try {
    const value = JSON.parse(trimmed) as unknown;
    if (isJsonObject(value)) {
      const error = value.error;
      if (typeof error === "string" && error) {
        return error;
      }
      return Object.keys(value).slice(0, 3).join(", ") || "object";
    }
    if (Array.isArray(value)) {
      return `${value.length} items`;
    }
  } catch {
    // Keep plain text fallback below.
  }
  return trimmed.length > 40 ? `${trimmed.slice(0, 40)}...` : trimmed;
}

function MarkdownContent({
  content,
  inverse = false,
}: {
  content: string;
  inverse?: boolean;
}) {
  return (
    <div className="grid min-w-0 gap-2 break-words leading-6">
      {parseMarkdownBlocks(content).map((block, index) => {
        if (block.kind === "code") {
          return (
            <pre
              key={index}
              className="max-w-full overflow-auto rounded-sm bg-black/80 p-2 text-xs text-white"
            >
              <code>{block.text}</code>
            </pre>
          );
        }
        if (block.kind === "heading") {
          const size =
            block.level === 1
              ? "text-base"
              : block.level === 2
                ? "text-sm"
                : "text-sm";
          return (
            <div key={index} className={`${size} font-semibold`}>
              <InlineMarkdown text={block.text} inverse={inverse} />
            </div>
          );
        }
        if (block.kind === "list") {
          return (
            <ul key={index} className="grid list-disc gap-1 pl-5">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>
                  <InlineMarkdown text={item} inverse={inverse} />
                </li>
              ))}
            </ul>
          );
        }
        if (block.kind === "ordered-list") {
          return (
            <ol key={index} className="grid list-decimal gap-1 pl-5">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>
                  <InlineMarkdown text={item} inverse={inverse} />
                </li>
              ))}
            </ol>
          );
        }
        return (
          <p key={index} className="whitespace-pre-wrap">
            <InlineMarkdown text={block.text} inverse={inverse} />
          </p>
        );
      })}
    </div>
  );
}

type MarkdownBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "heading"; level: number; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "ordered-list"; items: string[] }
  | { kind: "code"; text: string };

function parseMarkdownBlocks(content: string): MarkdownBlock[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  let unordered: string[] = [];
  let ordered: string[] = [];
  let inCode = false;
  let codeLines: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: "paragraph", text: paragraph.join("\n") });
      paragraph = [];
    }
  };
  const flushLists = () => {
    if (unordered.length > 0) {
      blocks.push({ kind: "list", items: unordered });
      unordered = [];
    }
    if (ordered.length > 0) {
      blocks.push({ kind: "ordered-list", items: ordered });
      ordered = [];
    }
  };
  const flushText = () => {
    flushParagraph();
    flushLists();
  };

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      if (inCode) {
        blocks.push({ kind: "code", text: codeLines.join("\n") });
        codeLines = [];
        inCode = false;
      } else {
        flushText();
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    if (line.trim() === "") {
      flushText();
      continue;
    }

    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      flushText();
      blocks.push({
        kind: "heading",
        level: heading[1].length,
        text: heading[2],
      });
      continue;
    }

    const unorderedItem = /^\s*[-*]\s+(.+)$/.exec(line);
    if (unorderedItem) {
      flushParagraph();
      ordered = ordered.length > 0 ? (flushLists(), []) : ordered;
      unordered.push(unorderedItem[1]);
      continue;
    }

    const orderedItem = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    if (orderedItem) {
      flushParagraph();
      unordered = unordered.length > 0 ? (flushLists(), []) : unordered;
      ordered.push(orderedItem[1]);
      continue;
    }

    flushLists();
    paragraph.push(line);
  }

  if (inCode) {
    blocks.push({ kind: "code", text: codeLines.join("\n") });
  }
  flushText();
  return blocks.length > 0 ? blocks : [{ kind: "paragraph", text: "" }];
}

function InlineMarkdown({
  text,
  inverse,
}: {
  text: string;
  inverse: boolean;
}) {
  const nodes = parseInlineMarkdown(text).map((part, index) => {
    if (part.kind === "code") {
      return (
        <code
          key={index}
          className={
            inverse
              ? "rounded-sm bg-white/20 px-1 py-0.5 font-mono text-[0.92em]"
              : "rounded-sm bg-muted px-1 py-0.5 font-mono text-[0.92em]"
          }
        >
          {part.text}
        </code>
      );
    }
    if (part.kind === "bold") {
      return <strong key={index}>{part.text}</strong>;
    }
    if (part.kind === "italic") {
      return <em key={index}>{part.text}</em>;
    }
    if (part.kind === "link") {
      return (
        <a
          key={index}
          className={inverse ? "underline" : "text-primary underline"}
          href={part.href}
          target="_blank"
          rel="noreferrer"
        >
          {part.text}
        </a>
      );
    }
    return <span key={index}>{part.text}</span>;
  });

  return <>{nodes}</>;
}

type InlinePart =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "italic"; text: string }
  | { kind: "link"; text: string; href: string };

function parseInlineMarkdown(text: string): InlinePart[] {
  const parts: InlinePart[] = [];
  const pattern =
    /(`([^`]+)`)|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(\[([^\]]+)\]\((https?:\/\/[^)\s]+)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ kind: "text", text: text.slice(lastIndex, match.index) });
    }
    if (match[2] !== undefined) {
      parts.push({ kind: "code", text: match[2] });
    } else if (match[4] !== undefined) {
      parts.push({ kind: "bold", text: match[4] });
    } else if (match[6] !== undefined) {
      parts.push({ kind: "italic", text: match[6] });
    } else if (match[8] !== undefined && match[9] !== undefined) {
      parts.push({ kind: "link", text: match[8], href: match[9] });
    }
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push({ kind: "text", text: text.slice(lastIndex) });
  }
  return parts.length > 0 ? parts : [{ kind: "text", text }];
}

async function streamAgentChat({
  config,
  history,
  context,
  signal,
  onDelta,
}: {
  config: AgentConfig;
  history: AgentMessage[];
  context: JsonObject;
  signal: AbortSignal;
  onDelta: (delta: string) => void;
}): Promise<StreamResult> {
  if (config.protocol === "chat_completions") {
    return streamChatCompletions({
      config,
      messages: toOpenAiMessages(history, context),
      signal,
      onDelta,
    });
  }
  if (config.protocol === "responses_text_tools") {
    return streamResponsesTextTools({
      config,
      history,
      context,
      signal,
      onDelta,
    });
  }
  return streamResponses({
    config,
    history,
    context,
    signal,
    onDelta,
  });
}

async function streamChatCompletions({
  config,
  messages,
  signal,
  onDelta,
}: {
  config: AgentConfig;
  messages: OpenAiMessage[];
  signal: AbortSignal;
  onDelta: (delta: string) => void;
}): Promise<StreamResult> {
  const response = await fetch(chatCompletionsUrl(config.apiUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      stream: true,
      messages,
      tools: agentTools,
      tool_choice: "auto",
    }),
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText);
  }
  if (!response.body) {
    throw new Error("stream response body is empty");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  const toolCalls = new Map<number, AgentToolCall>();

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      for (const line of part.split("\n")) {
        const clean = line.trim();
        if (!clean.startsWith("data:")) {
          continue;
        }
        const payload = clean.slice(5).trim();
        if (payload === "[DONE]") {
          return {
            content,
            toolCalls: Array.from(toolCalls.entries())
              .sort(([left], [right]) => left - right)
              .map(([, toolCall]) => toolCall),
          };
        }
        const chunk = JSON.parse(payload) as JsonObject;
        const choices = Array.isArray(chunk.choices) ? chunk.choices : [];
        for (const choice of choices) {
          if (!isJsonObject(choice)) {
            continue;
          }
          const delta = isJsonObject(choice.delta) ? choice.delta : {};
          if (typeof delta.content === "string") {
            content += delta.content;
            onDelta(delta.content);
          }
          const deltaToolCalls = Array.isArray(delta.tool_calls)
            ? delta.tool_calls
            : [];
          for (const rawToolCall of deltaToolCalls) {
            if (!isJsonObject(rawToolCall)) {
              continue;
            }
            const index =
              typeof rawToolCall.index === "number" ? rawToolCall.index : 0;
            const current =
              toolCalls.get(index) ??
              ({
                id:
                  typeof rawToolCall.id === "string"
                    ? rawToolCall.id
                    : makeAgentId("call"),
                type: "function",
                function: {
                  name: "",
                  arguments: "",
                },
              } satisfies AgentToolCall);
            if (typeof rawToolCall.id === "string") {
              current.id = rawToolCall.id;
            }
            const fn = isJsonObject(rawToolCall.function)
              ? rawToolCall.function
              : {};
            if (typeof fn.name === "string") {
              current.function.name += fn.name;
            }
            if (typeof fn.arguments === "string") {
              current.function.arguments += fn.arguments;
            }
            toolCalls.set(index, current);
          }
        }
      }
    }
  }

  return {
    content,
    toolCalls: Array.from(toolCalls.entries())
      .sort(([left], [right]) => left - right)
      .map(([, toolCall]) => toolCall),
  };
}

async function streamResponses({
  config,
  history,
  context,
  signal,
  onDelta,
}: {
  config: AgentConfig;
  history: AgentMessage[];
  context: JsonObject;
  signal: AbortSignal;
  onDelta: (delta: string) => void;
}): Promise<StreamResult> {
  const response = await fetch(responsesUrl(config.apiUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      stream: true,
      instructions: agentPromptWithContext(context),
      input: toResponsesInput(history, null),
      tools: responsesTools(),
      tool_choice: "auto",
    }),
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText);
  }
  if (!response.body) {
    throw new Error("stream response body is empty");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  const toolCalls = new Map<number | string, AgentToolCall>();

  const sortedToolCalls = () =>
    Array.from(toolCalls.entries())
      .sort(([left], [right]) => String(left).localeCompare(String(right)))
      .map(([, toolCall]) => toolCall)
      .filter((toolCall) => toolCall.function.name);

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      for (const line of part.split("\n")) {
        const clean = line.trim();
        if (!clean.startsWith("data:")) {
          continue;
        }
        const payload = clean.slice(5).trim();
        if (payload === "[DONE]") {
          return { content, toolCalls: sortedToolCalls() };
        }
        const event = JSON.parse(payload) as JsonObject;
        const eventType = typeof event.type === "string" ? event.type : "";

        if (
          eventType === "response.output_text.delta" &&
          typeof event.delta === "string"
        ) {
          content += event.delta;
          onDelta(event.delta);
          continue;
        }

        if (
          eventType === "response.function_call_arguments.delta" &&
          typeof event.delta === "string"
        ) {
          const key = responsesToolKey(event);
          const current =
            toolCalls.get(key) ??
            ({
              id: typeof event.call_id === "string" ? event.call_id : makeAgentId("call"),
              type: "function",
              function: { name: "", arguments: "" },
            } satisfies AgentToolCall);
          current.function.arguments += event.delta;
          toolCalls.set(key, current);
          continue;
        }

        if (eventType === "response.output_item.added") {
          const item = isJsonObject(event.item) ? event.item : {};
          if (item.type === "function_call") {
            const key = responsesToolKey(event, item);
            toolCalls.set(key, responsesToolCallFromItem(item, key));
          }
          continue;
        }

        if (eventType === "response.output_item.done") {
          const item = isJsonObject(event.item) ? event.item : {};
          if (item.type === "function_call") {
            const key = responsesToolKey(event, item);
            const current = toolCalls.get(key);
            const next = responsesToolCallFromItem(item, key);
            if (
              current?.function.arguments &&
              !next.function.arguments
            ) {
              next.function.arguments = current.function.arguments;
            }
            toolCalls.set(key, next);
          }
        }
      }
    }
  }

  return { content, toolCalls: sortedToolCalls() };
}

async function streamResponsesTextTools({
  config,
  history,
  context,
  signal,
  onDelta,
}: {
  config: AgentConfig;
  history: AgentMessage[];
  context: JsonObject;
  signal: AbortSignal;
  onDelta: (delta: string) => void;
}): Promise<StreamResult> {
  const response = await fetch(responsesUrl(config.apiUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      stream: true,
      instructions: `${agentPromptWithContext(context)}\n\n${textToolProtocolPrompt()}`,
      input: toResponsesTextInput(history, null),
    }),
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText);
  }
  if (!response.body) {
    throw new Error("stream response body is empty");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      for (const line of part.split("\n")) {
        const clean = line.trim();
        if (!clean.startsWith("data:")) {
          continue;
        }
        const payload = clean.slice(5).trim();
        if (payload === "[DONE]") {
          return parseTextToolResponse(content);
        }
        const event = JSON.parse(payload) as JsonObject;
        const eventType = typeof event.type === "string" ? event.type : "";
        if (
          eventType === "response.output_text.delta" &&
          typeof event.delta === "string"
        ) {
          content += event.delta;
          onDelta(event.delta);
        }
      }
    }
  }

  return parseTextToolResponse(content);
}

function toOpenAiMessages(
  history: AgentMessage[],
  context: JsonObject,
): OpenAiMessage[] {
  const messages: OpenAiMessage[] = [
    {
      role: "system",
      content: agentPromptWithContext(context),
    },
  ];

  for (const message of historyForRequest(history)) {
    if (message.role === "tool") {
      messages.push({
        role: "tool",
        tool_call_id: message.toolCallId,
        content: compactToolResult(message),
      });
    } else {
      messages.push({
        role: message.role,
        content: compactMessageContent(message.content) || null,
        ...(message.role === "assistant" && message.toolCalls?.length
          ? { tool_calls: compactToolCalls(message.toolCalls) }
          : {}),
      });
    }
  }

  return messages;
}

function toResponsesInput(
  history: AgentMessage[],
  context: JsonObject | null,
): unknown[] {
  const input: unknown[] = context
    ? [
        {
          role: "user",
          content: `ComposerContext JSON:\n${JSON.stringify(context, null, 2)}`,
        },
      ]
    : [];
  for (const message of historyForRequest(history)) {
    if (message.role === "tool") {
      input.push({
        type: "function_call_output",
        call_id: message.toolCallId,
        output: compactToolResult(message),
      });
      continue;
    }

    if (message.role === "assistant" && message.toolCalls?.length) {
      if (message.content.trim()) {
        input.push({
          role: "assistant",
          content: compactMessageContent(message.content),
        });
      }
      for (const toolCall of compactToolCalls(message.toolCalls)) {
        input.push({
          type: "function_call",
          call_id: toolCall.id,
          name: toolCall.function.name,
          arguments: toolCall.function.arguments || "{}",
        });
      }
      continue;
    }

    input.push({
      role: message.role,
      content: compactMessageContent(message.content),
    });
  }
  return input;
}

function toResponsesTextInput(
  history: AgentMessage[],
  context: JsonObject | null,
): unknown[] {
  const input: unknown[] = context
    ? [
        {
          role: "user",
          content: `ComposerContext JSON:\n${JSON.stringify(context, null, 2)}`,
        },
      ]
    : [];
  for (const message of historyForRequest(history)) {
    if (message.role === "tool") {
      input.push({
        role: "user",
        content: [
          `Tool result for ${message.name}`,
          `call_id: ${message.toolCallId}`,
          `ok: ${message.ok}`,
          `arguments: ${truncateText(message.args, REQUEST_MESSAGE_CHAR_LIMIT)}`,
          "result:",
          compactToolResult(message),
        ].join("\n"),
      });
      continue;
    }

    if (message.role === "assistant" && message.toolCalls?.length) {
      const toolPayload = {
        tool_calls: compactToolCalls(message.toolCalls).map((toolCall) => ({
          name: toolCall.function.name,
          arguments: parseToolArgumentsForHistory(
            toolCall.function.arguments,
          ),
        })),
      };
      input.push({
        role: "assistant",
        content:
          compactMessageContent(message.content).trim() ||
          JSON.stringify(toolPayload, null, 2),
      });
      continue;
    }

    input.push({
      role: message.role,
      content: compactMessageContent(message.content),
    });
  }
  return input;
}

function historyForRequest(history: AgentMessage[]): AgentMessage[] {
  return history.slice(-REQUEST_HISTORY_LIMIT);
}

function compactMessageContent(content: string): string {
  return truncateText(content, REQUEST_MESSAGE_CHAR_LIMIT);
}

function compactToolResult(
  message: Extract<AgentMessage, { role: "tool" }>,
): string {
  return truncateText(
    message.result,
    REQUEST_TOOL_RESULT_CHAR_LIMIT,
    `[tool result truncated: ${message.name}, original length ${message.result.length}]`,
  );
}

function compactToolCalls(toolCalls: AgentToolCall[]): AgentToolCall[] {
  return toolCalls.map((toolCall) => {
    const args = toolCall.function.arguments;
    return {
      ...toolCall,
      function: {
        ...toolCall.function,
        arguments:
          args.length <= REQUEST_MESSAGE_CHAR_LIMIT
            ? args
            : JSON.stringify({
                truncated: true,
                original_length: args.length,
              }),
      },
    };
  });
}

function parseTextToolResponse(content: string): StreamResult {
  const parsed = extractTextToolCalls(content);
  if (!parsed || parsed.toolCalls.length === 0) {
    return { content, toolCalls: [] };
  }
  return {
    content: parsed.content.trim(),
    toolCalls: parsed.toolCalls,
  };
}

function extractTextToolCalls(
  content: string,
): { content: string; toolCalls: AgentToolCall[] } | null {
  const trimmed = content.trim();
  const direct = normalizeTextToolCalls(parseJsonMaybe(trimmed));
  if (direct.length > 0) {
    return { content: "", toolCalls: direct };
  }

  const spans: Array<{ start: number; end: number }> = [];
  const toolCalls: AgentToolCall[] = [];
  const fencePattern = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  while ((match = fencePattern.exec(content)) !== null) {
    const calls = normalizeTextToolCalls(parseJsonMaybe(match[1].trim()));
    if (calls.length > 0) {
      spans.push({ start: match.index, end: match.index + match[0].length });
      toolCalls.push(...calls);
    }
  }

  for (const span of jsonObjectSpans(content)) {
    if (spans.some((known) => rangesOverlap(span, known))) {
      continue;
    }
    const candidate = content.slice(span.start, span.end);
    const calls = normalizeTextToolCalls(parseJsonMaybe(candidate));
    if (calls.length > 0) {
      spans.push(span);
      toolCalls.push(...calls);
    }
  }

  if (toolCalls.length === 0) {
    return null;
  }

  return {
    content: removeSpans(content, spans),
    toolCalls,
  };
}

function jsonObjectSpans(content: string): Array<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") {
      if (depth === 0) {
        start = index;
      }
      depth += 1;
      continue;
    }
    if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        spans.push({ start, end: index + 1 });
        start = -1;
      }
    }
  }
  return spans;
}

function rangesOverlap(
  left: { start: number; end: number },
  right: { start: number; end: number },
): boolean {
  return left.start < right.end && right.start < left.end;
}

function removeSpans(content: string, spans: Array<{ start: number; end: number }>): string {
  const merged = [...spans]
    .sort((left, right) => left.start - right.start)
    .reduce<Array<{ start: number; end: number }>>((items, span) => {
      const current = items[items.length - 1];
      if (current && span.start <= current.end) {
        current.end = Math.max(current.end, span.end);
      } else {
        items.push({ ...span });
      }
      return items;
    }, []);
  let result = "";
  let cursor = 0;
  for (const span of merged) {
    result += content.slice(cursor, span.start);
    cursor = span.end;
  }
  result += content.slice(cursor);
  return result.replace(/\n{3,}/g, "\n\n");
}

function normalizeTextToolCalls(value: unknown): AgentToolCall[] {
  let rawCalls: unknown[] = [];
  if (Array.isArray(value)) {
    rawCalls = value;
  } else if (isJsonObject(value)) {
    if (Array.isArray(value.tool_calls)) {
      rawCalls = value.tool_calls;
    } else if (isJsonObject(value.tool_call)) {
      rawCalls = [value.tool_call];
    } else if (typeof value.name === "string") {
      rawCalls = [value];
    }
  }

  return rawCalls.flatMap((rawCall) => {
    if (!isJsonObject(rawCall)) {
      return [];
    }
    const fn = isJsonObject(rawCall.function) ? rawCall.function : null;
    const name =
      typeof rawCall.name === "string"
        ? rawCall.name
        : typeof fn?.name === "string"
          ? fn.name
          : "";
    if (!name) {
      return [];
    }
    const rawArgs =
      rawCall.arguments ??
      rawCall.args ??
      rawCall.input ??
      fn?.arguments ??
      {};
    return [
      {
        id:
          typeof rawCall.id === "string"
            ? rawCall.id
            : typeof rawCall.call_id === "string"
              ? rawCall.call_id
              : makeAgentId("text-call"),
        type: "function" as const,
        function: {
          name,
          arguments:
            typeof rawArgs === "string"
              ? rawArgs
              : JSON.stringify(rawArgs ?? {}),
        },
      },
    ];
  });
}

function parseToolArgumentsForHistory(argumentsText: string): unknown {
  return parseJsonMaybe(argumentsText) ?? argumentsText;
}

function parseJsonMaybe(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function responsesTools(): ResponsesTool[] {
  return agentTools.map((tool) => ({
    type: "function",
    name: tool.function.name,
    description: tool.function.description,
    parameters: tool.function.parameters,
  }));
}

function responsesToolKey(
  event: JsonObject,
  item: JsonObject = {},
): string | number {
  if (typeof event.output_index === "number") {
    return event.output_index;
  }
  if (typeof item.id === "string") {
    return item.id;
  }
  if (typeof event.item_id === "string") {
    return event.item_id;
  }
  if (typeof item.call_id === "string") {
    return item.call_id;
  }
  if (typeof event.call_id === "string") {
    return event.call_id;
  }
  return "0";
}

function responsesToolCallFromItem(
  item: JsonObject,
  fallbackKey: string | number,
): AgentToolCall {
  return {
    id:
      typeof item.call_id === "string"
        ? item.call_id
        : typeof item.id === "string"
          ? item.id
          : String(fallbackKey),
    type: "function",
    function: {
      name: typeof item.name === "string" ? item.name : "",
      arguments: typeof item.arguments === "string" ? item.arguments : "",
    },
  };
}

function buildComposerContext({
  state,
  schema,
  page,
  dirty,
  selection,
  output,
  resolved,
  docsIndex,
}: {
  state: ComposerState;
  schema: ComposerSchema;
  page: string;
  dirty: boolean;
  selection: AgentSelection;
  output: string;
  resolved: ResolvedState | null;
  docsIndex: string[];
}): JsonObject {
  return {
    app: {
      name: "Composer",
      description: "The foundation that lets you sing",
      current_page: page,
      dirty,
      selection,
    },
    available_panels: panelNames,
    context_mode: "compact",
    exact_data_access:
      "Use read_panel/read_state_path for current config, read_schema_path for backend schema slices, and search_sing_box_docs/read_sing_box_doc for GitHub documentation. Indexes are for discovery; exact writes require schema/doc tool reads.",
    state_summary: buildStateSummary(state),
    composer_state_schema: composerStateSchema,
    schema_summary: buildSchemaSummary(schema),
    schema_index: buildSchemaIndex(schema),
    sing_box_docs_index: docsIndex,
    resolved_summary: summarizeResolved(resolved),
    output_summary: summarizeOutput(output),
  };
}

function buildStateSummary(state: ComposerState): JsonObject {
  return {
    version: state.version,
    metadata: state.metadata,
    base_config: summarizeJsonValue(state.base_config),
    global: {
      log: summarizeJsonValue(state.global.log),
      ntp: summarizeJsonValue(state.global.ntp),
      experimental: summarizeJsonValue(state.global.experimental),
    },
    dns: {
      enabled: state.dns.enabled,
      options: summarizeJsonValue(state.dns.options),
      servers: state.dns.servers.map((server, index) =>
        summarizeTypedObject(server, index),
      ),
      rules: state.dns.rules.map((rule, index) =>
        summarizeTypedObject(rule, index),
      ),
    },
    route: {
      options: summarizeJsonValue(state.route.options),
      rule_sets: state.route.rule_sets.map((ruleSet, index) =>
        summarizeTypedObject(ruleSet, index),
      ),
    },
    inbounds: state.inbounds.map((inbound, index) =>
      summarizeTypedObject(inbound, index),
    ),
    endpoints: state.endpoints.map((endpoint, index) =>
      summarizeTypedObject(endpoint, index),
    ),
    http_clients: state.http_clients.map((client, index) =>
      summarizeTypedObject(client, index),
    ),
    certificate: summarizeJsonValue(state.certificate),
    certificate_providers: state.certificate_providers.map((provider, index) =>
      summarizeTypedObject(provider, index),
    ),
    services: state.services.map((service, index) =>
      summarizeTypedObject(service, index),
    ),
    extra_route_rules: state.extra_route_rules.map((rule, index) =>
      summarizeTypedObject(rule, index),
    ),
    proxy_sources: state.proxy_sources.map((source, index) => ({
      index,
      id: source.id,
      name: source.name,
      enabled: source.enabled,
      kind: source.kind,
      prefix: source.prefix,
      name_rewrites: source.name_rewrites.length,
      subscription_last_fetch_at: source.subscription.last_fetch_at ?? null,
      nodes: source.nodes.length,
      node_types: countBy(
        source.nodes.map((node) =>
          typeof node.type === "string" ? node.type : "unknown",
        ),
      ),
    })),
    proxy_groups: state.proxy_groups.map((group, index) => ({
      index,
      id: group.id,
      tag: group.tag,
      enabled: group.enabled,
      group_type: group.group_type,
      source_ids: group.source_ids,
      match_regexes: group.match_regexes,
      include_groups: group.include_groups,
      include_special: group.include_special,
    })),
    target_groups: state.target_groups.map((target, index) => ({
      index,
      id: target.id,
      name: target.name,
      enabled: target.enabled,
      outbound: target.outbound,
      entries: target.entries.length,
      entry_kinds: countBy(target.entries.map((entry) => entry.kind)),
    })),
  };
}

function buildSchemaSummary(schema: ComposerSchema): JsonObject {
  return {
    schema_version: schema.schema_version,
    defaults: {
      outbound: schema.default_outbound_type,
      inbound: schema.default_inbound_type,
      endpoint: schema.default_endpoint_type,
      certificate_provider: schema.default_certificate_provider_type,
      service: schema.default_service_type,
      dns_server: schema.dns?.default_server_type,
      dns_rule: schema.dns?.default_rule_type,
      route_rule: schema.route?.default_rule_type,
      route_rule_set: schema.route?.default_rule_set_type,
    },
    outbounds: summarizeTypedSchemas(schema.outbounds),
    inbounds: summarizeTypedSchemas(schema.inbounds ?? {}),
    endpoints: summarizeTypedSchemas(schema.endpoints ?? {}),
    certificate_providers: summarizeTypedSchemas(
      schema.certificate_providers ?? {},
    ),
    services: summarizeTypedSchemas(schema.services ?? {}),
    dns: schema.dns
      ? {
          options: summarizeFields(schema.dns.options.fields),
          servers: summarizeTypedSchemas(schema.dns.servers),
          rules: summarizeTypedSchemas(schema.dns.rules),
          nested_rules: summarizeTypedSchemas(schema.dns.nested_rules ?? {}),
        }
      : null,
    route: schema.route
      ? {
          options: summarizeFields(schema.route.options.fields),
          rules: summarizeTypedSchemas(schema.route.rules),
          nested_rules: summarizeTypedSchemas(schema.route.nested_rules ?? {}),
          rule_sets: summarizeTypedSchemas(schema.route.rule_sets ?? {}),
          headless_rules: summarizeTypedSchemas(
            schema.route.headless_rules ?? {},
          ),
        }
      : null,
    global: schema.global
      ? {
          log: summarizeFields(schema.global.log.fields),
          ntp: summarizeFields(schema.global.ntp.fields),
          experimental: summarizeFields(schema.global.experimental.fields),
        }
      : null,
    http_client: summarizeFields(schema.http_client?.fields ?? []),
    certificate: summarizeFields(schema.certificate?.fields ?? []),
  };
}

function buildSchemaIndex(schema: ComposerSchema): JsonObject {
  return {
    root: {
      path: "/",
      keys: [
        "outbounds",
        "inbounds",
        "endpoints",
        "http_client",
        "certificate",
        "certificate_providers",
        "services",
        "global",
        "dns",
        "route",
      ],
    },
    outbounds: schemaIndexForTypedMap("/outbounds", schema.outbounds),
    inbounds: schemaIndexForTypedMap("/inbounds", schema.inbounds ?? {}),
    endpoints: schemaIndexForTypedMap("/endpoints", schema.endpoints ?? {}),
    certificate_providers: schemaIndexForTypedMap(
      "/certificate_providers",
      schema.certificate_providers ?? {},
    ),
    services: schemaIndexForTypedMap("/services", schema.services ?? {}),
    global: schema.global
      ? [
          schemaIndexForObject("/global/log", "log", schema.global.log.fields),
          schemaIndexForObject("/global/ntp", "ntp", schema.global.ntp.fields),
          schemaIndexForObject(
            "/global/experimental",
            "experimental",
            schema.global.experimental.fields,
          ),
        ]
      : [],
    http_client: schemaIndexForObject(
      "/http_client",
      "http_client",
      schema.http_client?.fields ?? [],
    ),
    certificate: schemaIndexForObject(
      "/certificate",
      "certificate",
      schema.certificate?.fields ?? [],
    ),
    dns: schema.dns
      ? {
          options: schemaIndexForObject(
            "/dns/options",
            "dns.options",
            schema.dns.options.fields,
          ),
          servers: schemaIndexForTypedMap("/dns/servers", schema.dns.servers),
          rules: schemaIndexForTypedMap("/dns/rules", schema.dns.rules),
          nested_rules: schemaIndexForTypedMap(
            "/dns/nested_rules",
            schema.dns.nested_rules ?? {},
          ),
        }
      : null,
    route: schema.route
      ? {
          options: schemaIndexForObject(
            "/route/options",
            "route.options",
            schema.route.options.fields,
          ),
          rules: schemaIndexForTypedMap("/route/rules", schema.route.rules),
          nested_rules: schemaIndexForTypedMap(
            "/route/nested_rules",
            schema.route.nested_rules ?? {},
          ),
          rule_sets: schemaIndexForTypedMap(
            "/route/rule_sets",
            schema.route.rule_sets ?? {},
          ),
          headless_rules: schemaIndexForTypedMap(
            "/route/headless_rules",
            schema.route.headless_rules ?? {},
          ),
        }
      : null,
  };
}

function schemaIndexForTypedMap(
  basePath: string,
  schemas: Record<string, { type: string; label: string; fields: SchemaLikeField[] }>,
): unknown[] {
  return Object.entries(schemas).map(([key, schema]) =>
    schemaIndexForObject(`${basePath}/${escapeJsonPointer(key)}`, schema.label, schema.fields, schema.type),
  );
}

function schemaIndexForObject(
  path: string,
  label: string,
  fields: SchemaLikeField[],
  type?: string,
): JsonObject {
  return {
    path,
    label,
    type,
    fields: fields.map((field) => ({
      key: field.key,
      kind: field.kind,
      required: field.required === true,
      path: `${path}/fields/${escapeJsonPointer(field.key)}`,
      children: field.fields?.map((child) => child.key),
      variants: field.variants ? Object.keys(field.variants) : undefined,
      schemaNamespace: field.schemaNamespace,
    })),
  };
}

function escapeJsonPointer(value: string): string {
  return value.replace(/~/g, "~0").replace(/\//g, "~1");
}

function summarizeTypedSchemas(
  schemas: Record<string, { type: string; label: string; fields: SchemaLikeField[] }>,
): unknown[] {
  return Object.values(schemas).map((schema) => ({
    type: schema.type,
    label: schema.label,
    fields: summarizeFields(schema.fields),
  }));
}

type SchemaLikeField = {
  key: string;
  label: string;
  kind: string;
  required?: boolean;
  fields?: SchemaLikeField[];
  variants?: Record<string, SchemaLikeField[]>;
  options?: string[];
  schemaNamespace?: string;
};

function summarizeFields(fields: SchemaLikeField[]): unknown[] {
  return fields.map((field) => ({
    key: field.key,
    label: field.label,
    kind: field.kind,
    required: field.required === true,
    options: field.options?.slice(0, 16),
    schemaNamespace: field.schemaNamespace,
    child_fields: field.fields?.map((child) => child.key),
    variants: field.variants ? Object.keys(field.variants) : undefined,
  }));
}

function summarizeTypedObject(value: JsonObject, index: number): JsonObject {
  const tag =
    typeof value.tag === "string"
      ? value.tag
      : typeof value.name === "string"
        ? value.name
        : `${String(value.type ?? "item")}-${index + 1}`;
  return {
    index,
    tag,
    type: typeof value.type === "string" ? value.type : undefined,
    keys: Object.keys(value),
  };
}

function summarizeJsonValue(value: unknown): JsonObject {
  if (Array.isArray(value)) {
    return {
      type: "array",
      length: value.length,
    };
  }
  if (isJsonObject(value)) {
    return {
      type: "object",
      keys: Object.keys(value),
    };
  }
  return {
    type: value === null ? "null" : typeof value,
    value:
      typeof value === "string"
        ? truncateText(value, 200)
        : typeof value === "number" || typeof value === "boolean"
          ? value
          : undefined,
  };
}

function summarizeResolved(resolved: ResolvedState | null): JsonObject | null {
  if (!resolved) {
    return null;
  }
  return {
    proxies: resolved.proxies.length,
    groups: resolved.groups.length,
    rules: resolved.rules.length,
    proxy_tags: resolved.proxies.slice(0, 80).map((proxy) => proxy.tag),
    group_tags: resolved.groups.map((group) => group.tag),
  };
}

function summarizeOutput(output: string): JsonObject | null {
  if (!output.trim()) {
    return null;
  }
  const parsed = parseOutput(output);
  if (isJsonObject(parsed)) {
    return {
      type: "json",
      length: output.length,
      keys: Object.keys(parsed),
    };
  }
  return {
    type: "text",
    length: output.length,
  };
}

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function readPanel(
  panel: PanelName,
  context: {
    state: ComposerState;
    schema: ComposerSchema;
    page: string;
    dirty: boolean;
    selection: AgentSelection;
    output: string;
    resolved: ResolvedState | null;
    docsIndex: string[];
  },
): unknown {
  const effectivePanel = panel === "current" ? panelName(context.page, context.page) : panel;
  switch (effectivePanel) {
    case "all":
      return buildComposerContext(context);
    case "sources":
      return context.state.proxy_sources;
    case "groups":
      return context.state.proxy_groups;
    case "targets":
      return context.state.target_groups;
    case "extra_routes":
      return {
        route: context.state.route,
        extra_route_rules: context.state.extra_route_rules,
      };
    case "dns":
      return context.state.dns;
    case "inbounds":
      return context.state.inbounds;
    case "endpoints":
      return context.state.endpoints;
    case "http_clients":
      return context.state.http_clients;
    case "certificates":
      return {
        certificate: context.state.certificate,
        certificate_providers: context.state.certificate_providers,
      };
    case "services":
      return context.state.services;
    case "global":
      return context.state.global;
    case "base":
      return context.state.base_config;
    case "output":
      return {
        config: context.output.trim() ? parseOutput(context.output) : null,
        resolved: context.resolved,
      };
    case "current":
      return buildComposerContext(context);
    default:
      return assertNever(effectivePanel);
  }
}

function replacePanel(
  current: ComposerState,
  panel: PanelName,
  value: unknown,
): ComposerState {
  const next = cloneJson(current) as ComposerState;
  switch (panel) {
    case "all":
      return value as ComposerState;
    case "sources":
      next.proxy_sources = expectArray(value, panel) as ComposerState["proxy_sources"];
      return next;
    case "groups":
      next.proxy_groups = expectArray(value, panel) as ComposerState["proxy_groups"];
      return next;
    case "targets":
      next.target_groups = expectArray(value, panel) as ComposerState["target_groups"];
      return next;
    case "extra_routes": {
      if (!isJsonObject(value)) {
        throw new Error("extra_routes value must be an object");
      }
      if ("route" in value) {
        next.route = value.route as ComposerState["route"];
      }
      if ("extra_route_rules" in value) {
        next.extra_route_rules = expectArray(
          value.extra_route_rules,
          "extra_route_rules",
        ) as ComposerState["extra_route_rules"];
      }
      return next;
    }
    case "dns":
      next.dns = value as ComposerState["dns"];
      return next;
    case "inbounds":
      next.inbounds = expectArray(value, panel) as ComposerState["inbounds"];
      return next;
    case "endpoints":
      next.endpoints = expectArray(value, panel) as ComposerState["endpoints"];
      return next;
    case "http_clients":
      next.http_clients = expectArray(value, panel) as ComposerState["http_clients"];
      return next;
    case "certificates": {
      if (!isJsonObject(value)) {
        throw new Error("certificates value must be an object");
      }
      if ("certificate" in value) {
        next.certificate = value.certificate as ComposerState["certificate"];
      }
      if ("certificate_providers" in value) {
        next.certificate_providers = expectArray(
          value.certificate_providers,
          "certificate_providers",
        ) as ComposerState["certificate_providers"];
      }
      return next;
    }
    case "services":
      next.services = expectArray(value, panel) as ComposerState["services"];
      return next;
    case "global":
      next.global = value as ComposerState["global"];
      return next;
    case "base":
      next.base_config = value as ComposerState["base_config"];
      return next;
    case "output":
      throw new Error("output panel is generated and cannot be replaced");
    case "current":
      throw new Error("replace_panel does not support current");
    default:
      return assertNever(panel);
  }
}

function panelName(value: unknown, currentPage: string): PanelName {
  const raw = typeof value === "string" && value ? value : currentPage;
  if ((panelNames as string[]).includes(raw)) {
    return raw as PanelName;
  }
  if (raw === "output") {
    return "output";
  }
  throw new Error(`unknown panel: ${raw}`);
}

function getPathValue(root: unknown, path: string): unknown {
  const parts = pathParts(path);
  let current = root;
  for (const part of parts) {
    if (Array.isArray(current)) {
      const index = Number(part);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        throw new Error(`array index out of range: ${part}`);
      }
      current = current[index];
    } else if (isJsonObject(current)) {
      if (!(part in current)) {
        throw new Error(`path does not exist: ${path}`);
      }
      current = current[part];
    } else {
      throw new Error(`cannot read through non-object at ${part}`);
    }
  }
  return current;
}

function setPathValue(root: unknown, path: string, value: unknown): unknown {
  const parts = pathParts(path);
  if (parts.length === 0) {
    return cloneJson(value);
  }
  const parent = getPathValueByParts(root, parts.slice(0, -1));
  const key = parts[parts.length - 1];
  if (Array.isArray(parent)) {
    const index = key === "-" ? parent.length : Number(key);
    if (!Number.isInteger(index) || index < 0 || index > parent.length) {
      throw new Error(`array index out of range: ${key}`);
    }
    if (index === parent.length) {
      parent.push(cloneJson(value));
    } else {
      parent[index] = cloneJson(value);
    }
    return root;
  }
  if (isJsonObject(parent)) {
    parent[key] = cloneJson(value);
    return root;
  }
  throw new Error(`cannot write through non-object at ${path}`);
}

function deletePathValue(root: unknown, path: string): unknown {
  const parts = pathParts(path);
  if (parts.length === 0) {
    throw new Error("cannot delete root state");
  }
  const parent = getPathValueByParts(root, parts.slice(0, -1));
  const key = parts[parts.length - 1];
  if (Array.isArray(parent)) {
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0 || index >= parent.length) {
      throw new Error(`array index out of range: ${key}`);
    }
    return parent.splice(index, 1)[0];
  }
  if (isJsonObject(parent)) {
    if (!(key in parent)) {
      throw new Error(`path does not exist: ${path}`);
    }
    const removed = parent[key];
    delete parent[key];
    return removed;
  }
  throw new Error(`cannot delete through non-object at ${path}`);
}

function getPathValueByParts(root: unknown, parts: string[]): unknown {
  let current = root;
  for (const part of parts) {
    if (Array.isArray(current)) {
      const index = Number(part);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        throw new Error(`array index out of range: ${part}`);
      }
      current = current[index];
    } else if (isJsonObject(current)) {
      if (!(part in current)) {
        throw new Error(`path does not exist at ${part}`);
      }
      current = current[part];
    } else {
      throw new Error(`cannot traverse non-object at ${part}`);
    }
  }
  return current;
}

function pathParts(path: string): string[] {
  if (path === "" || path === "/") {
    return [];
  }
  if (!path.startsWith("/")) {
    throw new Error("JSON Pointer path must start with /");
  }
  return path
    .slice(1)
    .split("/")
    .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"));
}

function stringArg(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function expectArray(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${name} must be an array`);
  }
  return value;
}

function chatCompletionsUrl(apiUrl: string): string {
  const trimmed = apiUrl.trim().replace(/\/+$/, "");
  if (trimmed.endsWith("/chat/completions")) {
    return trimmed;
  }
  if (trimmed.endsWith("/responses")) {
    return `${trimmed.slice(0, -"/responses".length)}/chat/completions`;
  }
  return `${trimmed}/chat/completions`;
}

function responsesUrl(apiUrl: string): string {
  const trimmed = apiUrl.trim().replace(/\/+$/, "");
  if (trimmed.endsWith("/responses")) {
    return trimmed;
  }
  if (trimmed.endsWith("/chat/completions")) {
    return `${trimmed.slice(0, -"/chat/completions".length)}/responses`;
  }
  return `${trimmed}/responses`;
}

function normalizeAgentConfig(value: unknown): AgentConfig {
  const raw = isJsonObject(value) ? value : {};
  let protocol: AgentProtocol = defaultAgentConfig.protocol;
  if (raw.protocol === "chat_completions") {
    protocol = "chat_completions";
  } else if (raw.protocol === "responses_text_tools") {
    protocol = "responses_text_tools";
  } else if (raw.protocol === "responses") {
    protocol =
      raw.protocolModeVersion === 2 ? "responses" : "responses_text_tools";
  }
  return {
    apiUrl:
      typeof raw.apiUrl === "string" ? raw.apiUrl : defaultAgentConfig.apiUrl,
    apiKey: typeof raw.apiKey === "string" ? raw.apiKey : "",
    model: typeof raw.model === "string" ? raw.model : "",
    protocol,
    protocolModeVersion: 2,
  };
}

function normalizeAgentMessages(value: unknown): AgentMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const messages: AgentMessage[] = [];
  for (const rawMessage of value) {
    if (!isJsonObject(rawMessage)) {
      continue;
    }
    const id =
      typeof rawMessage.id === "string" ? rawMessage.id : makeAgentId("msg");
    if (rawMessage.role === "user" || rawMessage.role === "assistant") {
      const toolCalls = normalizeStoredToolCalls(rawMessage.toolCalls);
      const message: Extract<AgentMessage, { role: "user" | "assistant" }> = {
        id,
        role: rawMessage.role,
        content:
          typeof rawMessage.content === "string" ? rawMessage.content : "",
        ...(toolCalls.length > 0 ? { toolCalls } : {}),
      };
      messages.push(message);
      continue;
    }
    if (rawMessage.role === "tool") {
      const message: Extract<AgentMessage, { role: "tool" }> = {
        id,
        role: "tool",
        toolCallId:
          typeof rawMessage.toolCallId === "string"
            ? rawMessage.toolCallId
            : typeof rawMessage.tool_call_id === "string"
              ? rawMessage.tool_call_id
              : makeAgentId("call"),
        name: typeof rawMessage.name === "string" ? rawMessage.name : "tool",
        args:
          typeof rawMessage.args === "string"
            ? rawMessage.args
            : stringifyForDisplay(rawMessage.args ?? {}),
        result:
          typeof rawMessage.result === "string"
            ? rawMessage.result
            : stringifyForDisplay(rawMessage.result ?? ""),
        ok: rawMessage.ok !== false,
      };
      messages.push(message);
    }
  }
  return messages;
}

function normalizeStoredToolCalls(value: unknown): AgentToolCall[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((rawCall) => {
    if (!isJsonObject(rawCall)) {
      return [];
    }
    const fn = isJsonObject(rawCall.function) ? rawCall.function : {};
    const name = typeof fn.name === "string" ? fn.name : "";
    if (!name) {
      return [];
    }
    return [
      {
        id: typeof rawCall.id === "string" ? rawCall.id : makeAgentId("call"),
        type: "function" as const,
        function: {
          name,
          arguments:
            typeof fn.arguments === "string" ? fn.arguments : "{}",
        },
      },
    ];
  });
}

function messagesForStorage(messages: AgentMessage[]): AgentMessage[] {
  return messages.slice(-STORED_HISTORY_LIMIT).map((message) => {
    if (message.role === "tool") {
      return {
        ...message,
        args: truncateText(
          message.args,
          STORED_TOOL_ARGUMENT_CHAR_LIMIT,
          `[stored tool arguments truncated: ${message.name}, original length ${message.args.length}]`,
        ),
        result: truncateText(
          message.result,
          STORED_TOOL_RESULT_CHAR_LIMIT,
          `[stored tool result truncated: ${message.name}, original length ${message.result.length}]`,
        ),
      };
    }
    return {
      ...message,
      content: truncateText(
        message.content,
        STORED_MESSAGE_CHAR_LIMIT,
        `[stored message truncated: original length ${message.content.length}]`,
      ),
      ...(message.toolCalls?.length
        ? { toolCalls: compactToolCallsForStorage(message.toolCalls) }
        : {}),
    };
  });
}

function historyForClipboard(messages: AgentMessage[]): unknown[] {
  const history: unknown[] = [];
  for (const message of messagesForStorage(messages)) {
    if (message.role === "assistant") {
      if (!message.content.trim()) {
        continue;
      }
      history.push({
        id: message.id,
        role: message.role,
        content: message.content,
      });
      continue;
    }
    if (message.role === "user") {
      history.push({
        id: message.id,
        role: message.role,
        content: message.content,
      });
      continue;
    }
    if (message.role === "tool") {
      history.push({
        id: message.id,
        role: "tool",
        toolCallId: message.toolCallId,
        name: message.name,
        args: message.args,
        result: message.result,
        ok: message.ok,
      });
    }
  }
  return history;
}

function compactToolCallsForStorage(toolCalls: AgentToolCall[]): AgentToolCall[] {
  return toolCalls.map((toolCall) => ({
    ...toolCall,
    function: {
      ...toolCall.function,
      arguments: truncateText(
        toolCall.function.arguments,
        STORED_TOOL_ARGUMENT_CHAR_LIMIT,
        `[stored tool arguments truncated: ${toolCall.function.name}, original length ${toolCall.function.arguments.length}]`,
      ),
    },
  }));
}

function parseOutput(output: string): unknown {
  try {
    return JSON.parse(output);
  } catch {
    return output;
  }
}

function prettyJsonString(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function stringifyForDisplay(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value, null, 2);
}

function truncateText(
  value: string,
  maxLength: number,
  prefix = `[truncated: original length ${value.length}]`,
): string {
  if (value.length <= maxLength) {
    return value;
  }
  const available = Math.max(0, maxLength - prefix.length - 2);
  return `${prefix}\n${value.slice(0, available)}`;
}

function cloneJson<T>(value: T): T {
  return structuredClone(value);
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatAgentDate(value?: string | null): string {
  if (!value) {
    return "无";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function makeAgentId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage may be unavailable in restricted browser contexts.
  }
}

function assertNever(value: never): never {
  throw new Error(`unhandled value: ${String(value)}`);
}
