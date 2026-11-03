/**
 * dashcheck core: three tools over the dashboardbase
 * validation API.
 *
 * Shared rules, as documented in the spec:
 * - The base URL defaults to `https://api.dashboardbase.com`
 *   and is overridable via env `DASHBOARDBASE_API_URL` (or
 *   the injectable deps in tests).
 * - The API key from env `DASHBOARDBASE_API_KEY` is
 *   optional: when set it is sent as the `x-api-key` header
 *   on every request; when unset no such header is sent and
 *   its absence is never an error.
 * - The request timeout comes from env
 *   `DASHBOARDBASE_TIMEOUT_MS`, default 15000, enforced
 *   with an AbortController; a timeout is a fetch failure.
 * - When `path` is given, the file is read locally (through
 *   the injectable reader) and its text is sent as the
 *   content / response value. A read failure fails with
 *   `cannot read file: <path>` and makes no request.
 * - "One of them required" is enforced locally before any
 *   request: `one of content or path is required` for the
 *   setup-file tools, and `one of response or path is
 *   required` for the widget-response tool (labelled
 *   rendering of the same pinned rule for its argument
 *   names).
 * - For `validate_widget_response`, the response value is
 *   sent as given: if it parses as JSON it is sent as the
 *   parsed value, otherwise as the raw string (labelled).
 *   `widgetType` is included only when given.
 * - A successful call returns the upstream response body
 *   verbatim. That includes an upstream refusal body for
 *   link creation (for example when a setup file carries
 *   credentials): the refusal is upstream behaviour, not a
 *   local check, and passes through like any other body.
 * - A non-2xx upstream response fails with
 *   `dashboardbase error: HTTP <status>`; a throwing fetch
 *   (including a timeout abort) fails with
 *   `dashboardbase unreachable`.
 *
 * Wires (labelled reconstructions, not published in the
 * original record): `POST <base>/validate/setup-file` body
 * `{content}`; `POST <base>/validate/widget-response` body
 * `{response, widgetType?}`; `POST <base>/setup-links` body
 * `{content}`. JSON content type on every request.
 */
import { readFile } from "node:fs/promises";
import type {
  CreateSetupLinkArgs,
  FetchFn,
  FetchResponseLike,
  ReadTextFileFn,
  ValidateDeps,
  ValidateSetupFileArgs,
  ValidateWidgetResponseArgs,
} from "./types.js";

export const VERSION = "0.1.0";

export const DEFAULT_BASE_URL = "https://api.dashboardbase.com";
export const DEFAULT_TIMEOUT_MS = 15000;

function envOf(deps: ValidateDeps): Record<string, string | undefined> {
  return deps.env ?? process.env;
}

function baseUrl(deps: ValidateDeps): string {
  if (deps.baseUrl && deps.baseUrl.trim() !== "") {
    return deps.baseUrl.trim().replace(/\/+$/, "");
  }
  const raw = envOf(deps).DASHBOARDBASE_API_URL;
  const base = raw && raw.trim() !== "" ? raw.trim() : DEFAULT_BASE_URL;
  return base.replace(/\/+$/, "");
}

function apiKey(deps: ValidateDeps): string | undefined {
  const key = deps.apiKey ?? envOf(deps).DASHBOARDBASE_API_KEY;
  return key ? key : undefined;
}

function timeoutMs(deps: ValidateDeps): number {
  if (typeof deps.timeoutMs === "number" && deps.timeoutMs > 0) {
    return deps.timeoutMs;
  }
  const raw = envOf(deps).DASHBOARDBASE_TIMEOUT_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

async function defaultFetch(
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
): Promise<FetchResponseLike> {
  return fetch(url, init);
}

function fetchFn(deps: ValidateDeps): FetchFn {
  return deps.fetchFn ?? defaultFetch;
}

async function defaultReadTextFile(path: string): Promise<string> {
  return readFile(path, "utf8");
}

function readTextFile(deps: ValidateDeps): ReadTextFileFn {
  return deps.readTextFile ?? defaultReadTextFile;
}

/**
 * Resolve a content-or-path argument pair to the text to
 * send. Inline content wins when it is a string; otherwise
 * a string path is read locally. Anything else fails with
 * the pinned one-of error, and a read failure fails with
 * `cannot read file: <path>`.
 */
async function resolveContent(
  deps: ValidateDeps,
  inline: unknown,
  path: unknown,
  oneOfMessage: string,
): Promise<string> {
  if (typeof inline === "string") return inline;
  if (typeof path === "string" && path !== "") {
    try {
      return await readTextFile(deps)(path);
    } catch {
      throw new Error(`cannot read file: ${path}`);
    }
  }
  throw new Error(oneOfMessage);
}

/** Run one POST against the API and return the body text verbatim. */
async function callApi(deps: ValidateDeps, path: string, payload: unknown): Promise<string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const key = apiKey(deps);
  if (key) headers["x-api-key"] = key;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs(deps));
  let res: FetchResponseLike;
  try {
    res = await fetchFn(deps)(`${baseUrl(deps)}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch {
    throw new Error("dashboardbase unreachable");
  } finally {
    clearTimeout(timer);
  }
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`dashboardbase error: HTTP ${res.status}`);
  }
  return res.text();
}

/* ------------------------------------------------------------------ */
/* Tools                                                               */
/* ------------------------------------------------------------------ */

/**
 * Validate a dashboardbase setup file (JSON).
 * Wire (labelled reconstruction): POST <base>/validate/setup-file.
 */
export async function validateSetupFile(
  args: ValidateSetupFileArgs,
  deps: ValidateDeps = {},
): Promise<string> {
  const a = (args ?? {}) as unknown as Record<string, unknown>;
  const content = await resolveContent(deps, a.content, a.path, "one of content or path is required");
  return callApi(deps, "/validate/setup-file", { content });
}

/**
 * Validate a widget endpoint's JSON response against the
 * widget contract for its type.
 * Wire (labelled reconstruction): POST <base>/validate/widget-response.
 */
export async function validateWidgetResponse(
  args: ValidateWidgetResponseArgs,
  deps: ValidateDeps = {},
): Promise<string> {
  const a = (args ?? {}) as unknown as Record<string, unknown>;
  const raw = await resolveContent(deps, a.response, a.path, "one of response or path is required");
  let response: unknown = raw;
  try {
    response = JSON.parse(raw);
  } catch {
    response = raw;
  }
  const payload: Record<string, unknown> = { response };
  if (typeof a.widgetType === "string") payload.widgetType = a.widgetType;
  return callApi(deps, "/validate/widget-response", payload);
}

/**
 * Create a shareable, read-only setup link (expires after
 * 48 hours). An upstream refusal for a credential-carrying
 * file passes through verbatim like any other body.
 * Wire (labelled reconstruction): POST <base>/setup-links.
 */
export async function createSetupLink(
  args: CreateSetupLinkArgs,
  deps: ValidateDeps = {},
): Promise<string> {
  const a = (args ?? {}) as unknown as Record<string, unknown>;
  const content = await resolveContent(deps, a.content, a.path, "one of content or path is required");
  return callApi(deps, "/setup-links", { content });
}
