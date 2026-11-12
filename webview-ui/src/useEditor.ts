import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ConfirmationReply,
  Operation,
  Request,
  Response,
  Scope,
  Snapshot,
} from "../../shared/protocol";
import { isCurrentSnapshot } from "../../shared/state";

type DashboardView = { page: string; navigation: number | undefined };

declare const acquireVsCodeApi:
  | undefined
  | (() => {
      postMessage(message: Request | ConfirmationReply): void;
      getState(): DashboardView | undefined;
      setState(state: DashboardView): void;
    });
const api =
  typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : undefined;
const restoredView = api?.getState();
type DashboardConfirmation = Extract<Response, { type: "confirmation" }> & {
  page: string;
  profileToDelete?: string;
  profileToApply?: string;
};
const diagnosticFeedbackMs = 700;
const diagnosticTimeoutMs = 10000;

export const useEditor = () => {
  const [state, setState] = useState<Snapshot>();
  const [page, setPage] = useState(restoredView?.page ?? "formatting");
  const [confirmation, setConfirmation] = useState<DashboardConfirmation>();
  const [pending, setPending] = useState<Operation["type"]>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{ page: string; message: string }>();
  const requestId = useRef(0);
  const pendingRef = useRef<{
    id: string;
    page: string;
    profileToDelete?: string;
    profileToApply?: string;
    type: Operation["type"];
    startedAt: number;
    timeout: number | undefined;
    onDiagnosticRun: ((runId: string) => void) | undefined;
  }>(undefined);
  const latest = useRef<Snapshot | undefined>(undefined);
  const navigation = useRef(restoredView?.navigation);
  const selectPage = useCallback((page: string) => {
    setPage(page);
    setNotice(undefined);
    api?.setState({ page, navigation: navigation.current });
  }, []);
  const send = (
    body: Operation,
    scope: Scope = state?.scope ?? { target: "user" },
    onDiagnosticRun?: (runId: string) => void,
  ) => {
    if (!api || pendingRef.current) return;
    const id = `request-${++requestId.current}`;
    const startedAt = performance.now();
    const timeout =
      body.type === "runDiagnostics"
        ? window.setTimeout(() => {
            if (pendingRef.current?.id !== id) return;
            pendingRef.current = undefined;
            setPending(undefined);
            setError(
              "Diagnostics did not respond. Check the run history or try again.",
            );
            api.postMessage({
              type: "ready",
              id: `request-${++requestId.current}`,
              scope,
            });
          }, diagnosticTimeoutMs)
        : undefined;
    pendingRef.current = {
      id,
      page,
      ...(body.type === "profile" && body.action === "delete" && body.name
        ? { profileToDelete: body.name }
        : {}),
      ...(body.type === "profile" && body.action === "apply" && body.name
        ? { profileToApply: body.name }
        : {}),
      type: body.type,
      startedAt,
      timeout,
      onDiagnosticRun,
    };
    setPending(body.type);
    setError("");
    setNotice(undefined);
    api.postMessage({ ...body, id, scope } as Request);
  };
  useEffect(() => {
    let timeout: number | undefined;
    let diagnosticFeedback: number | undefined;
    const applyResponse = (response: Response) => {
      const request = pendingRef.current;
      // Complete an acknowledged request even if a newer event already won.
      if (request && response.id === request.id) {
        window.clearTimeout(request.timeout);
        pendingRef.current = undefined;
        setPending(undefined);
        setConfirmation(undefined);
        if (request.onDiagnosticRun && response.type === "state") {
          const report = response.state.diagnosticHistory[0];
          if (report) request.onDiagnosticRun(report.id);
        }
      }
      if (response.type === "error") {
        setError(response.error);
      }
      if (response.type === "state") {
        window.clearTimeout(timeout);
        const next = response.state;
        if (!isCurrentSnapshot(latest.current, next)) return;
        latest.current = next;
        setState(next);
        if (navigation.current !== next.navigation) {
          navigation.current = next.navigation;
          selectPage(next.page === "overview" ? "formatting" : next.page);
        }
        if (response.message && request && request.id === response.id)
          setNotice({ page: request.page, message: response.message });
      }
    };
    const receive = ({ data }: MessageEvent<Response>) => {
      const request = pendingRef.current;
      if (data.type === "confirmation") {
        if (request?.id === data.id) {
          setConfirmation({
            ...data,
            page: request.page,
            ...(request.profileToApply
              ? { profileToApply: request.profileToApply }
              : {}),
            ...(request.profileToDelete
              ? { profileToDelete: request.profileToDelete }
              : {}),
          });
        }
        return;
      }
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
      window.clearTimeout(pendingRef.current?.timeout);
      window.clearTimeout(diagnosticFeedback);
    };
  }, [selectPage]);
  // Clear the connection warning once the host has delivered state.
  useEffect(() => {
    if (state && error.startsWith("The editor")) setError("");
  }, [state, error]);

  useEffect(() => {
    if (confirmation && confirmation.page !== page) {
      api?.postMessage({
        type: "confirmationReply",
        token: confirmation.token,
        accepted: false,
      });
      setConfirmation(undefined);
    }
  }, [confirmation, page]);

  return {
    state,
    page,
    setPage: selectPage,
    pending,
    error,
    setError,
    notice: notice?.page === page ? notice.message : "",
    confirmation: confirmation?.page === page ? confirmation : undefined,
    replyToConfirmation: (accepted: boolean) => {
      if (!confirmation) return;
      api?.postMessage({
        type: "confirmationReply",
        token: confirmation.token,
        accepted,
      });
      setConfirmation(undefined);
    },
    send,
  };
};
