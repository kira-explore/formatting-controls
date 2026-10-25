import { useEffect, useRef, useState } from "react";
import type {
  Operation,
  Request,
  Response,
  Scope,
  Snapshot,
} from "../../shared/protocol";
import { isCurrentSnapshot } from "../../shared/state";

declare const acquireVsCodeApi:
  | undefined
  | (() => { postMessage(message: Request): void });
const api =
  typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : undefined;

export function useEditor() {
  const [state, setState] = useState<Snapshot>();
  const [page, setPage] = useState<string>("overview");
  const [pending, setPending] = useState<string>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const requestId = useRef(0);
  const pendingRef = useRef<string | undefined>(undefined);
  const latest = useRef<Snapshot | undefined>(undefined);
  const initial = useRef(true);
  const navigation = useRef(0);
  const send = (
    body: Operation,
    scope: Scope = state?.scope ?? { target: "user" },
  ) => {
    if (!api || pendingRef.current) return;
    const id = `request-${++requestId.current}`;
    pendingRef.current = id;
    setPending(id);
    setError("");
    setNotice("");
    api.postMessage({ ...body, id, scope } as Request);
  };
  useEffect(() => {
    let timeout: number | undefined;
    const receive = (event: MessageEvent<Response>) => {
      if (event.data.type === "error") {
        setError(event.data.error);
        if (event.data.id === pendingRef.current) {
          pendingRef.current = undefined;
          setPending(undefined);
        }
      }
      if (event.data.type === "state") {
        window.clearTimeout(timeout);
        const next = event.data.state;
        // Complete an acknowledged request even if a newer event already won.
        if (event.data.id === pendingRef.current) {
          pendingRef.current = undefined;
          setPending(undefined);
        }
        if (!isCurrentSnapshot(latest.current, next)) return;
        latest.current = next;
        setState(next);
        if (initial.current || navigation.current !== next.navigation) {
          navigation.current = next.navigation;
          setPage(next.page);
          initial.current = false;
        }
        if (event.data.message) setNotice(event.data.message);
      }
    };
    window.addEventListener("message", receive);
    const id = `request-${++requestId.current}`;
    api?.postMessage({ type: "ready", id, scope: { target: "user" } });
    timeout = window.setTimeout(
      () =>
        setError(
          "The editor has not responded. Reopen the dashboard or use Quick Controls.",
        ),
      15000,
    );
    return () => {
      window.removeEventListener("message", receive);
      window.clearTimeout(timeout);
    };
  }, []);
  // Clear the connection warning once the host has delivered state.
  useEffect(() => {
    if (state && error.startsWith("The editor")) setError("");
  }, [state, error]);

  return { state, page, setPage, pending, error, setError, notice, send };
}
