// Reading a port from React.
//
// Every port in the runtime is the same store: a synchronous `view()` returning a cached,
// identity-stable snapshot, and a `subscribe(listener)` returning a `Cancel`. Two properties matter
// and both are easy to get wrong:
//
//   * `subscribe` NEVER fires immediately. A component that only subscribes renders empty until
//     something changes. `useSyncExternalStore` seeds from `view()`, which is exactly right.
//   * `view()` returns the SAME object until the store emits (conversation.ts:428 — `view: () =>
//     current`). Wrapping it in anything that rebuilds an object would make React loop forever.
//
// So the whole adapter is one call. Nothing is derived here, because deriving is how presentation
// starts deciding.

import { useCallback, useSyncExternalStore } from 'react';
import type { Cancel } from '../../../maya-chat-shell/src/shell/ports.ts';

interface Store<V> {
  view(): V;
  subscribe(listener: (view: V) => void): Cancel;
}

export function usePortView<V>(port: Store<V>): V {
  // `subscribe` must be referentially stable or React tears the subscription down and rebuilds it
  // on every render, and an emit landing in that gap is simply missed. The ports are module
  // singletons, so keying on `port` makes this stable for the life of the component.
  //
  // The inner `() => onChange()` wrapper is also deliberate: conversation, shell and voice hold
  // their listeners in a Set and de-duplicate by function IDENTITY, so two components that passed
  // the same reference would register once and the first unsubscribe would silence both. A fresh
  // closure per component makes that impossible to trip over.
  const subscribe = useCallback((onChange: () => void) => port.subscribe(() => onChange()), [port]);
  const snapshot = useCallback(() => port.view(), [port]);
  return useSyncExternalStore(subscribe, snapshot);
}
