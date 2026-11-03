# Changelog

## 0.1.0 (2026-10-27)

- Initial release: three MCP tools and matching CLI subcommands
  for dashboardbase validation — `validate_setup_file`,
  `validate_widget_response`, and `create_setup_link`.
- The API key is optional (`DASHBOARDBASE_API_KEY`, sent as
  `x-api-key` when set; base URL via `DASHBOARDBASE_API_URL`,
  timeout via `DASHBOARDBASE_TIMEOUT_MS`); setup content may be
  passed inline or read from a local path, and upstream bodies
  are returned verbatim.
