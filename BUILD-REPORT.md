# dashcheck — Build Report (Batch 24)

Rebuild of the `com.dashboardbase/mcp` MCP server (npm
`@dashboardbase/mcp` v1.0.1) from the firsthand spec in
`specs-batch24/dashcheck.md`. Built 2026-10-27.

## Identity

- npm: `@reneturcios/dashcheck` @ 0.1.0, bin `dashcheck` →
  `dist/cli.js`
- MCP Registry name: `io.github.CloudCorpRecords/dashcheck`
  (matches `package.json` `mcpName`, `server.json` `name`,
  and the Dockerfile `io.modelcontextprotocol.server.name`
  label)
- server.json description (96 chars, verified):
  "Validate dashboard setup files and widget endpoint
  responses against the dashboardbase contract."
- server.json: npm package entry carries `"version":
  "0.1.0"`; the OCI entry
  (`ghcr.io/cloudcorprecords/dashcheck:0.1.0`) carries
  **no** `version` field (verified).

## Files (19-file factory set, per TEMPLATE.md §2)

package.json, server.json, Dockerfile, tsconfig.json
(byte-identical to builds/casebrief/tsconfig.json, verified
with `cmp`), .gitignore, .dockerignore, package-lock.json,
README.md (fresh prose), LICENSE (MIT, © 2026 Rene
Turcios), CHANGELOG.md (single 0.1.0 entry dated
2026-10-27), src/index.ts, src/cli.ts, src/mcp.ts,
src/types.ts, src/validate.ts (core),
test/validate.test.ts, and the four workflows under
.github/workflows/ (publish-container adapted: IMAGE
ghcr.io/cloudcorprecords/dashcheck, smoke assertion on
server name `dashcheck`). Plus this BUILD-REPORT.md and
the parity-out/ artifacts. The parity fixture lives at
`harness/fixtures/dashboardbase-mcp-tools-original.json`
with the spec's exact `_source` string.

## Implementation

- `src/mcp.ts`: low-level `Server` API
  (`sdk/server/index.js` + `StdioServerTransport`,
  handlers for `ListToolsRequestSchema` /
  `CallToolRequestSchema` from `sdk/types.js`), explicit
  JSON-schema literals for all three tools
  (validate_setup_file, validate_widget_response,
  create_setup_link); no McpServer/zod registration. Tool
  descriptions and input schemas are the fixture's,
  exactly — every schema is `{content|response, path,
  widgetType?}` string properties with no `required` list
  (the one-of rule is handler-enforced, per the pinned
  tables) and no `additionalProperties`.
- `src/validate.ts`: `VERSION = "0.1.0"`. All upstream
  access goes through injectable deps (`fetchFn`, `env`,
  `readTextFile`, plus `apiKey` / `baseUrl` / `timeoutMs`
  overrides). Base URL defaults to
  `https://api.dashboardbase.com`, overridable via
  `DASHBOARDBASE_API_URL`. The key from
  `DASHBOARDBASE_API_KEY` is optional: when set it is sent
  as the `x-api-key` header on every request; when unset
  no such header is sent and that is never an error. The
  timeout comes from `DASHBOARDBASE_TIMEOUT_MS`, default
  15000, enforced with an AbortController; a timeout is a
  fetch failure.
- Argument resolution: inline `content` / `response` wins
  when it is a string; otherwise a `path` is read locally
  through the reader and its text is sent. Neither →
  `one of content or path is required` (setup/link tools)
  or `one of response or path is required` (widget tool —
  labelled rendering, see Gaps). A read failure →
  `cannot read file: <path>`, with no request made. For
  the widget tool the response value is sent as the parsed
  JSON value when it parses, otherwise as the raw string
  (labelled), and `widgetType` is included only when
  given.
- Success returns the upstream body text verbatim —
  including an upstream refusal body for link creation
  when a setup file carries credentials (the refusal is
  upstream behaviour, not a local check). Non-2xx →
  `dashboardbase error: HTTP <status>`; a throwing fetch
  (including a timeout abort) → `dashboardbase
  unreachable`.
- CLI: one subcommand per tool taking a JSON argument
  string, `mcp`, `--version` (prints `0.1.0`); unknown
  subcommand → usage on stderr, exit 2; tool errors
  exit 1 (both spot-checked against the built CLI and in
  the spawned-CLI tests).

## Endpoint provenance (pinned vs reconstructed)

README-pinned (from the npm registry record):

- The 3 tools, their argument tables ("one of them
  required"), the response contract (upstream body
  verbatim), the 48-hour setup-link expiry, and the
  upstream refusal behaviour for credential-carrying
  files.
- All three environment variables:
  `DASHBOARDBASE_API_URL`, `DASHBOARDBASE_API_KEY` (sent
  as `x-api-key` when set), and
  `DASHBOARDBASE_TIMEOUT_MS` (default 15000).

Labelled reconstructions (also labelled in README.md and
in the spec — the upstream HTTP paths are not published
in the record):

- Default base URL `https://api.dashboardbase.com` is the
  spec-pinned default; the paths below are the
  reconstructions.
- `POST <base>/validate/setup-file` with body
  `{"content": "..."}` — `validate_setup_file`.
- `POST <base>/validate/widget-response` with body
  `{"response": ..., "widgetType": "..."}` (`widgetType`
  omitted when not given) — `validate_widget_response`.
- `POST <base>/setup-links` with body
  `{"content": "..."}` — `create_setup_link`.

## Verification (all real, run 2026-10-27)

- `npm run build` (tsc): exit 0. Fresh `npx tsc --noEmit`:
  exit 0.
- `npm test`: **33 tests, 33 pass, 0 fail** — fake fetch,
  injected env and injected file reader only, plus one
  real temp file for the default reader; no live network
  (the CLI tests spawn the CLI through tsx and exercise
  only paths that fail before any request). Covers all
  three wires (POST URL, body shape, Content-Type), the
  `x-api-key` header present with a key and absent
  without, env key/base handling, path args read locally
  and sent as content (injected reader, temp file, and
  inline-content precedence), verbatim passthrough
  (including a non-canonical JSON string and an upstream
  credential-refusal body for link creation), the widget
  response parse rule (JSON → parsed value, non-JSON →
  raw string) and `widgetType` inclusion/omission, both
  one-of errors and the read-failure error (each with no
  request made), the HTTP-error and unreachable mappings,
  the timeout abort (via env and via deps override), and
  the CLI cases (`--version` exit 0, unknown subcommand /
  non-JSON argument / extra arguments exit 2, one-of and
  read-failure exit 1).
- `node dist/cli.js --version`: prints `0.1.0`.
  Unknown subcommand exits 2 with usage (verified against
  the built CLI).
- Parity: tools captured by sending initialize +
  tools/list to `node dist/cli.js mcp` over stdio into
  `parity-out/tools-rebuild.json`, then
  `harness/parity.py` against
  `harness/fixtures/dashboardbase-mcp-tools-original.json`
  → **PASS, parity 100.0, identical_tools 3 / total 3**
  (see `parity-out/parity.json`).
- Lockfile (Route 3, clean): generated in a temp dir
  containing only `package.json` with
  `npm install --package-lock-only --ignore-scripts
  --offline`; verified it parses, `name` ==
  `@reneturcios/dashcheck`, **128 package entries**;
  copied in as `package-lock.json`, then
  `npm install --offline` in the build dir succeeded.
- Version consistency: `package.json` 0.1.0 =
  `server.json` top-level 0.1.0 = npm entry 0.1.0 = OCI
  tag `:0.1.0` = core `VERSION` 0.1.0 = CHANGELOG heading
  `## 0.1.0 (2026-10-27)`.

## Gaps

- Live upstream behaviour is unproven: no live call was
  made (tests are fake-fetch / injected-reader only).
- The three upstream HTTP paths are labelled
  reconstructions — the original record pins the tools,
  argument tables, env vars and behaviours but not the
  wire paths.
- Labelled rendering: the spec pins the one-of error
  string as `one of content or path is required`; for
  `validate_widget_response`, whose inline argument is
  named `response`, this rebuild renders the same rule as
  `one of response or path is required`. The setup-file
  and link tools use the pinned string verbatim.
- Labelled decision (from the spec): a widget `response`
  that parses as JSON is sent as the parsed value,
  otherwise as the raw string.
