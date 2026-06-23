import { Semaphore } from './semaphore';

interface Deferred<T = void> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T = void>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('Semaphore', () => {
  it('never lets more than `permits` tasks run concurrently (20 tasks, limit 5)', async () => {
    const limit = 5;
    const total = 20;
    const sem = new Semaphore(limit);

    let inFlight = 0;
    let peak = 0;

    // Each task awaits its own gate so we can control when it finishes.
    const gates = Array.from({ length: total }, () => deferred());

    const tasks = Array.from({ length: total }, (_, i) =>
      sem.runWithLimit(async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await gates[i].promise;
        inFlight--;
      }),
    );

    // Let the event loop schedule everything it can.
    await new Promise((r) => setImmediate(r));
    expect(inFlight).toBe(limit);
    expect(peak).toBe(limit);

    // Release gates one by one; peak must never exceed the limit.
    for (let i = 0; i < total; i++) {
      gates[i].resolve();
      await new Promise((r) => setImmediate(r));
      expect(inFlight).toBeLessThanOrEqual(limit);
      expect(peak).toBeLessThanOrEqual(limit);
    }

    await Promise.all(tasks);
    expect(inFlight).toBe(0);
    expect(peak).toBe(limit);
  });

  it('serves waiters in FIFO order', async () => {
    const sem = new Semaphore(1);
    const order: number[] = [];

    await sem.acquire(); // occupy the single permit

    const waiter1 = sem.acquire().then(() => order.push(1));
    const waiter2 = sem.acquire().then(() => order.push(2));
    const waiter3 = sem.acquire().then(() => order.push(3));

    sem.release();
    await waiter1;
    sem.release();
    await waiter2;
    sem.release();
    await waiter3;

    expect(order).toEqual([1, 2, 3]);
  });

  it('runWithLimit releases the permit even when the task throws', async () => {
    const sem = new Semaphore(1);

    await expect(
      sem.runWithLimit(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    // The permit must be free again.
    let ran = false;
    await sem.runWithLimit(async () => {
      ran = true;
    });
    expect(ran).toBe(true);
  });
});
