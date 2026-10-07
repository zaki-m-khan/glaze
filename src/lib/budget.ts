import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Budgets } from "./env";
import { BudgetExceededError } from "./errors";

export interface SpendEntry {
  at: string;
  suite: string;
  routineId: string;
  rows: number;
  credits: number;
  actions: number;
  clayRunId?: string;
}

export interface SpendState {
  credits: number;
  actions: number;
  entries: SpendEntry[];
}

export const SPEND_FILE = ".glaze/spend.json";

/** Cumulative Clay spend on this machine, measured from balance deltas, checked against hard budgets. */
export class SpendLedger {
  private state: SpendState;

  constructor(
    readonly budgets: Budgets,
    private readonly file = SPEND_FILE,
  ) {
    this.state = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as SpendState) : { credits: 0, actions: 0, entries: [] };
  }

  get spent(): { credits: number; actions: number } {
    return { credits: this.state.credits, actions: this.state.actions };
  }

  get remaining(): { credits: number; actions: number } {
    return { credits: this.budgets.credits - this.state.credits, actions: this.budgets.actions - this.state.actions };
  }

  /** Throws unless spending `estimate` keeps both meters within budget. */
  assertAffordable(estimate: { credits: number; actions: number }, what: string): void {
    const { credits, actions } = this.remaining;
    if (estimate.credits > credits || estimate.actions > actions) {
      throw new BudgetExceededError(
        `${what} needs ~${estimate.credits} credits / ${estimate.actions} actions; ` +
          `budget left is ${credits} credits / ${actions} actions (CLAY_CREDIT_BUDGET=${this.budgets.credits}, CLAY_ACTION_BUDGET=${this.budgets.actions})`,
      );
    }
  }

  record(entry: SpendEntry): void {
    this.state = {
      credits: this.state.credits + entry.credits,
      actions: this.state.actions + entry.actions,
      entries: [...this.state.entries, entry],
    };
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, `${JSON.stringify(this.state, null, 2)}\n`);
  }
}
