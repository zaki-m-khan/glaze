import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { SuiteError } from "./errors";

const severity = z.enum(["error", "warn"]).default("error");
const base = { field: z.string().min(1), name: z.string().optional(), severity };

export const checkSchema = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("required") }),
  z.object({ ...base, type: z.literal("type"), is: z.enum(["string", "number", "boolean", "array", "object"]) }),
  z.object({
    ...base,
    type: z.literal("enum"),
    values: z.array(z.string()).min(1),
    caseInsensitive: z.boolean().default(false),
  }),
  z.object({ ...base, type: z.literal("regex"), pattern: z.string(), flags: z.string().optional() }),
  z.object({
    ...base,
    type: z.literal("range"),
    parse: z.enum(["number", "money"]).default("number"),
    min: z.number().optional(),
    max: z.number().optional(),
    exclusiveMin: z.boolean().default(false),
  }),
  z.object({
    ...base,
    type: z.literal("date"),
    notFuture: z.boolean().default(true),
    notBefore: z.string().optional(),
  }),
  z.object({
    ...base,
    type: z.literal("custom"),
    fn: z.string(),
    args: z.record(z.string(), z.unknown()).default({}),
  }),
]);
export type Check = z.infer<typeof checkSchema>;

export const truthKinds = ["html-signatures", "tranco", "none"] as const;
export type TruthKind = (typeof truthKinds)[number];

const judgeSchema = z.object({
  field: z.string(),
  rubric: z.string().min(10),
  passScore: z.number().int().min(1).max(5).default(4),
});
export type JudgeSpec = z.infer<typeof judgeSchema>;

export const suiteSchema = z.object({
  name: z.string().regex(/^[a-z0-9-]+$/, "suite names are kebab-case"),
  title: z.string(),
  description: z.string().default(""),
  function: z.object({ name: z.string(), routineId: z.string().min(1) }),
  /** Path (relative to the suite file) of a company list. */
  rows: z.string(),
  /** Input name → literal value, or `$field` to read from the company row. */
  inputs: z.record(z.string(), z.string()),
  estimate: z.object({ creditsPerRow: z.number().nonnegative(), actionsPerRow: z.number().nonnegative() }),
  checks: z.array(checkSchema).default([]),
  judge: z.array(judgeSchema).default([]),
  truth: z.enum(truthKinds).default("none"),
  /** Field holding the value compared against ground truth. */
  truthField: z.string().optional(),
  targets: z.object({ coverage: z.number().min(0).max(1), accuracy: z.number().min(-1).max(1) }),
  regressions: z
    .object({
      coverageDrop: z.number().nonnegative().default(0.05),
      accuracyDrop: z.number().nonnegative().default(0.05),
      costIncrease: z.number().nonnegative().default(0.1),
    })
    .default({ coverageDrop: 0.05, accuracyDrop: 0.05, costIncrease: 0.1 }),
});
export type SuiteSpec = z.infer<typeof suiteSchema>;

export const companySchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  domain: z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, "bare lowercase domain, no scheme"),
});
export type Company = z.infer<typeof companySchema>;

export const companyListSchema = z.object({
  name: z.string(),
  description: z.string().default(""),
  companies: z.array(companySchema).min(1),
});

export interface SuiteRow {
  id: string;
  label: string;
  domain: string;
  inputs: Record<string, string>;
}

export interface Suite extends SuiteSpec {
  file: string;
  rowList: SuiteRow[];
}

function readStructured(file: string): unknown {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    throw new SuiteError(`Cannot read ${file}`);
  }
  try {
    return file.endsWith(".json") ? JSON.parse(text) : parseYaml(text);
  } catch (error) {
    throw new SuiteError(`${file} is not valid ${file.endsWith(".json") ? "JSON" : "YAML"}: ${String(error)}`);
  }
}

function validate<T>(schema: z.ZodType<T>, data: unknown, file: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
    throw new SuiteError(`${file} is invalid:\n${issues}`);
  }
  return result.data;
}

export function buildInputs(template: Record<string, string>, company: Company): Record<string, string> {
  const inputs: Record<string, string> = {};
  for (const [key, value] of Object.entries(template)) {
    if (!value.startsWith("$")) {
      inputs[key] = value;
      continue;
    }
    const field = value.slice(1);
    if (!(field in company)) throw new SuiteError(`Input "${key}" references unknown company field ${value}`);
    inputs[key] = company[field as keyof Company];
  }
  return inputs;
}

export function loadCompanies(file: string): Company[] {
  const list = validate(companyListSchema, readStructured(file), file);
  const seen = new Set<string>();
  for (const c of list.companies) {
    if (seen.has(c.id)) throw new SuiteError(`${file}: duplicate company id ${c.id}`);
    seen.add(c.id);
  }
  return list.companies;
}

export function loadSuite(file: string): Suite {
  const spec = validate(suiteSchema, readStructured(file), file);
  if (spec.truth !== "none" && !spec.truthField) throw new SuiteError(`${file}: truth "${spec.truth}" needs truthField`);
  const companies = loadCompanies(resolve(dirname(file), spec.rows));
  const rowList = companies.map((c) => ({ id: c.id, label: c.name, domain: c.domain, inputs: buildInputs(spec.inputs, c) }));
  return { ...spec, file, rowList };
}
