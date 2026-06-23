export interface UrlCheckResult {
  httpStatus: number | null;
  error: string | null;
  aborted: boolean;
}

/**
 * Port (domain abstraction) for the outbound URL check. The processor depends
 * on this contract; the concrete undici-based adapter lives in infrastructure
 * and is bound to this token in the composition root.
 *
 * Declared as an `abstract class` so it doubles as a runtime DI token.
 */
export abstract class UrlChecker {
  abstract head(url: string, signal: AbortSignal): Promise<UrlCheckResult>;
}
