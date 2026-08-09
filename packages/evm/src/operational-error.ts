export type SmokeOperation = 'startup' | 'rpc-preflight';

export interface SafeOperationalError {
  readonly code: 'SMOKE_PREFLIGHT_FAILED';
  readonly operation: SmokeOperation;
  readonly reason: 'RPC_FAILURE' | 'INVALID_CONFIGURATION' | 'UNEXPECTED_FAILURE';
}

export function safeOperationalError(
  operation: SmokeOperation,
  error: unknown,
): SafeOperationalError {
  const classification = error instanceof Error ? `${error.name} ${error.message}` : '';
  const reason = /rpc|http|fetch|network|request|timeout/i.test(classification)
    ? 'RPC_FAILURE'
    : error instanceof TypeError || error instanceof RangeError
      ? 'INVALID_CONFIGURATION'
      : 'UNEXPECTED_FAILURE';
  return Object.freeze({ code: 'SMOKE_PREFLIGHT_FAILED', operation, reason });
}

export function safeErrorLine(operation: SmokeOperation, error: unknown): string {
  return JSON.stringify(safeOperationalError(operation, error));
}
