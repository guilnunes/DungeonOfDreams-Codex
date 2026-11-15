# Protected backend contract

This directory specifies the backend boundary. It is not a deployed backend or a mock login implementation. The static Pages app must not be treated as authenticated until these endpoints are implemented by a server with a real identity provider and explicit source authorization.

## Endpoints

| Endpoint | Required behavior |
| --- | --- |
| `GET /auth/login` | Start server-controlled login. Validate OAuth state and PKCE where supported; constrain return destinations. |
| `GET /auth/logout` | Display sign-out confirmation. Logout must complete through a CSRF-protected POST, not mutate a session on GET. |
| `GET /api/session` | Return `user: null` or an authenticated user display name and CSRF token. Never expose provider tokens. |
| `GET /api/records` | Authorize the session and each source target, then return normalized source-owned records. Return 401 when signed out and 403 when permission is absent. |
| `GET /api/records?history=...` | Return only source-native revisions the visitor is authorized to view. |
| `POST /api/records` | Validate session, CSRF, write permission, target binding, expected source revision, and explicit submitted changes. Write only to the canonical provider. Reject conflicts with 409. |

Successful records response:

```json
{"records":[],"interviewRootId":null}
```

Successful signed-out session response:

```json
{"user":null}
```

A signed-in session response must contain `user.displayName` and `csrfToken`. Record fields are defined by the public projection type in `frontend/src/model.ts`. IDs, content, source URLs, relationships, and capabilities arrive at runtime after authorization; they are not build inputs.

## Authorization and deployment requirements

- Keep a server-side account allowlist initially; sign-in alone does not authorize the project.
- Require source read or write permission for every operation. Bind record IDs to server-owned provider targets; do not implement a generic URL or tool proxy.
- Keep sessions in Secure, HttpOnly cookies. Cross-origin cookie policy and CSRF handling must match the chosen domains and identity provider. Prefer related custom domains to reduce third-party-cookie failures.
- Allow CORS only from exact configured frontend origins, with credentials enabled. Never combine credentialed requests with a wildcard origin. Validate Origin and a session-bound CSRF token on writes.
- Store Notion and GitHub integration secrets in server-managed secrets, not this repository, frontend environment variables, localStorage, or URLs.
- Use private/no-store responses for user data. Never share one visitor's results or permissions with another.
- Preserve provider errors safely, source-specific loading status, and rate-limit timing. Do not leak credentials or private provider diagnostics into browser errors.
- Re-read source revision metadata before saving. Use GitHub blob SHAs for conflict checks and normally open a branch/PR for code or asset changes. For Notion, preserve unsupported blocks and acknowledge that read-before-write metadata checks alone are not atomic.
- Do not retry writes automatically when completion is uncertain, including after login. Add server-side duplicate-submission protection.
- Expose assets through an authorized endpoint or carefully scoped short-lived links. Do not make private repositories or asset buckets public to display images.
- Sanitize public source-link schemes and render provider text as text. Raw HTML from the source must not execute in the browser.

## Outstanding work

Deploy the backend, configure its identity provider and account policy, authorize the selected Notion pages and game repository, implement provider adapters, and verify hosted reads and explicitly authorized writes. Until then, the frontend stays empty and directs the user to connection setup.
