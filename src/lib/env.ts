import { config as loadDotenv } from "dotenv";
import { ConfigError } from "./errors";

let loaded = false;

/** Loads `.env.local` then `.env` (first one wins per key). Safe to call repeatedly. */
export function loadEnv(): void {
  if (loaded) return;
  loadDotenv({ path: [".env.local", ".env"], quiet: true });
  loaded = true;
}

export interface Budgets {
  credits: number;
  actions: number;
}

function readNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new ConfigError(`${name} must be a non-negative number`);
  return n;
}

/** Budgets default to zero, so a machine with no config can never spend. */
export function readBudgets(): Budgets {
  loadEnv();
  return { credits: readNumber("CLAY_CREDIT_BUDGET", 0), actions: readNumber("CLAY_ACTION_BUDGET", 0) };
}

export function readClayApiKey(): string {
  loadEnv();
  const key = process.env.CLAY_API_KEY;
  if (!key) throw new ConfigError("CLAY_API_KEY is not set; live runs need it (replay mode does not)");
  return key;
}

export function readAnthropicApiKey(): string | undefined {
  loadEnv();
  return process.env.ANTHROPIC_API_KEY || undefined;
}
