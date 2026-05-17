export type JsonObject = Record<string, unknown>;

export type FieldKind =
  | "string"
  | "number"
  | "boolean"
  | "select"
  | "string-list"
  | "number-list"
  | "map"
  | "object"
  | "object-list"
  | "object-map"
  | "variant-object"
  | "string-or-object"
  | "boolean-or-object"
  | "typed-list"
  | "json";

export type FieldCondition = {
  key: string;
  op: "empty" | "present" | "equals" | "not-equals" | "one-of" | "not-one-of";
  value?: unknown;
  values?: unknown[];
};

export type SchemaField = {
  key: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  placeholder?: string;
  defaultValue?: unknown;
  options?: string[];
  valueType?: "string" | "number";
  allowedValues?: string[];
  min?: number;
  max?: number;
  wide?: boolean;
  fields?: SchemaField[];
  variants?: Record<string, SchemaField[]>;
  variantOptions?: string[];
  visibleWhen?: FieldCondition[];
  ref?: string;
  flatten?: boolean;
  schemaNamespace?: string;
  defaultType?: string;
  typeOptions?: OutboundTypeOption[];
  schemas?: Record<string, OutboundSchema>;
};

export type OutboundSchema = {
  type: string;
  label: string;
  fields: SchemaField[];
};

export type ObjectSchema = {
  fields: SchemaField[];
};

export type OutboundTypeOption = {
  value: string;
  label: string;
};

export type ComposerSchema = {
  schema_version: number;
  default_outbound_type: string;
  outbounds: Record<string, OutboundSchema>;
  outbound_type_options?: OutboundTypeOption[];
  default_inbound_type?: string;
  inbounds?: Record<string, OutboundSchema>;
  inbound_type_options?: OutboundTypeOption[];
  dns?: DnsSchema;
};

export type DnsSchema = {
  options: ObjectSchema;
  default_server_type: string;
  servers: Record<string, OutboundSchema>;
  server_type_options?: OutboundTypeOption[];
  default_rule_type: string;
  rules: Record<string, OutboundSchema>;
  rule_type_options?: OutboundTypeOption[];
  default_nested_rule_type?: string;
  nested_rules?: Record<string, OutboundSchema>;
  nested_rule_type_options?: OutboundTypeOption[];
};

export const EMPTY_COMPOSER_SCHEMA: ComposerSchema = {
  schema_version: 1,
  default_outbound_type: "",
  outbounds: {},
  outbound_type_options: [],
  default_inbound_type: "",
  inbounds: {},
  inbound_type_options: [],
  dns: {
    options: { fields: [] },
    default_server_type: "",
    servers: {},
    server_type_options: [],
    default_rule_type: "",
    rules: {},
    rule_type_options: [],
    default_nested_rule_type: "",
    nested_rules: {},
    nested_rule_type_options: [],
  },
};

export function normalizeComposerSchema(
  schema: ComposerSchema,
): ComposerSchema {
  const outbounds = schema.outbounds ?? {};
  const options =
    schema.outbound_type_options ??
    Object.values(outbounds).map((outbound) => ({
      value: outbound.type,
      label: outbound.label,
    }));
  const defaultType =
    schema.default_outbound_type && outbounds[schema.default_outbound_type]
      ? schema.default_outbound_type
      : (options[0]?.value ?? "");
  const inbounds = schema.inbounds ?? {};
  const inboundOptions =
    schema.inbound_type_options ??
    Object.values(inbounds).map((inbound) => ({
      value: inbound.type,
      label: inbound.label,
    }));
  const defaultInboundType =
    schema.default_inbound_type && inbounds[schema.default_inbound_type]
      ? schema.default_inbound_type
      : (inboundOptions[0]?.value ?? "");
  return {
    ...schema,
    default_outbound_type: defaultType,
    outbounds,
    outbound_type_options: options.filter((option) => outbounds[option.value]),
    default_inbound_type: defaultInboundType,
    inbounds,
    inbound_type_options: inboundOptions.filter(
      (option) => inbounds[option.value],
    ),
    dns: normalizeDnsSchema(schema.dns),
  };
}

function normalizeDnsSchema(schema: DnsSchema | undefined): DnsSchema {
  const servers = schema?.servers ?? {};
  const rules = schema?.rules ?? {};
  const nestedRules = schema?.nested_rules ?? {};
  const serverOptions =
    schema?.server_type_options ??
    Object.values(servers).map((server) => ({
      value: server.type,
      label: server.label,
    }));
  const ruleOptions =
    schema?.rule_type_options ??
    Object.values(rules).map((rule) => ({
      value: rule.type,
      label: rule.label,
    }));
  const nestedRuleOptions =
    schema?.nested_rule_type_options ??
    Object.values(nestedRules).map((rule) => ({
      value: rule.type,
      label: rule.label,
    }));
  const defaultServerType =
    schema?.default_server_type && servers[schema.default_server_type]
      ? schema.default_server_type
      : (serverOptions[0]?.value ?? "");
  const defaultRuleType =
    schema?.default_rule_type && rules[schema.default_rule_type]
      ? schema.default_rule_type
      : (ruleOptions[0]?.value ?? "");
  const defaultNestedRuleType =
    schema?.default_nested_rule_type &&
    nestedRules[schema.default_nested_rule_type]
      ? schema.default_nested_rule_type
      : (nestedRuleOptions[0]?.value ?? "");
  return {
    options: schema?.options ?? { fields: [] },
    default_server_type: defaultServerType,
    servers,
    server_type_options: serverOptions.filter(
      (option) => servers[option.value],
    ),
    default_rule_type: defaultRuleType,
    rules,
    rule_type_options: ruleOptions.filter((option) => rules[option.value]),
    default_nested_rule_type: defaultNestedRuleType,
    nested_rules: nestedRules,
    nested_rule_type_options: nestedRuleOptions.filter(
      (option) => nestedRules[option.value],
    ),
  };
}

export function getOutboundTypeOptions(
  schema: ComposerSchema,
): OutboundTypeOption[] {
  return schema.outbound_type_options ?? [];
}

export function getOutboundSchema(
  schema: ComposerSchema,
  type: unknown,
): OutboundSchema | null {
  return typeof type === "string" ? (schema.outbounds[type] ?? null) : null;
}

export function getInboundTypeOptions(
  schema: ComposerSchema,
): OutboundTypeOption[] {
  return schema.inbound_type_options ?? [];
}

export function getInboundSchema(
  schema: ComposerSchema,
  type: unknown,
): OutboundSchema | null {
  return typeof type === "string" ? (schema.inbounds?.[type] ?? null) : null;
}

export function getDnsServerTypeOptions(
  schema: ComposerSchema,
): OutboundTypeOption[] {
  return schema.dns?.server_type_options ?? [];
}

export function getDnsRuleTypeOptions(
  schema: ComposerSchema,
): OutboundTypeOption[] {
  return schema.dns?.rule_type_options ?? [];
}

export function getDnsServerSchema(
  schema: ComposerSchema,
  type: unknown,
): OutboundSchema | null {
  return typeof type === "string" ? (schema.dns?.servers[type] ?? null) : null;
}

export function getDnsRuleSchema(
  schema: ComposerSchema,
  type: unknown,
): OutboundSchema | null {
  return typeof type === "string" ? (schema.dns?.rules[type] ?? null) : null;
}

export function getTypedListSchemas(
  schema: ComposerSchema,
  field: SchemaField,
): Record<string, OutboundSchema> {
  if (field.schemas && Object.keys(field.schemas).length > 0) {
    return field.schemas;
  }
  if (field.schemaNamespace === "dns.rules") {
    return schema.dns?.rules ?? {};
  }
  if (field.schemaNamespace === "dns.nested_rules") {
    return schema.dns?.nested_rules ?? {};
  }
  return {};
}

export function getTypedListTypeOptions(
  schema: ComposerSchema,
  field: SchemaField,
): OutboundTypeOption[] {
  if (field.typeOptions && field.typeOptions.length > 0) {
    return field.typeOptions.filter(
      (option) => getTypedListSchemas(schema, field)[option.value],
    );
  }
  if (field.schemaNamespace === "dns.rules") {
    return schema.dns?.rule_type_options ?? [];
  }
  if (field.schemaNamespace === "dns.nested_rules") {
    return schema.dns?.nested_rule_type_options ?? [];
  }
  return Object.values(getTypedListSchemas(schema, field)).map((item) => ({
    value: item.type,
    label: item.label,
  }));
}

export function getTypedListDefaultType(
  schema: ComposerSchema,
  field: SchemaField,
): string {
  const schemas = getTypedListSchemas(schema, field);
  if (field.defaultType && schemas[field.defaultType]) {
    return field.defaultType;
  }
  if (
    field.schemaNamespace === "dns.rules" &&
    schema.dns?.default_rule_type &&
    schemas[schema.dns.default_rule_type]
  ) {
    return schema.dns.default_rule_type;
  }
  if (
    field.schemaNamespace === "dns.nested_rules" &&
    schema.dns?.default_nested_rule_type &&
    schemas[schema.dns.default_nested_rule_type]
  ) {
    return schema.dns.default_nested_rule_type;
  }
  return Object.keys(schemas)[0] ?? "";
}

export function getTypedListItemSchema(
  schema: ComposerSchema,
  field: SchemaField,
  type: unknown,
): OutboundSchema | null {
  return typeof type === "string"
    ? (getTypedListSchemas(schema, field)[type] ?? null)
    : null;
}

export function createOutboundNode(
  schema: ComposerSchema,
  type: string,
  seed?: JsonObject,
): JsonObject {
  const outboundSchema =
    schema.outbounds[type] ??
    schema.outbounds[schema.default_outbound_type] ??
    Object.values(schema.outbounds)[0];
  if (!outboundSchema) {
    return { type, tag: seed?.tag ?? "proxy-1" };
  }
  const next: JsonObject = { type: outboundSchema.type };
  for (const field of outboundSchema.fields) {
    if (field.key === "_dialer") {
      continue;
    }
    assignInitialField(next, field, seed);
  }
  if (!next.tag) {
    next.tag = seed?.tag ?? "proxy-1";
  }
  return sanitizeOutboundNode(schema, next);
}

export function createDnsServer(
  schema: ComposerSchema,
  type: string,
  seed?: JsonObject,
): JsonObject {
  const dns = schema.dns;
  const serverSchema =
    dns?.servers[type] ??
    (dns?.default_server_type ? dns.servers[dns.default_server_type] : null) ??
    Object.values(dns?.servers ?? {})[0];
  return createTypedValue(schema, serverSchema, type, seed, "dns-server-1");
}

export function createDnsRule(
  schema: ComposerSchema,
  type: string,
  seed?: JsonObject,
): JsonObject {
  const dns = schema.dns;
  const ruleSchema =
    dns?.rules[type] ??
    (dns?.default_rule_type ? dns.rules[dns.default_rule_type] : null) ??
    Object.values(dns?.rules ?? {})[0];
  return createTypedValue(schema, ruleSchema, type, seed, "");
}

export function createInbound(
  schema: ComposerSchema,
  type: string,
  seed?: JsonObject,
): JsonObject {
  const inboundSchema =
    schema.inbounds?.[type] ??
    (schema.default_inbound_type
      ? schema.inbounds?.[schema.default_inbound_type]
      : null) ??
    Object.values(schema.inbounds ?? {})[0];
  return createTypedValue(schema, inboundSchema, type, seed, "inbound-1");
}

function createTypedValue(
  schemaRoot: ComposerSchema,
  typedSchema: OutboundSchema | undefined | null,
  type: string,
  seed: JsonObject | undefined,
  fallbackTag: string,
): JsonObject {
  if (!typedSchema) {
    return fallbackTag ? { type, tag: seed?.tag ?? fallbackTag } : { type };
  }
  const next: JsonObject = { type: typedSchema.type };
  for (const field of typedSchema.fields) {
    if (field.key === "type" || field.key === "_dialer") {
      continue;
    }
    assignInitialField(next, field, seed);
  }
  if (fallbackTag && !next.tag) {
    next.tag = seed?.tag ?? fallbackTag;
  }
  return {
    type: typedSchema.type,
    ...sanitizeFields(next, typedSchema.fields, schemaRoot),
  };
}

function assignInitialField(
  output: JsonObject,
  field: SchemaField,
  seed?: JsonObject,
) {
  if (field.flatten) {
    for (const nested of field.fields ?? []) {
      assignInitialField(output, nested, seed);
    }
    return;
  }
  const seeded = seed?.[field.key];
  const value = seeded !== undefined ? seeded : defaultValueForField(field);
  if (value !== undefined && hasFieldContent(value, field)) {
    output[field.key] = value;
  }
}

export function changeOutboundType(
  schema: ComposerSchema,
  current: JsonObject,
  type: string,
): JsonObject {
  const seed: JsonObject = {};
  for (const key of [
    "tag",
    "server",
    "server_port",
    "password",
    "uuid",
    "tls",
  ]) {
    if (current[key] !== undefined) {
      seed[key] = current[key];
    }
  }
  return createOutboundNode(schema, type, seed);
}

export function changeDnsServerType(
  schema: ComposerSchema,
  current: JsonObject,
  type: string,
): JsonObject {
  return createDnsServer(schema, type, {
    tag: current.tag,
    server: current.server,
    server_port: current.server_port,
    tls: current.tls,
  });
}

export function changeDnsRuleType(
  schema: ComposerSchema,
  current: JsonObject,
  type: string,
): JsonObject {
  return createDnsRule(schema, type, {
    label: current.label,
    action: current.action,
    server: current.server,
  });
}

export function changeInboundType(
  schema: ComposerSchema,
  current: JsonObject,
  type: string,
): JsonObject {
  return createInbound(schema, type, {
    tag: current.tag,
    listen: current.listen,
    listen_port: current.listen_port,
    tls: current.tls,
    users: current.users,
  });
}

export function sanitizeOutboundNode(
  schema: ComposerSchema,
  value: JsonObject,
): JsonObject {
  const outboundSchema =
    getOutboundSchema(schema, value.type) ??
    schema.outbounds[schema.default_outbound_type];
  if (!outboundSchema) {
    return { ...value };
  }
  return {
    type: outboundSchema.type,
    ...sanitizeFields(value, outboundSchema.fields, schema),
  };
}

export function sanitizeDnsServer(
  schema: ComposerSchema,
  value: JsonObject,
): JsonObject {
  const serverSchema =
    getDnsServerSchema(schema, value.type) ??
    (schema.dns?.default_server_type
      ? schema.dns.servers[schema.dns.default_server_type]
      : undefined);
  if (!serverSchema) {
    return { ...value };
  }
  return {
    type: serverSchema.type,
    ...sanitizeFields(value, serverSchema.fields, schema),
  };
}

export function sanitizeDnsRule(
  schema: ComposerSchema,
  value: JsonObject,
): JsonObject {
  const ruleSchema =
    getDnsRuleSchema(schema, value.type) ??
    (schema.dns?.default_rule_type
      ? schema.dns.rules[schema.dns.default_rule_type]
      : undefined);
  if (!ruleSchema) {
    return { ...value };
  }
  return {
    type: ruleSchema.type,
    ...sanitizeFields(value, ruleSchema.fields, schema),
  };
}

export function sanitizeInbound(
  schema: ComposerSchema,
  value: JsonObject,
): JsonObject {
  const inboundSchema =
    getInboundSchema(schema, value.type) ??
    (schema.default_inbound_type
      ? schema.inbounds?.[schema.default_inbound_type]
      : undefined);
  if (!inboundSchema) {
    return { ...value };
  }
  return {
    type: inboundSchema.type,
    ...sanitizeFields(value, inboundSchema.fields, schema),
  };
}

export function createTypedListItem(
  schema: ComposerSchema,
  field: SchemaField,
  type = getTypedListDefaultType(schema, field),
  seed?: JsonObject,
): JsonObject {
  const itemSchema =
    getTypedListSchemas(schema, field)[type] ??
    Object.values(getTypedListSchemas(schema, field))[0];
  return createTypedValue(schema, itemSchema, type, seed, "");
}

export function changeTypedListItemType(
  schema: ComposerSchema,
  field: SchemaField,
  current: JsonObject,
  type: string,
): JsonObject {
  return createTypedListItem(schema, field, type, {
    mode: current.mode,
    rules: current.rules,
  });
}

export function sanitizeTypedListItem(
  schema: ComposerSchema,
  field: SchemaField,
  value: JsonObject,
): JsonObject {
  const itemSchema =
    getTypedListItemSchema(schema, field, value.type) ??
    getTypedListSchemas(schema, field)[getTypedListDefaultType(schema, field)];
  if (!itemSchema) {
    return { ...value };
  }
  return {
    type: itemSchema.type,
    ...sanitizeFields(value, itemSchema.fields, schema),
  };
}

export function sanitizeFields(
  value: JsonObject,
  fields: SchemaField[],
  schemaRoot?: ComposerSchema,
): JsonObject {
  const output: JsonObject = {};
  for (const field of fields) {
    if (isFlattenedField(field)) {
      Object.assign(
        output,
        sanitizeFields(value, field.fields ?? [], schemaRoot),
      );
      continue;
    }
    if (!isFieldVisible(field, value)) {
      continue;
    }
    const raw = value[field.key];
    const normalized = normalizeFieldValue(raw, field, schemaRoot);
    if (normalized !== undefined && hasFieldContent(normalized, field)) {
      output[field.key] = normalized;
    }
  }
  return output;
}

export function defaultValueForField(field: SchemaField): unknown {
  if (field.defaultValue !== undefined) {
    return structuredClone(field.defaultValue);
  }
  if (field.required) {
    if (field.kind === "number") {
      return undefined;
    }
    if (field.kind === "json") {
      return structuredClone(field.defaultValue ?? null);
    }
    if (
      field.kind === "string" ||
      field.kind === "select" ||
      field.kind === "string-or-object"
    ) {
      return "";
    }
    if (
      field.kind === "string-list" ||
      field.kind === "number-list" ||
      field.kind === "typed-list" ||
      field.kind === "object-list"
    ) {
      return [];
    }
    if (field.kind === "object" || field.kind === "object-map") {
      return {};
    }
  }
  return undefined;
}

export function validateOutboundNode(
  schema: ComposerSchema,
  value: JsonObject,
): string[] {
  const outboundSchema = getOutboundSchema(schema, value.type);
  if (!outboundSchema) {
    return [`不支持的出站类型: ${String(value.type ?? "")}`];
  }
  return validateFields(value, outboundSchema.fields, schema);
}

export function validateDnsServer(
  schema: ComposerSchema,
  value: JsonObject,
): string[] {
  const serverSchema = getDnsServerSchema(schema, value.type);
  if (!serverSchema) {
    return [`不支持的 DNS 服务器类型: ${String(value.type ?? "")}`];
  }
  return validateFields(value, serverSchema.fields, schema);
}

export function validateDnsRule(
  schema: ComposerSchema,
  value: JsonObject,
): string[] {
  const ruleSchema = getDnsRuleSchema(schema, value.type);
  if (!ruleSchema) {
    return [`不支持的 DNS 规则类型: ${String(value.type ?? "")}`];
  }
  return validateFields(value, ruleSchema.fields, schema);
}

export function validateInbound(
  schema: ComposerSchema,
  value: JsonObject,
): string[] {
  const inboundSchema = getInboundSchema(schema, value.type);
  if (!inboundSchema) {
    return [`不支持的入站类型: ${String(value.type ?? "")}`];
  }
  return validateFields(value, inboundSchema.fields, schema);
}

export function validateTypedListItem(
  schema: ComposerSchema,
  field: SchemaField,
  value: JsonObject,
): string[] {
  const itemSchema = getTypedListItemSchema(schema, field, value.type);
  if (!itemSchema) {
    return [`不支持的子规则类型: ${String(value.type ?? "")}`];
  }
  return validateFields(value, itemSchema.fields, schema);
}

export function validateFields(
  value: JsonObject,
  fields: SchemaField[],
  schemaRoot?: ComposerSchema,
  prefix = "",
): string[] {
  const errors: string[] = [];
  for (const field of fields) {
    if (isFlattenedField(field)) {
      errors.push(
        ...validateFields(value, field.fields ?? [], schemaRoot, prefix),
      );
      continue;
    }
    if (!isFieldVisible(field, value)) {
      continue;
    }
    const label = `${prefix}${field.label}`;
    const raw = value[field.key];
    if (field.required && !hasFieldContent(raw, field)) {
      errors.push(`${label} 为必填`);
      continue;
    }
    if (!hasFieldContent(raw, field)) {
      continue;
    }
    if (field.kind === "number") {
      const number = asNumber(raw);
      if (number === undefined) {
        errors.push(`${label} 必须是数字`);
      } else {
        if (field.min !== undefined && number < field.min) {
          errors.push(`${label} 不能小于 ${field.min}`);
        }
        if (field.max !== undefined && number > field.max) {
          errors.push(`${label} 不能大于 ${field.max}`);
        }
      }
    }
    if (
      field.kind === "select" &&
      field.options &&
      !field.options.includes(String(raw))
    ) {
      errors.push(`${label} 的值不在允许范围内`);
    }
    if (
      (field.kind === "string-list" || field.kind === "number-list") &&
      field.allowedValues &&
      Array.isArray(raw)
    ) {
      for (const item of raw) {
        if (!field.allowedValues.includes(String(item))) {
          errors.push(`${label} 包含不支持的值: ${String(item)}`);
        }
      }
    }
    if (field.kind === "number-list" && Array.isArray(raw)) {
      for (const item of raw) {
        const number = asNumber(item);
        if (number === undefined) {
          errors.push(`${label} 必须只包含数字`);
          continue;
        }
        if (field.min !== undefined && number < field.min) {
          errors.push(`${label} 不能小于 ${field.min}`);
        }
        if (field.max !== undefined && number > field.max) {
          errors.push(`${label} 不能大于 ${field.max}`);
        }
      }
    }
    if (field.kind === "object" && isObject(raw)) {
      errors.push(
        ...validateFields(raw, field.fields ?? [], schemaRoot, `${label}.`),
      );
    }
    if (field.kind === "object-list") {
      if (!Array.isArray(raw)) {
        errors.push(`${label} 必须是列表`);
      } else {
        raw.forEach((item, index) => {
          if (!isObject(item)) {
            errors.push(`${label}.${index + 1} 必须是对象`);
            return;
          }
          errors.push(
            ...validateFields(
              item,
              field.fields ?? [],
              schemaRoot,
              `${label}.${index + 1}.`,
            ),
          );
        });
      }
    }
    if (field.kind === "object-map") {
      if (!isObject(raw)) {
        errors.push(`${label} 必须是对象`);
      } else {
        for (const [key, item] of Object.entries(raw)) {
          if (!isObject(item)) {
            errors.push(`${label}.${key} 必须是对象`);
            continue;
          }
          errors.push(
            ...validateFields(
              item,
              field.fields ?? [],
              schemaRoot,
              `${label}.${key}.`,
            ),
          );
        }
      }
    }
    if (field.kind === "string-or-object") {
      if (typeof raw === "string") {
        continue;
      }
      if (isObject(raw)) {
        errors.push(
          ...validateFields(raw, field.fields ?? [], schemaRoot, `${label}.`),
        );
      } else {
        errors.push(`${label} 必须是字符串或对象`);
      }
    }
    if (field.kind === "boolean-or-object") {
      if (typeof raw === "boolean") {
        continue;
      }
      if (isObject(raw)) {
        errors.push(
          ...validateFields(raw, field.fields ?? [], schemaRoot, `${label}.`),
        );
      } else {
        errors.push(`${label} 必须是布尔值或对象`);
      }
    }
    if (field.kind === "variant-object" && isObject(raw)) {
      const type = typeof raw.type === "string" ? raw.type : "";
      if (!type) {
        errors.push(`${label}.type 为必填`);
      } else if (!field.variantOptions?.includes(type)) {
        errors.push(`${label}.type 的值不在允许范围内`);
      } else {
        errors.push(
          ...validateFields(
            raw,
            field.variants?.[type] ?? [],
            schemaRoot,
            `${label}.`,
          ),
        );
      }
    }
    if (field.kind === "typed-list") {
      if (!Array.isArray(raw)) {
        errors.push(`${label} 必须是列表`);
      } else if (!schemaRoot) {
        errors.push(`${label} 缺少 schema`);
      } else {
        raw.forEach((item, index) => {
          if (!isObject(item)) {
            errors.push(`${label}.${index + 1} 必须是对象`);
            return;
          }
          errors.push(
            ...validateTypedListItem(schemaRoot, field, item).map(
              (error) => `${label}.${index + 1}.${error}`,
            ),
          );
        });
      }
    }
    if (field.kind === "json") {
      continue;
    }
  }
  return errors;
}

function normalizeFieldValue(
  raw: unknown,
  field: SchemaField,
  schemaRoot?: ComposerSchema,
): unknown {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  switch (field.kind) {
    case "string":
      return typeof raw === "string" ? raw : String(raw);
    case "select":
      if (field.valueType === "number") {
        return asNumber(raw);
      }
      return typeof raw === "string" ? raw : String(raw);
    case "number":
      return asNumber(raw);
    case "boolean":
      return raw === true ? true : undefined;
    case "string-list":
      return normalizeStringList(raw);
    case "number-list":
      return normalizeStringList(raw)
        .map((item) => Number(item))
        .filter(Number.isFinite);
    case "map":
      return normalizeMap(raw);
    case "object": {
      if (!isObject(raw)) {
        return undefined;
      }
      return sanitizeFields(raw, field.fields ?? [], schemaRoot);
    }
    case "object-list": {
      if (!Array.isArray(raw)) {
        return undefined;
      }
      const items = raw
        .filter(isObject)
        .map((item) => sanitizeFields(item, field.fields ?? [], schemaRoot));
      return items.length > 0 ? items : undefined;
    }
    case "object-map": {
      if (!isObject(raw)) {
        return undefined;
      }
      const output: JsonObject = {};
      for (const [key, item] of Object.entries(raw)) {
        const cleanKey = key.trim();
        if (!cleanKey || !isObject(item)) {
          continue;
        }
        const nested = sanitizeFields(item, field.fields ?? [], schemaRoot);
        if (Object.keys(nested).length > 0) {
          output[cleanKey] = nested;
        }
      }
      return Object.keys(output).length > 0 ? output : undefined;
    }
    case "variant-object": {
      if (!isObject(raw)) {
        return undefined;
      }
      const type =
        typeof raw.type === "string"
          ? raw.type
          : (field.variantOptions?.[0] ?? "");
      if (!field.variantOptions?.includes(type)) {
        return undefined;
      }
      const nested = sanitizeFields(
        raw,
        field.variants?.[type] ?? [],
        schemaRoot,
      );
      return { type, ...nested };
    }
    case "string-or-object": {
      if (typeof raw === "string") {
        const trimmed = raw.trim();
        return trimmed || undefined;
      }
      if (!isObject(raw)) {
        return undefined;
      }
      return sanitizeFields(raw, field.fields ?? [], schemaRoot);
    }
    case "boolean-or-object": {
      if (raw === true) {
        return true;
      }
      if (!isObject(raw)) {
        return undefined;
      }
      return sanitizeFields(raw, field.fields ?? [], schemaRoot);
    }
    case "typed-list": {
      if (!Array.isArray(raw) || !schemaRoot) {
        return undefined;
      }
      const items = raw
        .filter(isObject)
        .map((item) => sanitizeTypedListItem(schemaRoot, field, item));
      return items.length > 0 ? items : undefined;
    }
    case "json":
      return raw;
    default:
      return undefined;
  }
}

export function isFieldVisible(field: SchemaField, value: JsonObject): boolean {
  return (field.visibleWhen ?? []).every((condition) =>
    conditionMatches(value, condition),
  );
}

function conditionMatches(
  value: JsonObject,
  condition: FieldCondition,
): boolean {
  const raw = value[condition.key];
  switch (condition.op) {
    case "empty":
      return !hasAnyContent(raw);
    case "present":
      return hasAnyContent(raw);
    case "equals":
      return looseEqual(raw, condition.value);
    case "not-equals":
      return !looseEqual(raw, condition.value);
    case "one-of":
      return (condition.values ?? []).some((item) => looseEqual(raw, item));
    case "not-one-of":
      return !(condition.values ?? []).some((item) => looseEqual(raw, item));
    default:
      return true;
  }
}

function looseEqual(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true;
  }
  if (
    (typeof left === "number" || typeof left === "string") &&
    (typeof right === "number" || typeof right === "string")
  ) {
    return String(left) === String(right);
  }
  return false;
}

function hasAnyContent(value: unknown): boolean {
  if (value === undefined || value === null) {
    return false;
  }
  if (typeof value === "string") {
    return value.trim() !== "";
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (isObject(value)) {
    return true;
  }
  return true;
}

function hasFieldContent(value: unknown, field: SchemaField): boolean {
  if (value === undefined || value === null) {
    return false;
  }
  if (field.kind === "boolean") {
    return value === true;
  }
  if (field.kind === "number") {
    return asNumber(value) !== undefined;
  }
  if (field.kind === "string" || field.kind === "select") {
    return typeof value === "string" ? value.trim() !== "" : true;
  }
  if (
    field.kind === "string-list" ||
    field.kind === "number-list" ||
    field.kind === "typed-list" ||
    field.kind === "object-list"
  ) {
    return Array.isArray(value) && value.length > 0;
  }
  if (field.kind === "map" || field.kind === "object-map") {
    return isObject(value) && Object.keys(value).length > 0;
  }
  if (field.kind === "object" || field.kind === "variant-object") {
    return isObject(value);
  }
  if (field.kind === "string-or-object") {
    return typeof value === "string" ? value.trim() !== "" : isObject(value);
  }
  if (field.kind === "boolean-or-object") {
    return value === true || isObject(value);
  }
  if (field.kind === "json") {
    return value !== null && value !== undefined;
  }
  return true;
}

export function isFlattenedField(field: SchemaField): boolean {
  return field.flatten === true || field.key === "_dialer";
}

function normalizeStringList(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof raw === "string") {
    return raw
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeMap(raw: unknown): JsonObject | undefined {
  if (!isObject(raw)) {
    return undefined;
  }
  const output: JsonObject = {};
  for (const [key, value] of Object.entries(raw)) {
    const cleanKey = key.trim();
    if (!cleanKey) {
      continue;
    }
    if (Array.isArray(value)) {
      const list = value.map((item) => String(item).trim()).filter(Boolean);
      if (list.length > 0) {
        output[cleanKey] = list;
      }
    } else if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
    ) {
      output[cleanKey] = String(value);
    }
  }
  return Object.keys(output).length > 0 ? output : undefined;
}

function asNumber(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw;
  }
  if (typeof raw === "string" && raw.trim() !== "") {
    const number = Number(raw);
    return Number.isFinite(number) ? number : undefined;
  }
  return undefined;
}

function isObject(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
