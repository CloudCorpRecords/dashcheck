/**
 * dashcheck types.
 *
 * Three tools wrapping the dashboardbase validation API.
 * Every tool answers with the upstream body passed through
 * unchanged, as a single string; failures are Errors
 * carrying the pinned error strings.
 */

export interface ValidateSetupFileArgs {
  content?: string;
  path?: string;
}

export interface ValidateWidgetResponseArgs {
  response?: string;
  path?: string;
  widgetType?: string;
}

export interface CreateSetupLinkArgs {
  content?: string;
  path?: string;
}

/** The minimal slice of a fetch Response this client relies on. */
export interface FetchResponseLike {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

/** Injectable fetch, so tests never touch the live network. */
export type FetchFn = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<FetchResponseLike>;

/** Injectable local file reader, so path args are testable offline. */
export type ReadTextFileFn = (path: string) => Promise<string>;

/** Runtime dependencies for the core, all injectable in tests. */
export interface ValidateDeps {
  /** Fetch implementation. Defaults to the global fetch. */
  fetchFn?: FetchFn;
  /** Environment (DASHBOARDBASE_API_URL / DASHBOARDBASE_API_KEY / DASHBOARDBASE_TIMEOUT_MS). Defaults to process.env. */
  env?: Record<string, string | undefined>;
  /** File reader for `path` args. Defaults to fs/promises readFile (utf8). */
  readTextFile?: ReadTextFileFn;
  /** API key override. Defaults to env DASHBOARDBASE_API_KEY. */
  apiKey?: string;
  /** Base URL override. Defaults to env DASHBOARDBASE_API_URL or the default base. */
  baseUrl?: string;
  /** Timeout override in ms. Defaults to env DASHBOARDBASE_TIMEOUT_MS or 15000. */
  timeoutMs?: number;
}
