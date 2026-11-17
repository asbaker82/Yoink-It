/** Rejects if `promise` hasn't settled within `ms`, so the UI never waits forever. */
export function withTimeout<T>(promise: Promise<T>, ms = 20_000, what = 'The request'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${what} timed out. Check your connection and try again.`)),
      ms,
    );
    promise.then(
      value => { clearTimeout(timer); resolve(value); },
      err => { clearTimeout(timer); reject(err); },
    );
  });
}
