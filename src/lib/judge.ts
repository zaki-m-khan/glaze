import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { sha256, stableStringify } from "./hash";
import type { JudgeSpec } from "./suite";

export const JUDGE_MODEL = "claude-haiku-4-5-20251001";
const JUDGE_CACHE_DIR = ".glaze/cache/judge";

export interface JudgeResult {
  field: string;
  score: number;
  pass: boolean;
  reason: string;
}

export interface JudgeRequest {
  spec: JudgeSpec;
  value: unknown;
  /** What the row is about, e.g. `{ company: "Clay", domain: "clay.com" }`. */
  context: Record<string, string>;
}

/** Sends one prompt and returns the model's text. Injected so tests never hit the network. */
export type Completer = (system: string, prompt: string) => Promise<string>;

const verdictSchema = z.object({
  score: z.number().int().min(1).max(5),
  reason: z.string().min(1).max(500),
});

const SYSTEM = [
  "You grade one output of a data-enrichment function against a rubric.",
  "Score 1-5: 5 fully meets the rubric, 3 partially, 1 fails or is unusable.",
  "Judge only what is in front of you. Do not reward length. If you cannot tell whether a claim is true, say so and do not assume it is.",
  'Reply with only a JSON object: {"score": <1-5>, "reason": "<one sentence>"}',
].join("\n");

export function buildPrompt({ spec, value, context }: JudgeRequest): string {
  const contextLines = Object.entries(context).map(([k, v]) => `${k}: ${v}`);
  return [`Rubric: ${spec.rubric}`, "", "Row:", ...contextLines, "", `Output field "${spec.field}":`, JSON.stringify(value, null, 2)].join("\n");
}

export function parseVerdict(text: string): { score: number; reason: string } {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error(`judge reply has no JSON object: ${text.slice(0, 120)}`);
  return verdictSchema.parse(JSON.parse(text.slice(start, end + 1)));
}

export class Judge {
  constructor(
    private readonly complete: Completer,
    /** null disables the on-disk cache. */
    private readonly cacheDir: string | null = JUDGE_CACHE_DIR,
    readonly model = JUDGE_MODEL,
  ) {}

  async judge(request: JudgeRequest): Promise<JudgeResult> {
    const prompt = buildPrompt(request);
    const key = sha256(stableStringify({ model: this.model, system: SYSTEM, prompt })).slice(0, 24);
    const cached = this.readCache(key);
    const verdict = cached ?? parseVerdict(await this.complete(SYSTEM, prompt));
    if (!cached) this.writeCache(key, verdict);
    return { field: request.spec.field, score: verdict.score, pass: verdict.score >= request.spec.passScore, reason: verdict.reason };
  }

  private readCache(key: string): { score: number; reason: string } | undefined {
    if (!this.cacheDir) return undefined;
    const file = join(this.cacheDir, `${key}.json`);
    return existsSync(file) ? verdictSchema.parse(JSON.parse(readFileSync(file, "utf8"))) : undefined;
  }

  private writeCache(key: string, verdict: { score: number; reason: string }): void {
    if (!this.cacheDir) return;
    mkdirSync(this.cacheDir, { recursive: true });
    writeFileSync(join(this.cacheDir, `${key}.json`), JSON.stringify(verdict));
  }
}

export function anthropicCompleter(apiKey: string, model = JUDGE_MODEL): Completer {
  const client = new Anthropic({ apiKey, maxRetries: 4 });
  return async (system, prompt) => {
    const message = await client.messages.create({ model, max_tokens: 300, temperature: 0, system, messages: [{ role: "user", content: prompt }] });
    return message.content.map((block) => (block.type === "text" ? block.text : "")).join("");
  };
}
