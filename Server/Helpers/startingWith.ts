/**
 * A subscription that sends what's true now, then each update. A client that
 * reconnects (a phone does whenever its browser leaves the foreground)
 * subscribes again, so an update pushed while it was away still reaches it.
 *
 * The live iterator only starts listening on its first pull, so that pull is
 * made before the current state is read: nothing written in between is lost,
 * though it may arrive twice.
 */
export function startingWith<T>(
  subscribed: AsyncIterator<T> | Promise<AsyncIterator<T>>,
  current: () => Promise<T[]>,
): AsyncIterableIterator<T> {
  const events = Promise.resolve(subscribed);
  let first: Promise<IteratorResult<T>> | null = events.then((live) => live.next());
  const reading = current().catch((error: Error) => {
    console.error(`[Subscriptions] current state not read: ${error.message}`);
    return [] as T[];
  });
  let caught: T[] | null = null;

  const iterator: AsyncIterableIterator<T> = {
    async next() {
      caught ??= await reading;

      const value = caught.shift();

      if (value !== undefined) {
        return { value, done: false };
      }

      if (first) {
        const pulled = first;

        first = null;

        return pulled;
      }

      return (await events).next();
    },
    async return(value?: unknown) {
      const live = await events;

      caught = [];

      return live.return ? live.return(value) : { value: value as T, done: true };
    },
    async throw(error?: unknown) {
      const live = await events;

      return live.throw ? live.throw(error) : Promise.reject(error);
    },
    [Symbol.asyncIterator]() {
      return iterator;
    },
  };

  return iterator;
}
