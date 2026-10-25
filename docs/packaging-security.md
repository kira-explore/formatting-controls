# Packaging dependency security fix

Resolved GHSA-xcx6-jx8p-x3h5 with a temporary, version-scoped Bun override:

```json
"overrides": {
  "@azure/identity@4.14.0>@azure/msal-node": "7.1.1"
}
```

The latest stable @vscode/vsce 4.0.0 uses @azure/identity 4.14.0, whose declared MSAL range is ^6.0.0. MSAL versions >=5.0.0-beta.0 and <7.1.0 are affected; 7.1.1 contains the upstream fix. The override deliberately goes outside Identity's declared semver range. It is a compatibility-tested project workaround, not a claim that Microsoft has expanded that support range. The upstream prereleases checked during this review still used vulnerable MSAL ranges, so no prerelease tooling or fork was adopted.

## Compatibility basis

MSAL 7.0's breaking change removes responseMode from acquireTokenInteractive and requires form_post for browser-loopback authentication. vsce's Entra credential chain uses EnvironmentCredential, AzureCliCredential, ManagedIdentityCredential, AzurePowerShellCredential and AzureDeveloperCliCredential; it does not use interactive browser-loopback authentication. The source review applies to vsce 4.0.0 and Identity 4.14.0 only.

Regression tests resolve Identity through the installed vsce package and MSAL through that Identity instance, ensuring they exercise the actual transitive pair. The real SDK and MSAL process client-secret/token-cache, client-assertion, authorization-code, environment-credential/chain fallback and authentication-rejection scenarios. A fixture HTTP transport serves discovery/token responses in memory; it rejects unexpected endpoints. These tests do not contact Azure, use real credentials, or publish anything. They are not a live publisher-account or every-credential-flow certification.

Node 24 runs these compatibility tests in the unit suite and the Linux/macOS/Windows CI matrix. Packaging uses the unchanged stable vsce API and validates the final VSIX after its build hook. No authentication library or runtime dependency tree is added to the extension bundle.

## Maintenance and audit policy

The exact parent/version selector confines this workaround to Identity 4.14.0. A future SDK update does not silently inherit it: review the upstream dependency range and remove the override once the supported range includes a patched MSAL. Update the resolved-version regression assertion deliberately when that happens. Bun 1.4.4 supports the version-scoped override and commits the resulting version-3 lockfile.

PR validation and release preparation now require a completely clean, unfiltered bun audit. The previous advisory allowlist has been removed; no advisory IDs are ignored. This removes the dependency release blocker only. Hands-on screen-reader, remote-workspace and concurrent-window checks and publisher approval remain separate release gates.

References: [advisory](https://github.com/advisories/GHSA-xcx6-jx8p-x3h5), [MSAL 7.0 changes](https://github.com/AzureAD/microsoft-authentication-library-for-js/releases/tag/msal-node-v7.0.0), [MSAL 7.1 security fix](https://github.com/AzureAD/microsoft-authentication-library-for-js/releases/tag/msal-node-v7.1.0), [Bun scoped overrides](https://bun.sh/docs/pm/overrides).
