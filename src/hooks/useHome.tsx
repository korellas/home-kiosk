import {
  createContext,
  useCallback,
  useContext,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import type { HomeAdapter, HomeCommand, HomeSnapshot } from "../data/types";

type HomeContextValue = {
  state: HomeSnapshot;
  send: (command: HomeCommand) => Promise<boolean>;
  pending: boolean;
  error: string | null;
  dismissError: () => void;
  offline: boolean;
};
const HomeContext = createContext<HomeContextValue | null>(null);

export function HomeProvider({
  adapter,
  children,
}: {
  adapter: HomeAdapter;
  children: ReactNode;
}) {
  const state = useSyncExternalStore(adapter.subscribe, adapter.getSnapshot);
  const [requests, setRequests] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const send = useCallback(
    (command: HomeCommand) => {
      setError(null);
      setRequests((value) => value + 1);
      return adapter
        .execute(command)
        .then(() => true)
        .catch((reason: unknown) => {
          setError(
            reason instanceof Error
              ? reason.message
              : "명령을 보내지 못했어요. 다시 시도해 주세요.",
          );
          return false;
        })
        .finally(() => setRequests((value) => value - 1));
    },
    [adapter],
  );
  return (
    <HomeContext
      value={{
        state,
        send,
        pending: requests > 0,
        error,
        dismissError: () => setError(null),
        offline: state.connection === "offline",
      }}
    >
      {children}
    </HomeContext>
  );
}
export function useHome() {
  const home = useContext(HomeContext);
  if (!home) throw new Error("HomeProvider 안에서 사용해 주세요.");
  return home;
}
