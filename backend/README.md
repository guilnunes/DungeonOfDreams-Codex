# Protected backend

Dependency-free Node 22 backend for GitHub App login, owner authorization, Notion document reads/writes, and GitHub file and asset reads. GitHub file edits create branches and pull requests rather than changing the canonical branch directly.

No credentials or project source targets are included in this repository. The backend fails startup when required identity settings are missing.

## Deploy and configure

1. Deploy the combined application as a **single Node 22 process** behind HTTPS. Run `npm run build` first; the server serves the resulting `dist/` alongside its API. `backend/Dockerfile` is available; build it from the repository root. Set `HOST=0.0.0.0` inside a container; bind to loopback when an adjacent reverse proxy terminates TLS. `/health` reports process availability without project data.
2. Set `CODEX_APP_ORIGIN` to the app’s canonical HTTPS origin. Render supplies `RENDER_EXTERNAL_URL` automatically, so this setting is optional on its default domain. Frontend and backend must use the same origin; split-origin configuration is rejected. Configure the proxy to forward requests without logging OAuth query parameters, cookies, request bodies, or authorization headers.
3. Register a private GitHub App. Set its callback to `/auth/callback` on that backend origin. Enable web-flow user authorization. Install it only on the required game repository. Grant repository Contents read/write and Pull requests read/write for PR creation, plus Metadata read access. Do not grant unrelated repositories or administration permissions. Disable webhook delivery if you are not configuring a webhook receiver. An app client ID is different from its numeric app ID.
4. Set server secrets `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`. Set `CODEX_OWNER_LOGIN` to the one GitHub account authorized to use this app. Successful provider login alone does not grant access to any other account.
5. Create a Notion internal integration with only the needed read/update capabilities, connect it to the intended project pages, and store its token in server secret `NOTION_TOKEN`. This is an owner-operated service integration: it does not impersonate arbitrary Notion visitors. Sharing the app with additional users requires a different Notion authorization model.
6. Build `CODEX_SOURCES_JSON` from the shape in `sources.example.json`, replacing every placeholder **on the server**, never in Git. Configure exact source IDs/paths and write policy. Start with `writable: false`, verify reads, then enable writes for intended records.
7. The browser uses its own HTTPS origin automatically. No API URL or provider secret is passed into the frontend build. The container includes both the UI and API.
8. Sign in and verify the intended account, source access, and a specific reviewed source edit. Local mocked-provider tests do not prove live integration credentials or permissions.

For local process startup, copy `backend/.env.example` to ignored `backend/.env`, fill it locally, and run `npm run backend`. The public URLs still require HTTPS through your chosen local tunnel or TLS proxy; there is no insecure development-login bypass.

## Cookies and hosting

Sessions use opaque Secure, HttpOnly cookies. GitHub authorization uses one-use state and PKCE; provider tokens remain in backend memory and are never returned to the frontend. Sign-out requires explicit form submission with CSRF protection. Session validity and the owner account are rechecked against GitHub for each authenticated request.

The UI, session endpoints, OAuth callback, and private assets share the same HTTPS origin. Cookies use SameSite=Lax; cross-site cookies are not enabled. A custom domain must also be configured as `CODEX_APP_ORIGIN` and in the GitHub App callback settings. API routes retain Origin and CSRF checks even though no second-domain CORS arrangement is needed.

The static handler serves only files inside the public build directory. It rejects hidden files, unknown file types, encoded traversal, and symlinks escaping that directory. It never serves backend source, environment files, or project documents. `/api/`, `/auth/`, and `/health` are always routed to the backend handler. The public app shell is not a credential or document store.

Session, OAuth state, write locks, and idempotency records are intentionally **in-memory**. Restarting signs everyone out. Run exactly one instance; horizontal replicas and restart-durable sessions require a shared transactional session/idempotency store before deployment at that scale. Render Free sleeping/redeploying also loses that process state. Never automatically replay an uncertain write after a restart or new sign-in; inspect its source first.

Sessions end after the configured lifetime, capped at eight hours and the provider token expiry. Expiring GitHub App tokens are not refreshed automatically; reauthenticate. No project-document database or offline mirror is created.

## Source bindings

- `id`: stable application reference; client submissions resolve only through this server-owned binding.
- `provider`: `notion` or `github`.
- `category`, `kind`, optional `title`: display projection defaults, not a copy of authored content.
- `format`: `text`, `record-json`, or `asset`.
- `writable`: an explicit server-side write policy, in addition to provider permissions.
- Notion requires `pageId`; GitHub requires `repository`, `branch`, and exact `path`.
- Optional `interviewRoot: true` identifies the root interview record without bundling it in frontend code.
- Optional `assetId` links a specification to another configured GitHub `asset` binding. Images are served through an authorized backend endpoint, not made public.

`text` reads native page markdown or UTF-8 repository content. Only body edits are accepted; native page titles and unrelated metadata are not overwritten by the form.

`record-json` is an explicitly configured structured record in a JSON file, or an entire Notion page containing one JSON object, optionally fenced with `json`. Fields such as title, body, status, population rules, and choices are projected into the editor. Unknown existing JSON fields are retained when updating known fields. This does not automatically convert existing narrative pages to JSON. Create/configure those structured records in the canonical source deliberately.

`asset` supports PNG, JPEG, WebP, GIF, and SVG from a selected GitHub path. It is read-only; binary uploads need a separate reviewed asset workflow. Files must be smaller than 2 MB and supported by GitHub's base64 contents response. Larger assets require a dedicated streaming storage adapter.

At most 100 explicit bindings are accepted. Reads are bounded and processed four at a time, with independent source errors. No recursive workspace crawl or arbitrary provider proxy is available. The first release edits existing configured records; creating new pages/files or retargeting bindings is done in the provider/server configuration.

## Writes and source history

The browser submits `{ id, revision, changes }` with a session-bound CSRF token and request ID. The server checks identity, Origin, binding, write policy, and source revision. It serializes writes per source and records one result per request ID. An interrupted or ambiguous write is not automatically replayed. The frontend requires an explicit review and submit click.

Notion: read page metadata and complete markdown, refuse writes to empty, truncated, or unsupported content, then use a synchronous exact-content `update_content` operation. A readback confirms the result. Warnings or mismatched content are reported as uncertain. Last-edited/content checks and a process-local lock cannot provide atomic transactions against external Notion editors; a narrow race remains. This app does not claim otherwise. Native Notion version history is opened in Notion, not copied into a new history database.

GitHub: check the blob SHA, create a fresh branch from the configured base, confirm that branch still contains the reviewed blob, update that file on the branch, and open a PR. Main stays unchanged until merge. Source history shows up to ten commits affecting the configured file. If a step fails partway through, a branch or PR may exist; inspect the repository before submitting another operation.

## Endpoints

| Endpoint | Behavior |
| --- | --- |
| `GET /health` | Public process health, no source details |
| `GET /auth/login` | Start state/PKCE-protected GitHub App authorization |
| `GET /auth/callback` | Exchange code server-side, enforce owner, rotate session |
| `GET /auth/logout` | Show explicit sign-out form |
| `POST /auth/logout` | CSRF-protected session destruction |
| `GET /api/session` | Signed-in display identity and CSRF token; no provider token |
| `GET /api/sources` | Authorized binding summaries without private target configuration |
| `GET /api/records` | Source records and independent errors, private/no-store |
| `GET /api/records?history=ID` | Source-native GitHub file revisions; Notion history guidance |
| `POST /api/records` | Reviewed writeback or PR, with conflict/idempotency checks |
| `GET /api/assets/ID` | Authorized binary image, optional validated commit revision |

## Reference documentation

- https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app
- https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents
- https://developers.notion.com/reference/retrieve-page-markdown
- https://developers.notion.com/reference/update-page-markdown
