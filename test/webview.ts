import assert from "node:assert/strict";
import type { Browser } from "playwright-core";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
interface Reply {
  id?: number;
  method?: string;
  params?: { context?: { id: number; auxData?: { isDefault?: boolean } } };
  result?: { result?: { value?: unknown }; exceptionDetails?: unknown };
  error?: unknown;
}
export async function attachControls(browser: Browser) {
  const session = await browser.newBrowserCDPSession();
  let targetId: string | undefined;
  for (let n = 0; n < 200 && !targetId; n++) {
    const { targetInfos } = await session.send("Target.getTargets");
    targetId = targetInfos.find((t) => t.type === "iframe")?.targetId;
    if (!targetId) await delay(50);
  }
  assert.ok(targetId, "Controls webview target");
  const { sessionId } = await session.send("Target.attachToTarget", {
    targetId,
    flatten: false,
  });
  let sequence = 0;
  const contexts: { id: number; auxData?: { isDefault?: boolean } }[] = [];
  const pending = new Map<number, (r: Reply) => void>();
  session.on("Target.receivedMessageFromTarget", ({ message }) => {
    const reply: Reply = JSON.parse(message);
    if (
      reply.method === "Runtime.executionContextCreated" &&
      reply.params?.context
    )
      contexts.push(reply.params.context);
    if (reply.id) {
      pending.get(reply.id)?.(reply);
      pending.delete(reply.id);
    }
  });
  const send = (method: string, params: object = {}): Promise<Reply> =>
    new Promise((resolve, reject) => {
      const id = ++sequence;
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Timed out: ${method}`));
      }, 15000);
      pending.set(id, (r) => {
        clearTimeout(timeout);
        r.error ? reject(new Error(JSON.stringify(r.error))) : resolve(r);
      });
      void session
        .send("Target.sendMessageToTarget", {
          sessionId,
          message: JSON.stringify({ id, method, params }),
        })
        .catch(reject);
    });
  await send("Runtime.enable");
  let contextId: number | undefined;
  for (let n = 0; n < 200 && !contextId; n++) {
    for (const context of contexts.filter((c) => c.auxData?.isDefault)) {
      const reply = await send("Runtime.evaluate", {
        contextId: context.id,
        expression: '!!document.querySelector(".quick-formatting")',
        returnByValue: true,
      });
      if (reply.result?.result?.value) contextId = context.id;
    }
    if (!contextId) await delay(50);
  }
  assert.ok(contextId, "Real controls must be mounted");
  const evaluate = async <T>(expression: string): Promise<T> => {
    const reply = await send("Runtime.evaluate", {
      contextId,
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (reply.result?.exceptionDetails)
      throw new Error(JSON.stringify(reply.result.exceptionDetails));
    return reply.result?.result?.value as T;
  };
  const wait = async (expression: string) => {
    for (let n = 0; n < 200; n++) {
      if (await evaluate<boolean>(expression)) return;
      await delay(50);
    }
    throw new Error(`Controls did not settle: ${expression}`);
  };
  return { evaluate, wait, dispose: () => session.detach() };
}
