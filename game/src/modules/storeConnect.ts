import { iap } from "./iap";

/**
 * One shared, single-flight connection attempt to the store. App boot and the
 * Shop's "try again" both go through here, so iap.init() never runs twice at
 * once (two inits would register two purchase listeners and grant twice), and
 * it is only retried while the store is still unreachable.
 */
let pending: Promise<void> | null = null;

export function connectStore(): Promise<void> {
  // Already connected (even with no products): a re-init would double the listeners.
  if (iap.isConnected()) return Promise.resolve();
  if (!pending) {
    pending = iap.init().finally(() => {
      pending = null;
    });
  }
  return pending;
}
