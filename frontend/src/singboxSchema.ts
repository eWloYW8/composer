export type JsonObject = Record<string, unknown>;

export type FieldKind =
  | "string"
  | "number"
  | "boolean"
  | "select"
  | "string-or-number"
  | "string-list"
  | "number-list"
  | "string-or-number-list"
  | "map"
  | "object"
  | "object-list"
  | "object-map"
  | "variant-object"
  | "string-or-object"
  | "string-or-object-list"
  | "number-or-object"
  | "boolean-or-object"
  | "typed-list"
  | "json"
  | "constraint";

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
  valueType?: "string" | "number" | "string-list";
  allowedValues?: string[];
  min?: number | null;
  max?: number | null;
  minLength?: number | null;
  maxLength?: number | null;
  pattern?: string | null;
  integer?: boolean;
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
  requiresAny?: string[];
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
  default_endpoint_type?: string;
  endpoints?: Record<string, OutboundSchema>;
  endpoint_type_options?: OutboundTypeOption[];
  http_client?: ObjectSchema;
  certificate?: ObjectSchema;
  default_certificate_provider_type?: string;
  certificate_providers?: Record<string, OutboundSchema>;
  certificate_provider_type_options?: OutboundTypeOption[];
  default_service_type?: string;
  services?: Record<string, OutboundSchema>;
  service_type_options?: OutboundTypeOption[];
  global?: GlobalSchema;
  dns?: DnsSchema;
  route?: RouteSchema;
};

export type GlobalSchema = {
  log: ObjectSchema;
  ntp: ObjectSchema;
  experimental: ObjectSchema;
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

export type RouteSchema = {
  options: ObjectSchema;
  default_rule_type: string;
  rules: Record<string, OutboundSchema>;
  rule_type_options?: OutboundTypeOption[];
  default_nested_rule_type?: string;
  nested_rules?: Record<string, OutboundSchema>;
  nested_rule_type_options?: OutboundTypeOption[];
  default_rule_set_type?: string;
  rule_sets?: Record<string, OutboundSchema>;
  rule_set_type_options?: OutboundTypeOption[];
  default_headless_rule_type?: string;
  headless_rules?: Record<string, OutboundSchema>;
  headless_rule_type_options?: OutboundTypeOption[];
};

export const EMPTY_COMPOSER_SCHEMA: ComposerSchema = {
  schema_version: 1,
  default_outbound_type: "",
  outbounds: {},
  outbound_type_options: [],
  default_inbound_type: "",
  inbounds: {},
  inbound_type_options: [],
  default_endpoint_type: "",
  endpoints: {},
  endpoint_type_options: [],
  http_client: { fields: [] },
  certificate: { fields: [] },
  default_certificate_provider_type: "",
  certificate_providers: {},
  certificate_provider_type_options: [],
  default_service_type: "",
  services: {},
  service_type_options: [],
  global: {
    log: { fields: [] },
    ntp: { fields: [] },
    experimental: { fields: [] },
  },
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
  route: {
    options: { fields: [] },
    default_rule_type: "",
    rules: {},
    rule_type_options: [],
    default_nested_rule_type: "",
    nested_rules: {},
    nested_rule_type_options: [],
    default_rule_set_type: "",
    rule_sets: {},
    rule_set_type_options: [],
    default_headless_rule_type: "",
    headless_rules: {},
    headless_rule_type_options: [],
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
  const endpoints = schema.endpoints ?? {};
  const endpointOptions =
    schema.endpoint_type_options ??
    Object.values(endpoints).map((endpoint) => ({
      value: endpoint.type,
      label: endpoint.label,
    }));
  const defaultEndpointType =
    schema.default_endpoint_type && endpoints[schema.default_endpoint_type]
      ? schema.default_endpoint_type
      : (endpointOptions[0]?.value ?? "");
  const certificateProviders = schema.certificate_providers ?? {};
  const certificateProviderOptions =
    schema.certificate_provider_type_options ??
    Object.values(certificateProviders).map((provider) => ({
      value: provider.type,
      label: provider.label,
    }));
  const defaultCertificateProviderType =
    schema.default_certificate_provider_type &&
    certificateProviders[schema.default_certificate_provider_type]
      ? schema.default_certificate_provider_type
      : (certificateProviderOptions[0]?.value ?? "");
  const services = schema.services ?? {};
  const serviceOptions =
    schema.service_type_options ??
    Object.values(services).map((service) => ({
      value: service.type,
      label: service.label,
    }));
  const defaultServiceType =
    schema.default_service_type && services[schema.default_service_type]
      ? schema.default_service_type
      : (serviceOptions[0]?.value ?? "");
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
    default_endpoint_type: defaultEndpointType,
    endpoints,
    endpoint_type_options: endpointOptions.filter(
      (option) => endpoints[option.value],
    ),
    http_client: schema.http_client ?? { fields: [] },
    certificate: schema.certificate ?? { fields: [] },
    default_certificate_provider_type: defaultCertificateProviderType,
    certificate_providers: certificateProviders,
    certificate_provider_type_options: certificateProviderOptions.filter(
      (option) => certificateProviders[option.value],
    ),
    default_service_type: defaultServiceType,
    services,
    service_type_options: serviceOptions.filter(
      (option) => services[option.value],
    ),
    global: normalizeGlobalSchema(schema.global),
    dns: normalizeDnsSchema(schema.dns),
    route: normalizeRouteSchema(schema.route),
  };
}

function normalizeGlobalSchema(schema: GlobalSchema | undefined): GlobalSchema {
  return {
    log: schema?.log ?? { fields: [] },
    ntp: schema?.ntp ?? { fields: [] },
    experimental: schema?.experimental ?? { fields: [] },
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

function normalizeRouteSchema(schema: RouteSchema | undefined): RouteSchema {
  const rules = schema?.rules ?? {};
  const nestedRules = schema?.nested_rules ?? {};
  const ruleSets = schema?.rule_sets ?? {};
  const headlessRules = schema?.headless_rules ?? {};
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
  const ruleSetOptions =
    schema?.rule_set_type_options ??
    Object.values(ruleSets).map((ruleSet) => ({
      value: ruleSet.type,
      label: ruleSet.label,
    }));
  const headlessRuleOptions =
    schema?.headless_rule_type_options ??
    Object.values(headlessRules).map((rule) => ({
      value: rule.type,
      label: rule.label,
    }));
  const defaultRuleType =
    schema?.default_rule_type && rules[schema.default_rule_type]
      ? schema.default_rule_type
      : (ruleOptions[0]?.value ?? "");
  const defaultNestedRuleType =
    schema?.default_nested_rule_type &&
    nestedRules[schema.default_nested_rule_type]
      ? schema.default_nested_rule_type
      : (nestedRuleOptions[0]?.value ?? "");
  const defaultRuleSetType =
    schema?.default_rule_set_type && ruleSets[schema.default_rule_set_type]
      ? schema.default_rule_set_type
      : (ruleSetOptions[0]?.value ?? "");
  const defaultHeadlessRuleType =
    schema?.default_headless_rule_type &&
    headlessRules[schema.default_headless_rule_type]
      ? schema.default_headless_rule_type
      : (headlessRuleOptions[0]?.value ?? "");
  return {
    options: schema?.options ?? { fields: [] },
    default_rule_type: defaultRuleType,
    rules,
    rule_type_options: ruleOptions.filter((option) => rules[option.value]),
    default_nested_rule_type: defaultNestedRuleType,
    nested_rules: nestedRules,
    nested_rule_type_options: nestedRuleOptions.filter(
      (option) => nestedRules[option.value],
    ),
    default_rule_set_type: defaultRuleSetType,
    rule_sets: ruleSets,
    rule_set_type_options: ruleSetOptions.filter(
      (option) => ruleSets[option.value],
    ),
    default_headless_rule_type: defaultHeadlessRuleType,
    headless_rules: headlessRules,
    headless_rule_type_options: headlessRuleOptions.filter(
      (option) => headlessRules[option.value],
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

export function getEndpointTypeOptions(
  schema: ComposerSchema,
): OutboundTypeOption[] {
  return schema.endpoint_type_options ?? [];
}

export function getEndpointSchema(
  schema: ComposerSchema,
  type: unknown,
): OutboundSchema | null {
  return typeof type === "string" ? (schema.endpoints?.[type] ?? null) : null;
}

export function getCertificateProviderTypeOptions(
  schema: ComposerSchema,
): OutboundTypeOption[] {
  return schema.certificate_provider_type_options ?? [];
}

export function getCertificateProviderSchema(
  schema: ComposerSchema,
  type: unknown,
): OutboundSchema | null {
  return typeof type === "string"
    ? (schema.certificate_providers?.[type] ?? null)
    : null;
}

export function getServiceTypeOptions(
  schema: ComposerSchema,
): OutboundTypeOption[] {
  return schema.service_type_options ?? [];
}

export function getServiceSchema(
  schema: ComposerSchema,
  type: unknown,
): OutboundSchema | null {
  return typeof type === "string" ? (schema.services?.[type] ?? null) : null;
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

export function getRouteRuleTypeOptions(
  schema: ComposerSchema,
): OutboundTypeOption[] {
  return schema.route?.rule_type_options ?? [];
}

export function getRouteRuleSchema(
  schema: ComposerSchema,
  type: unknown,
): OutboundSchema | null {
  return typeof type === "string" ? (schema.route?.rules[type] ?? null) : null;
}

export function getRouteRuleSetTypeOptions(
  schema: ComposerSchema,
): OutboundTypeOption[] {
  return schema.route?.rule_set_type_options ?? [];
}

export function getRouteRuleSetSchema(
  schema: ComposerSchema,
  type: unknown,
): OutboundSchema | null {
  return typeof type === "string"
    ? (schema.route?.rule_sets?.[type] ?? null)
    : null;
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
  if (field.schemaNamespace === "route.rules") {
    return schema.route?.rules ?? {};
  }
  if (field.schemaNamespace === "route.nested_rules") {
    return schema.route?.nested_rules ?? {};
  }
  if (field.schemaNamespace === "route.rule_sets") {
    return schema.route?.rule_sets ?? {};
  }
  if (field.schemaNamespace === "route.headless_rules") {
    return schema.route?.headless_rules ?? {};
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
  if (field.schemaNamespace === "route.rules") {
    return schema.route?.rule_type_options ?? [];
  }
  if (field.schemaNamespace === "route.nested_rules") {
    return schema.route?.nested_rule_type_options ?? [];
  }
  if (field.schemaNamespace === "route.rule_sets") {
    return schema.route?.rule_set_type_options ?? [];
  }
  if (field.schemaNamespace === "route.headless_rules") {
    return schema.route?.headless_rule_type_options ?? [];
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
  if (
    field.schemaNamespace === "route.rules" &&
    schema.route?.default_rule_type &&
    schemas[schema.route.default_rule_type]
  ) {
    return schema.route.default_rule_type;
  }
  if (
    field.schemaNamespace === "route.nested_rules" &&
    schema.route?.default_nested_rule_type &&
    schemas[schema.route.default_nested_rule_type]
  ) {
    return schema.route.default_nested_rule_type;
  }
  if (
    field.schemaNamespace === "route.rule_sets" &&
    schema.route?.default_rule_set_type &&
    schemas[schema.route.default_rule_set_type]
  ) {
    return schema.route.default_rule_set_type;
  }
  if (
    field.schemaNamespace === "route.headless_rules" &&
    schema.route?.default_headless_rule_type &&
    schemas[schema.route.default_headless_rule_type]
  ) {
    return schema.route.default_headless_rule_type;
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

export function createRouteRule(
  schema: ComposerSchema,
  type: string,
  seed?: JsonObject,
): JsonObject {
  const route = schema.route;
  const ruleSchema =
    route?.rules[type] ??
    (route?.default_rule_type ? route.rules[route.default_rule_type] : null) ??
    Object.values(route?.rules ?? {})[0];
  return createTypedValue(schema, ruleSchema, type, seed, "");
}

export function createRouteRuleSet(
  schema: ComposerSchema,
  type: string,
  seed?: JsonObject,
): JsonObject {
  const route = schema.route;
  const ruleSetSchema =
    route?.rule_sets?.[type] ??
    (route?.default_rule_set_type
      ? route.rule_sets?.[route.default_rule_set_type]
      : null) ??
    Object.values(route?.rule_sets ?? {})[0];
  return createTypedValue(schema, ruleSetSchema, type, seed, "rule-set-1");
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

export function createEndpoint(
  schema: ComposerSchema,
  type: string,
  seed?: JsonObject,
): JsonObject {
  const endpointSchema =
    schema.endpoints?.[type] ??
    (schema.default_endpoint_type
      ? schema.endpoints?.[schema.default_endpoint_type]
      : null) ??
    Object.values(schema.endpoints ?? {})[0];
  return createTypedValue(schema, endpointSchema, type, seed, "endpoint-1");
}

export function createCertificateProvider(
  schema: ComposerSchema,
  type: string,
  seed?: JsonObject,
): JsonObject {
  const providerSchema =
    schema.certificate_providers?.[type] ??
    (schema.default_certificate_provider_type
      ? schema.certificate_providers?.[schema.default_certificate_provider_type]
      : null) ??
    Object.values(schema.certificate_providers ?? {})[0];
  return createTypedValue(
    schema,
    providerSchema,
    type,
    seed,
    "certificate-provider-1",
  );
}

export function createService(
  schema: ComposerSchema,
  type: string,
  seed?: JsonObject,
): JsonObject {
  const serviceSchema =
    schema.services?.[type] ??
    (schema.default_service_type
      ? schema.services?.[schema.default_service_type]
      : null) ??
    Object.values(schema.services ?? {})[0];
  return createTypedValue(schema, serviceSchema, type, seed, "service-1");
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

export function changeRouteRuleType(
  schema: ComposerSchema,
  current: JsonObject,
  type: string,
): JsonObject {
  return createRouteRule(schema, type, {
    label: current.label,
    mode: current.mode,
    rules: current.rules,
    action: current.action,
    outbound: current.outbound,
    server: current.server,
  });
}

export function changeRouteRuleSetType(
  schema: ComposerSchema,
  current: JsonObject,
  type: string,
): JsonObject {
  return createRouteRuleSet(schema, type, {
    tag: current.tag,
    format: current.format,
    path: current.path,
    url: current.url,
    rules: current.rules,
    http_client: current.http_client,
    update_interval: current.update_interval,
    download_detour: current.download_detour,
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

export function changeEndpointType(
  schema: ComposerSchema,
  current: JsonObject,
  type: string,
): JsonObject {
  return createEndpoint(schema, type, {
    tag: current.tag,
    name: current.name,
    address: current.address,
    private_key: current.private_key,
    peers: current.peers,
    auth_key: current.auth_key,
    control_url: current.control_url,
  });
}

export function changeCertificateProviderType(
  schema: ComposerSchema,
  current: JsonObject,
  type: string,
): JsonObject {
  return createCertificateProvider(schema, type, {
    tag: current.tag,
    domain: current.domain,
    data_directory: current.data_directory,
    endpoint: current.endpoint,
    http_client: current.http_client,
  });
}

export function changeServiceType(
  schema: ComposerSchema,
  current: JsonObject,
  type: string,
): JsonObject {
  return createService(schema, type, {
    tag: current.tag,
    listen: current.listen,
    listen_port: current.listen_port,
    tls: current.tls,
    users: current.users,
    servers: current.servers,
    config_path: current.config_path,
  });
}

export function sanitizeOutboundNode(
  schema: ComposerSchema,
  value: JsonObject,
): JsonObject {
  const outboundSchema = getOutboundSchema(schema, value.type);
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
  const serverSchema = getDnsServerSchema(schema, value.type);
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
  const ruleSchema = getDnsRuleSchema(schema, value.type);
  if (!ruleSchema) {
    return { ...value };
  }
  return {
    type: ruleSchema.type,
    ...sanitizeFields(value, ruleSchema.fields, schema),
  };
}

export function sanitizeRouteRule(
  schema: ComposerSchema,
  value: JsonObject,
): JsonObject {
  const ruleSchema = getRouteRuleSchema(schema, value.type);
  if (!ruleSchema) {
    return { ...value };
  }
  return {
    type: ruleSchema.type,
    ...sanitizeFields(value, ruleSchema.fields, schema),
  };
}

export function sanitizeRouteRuleSet(
  schema: ComposerSchema,
  value: JsonObject,
): JsonObject {
  const ruleSetSchema = getRouteRuleSetSchema(schema, value.type);
  if (!ruleSetSchema) {
    return { ...value };
  }
  return {
    type: ruleSetSchema.type,
    ...sanitizeFields(value, ruleSetSchema.fields, schema),
  };
}

export function sanitizeInbound(
  schema: ComposerSchema,
  value: JsonObject,
): JsonObject {
  const inboundSchema = getInboundSchema(schema, value.type);
  if (!inboundSchema) {
    return { ...value };
  }
  return {
    type: inboundSchema.type,
    ...sanitizeFields(value, inboundSchema.fields, schema),
  };
}

export function sanitizeEndpoint(
  schema: ComposerSchema,
  value: JsonObject,
): JsonObject {
  const endpointSchema = getEndpointSchema(schema, value.type);
  if (!endpointSchema) {
    return { ...value };
  }
  return {
    type: endpointSchema.type,
    ...sanitizeFields(value, endpointSchema.fields, schema),
  };
}

export function sanitizeCertificateProvider(
  schema: ComposerSchema,
  value: JsonObject,
): JsonObject {
  const providerSchema = getCertificateProviderSchema(schema, value.type);
  if (!providerSchema) {
    return { ...value };
  }
  return {
    type: providerSchema.type,
    ...sanitizeFields(value, providerSchema.fields, schema),
  };
}

export function sanitizeService(
  schema: ComposerSchema,
  value: JsonObject,
): JsonObject {
  const serviceSchema = getServiceSchema(schema, value.type);
  if (!serviceSchema) {
    return { ...value };
  }
  return {
    type: serviceSchema.type,
    ...sanitizeFields(value, serviceSchema.fields, schema),
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
    action: current.action,
    outbound: current.outbound,
    server: current.server,
  });
}

export function sanitizeTypedListItem(
  schema: ComposerSchema,
  field: SchemaField,
  value: JsonObject,
): JsonObject {
  const itemSchema = getTypedListItemSchema(schema, field, value.type);
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
  const knownKeys = schemaFieldKeySet(fields);
  for (const [key, raw] of Object.entries(value)) {
    if (!knownKeys.has(key)) {
      output[key] = raw;
    }
  }
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
    } else if (shouldPreserveRawFieldValue(raw)) {
      output[field.key] = raw;
    }
  }
  return output;
}

function schemaFieldKeySet(fields: SchemaField[]): Set<string> {
  const keys = new Set<string>();
  for (const field of fields) {
    if (field.kind === "constraint") {
      continue;
    }
    if (isFlattenedField(field)) {
      for (const key of schemaFieldKeySet(field.fields ?? [])) {
        keys.add(key);
      }
      continue;
    }
    keys.add(field.key);
  }
  return keys;
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
      field.kind === "string-or-number-list" ||
      field.kind === "string-or-object-list" ||
      field.kind === "typed-list" ||
      field.kind === "object-list"
    ) {
      return [];
    }
    if (
      field.kind === "object" ||
      field.kind === "object-map" ||
      field.kind === "number-or-object"
    ) {
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
    return [];
  }
  return validateFields(value, outboundSchema.fields, schema);
}

export function validateDnsServer(
  schema: ComposerSchema,
  value: JsonObject,
): string[] {
  const serverSchema = getDnsServerSchema(schema, value.type);
  if (!serverSchema) {
    return [];
  }
  return validateFields(value, serverSchema.fields, schema);
}

export function validateDnsRule(
  schema: ComposerSchema,
  value: JsonObject,
): string[] {
  const ruleSchema = getDnsRuleSchema(schema, value.type);
  if (!ruleSchema) {
    return [];
  }
  return validateFields(value, ruleSchema.fields, schema);
}

export function validateRouteRule(
  schema: ComposerSchema,
  value: JsonObject,
): string[] {
  const ruleSchema = getRouteRuleSchema(schema, value.type);
  if (!ruleSchema) {
    return [];
  }
  return validateFields(value, ruleSchema.fields, schema);
}

export function validateRouteRuleSet(
  schema: ComposerSchema,
  value: JsonObject,
): string[] {
  const ruleSetSchema = getRouteRuleSetSchema(schema, value.type);
  if (!ruleSetSchema) {
    return [];
  }
  return validateFields(value, ruleSetSchema.fields, schema);
}

export function validateInbound(
  schema: ComposerSchema,
  value: JsonObject,
): string[] {
  const inboundSchema = getInboundSchema(schema, value.type);
  if (!inboundSchema) {
    return [];
  }
  return validateFields(value, inboundSchema.fields, schema);
}

export function validateEndpoint(
  schema: ComposerSchema,
  value: JsonObject,
): string[] {
  const endpointSchema = getEndpointSchema(schema, value.type);
  if (!endpointSchema) {
    return [];
  }
  return validateFields(value, endpointSchema.fields, schema);
}

export function validateCertificateProvider(
  schema: ComposerSchema,
  value: JsonObject,
): string[] {
  const providerSchema = getCertificateProviderSchema(schema, value.type);
  if (!providerSchema) {
    return [];
  }
  return validateFields(value, providerSchema.fields, schema);
}

export function validateService(
  schema: ComposerSchema,
  value: JsonObject,
): string[] {
  const serviceSchema = getServiceSchema(schema, value.type);
  if (!serviceSchema) {
    return [];
  }
  return validateFields(value, serviceSchema.fields, schema);
}

export function validateTypedListItem(
  schema: ComposerSchema,
  field: SchemaField,
  value: JsonObject,
): string[] {
  const itemSchema = getTypedListItemSchema(schema, field, value.type);
  if (!itemSchema) {
    return [];
  }
  return validateFields(value, itemSchema.fields, schema);
}

export function validateFields(
  value: JsonObject,
  fields: SchemaField[],
  schemaRoot?: ComposerSchema,
  prefix = "",
): string[] {
  void value;
  void fields;
  void schemaRoot;
  void prefix;
  return [];
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
    case "string-or-number":
      return parseStringOrNumberScalar(raw);
    case "boolean":
      return typeof raw === "boolean" ? raw : undefined;
    case "string-list":
      return normalizeStringList(raw);
    case "number-list":
      return normalizeNumberList(raw)
        .filter(Number.isFinite);
    case "string-or-number-list":
      return normalizeStringOrNumberList(raw);
    case "map":
      return normalizeMap(raw, field.valueType);
    case "object": {
      if (!isObject(raw)) {
        return undefined;
      }
      return sanitizeFields(raw, field.fields ?? [], schemaRoot);
    }
    case "object-list": {
      const rawItems = isObject(raw) ? [raw] : raw;
      if (!Array.isArray(rawItems)) {
        return undefined;
      }
      const items = rawItems
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
        return raw;
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
    case "string-or-object-list": {
      if (typeof raw === "string") {
        const trimmed = raw.trim();
        return trimmed || undefined;
      }
      if (isObject(raw)) {
        return sanitizeFields(raw, field.fields ?? [], schemaRoot);
      }
      if (!Array.isArray(raw)) {
        return undefined;
      }
      const items = raw
        .map((item) => {
          if (typeof item === "string") {
            const trimmed = item.trim();
            return trimmed || undefined;
          }
          if (isObject(item)) {
            return sanitizeFields(item, field.fields ?? [], schemaRoot);
          }
          return undefined;
        })
        .filter((item): item is string | JsonObject => item !== undefined);
      return items.length > 0 ? items : undefined;
    }
    case "number-or-object": {
      const number = asNumber(raw);
      if (number !== undefined) {
        return number;
      }
      if (!isObject(raw)) {
        return undefined;
      }
      return sanitizeFields(raw, field.fields ?? [], schemaRoot);
    }
    case "boolean-or-object": {
      if (typeof raw === "boolean") {
        return raw;
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
    case "constraint":
      return undefined;
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
  const raw = getConditionValue(value, condition.key);
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

function getConditionValue(value: JsonObject, key: string): unknown {
  let current: unknown = value;
  for (const segment of key.split(".")) {
    if (!isObject(current)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
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

function shouldPreserveRawFieldValue(value: unknown): boolean {
  return hasAnyContent(value);
}

function hasFieldContent(value: unknown, field: SchemaField): boolean {
  if (value === undefined || value === null) {
    return false;
  }
  if (field.kind === "boolean") {
    return typeof value === "boolean";
  }
  if (field.kind === "number") {
    return asNumber(value) !== undefined;
  }
  if (field.kind === "string" || field.kind === "select") {
    return typeof value === "string" ? value.trim() !== "" : true;
  }
  if (field.kind === "string-or-number") {
    return typeof value === "string"
      ? value.trim() !== ""
      : asNumber(value) !== undefined;
  }
  if (field.kind === "string-list") {
    return Array.isArray(value)
      ? value.length > 0
      : typeof value === "string" && value.trim() !== "";
  }
  if (field.kind === "number-list") {
    return Array.isArray(value) ? value.length > 0 : asNumber(value) !== undefined;
  }
  if (field.kind === "string-or-number-list") {
    return Array.isArray(value)
      ? value.length > 0
      : typeof value === "string"
        ? value.trim() !== ""
        : asNumber(value) !== undefined;
  }
  if (field.kind === "typed-list") {
    return Array.isArray(value) && value.length > 0;
  }
  if (field.kind === "object-list") {
    return Array.isArray(value) ? value.length > 0 : isObject(value);
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
  if (field.kind === "string-or-object-list") {
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    return typeof value === "string" ? value.trim() !== "" : isObject(value);
  }
  if (field.kind === "number-or-object") {
    return asNumber(value) !== undefined || isObject(value);
  }
  if (field.kind === "boolean-or-object") {
    return typeof value === "boolean" || isObject(value);
  }
  if (field.kind === "json") {
    return value !== null && value !== undefined;
  }
  if (field.kind === "constraint") {
    return false;
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

function normalizeNumberList(raw: unknown): number[] {
  if (Array.isArray(raw)) {
    return raw.map(asNumber).filter((item): item is number => item !== undefined);
  }
  const scalar = asNumber(raw);
  if (scalar !== undefined) {
    return [scalar];
  }
  return normalizeStringList(raw)
    .map(Number)
    .filter(Number.isFinite);
}

function normalizeStringOrNumberList(raw: unknown): Array<string | number> {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return [raw];
  }
  if (Array.isArray(raw)) {
    return raw
      .map((item) => parseStringOrNumberScalar(item))
      .filter((item): item is string | number => item !== undefined);
  }
  return normalizeStringList(raw).map((item) => {
    const number = Number(item);
    return Number.isInteger(number) && String(number) === item ? number : item;
  });
}

function parseStringOrNumberScalar(raw: unknown): string | number | undefined {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw;
  }
  if (typeof raw !== "string") {
    return undefined;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }
  const number = Number(trimmed);
  return Number.isInteger(number) && String(number) === trimmed
    ? number
    : trimmed;
}

function normalizeMap(
  raw: unknown,
  valueType?: SchemaField["valueType"],
): JsonObject | undefined {
  if (!isObject(raw)) {
    return undefined;
  }
  const output: JsonObject = {};
  for (const [key, value] of Object.entries(raw)) {
    const cleanKey = key.trim();
    if (!cleanKey) {
      continue;
    }
    if (valueType === "number") {
      const number = asNumber(value);
      if (number !== undefined) {
        output[cleanKey] = number;
      }
    } else if (valueType === "string") {
      if (
        !Array.isArray(value) &&
        !isObject(value) &&
        value !== undefined &&
        value !== null &&
        String(value).trim() !== ""
      ) {
        output[cleanKey] = String(value);
      }
    } else if (valueType === "string-list") {
      const list = normalizeStringList(value);
      if (list.length > 0) {
        output[cleanKey] = list;
      }
    } else if (Array.isArray(value)) {
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

function isStringListValue(value: unknown): boolean {
  if (typeof value === "string") {
    return value.trim() !== "";
  }
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === "string" && item.trim() !== "")
  );
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
