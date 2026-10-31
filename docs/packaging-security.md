# Packaging dependency security

The committed lockfile uses vsce 4.1.0 with two temporary Bun overrides:

```json
"overrides": {
  "@azure/identity@4.14.0>@azure/msal-node": "7.1.1",
  "minimatch": "11.0.3"
}
```

These dependencies belong to build/packaging tooling. Their authentication and glob dependency trees are not shipped as runtime packages in the VSIX. PR validation and release preparation require a clean, unfiltered `bun audit`; no advisory IDs are ignored.

## Azure Identity / MSAL

[GHSA-xcx6-jx8p-x3h5](https://github.com/advisories/GHSA-xcx6-jx8p-x3h5) affects the MSAL versions selected by Azure Identity 4.14.0's declared ^6.0.0 range. The version-scoped override selects patched MSAL 7.1.1. It deliberately exceeds that declared range and is a compatibility-tested project workaround, not an expanded upstream support guarantee.

MSAL 7.0 removes `responseMode` from `acquireTokenInteractive` and requires `form_post` for browser-loopback authentication. vsce's Entra credential chain uses environment, CLI, managed identity, PowerShell and developer CLI credentials; it does not use interactive browser-loopback authentication. See the [MSAL 7.0 changes](https://github.com/AzureAD/microsoft-authentication-library-for-js/releases/tag/msal-node-v7.0.0) and [7.1 security fix](https://github.com/AzureAD/microsoft-authentication-library-for-js/releases/tag/msal-node-v7.1.0).

Regression tests resolve Identity through the installed vsce package and MSAL through that Identity instance. The actual libraries exercise client-secret/cache, client-assertion, authorization-code, environment/chain fallback and authentication-rejection scenarios. An in-memory HTTP transport supplies fixtures and rejects unexpected endpoints. These tests use no real Azure credentials and perform no publication. They do not certify every credential flow or a live publisher account.

The exact parent/version selector confines the override to Identity 4.14.0. Remove it when the packaging dependency's supported range includes patched MSAL, then deliberately update the resolved-version assertion and rerun the compatibility suite.

## minimatch

[GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) describes pattern amplification that can exhaust CPU/memory. Versions below 11.0.1 are affected; the project selects 11.0.3 instead of the 10.x version requested by packaging tooling.

This override also crosses the parent's major-version range. Final VSIX packaging/content validation exercises the actual installed toolchain, but does not establish compatibility for every glob pattern or every upstream caller. Review all resolved minimatch consumers on dependency updates. Remove the override when their supported ranges select a patched version without it.

## Verification and maintenance

```sh
bun install --frozen-lockfile
bun run test
bun run security:check
bun run package
```

The Node 24 unit suite and Linux/macOS/Windows checks exercise packaging authentication compatibility. Packaging validates the final archive after vsce's build hook. Keep `package.json`, `bun.lock` and this rationale consistent whenever either override changes. [Bun's override documentation](https://bun.sh/docs/pm/overrides) describes the selector syntax.

A clean audit resolves dependency findings only. Manual accessibility review and maintainer publication approval remain separate [release gates](releasing.md).
