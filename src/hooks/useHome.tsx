import {
  createContext,
  useCallback,
  useContext,
  useState,
  useMemo,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import type { HomeAdapter, HomeCommand, HomeSnapshot } from "../data/types";

type HomeContextValue = {
  adapter: HomeAdapter;
  send: (command: HomeCommand) => Promise<boolean>;
};
const HomeContext = createContext<HomeContextValue | null>(null);
const CommandContext = createContext<{
  pending: boolean;
  error: string | null;
  dismissError: () => void;
} | null>(null);

export function HomeProvider({
  adapter,
  children,
}: {
  adapter: HomeAdapter;
  children: ReactNode;
}) {
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
  const home = useMemo(() => ({ adapter, send }), [adapter, send]);
  const dismissError = useCallback(() => setError(null), []);
  const pending = requests > 0;
  const command = useMemo(
    () => ({ pending, error, dismissError }),
    [pending, error, dismissError],
  );
  return (
    <HomeContext value={home}>
      <CommandContext value={command}>{children}</CommandContext>
    </HomeContext>
  );
}

// Select existing snapshot values so unchanged selections retain their identity.
export function useHomeValue<T>(select: (state: HomeSnapshot) => T): T {
  const home = useContext(HomeContext);
  if (!home) throw new Error("HomeProvider 안에서 사용해 주세요.");
  return useSyncExternalStore(home.adapter.subscribe, () =>
    select(home.adapter.getSnapshot()),
  );
}

const wholeSnapshot = (state: HomeSnapshot) => state;
type HomeView<T> = {
  state: T;
  send: HomeContextValue["send"];
  offline: boolean;
};
export function useHome(): HomeView<HomeSnapshot>;
export function useHome<T>(select: (state: HomeSnapshot) => T): HomeView<T>;
export function useHome(
  select: (state: HomeSnapshot) => unknown = wholeSnapshot,
) {
  const home = useContext(HomeContext);
  if (!home) throw new Error("HomeProvider 안에서 사용해 주세요.");
  const state = useHomeValue(select);
  const offline = useHomeValue((state) => state.connection === "offline");
  return { state, send: home.send, offline };
}

export function useCommandStatus() {
  const command = useContext(CommandContext);
  if (!command) throw new Error("HomeProvider 안에서 사용해 주세요.");
  return command;
}
