# Public-source migration

The public codebase was prepared from a clean export of the private UI, not by pushing the original repository or its history.

Removed from this export:

- Authored document snapshots and full-text source imports.
- Interview trees, desire mappings, role lists, room rule datasets, and asset specification records.
- Hardcoded lore, world identities, approved design decisions, and canonical asset identifiers.
- Private Notion page/data-source IDs and project-specific source links.
- Site identity, deployment manifests, platform credentials, runtime databases, local drafts, and generated artifacts.
- Sites-only authentication and connector bindings from the browser application.

Retained and adapted:

- Workspace layout, responsive styles, navigation, inspectors, comparison UI, and reusable interface components.
- Source-neutral data projection types and runtime API calls, backed by the co-hosted owner-authorized Node service.
- A generic room-label simulator and copyable diagnostic overlay code. These do not modify the game.
- Explicit setup/error states when a backend or source connection is unavailable.

The public shell does not contain a substitute project database. The original private deployment and any previous workspace edits are retained separately; nothing is automatically migrated into Notion or GitHub by this export.

The frontend and backend are now co-hosted by one Node service; GitHub Pages is not used. Private source bindings and provider authorization must be configured at runtime on that backend, never passed as frontend build variables.

The backend implementation now lives in `backend/`. Live operation still requires server-side GitHub App credentials, a Notion integration token, source bindings, and an HTTPS deployment. Provider secrets and actual binding values have not been committed.

The previous split-origin deployment workflow has been removed. Public assets are served from `dist/`, while API/auth/asset requests retain backend authentication. Runtime origin configuration stays server-side.
