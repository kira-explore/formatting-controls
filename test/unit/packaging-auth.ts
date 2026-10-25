import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { test } from "node:test";

// Resolve through vsce so the tests exercise its actual transitive SDK/MSAL pair.
const root = createRequire(resolve("package.json"));
const fromVsce = createRequire(root.resolve("@vscode/vsce"));
const fromIdentity = createRequire(fromVsce.resolve("@azure/identity"));
interface Credential {
  getToken(
    scopes: string | string[],
  ): Promise<{ token: string; expiresOnTimestamp: number } | null>;
}
type CredentialConstructor = new (...args: unknown[]) => Credential;
const identity = fromVsce("@azure/identity") as {
  ClientSecretCredential: CredentialConstructor;
  ClientAssertionCredential: CredentialConstructor;
  AuthorizationCodeCredential: CredentialConstructor;
  EnvironmentCredential: CredentialConstructor;
  ChainedTokenCredential: CredentialConstructor;
  CredentialUnavailableError: new (message: string) => Error;
};
const { createHttpHeaders } = fromIdentity("@azure/core-rest-pipeline") as {
  createHttpHeaders(headers?: Record<string, string>): unknown;
};
const tenant = "11111111-1111-4111-8111-111111111111",
  client = "22222222-2222-4222-8222-222222222222";
const scope = "499b84ac-1321-427f-aa17-267ca6975798/.default";
const authority = `https://login.microsoftonline.com/${tenant}`;
interface Request {
  url: string;
  method: string;
  body?: unknown;
}
function transport(rejectToken = false) {
  const posts: URLSearchParams[] = [];
  return {
    posts,
    options: {
      disableInstanceDiscovery: true,
      retryOptions: { maxRetries: 0 },
      httpClient: {
        async sendRequest(request: Request) {
          let body: object,
            status = 200;
          if (
            request.method === "GET" &&
            request.url.includes("/.well-known/openid-configuration")
          ) {
            body = {
              authorization_endpoint: `${authority}/oauth2/v2.0/authorize`,
              token_endpoint: `${authority}/oauth2/v2.0/token`,
              issuer: `${authority}/v2.0`,
              jwks_uri: `${authority}/discovery/v2.0/keys`,
              end_session_endpoint: `${authority}/oauth2/v2.0/logout`,
            };
          } else if (
            request.method === "POST" &&
            `${new URL(request.url).origin}${new URL(request.url).pathname}` ===
              `${authority}/oauth2/v2.0/token`
          ) {
            posts.push(new URLSearchParams(String(request.body)));
            status = rejectToken ? 400 : 200;
            body = rejectToken
              ? {
                  error: "invalid_client",
                  error_description: "Fixture rejected the test client",
                }
              : {
                  token_type: "Bearer",
                  access_token: "fixture-access-token",
                  expires_in: 3600,
                  ext_expires_in: 3600,
                  scope,
                };
          } else
            throw new Error(
              `Unexpected authentication request: ${request.method} ${request.url}`,
            );
          return {
            request,
            status,
            headers: createHttpHeaders({ "content-type": "application/json" }),
            bodyAsText: JSON.stringify(body),
          };
        },
      },
    },
  };
}
test("vsce resolves the patched MSAL through its Azure Identity dependency", () => {
  assert.equal(
    (fromIdentity("@azure/msal-node/package.json") as { version: string })
      .version,
    "7.1.1",
  );
  assert.equal(
    (fromVsce("@azure/identity/package.json") as { version: string }).version,
    "4.14.0",
  );
});
test("the real SDK/MSAL client-secret flow obtains and caches a token", async () => {
  const mock = transport();
  const credential = new identity.ClientSecretCredential(
    tenant,
    client,
    "fixture-secret",
    mock.options,
  );
  assert.equal(
    (await credential.getToken(scope))?.token,
    "fixture-access-token",
  );
  assert.equal(
    (await credential.getToken(scope))?.token,
    "fixture-access-token",
  );
  assert.equal(mock.posts.length, 1);
  assert.equal(mock.posts[0]?.get("grant_type"), "client_credentials");
  assert.equal(mock.posts[0]?.get("client_secret"), "fixture-secret");
});
test("the real SDK/MSAL client-assertion flow remains compatible", async () => {
  const mock = transport();
  const credential = new identity.ClientAssertionCredential(
    tenant,
    client,
    async () => "fixture-assertion",
    mock.options,
  );
  assert.equal(
    (await credential.getToken(scope))?.token,
    "fixture-access-token",
  );
  assert.equal(mock.posts[0]?.get("client_assertion"), "fixture-assertion");
});
test("the real SDK/MSAL authorization-code flow accepts a plain code", async () => {
  const mock = transport();
  const credential = new identity.AuthorizationCodeCredential(
    tenant,
    client,
    "fixture-secret",
    "fixture-code",
    "http://localhost/callback",
    mock.options,
  );
  assert.equal(
    (await credential.getToken(scope))?.token,
    "fixture-access-token",
  );
  assert.equal(mock.posts[0]?.get("grant_type"), "authorization_code");
  assert.equal(mock.posts[0]?.get("code"), "fixture-code");
});
test("the publishing environment credential and chain work with patched MSAL", async () => {
  const previous = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => key.startsWith("AZURE_")),
  );
  try {
    for (const key of Object.keys(previous)) delete process.env[key];
    Object.assign(process.env, {
      AZURE_TENANT_ID: tenant,
      AZURE_CLIENT_ID: client,
      AZURE_CLIENT_SECRET: "fixture-secret",
    });
    const mock = transport();
    const unavailable = {
      async getToken() {
        throw new identity.CredentialUnavailableError("Fixture unavailable");
      },
    };
    const chain = new identity.ChainedTokenCredential(
      unavailable,
      new identity.EnvironmentCredential(mock.options),
    );
    assert.equal((await chain.getToken(scope))?.token, "fixture-access-token");
    assert.equal(mock.posts[0]?.get("client_id"), client);
  } finally {
    for (const key of Object.keys(process.env))
      if (key.startsWith("AZURE_")) delete process.env[key];
    Object.assign(process.env, previous);
  }
});
test("the patched SDK propagates rejected client authentication", async () => {
  const mock = transport(true);
  const credential = new identity.ClientSecretCredential(
    tenant,
    client,
    "fixture-secret",
    mock.options,
  );
  await assert.rejects(
    credential.getToken(scope),
    /invalid_client|Fixture rejected/,
  );
  assert.equal(mock.posts.length, 1);
});
