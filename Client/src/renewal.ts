type Renew = () => Promise<boolean>;

let renew: Renew | undefined;
let pending: Promise<boolean> | undefined;

export function onUnauthenticated(next: Renew): () => void {
  renew = next;

  return () => {
    if (renew === next) {
      renew = undefined;
    }
  };
}

export function session(): Promise<boolean> {
  if (!renew) {
    return Promise.resolve(false);
  }

  pending ??= renew().finally(() => {
    pending = undefined;
  });

  return pending;
}
