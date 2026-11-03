# dashcheck

Check a dashboard before you ship it. dashcheck is a small
client for the dashboardbase validation service: hand it a
setup file and it reports any schema, layout, binding or
contents errors; hand it the JSON a widget endpoint actually
returned and it checks that body against the widget contract
for its type; and when a setup is ready to share, it can mint
a read-only link to it that expires after 48 hours.

Setup content can be passed inline as a string or pointed at
with a local file path — in the path case the file is read on
your machine and its text is what gets sent. Whatever the
service returns comes back exactly as it sent it: nothing is
trimmed, renamed or summarised on the way through. That
includes refusals: if a setup file carries credentials, the
service itself refuses to create a link and lists the
offending fields, and that refusal body passes through like
any other response.

## Configuration

Three environment variables control the client:

- `DASHBOARDBASE_API_URL` (optional) — API base URL.
  Defaults to `https://api.dashboardbase.com`.
- `DASHBOARDBASE_API_KEY` (optional) — when set, it is sent
  on every request as the `x-api-key` header. Leaving it
  unset is not an error: the validation endpoints are usable
  without a key.
- `DASHBOARDBASE_TIMEOUT_MS` (optional) — request timeout
  in milliseconds, enforced with an abort controller.
  Defaults to `15000`; a timeout counts as a fetch failure.

## Tools

- `validate_setup_file` — validate a dashboardbase setup
  file (JSON) and return any schema, layout, binding, or
  contents errors. Takes `content` (the setup file contents)
  or `path` (a local path to a setup file); one of them is
  required.
- `validate_widget_response` — validate a widget endpoint's
  JSON response against the dashboardbase widget contract
  for its type (`kpi`, `timeseries`, `bar`, `table` or
  `text`). Takes `response` (the JSON body the endpoint
  returned) or `path` (a local path to a JSON file holding
  the response); one of them is required. `widgetType` is
  optional and overrides the type field in the response
  envelope. A response value that parses as JSON is sent as
  the parsed value; otherwise it is sent as the raw string.
- `create_setup_link` — create a shareable, read-only setup
  link for a setup file; the link expires after 48 hours.
  Takes `content` or `path`, as above.

The one-of rule is enforced locally before any request:
`one of content or path is required` (for the
widget-response tool, `one of response or path is
required`). A local file that cannot be read fails with
`cannot read file: <path>`. An upstream non-2xx reply fails
with `dashboardbase error: HTTP <status>` and an
unreachable API (including a timeout) with `dashboardbase
unreachable`.

### Endpoint provenance

The original record pins the three tools, their argument
tables, the three environment variables, the 48-hour link
behaviour and the credential-refusal behaviour, but it does
not publish the upstream HTTP paths. The three paths below
are reconstructions, labelled as such:

- `POST <base>/validate/setup-file` with JSON body
  `{"content": "..."}` — reconstruction (used by
  `validate_setup_file`).
- `POST <base>/validate/widget-response` with JSON body
  `{"response": ..., "widgetType": "..."}` (the
  `widgetType` key is omitted when not given) —
  reconstruction (used by `validate_widget_response`).
- `POST <base>/setup-links` with JSON body
  `{"content": "..."}` — reconstruction (used by
  `create_setup_link`).

## CLI

Each tool is a subcommand taking one JSON argument string:

```bash
npx @reneturcios/dashcheck validate_setup_file '{"path":"./setup.json"}'
npx @reneturcios/dashcheck validate_widget_response '{"response":"{\"type\":\"kpi\",\"value\":42}","widgetType":"kpi"}'
npx @reneturcios/dashcheck create_setup_link '{"content":"{\"widgets\":[]}"}'
npx @reneturcios/dashcheck --version
```

Output is the tool's result text (the upstream body on
success). Exit codes: `0` on success, `1` on a runtime
error (including a validation, file-read or upstream
failure), `2` on a usage error.

## MCP server

```bash
npx -y @reneturcios/dashcheck mcp
```

MCP client config (the key is optional; provide it through
the client's environment when you have one):

```json
{
  "mcpServers": {
    "dashcheck": {
      "command": "npx",
      "args": ["-y", "@reneturcios/dashcheck", "mcp"],
      "env": {
        "DASHBOARDBASE_API_KEY": "<your key>"
      }
    }
  }
}
```

## Docker

```bash
docker run -i ghcr.io/cloudcorprecords/dashcheck
docker run --rm ghcr.io/cloudcorprecords/dashcheck validate_setup_file '{"path":"./setup.json"}'
```

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # tsx --test test/*.test.ts (fake fetch and injected file reader only, no network)
npm run dev     # run the CLI from source
```

## License

MIT — Copyright (c) 2026 Rene Turcios
