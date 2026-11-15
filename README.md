# Dungeon of Dreams Codex

A public application shell for a private, source-connected development workspace. It provides structured views for design documentation, room specifications, interviews, asset comparisons, templates, decisions, and development diagnostics.

**This repository includes no project documents, authored interview trees, asset files, private source identifiers, user records, credentials, or historical snapshots.** It starts with fresh Git history; the original private application's history was not imported.

## Source separation

| Component | Owner |
| --- | --- |
| Website source, UI styles, public data contracts | This repository |
| Design documents, narrative, interview content, intended population rules | The configured Notion source |
| Game code, runtime rules, actual asset files, implementation evidence | The configured game repository |
| Sessions, authorization, provider credentials, source bindings, live reads and writes | The co-hosted protected Node server |

A design specification and its implementation are linked records with different roles. This UI must not silently merge their content or become another editable copy.

## Current status

- One Node service serves both the React/Vite frontend and the protected API on the same HTTPS origin.
- Existing UI adapted from the private prototype, with embedded project content removed.
- Empty by default: no demo dataset or fallback snapshot is shipped.
- Generic room-entry debug simulator, isolated from the actual game.
- Implemented Node backend and API client, with GitHub App login, owner authorization, HTTPS-only origin configuration, and no browser-held provider tokens.
- Authentication and Notion/GitHub adapters run in the co-hosted Node server. Project content cannot load until the app is deployed and supplied with credentials and server-only source bindings.
- Reviewed Notion changes write back to their configured page. GitHub file changes open a branch and pull request; the canonical branch is not automatically modified. No automatic content migration is performed.

The private hosted prototype remains a separate deployment. This commit does not move its data or change its access policy.

## Development

Use Node 22.13 or later.

```sh
npm ci
npm test
npm run build
npm run dev
```

For a complete local build, run `npm run build`, then configure the ignored `backend/.env` file and run `npm run backend` behind an HTTPS proxy. `npm run dev` previews the UI only; authentication is not bypassed for local development.

## One-host deployment

Use a single Render Free Web Service or another Node/Docker host. The server serves the built UI from `/`, browser assets from `dist/`, and protected endpoints from `/api/` and `/auth/`.

- `render.yaml` configures **one free web service**, not a separate static frontend service.
- `backend/Dockerfile` builds the UI in one stage and copies only its public build plus the backend into the runtime image.
- Render's assigned HTTPS URL becomes the app origin automatically. On another host or a custom domain, set server variable `CODEX_APP_ORIGIN` to the canonical HTTPS origin.
- The browser automatically uses its own origin for API calls. No frontend environment settings, CORS allowlist for a second site, or third-party session cookies are needed.
- GitHub remains the source repository and CI host. A separate GitHub Pages deployment is not used; its former deployment workflow was removed.

Create the web service first and note its assigned URL. Register the GitHub App callback as that origin plus `/auth/callback`, add the server-only credentials and source bindings, and deploy. The service intentionally stays unready until the identity settings are supplied. Alternatively, use the Render Blueprint once those credentials are ready.

Render Free still sleeps after idle time. Current in-memory sessions and idempotency state disappear on process restarts, so users must sign in again; co-hosting fixes cross-site cookie issues but does not make sessions durable. See the backend guide before using multiple instances or relying on restart-surviving sessions.

## Backend integration

See [the backend setup and implementation guide](backend/README.md) and [the migration notes](docs/MIGRATION.md). Provider identifiers and credentials must be configured server-side outside Git. The browser is never allowed to pick arbitrary provider actions or private targets.

## Verification

`npm test` checks OAuth state/PKCE, owner enforcement, secure cookies, CORS/CSRF, source permissions, conflict handling, write idempotency, provider adapters, and HTTP transport using mocked provider responses. Live credentials and hosted integration flows must be verified separately. `npm run audit:public` checks the source and generated artifact for forbidden private files, identifier patterns, credentials, and hardcoded document links. Auditing is a defense in depth measure and must accompany human review before adding source data or integrations.
