/**
 * Resolves after a random delay in the half-open interval [minMs, maxMs).
 *
 * If the supplied signal is already aborted, rejects immediately with an
 * AbortError. If the signal aborts while waiting, the pending timer is cleared
 * and the promise rejects with an AbortError. There is no possibility of a late
 * resolve after an abort.
 */
export function randomDelay(
  minMs: number,
  maxMs: number,
  signal: AbortSignal,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }

    const low = Math.min(minMs, maxMs);
    const high = Math.max(minMs, maxMs);
    const span = Math.max(0, high - low);
    const ms = low + Math.random() * span;

    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };

    signal.addEventListener('abort', onAbort, { once: true });
  });
}
