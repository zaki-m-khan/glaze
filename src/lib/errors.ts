/** Base class so callers can catch every Glaze error with one `instanceof`. */
export class GlazeError extends Error {
  override readonly name: string = "GlazeError";
}

/** A non-2xx response from the Clay Public API. `status` is the machine-readable category. */
export class ClayApiError extends GlazeError {
  override readonly name: string = "ClayApiError";
  constructor(
    readonly status: number,
    message: string,
    readonly path: string,
  ) {
    super(`Clay API ${status} on ${path}: ${message}`);
  }
}

export class ClayAuthError extends ClayApiError {
  override readonly name = "ClayAuthError";
}

export class ClayNotFoundError extends ClayApiError {
  override readonly name = "ClayNotFoundError";
}

export class ClayRateLimitError extends ClayApiError {
  override readonly name = "ClayRateLimitError";
  constructor(
    path: string,
    message: string,
    readonly retryAfterMs: number,
  ) {
    super(429, message, path);
  }
}

export class RunTimeoutError extends GlazeError {
  override readonly name = "RunTimeoutError";
  constructor(
    readonly routineRunId: string,
    readonly timeoutMs: number,
  ) {
    super(`Routine run ${routineRunId} did not finish within ${Math.round(timeoutMs / 1000)}s`);
  }
}

export class BudgetExceededError extends GlazeError {
  override readonly name = "BudgetExceededError";
}

export class SuiteError extends GlazeError {
  override readonly name = "SuiteError";
}

export class ConfigError extends GlazeError {
  override readonly name = "ConfigError";
}
