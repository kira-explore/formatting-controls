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
const diagnosticFeedbackMs = 700;

export const useEditor = () => {
  const [state, setState] = useState<Snapshot>();
  const [page, setPage] = useState<string>("formatting");
  const [pending, setPending] = useState<Operation["type"]>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const requestId = useRef(0);
  const pendingRef = useRef<{
    id: string;
    type: Operation["type"];
    startedAt: number;
  }>(undefined);
  const latest = useRef<Snapshot | undefined>(undefined);
  const initial = useRef(true);
  const navigation = useRef(0);
  const send = (
    body: Operation,
    scope: Scope = state?.scope ?? { target: "user" },
  ) => {
    if (!api || pendingRef.current) return;
    const id = `request-${++requestId.current}`;
    pendingRef.current = { id, type: body.type, startedAt: performance.now() };
    setPending(body.type);
    setError("");
    setNotice("");
    api.postMessage({ ...body, id, scope } as Request);
  };
  useEffect(() => {
    let timeout: number | undefined;
    let diagnosticFeedback: number | undefined;
    const applyResponse = (response: Response) => {
      if (response.type === "error") {
        setError(response.error);
        if (response.id === pendingRef.current?.id) {
          pendingRef.current = undefined;
          setPending(undefined);
        }
      }
      if (response.type === "state") {
        window.clearTimeout(timeout);
        const next = response.state;
        // Complete an acknowledged request even if a newer event already won.
        if (pendingRef.current && response.id === pendingRef.current.id) {
          pendingRef.current = undefined;
          setPending(undefined);
        }
        if (!isCurrentSnapshot(latest.current, next)) return;
        latest.current = next;
        setState(next);
        if (initial.current || navigation.current !== next.navigation) {
          navigation.current = next.navigation;
          setPage(next.page === "overview" ? "formatting" : next.page);
          initial.current = false;
        }
        if (response.message) setNotice(response.message);
      }
    };
    const receive = ({ data }: MessageEvent<Response>) => {
      const request = pendingRef.current;
      if (
        data.type === "state" &&
        request?.type === "runDiagnostics" &&
        data.id === request.id
      ) {
        // Keep fast runs visible without delaying the host or error responses.
        const remaining =
          diagnosticFeedbackMs - (performance.now() - request.startedAt);
        if (remaining > 0) {
          diagnosticFeedback = window.setTimeout(
            () => applyResponse(data),
            remaining,
          );
          return;
        }
      }
      applyResponse(data);
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
      window.clearTimeout(diagnosticFeedback);
    };
  }, []);
  // Clear the connection warning once the host has delivered state.
  useEffect(() => {
    if (state && error.startsWith("The editor")) setError("");
  }, [state, error]);

  return { state, page, setPage, pending, error, setError, notice, send };
};
