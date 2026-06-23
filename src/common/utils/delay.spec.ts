import { randomDelay } from './delay';

describe('randomDelay', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('resolves after a delay within [min, max)', async () => {
    // Force the random pick to the middle of the range.
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const controller = new AbortController();

    const promise = randomDelay(100, 200, controller.signal);
    let resolved = false;
    void promise.then(() => {
      resolved = true;
    });

    // Not yet — chosen delay is 150ms.
    jest.advanceTimersByTime(149);
    await Promise.resolve();
    expect(resolved).toBe(false);

    jest.advanceTimersByTime(1);
    await Promise.resolve();
    await expect(promise).resolves.toBeUndefined();
    expect(resolved).toBe(true);
  });

  it('rejects immediately with AbortError if the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      randomDelay(100, 200, controller.signal),
    ).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('rejects with AbortError, clears the timer, and never resolves late when aborted mid-wait', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const clearSpy = jest.spyOn(global, 'clearTimeout');
    const controller = new AbortController();

    const promise = randomDelay(100, 200, controller.signal);

    let resolved = false;
    let rejectedName: string | undefined;
    void promise.then(
      () => {
        resolved = true;
      },
      (err) => {
        rejectedName = err?.name;
      },
    );

    // Abort partway through.
    jest.advanceTimersByTime(50);
    controller.abort();
    await Promise.resolve();

    expect(rejectedName).toBe('AbortError');
    expect(clearSpy).toHaveBeenCalled();

    // Advance well past the original delay — it must NOT resolve late.
    jest.advanceTimersByTime(1000);
    await Promise.resolve();
    expect(resolved).toBe(false);

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  });
});
