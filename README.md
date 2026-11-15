# Dungeon of Dreams Codex

A public application shell for a private, source-connected development workspace. It provides structured views for design documentation, room specifications, interviews, asset comparisons, templates, decisions, and development diagnostics.

**This repository includes no project documents, authored interview trees, asset files, private source identifiers, user records, credentials, or historical snapshots.** It starts with fresh Git history; the original private application's history was not imported.

## Source separation

| Component | Owner |
| --- | --- |
| Website source, UI styles, public data contracts | This repository |
| Design documents, narrative, interview content, intended population rules | The configured Notion source |
| Game code, runtime rules, actual asset files, implementation evidence | The configured game repository |
| Sessions, authorization, provider credentials, source bindings, live reads and writes | A separately deployed protected backend |

A design specification and its implementation are linked records with different roles. This UI must not silently merge their content or become another editable copy.

## Current status

- Static React/Vite frontend, compatible with GitHub Pages project paths.
- Existing UI adapted from the private prototype, with embedded project content removed.
- Empty by default: no demo dataset or fallback snapshot is shipped.
- Generic room-entry debug simulator, isolated from the actual game.
- Backend API client and contract, with HTTPS-only origin configuration and no browser-held provider tokens.
- Authentication and Notion/GitHub provider adapters are **not implemented in this public frontend**. Project content cannot load until the protected backend is deployed and configured.
- No automatic document migration, writeback, or game-repository modification is performed.

The private hosted prototype remains a separate deployment. This commit does not move its data or change its access policy.

## Development

Use Node 22.13 or later.

```sh
npm ci
npm test
npm run build
npm run dev
```

Without backend configuration, the UI displays a connection-required state and makes no project-content requests. To connect a backend, copy `.env.example` to `.env.local` and set `VITE_CODEX_API_BASE_URL` to its HTTPS origin. This value is public and becomes part of the browser build; never place tokens or source IDs in it.

## GitHub Pages

1. In repository settings, choose GitHub Actions as the Pages publishing source.
2. Optionally set the repository variable `CODEX_API_BASE_URL` to the protected backend's HTTPS origin.
3. Run the **Deploy public app shell** workflow manually.

The manual workflow builds, tests, and audits the artifact before deployment. It does not publish automatically when this source is committed. Relative asset paths allow the app to run beneath a project-repository URL.

GitHub Pages publishes the app files publicly. Confidential content must be returned only by the protected backend after authentication and authorization. A browser login screen is not an access-control boundary.

## Backend integration

See [the backend contract](backend/README.md) and [the migration notes](docs/MIGRATION.md). Provider identifiers and credentials must be configured server-side outside Git. The browser is never allowed to pick arbitrary provider actions or private targets.

## Verification

`npm test` checks backend-origin validation, unauthorized access handling, path confinement, and safe API request behavior. `npm run audit:public` checks the source and generated artifact for forbidden private files, identifier patterns, credentials, and hardcoded document links. Auditing is a defense in depth measure and must accompany human review before adding source data or integrations.
