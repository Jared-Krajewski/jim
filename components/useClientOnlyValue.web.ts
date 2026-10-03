import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

// The server snapshot is used during server rendering and hydration, the
// client snapshot afterwards — so this returns `server` until we're on the client.
export function useClientOnlyValue<S, C>(server: S, client: C): S | C {
  return useSyncExternalStore<S | C>(
    subscribe,
    () => client,
    () => server,
  );
}
