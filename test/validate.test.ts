import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createSetupLink,
  validateSetupFile,
  validateWidgetResponse,
} from "../src/validate.js";
import type { FetchFn, ValidateDeps } from "../src/types.js";

/**
 * Every test runs against an injected fake fetch, an injected
 * env, and an injected file reader (or a temp file for the
 * default reader): no live network, no live call is made.
 * The CLI tests spawn the real CLI through tsx and only
 * exercise paths that fail before any request (version,
 * usage, validation, file read).
 */

type Captured = {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

function makeFetch(
  handler: (url: string) => { status?: number; body: unknown },
  captured: Captured[] = [],
): FetchFn {
  return async (url, init) => {
    captured.push({ url, method: init?.method, headers: init?.headers, body: init?.body });
    const r = handler(url);
    const status = r.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => (typeof r.body === "string" ? r.body : JSON.stringify(r.body)),
    };
  };
}

const okFetch = (body: unknown = { ok: true }, captured: Captured[] = []) =>
  makeFetch(() => ({ body }), captured);

const throwingFetch: FetchFn = async () => {
  throw new Error("connection refused");
};

function reader(files: Record<string, string>, readPaths: string[] = []) {
  return async (path: string): Promise<string> => {
    readPaths.push(path);
    const text = files[path];
    if (text === undefined) throw new Error("ENOENT");
    return text;
  };
}

function deps(fetchFn: FetchFn, extra: Partial<ValidateDeps> = {}): ValidateDeps {
  return { fetchFn, env: {}, readTextFile: reader({}), ...extra };
}

function keyDeps(fetchFn: FetchFn, extra: Partial<ValidateDeps> = {}): ValidateDeps {
  return { fetchFn, env: { DASHBOARDBASE_API_KEY: "test-key" }, readTextFile: reader({}), ...extra };
}

async function expectError(promise: Promise<unknown>, message: string): Promise<void> {
  await assert.rejects(promise, (err: unknown) => {
    assert.equal(err instanceof Error ? err.message : String(err), message);
    return true;
  });
}

const SETUP = '{"widgets":[{"type":"kpi","title":"Revenue"}]}';
const WIDGET_JSON = '{"type":"kpi","value":42}';

describe("validate_setup_file (labelled reconstruction wire)", () => {
  it("POSTs {content} to <base>/validate/setup-file and returns the body verbatim", async () => {
    const captured: Captured[] = [];
    const body = { valid: true, errors: [] };
    const out = await validateSetupFile({ content: SETUP }, deps(okFetch(body, captured)));
    assert.equal(out, JSON.stringify(body));
    assert.equal(captured.length, 1);
    assert.equal(captured[0].url, "https://api.dashboardbase.com/validate/setup-file");
    assert.equal(captured[0].method, "POST");
    assert.deepEqual(JSON.parse(captured[0].body ?? ""), { content: SETUP });
    assert.equal(captured[0].headers?.["Content-Type"], "application/json");
  });

  it("sends x-api-key when a key is set and omits it when not", async () => {
    const withKey: Captured[] = [];
    await validateSetupFile({ content: SETUP }, keyDeps(okFetch({}, withKey)));
    assert.equal(withKey[0].headers?.["x-api-key"], "test-key");
    const withoutKey: Captured[] = [];
    await validateSetupFile({ content: SETUP }, deps(okFetch({}, withoutKey)));
    assert.equal(withoutKey[0].headers?.["x-api-key"], undefined);
  });

  it("reads the key and base URL from env", async () => {
    const captured: Captured[] = [];
    await validateSetupFile(
      { content: SETUP },
      deps(okFetch({}, captured), {
        env: { DASHBOARDBASE_API_KEY: "env-key", DASHBOARDBASE_API_URL: "https://db.example.test/v1/" },
      }),
    );
    assert.equal(captured[0].url, "https://db.example.test/v1/validate/setup-file");
    assert.equal(captured[0].headers?.["x-api-key"], "env-key");
  });

  it("reads a path arg locally through the injected reader and sends its text as content", async () => {
    const captured: Captured[] = [];
    const readPaths: string[] = [];
    const out = await validateSetupFile(
      { path: "/tmp/setup.json" },
      deps(okFetch({ valid: false }, captured), {
        readTextFile: reader({ "/tmp/setup.json": SETUP }, readPaths),
      }),
    );
    assert.equal(out, '{"valid":false}');
    assert.deepEqual(readPaths, ["/tmp/setup.json"]);
    assert.deepEqual(JSON.parse(captured[0].body ?? ""), { content: SETUP });
  });

  it("reads a path arg from a real temp file with the default reader", async () => {
    const dir = mkdtempSync(join(tmpdir(), "dashcheck-"));
    const file = join(dir, "setup.json");
    writeFileSync(file, SETUP);
    const captured: Captured[] = [];
    await validateSetupFile(
      { path: file },
      { fetchFn: okFetch({}, captured), env: {} },
    );
    assert.deepEqual(JSON.parse(captured[0].body ?? ""), { content: SETUP });
  });

  it("prefers inline content over path and does not read the file", async () => {
    const readPaths: string[] = [];
    const captured: Captured[] = [];
    await validateSetupFile(
      { content: SETUP, path: "/tmp/other.json" },
      deps(okFetch({}, captured), { readTextFile: reader({}, readPaths) }),
    );
    assert.deepEqual(readPaths, []);
    assert.deepEqual(JSON.parse(captured[0].body ?? ""), { content: SETUP });
  });

  it("returns a string body verbatim, without JSON re-serialisation", async () => {
    const raw = '{ "valid" :  false,  "errors": [ "bad binding" ] }';
    const out = await validateSetupFile({ content: SETUP }, deps(okFetch(raw)));
    assert.equal(out, raw);
  });

  it("rejects missing content and path with the one-of error and makes no request", async () => {
    const captured: Captured[] = [];
    await expectError(
      validateSetupFile({}, deps(okFetch({}, captured))),
      "one of content or path is required",
    );
    assert.deepEqual(captured, []);
  });

  it("rejects a non-string content with no path", async () => {
    await expectError(
      validateSetupFile({ content: 42 } as never, deps(okFetch())),
      "one of content or path is required",
    );
  });

  it("maps a file read failure to cannot read file: <path> and makes no request", async () => {
    const captured: Captured[] = [];
    await expectError(
      validateSetupFile(
        { path: "/nope/missing.json" },
        deps(okFetch({}, captured), { readTextFile: reader({}) }),
      ),
      "cannot read file: /nope/missing.json",
    );
    assert.deepEqual(captured, []);
  });
});

describe("validate_widget_response (labelled reconstruction wire)", () => {
  it("POSTs the parsed JSON response to <base>/validate/widget-response", async () => {
    const captured: Captured[] = [];
    const out = await validateWidgetResponse({ response: WIDGET_JSON }, deps(okFetch({ valid: true }, captured)));
    assert.equal(out, '{"valid":true}');
    assert.equal(captured[0].url, "https://api.dashboardbase.com/validate/widget-response");
    assert.equal(captured[0].method, "POST");
    assert.deepEqual(JSON.parse(captured[0].body ?? ""), { response: { type: "kpi", value: 42 } });
  });

  it("sends a non-JSON response as the raw string", async () => {
    const captured: Captured[] = [];
    await validateWidgetResponse({ response: "not json at all" }, deps(okFetch({}, captured)));
    assert.deepEqual(JSON.parse(captured[0].body ?? ""), { response: "not json at all" });
  });

  it("includes widgetType only when given", async () => {
    const withType: Captured[] = [];
    await validateWidgetResponse(
      { response: WIDGET_JSON, widgetType: "timeseries" },
      deps(okFetch({}, withType)),
    );
    assert.deepEqual(JSON.parse(withType[0].body ?? ""), {
      response: { type: "kpi", value: 42 },
      widgetType: "timeseries",
    });
    const withoutType: Captured[] = [];
    await validateWidgetResponse({ response: WIDGET_JSON }, deps(okFetch({}, withoutType)));
    assert.equal("widgetType" in JSON.parse(withoutType[0].body ?? ""), false);
  });

  it("reads a path arg locally and sends its parsed JSON as the response", async () => {
    const captured: Captured[] = [];
    await validateWidgetResponse(
      { path: "/tmp/widget.json" },
      deps(okFetch({}, captured), {
        readTextFile: reader({ "/tmp/widget.json": WIDGET_JSON }),
      }),
    );
    assert.deepEqual(JSON.parse(captured[0].body ?? ""), { response: { type: "kpi", value: 42 } });
  });

  it("rejects missing response and path with the one-of error and makes no request", async () => {
    const captured: Captured[] = [];
    await expectError(
      validateWidgetResponse({}, deps(okFetch({}, captured))),
      "one of response or path is required",
    );
    assert.deepEqual(captured, []);
  });

  it("maps a file read failure to cannot read file: <path>", async () => {
    await expectError(
      validateWidgetResponse(
        { path: "/nope/widget.json" },
        deps(okFetch(), { readTextFile: reader({}) }),
      ),
      "cannot read file: /nope/widget.json",
    );
  });

  it("sends x-api-key when a key is set", async () => {
    const captured: Captured[] = [];
    await validateWidgetResponse({ response: WIDGET_JSON }, keyDeps(okFetch({}, captured)));
    assert.equal(captured[0].headers?.["x-api-key"], "test-key");
  });
});

describe("create_setup_link (labelled reconstruction wire)", () => {
  it("POSTs {content} to <base>/setup-links and returns the body verbatim", async () => {
    const captured: Captured[] = [];
    const body = { url: "https://dashboardbase.com/s/abc", expires_in_hours: 48 };
    const out = await createSetupLink({ content: SETUP }, deps(okFetch(body, captured)));
    assert.equal(out, JSON.stringify(body));
    assert.equal(captured[0].url, "https://api.dashboardbase.com/setup-links");
    assert.equal(captured[0].method, "POST");
    assert.deepEqual(JSON.parse(captured[0].body ?? ""), { content: SETUP });
  });

  it("reads a path arg locally and sends its text as content", async () => {
    const captured: Captured[] = [];
    await createSetupLink(
      { path: "/tmp/setup.json" },
      deps(okFetch({}, captured), { readTextFile: reader({ "/tmp/setup.json": SETUP }) }),
    );
    assert.deepEqual(JSON.parse(captured[0].body ?? ""), { content: SETUP });
  });

  it("passes an upstream credential-refusal body through verbatim", async () => {
    const refusal = '{"error":"setup file contains credentials","fields":["api_key","db_password"]}';
    const out = await createSetupLink({ content: SETUP }, deps(okFetch(refusal)));
    assert.equal(out, refusal);
  });

  it("rejects missing content and path with the one-of error and makes no request", async () => {
    const captured: Captured[] = [];
    await expectError(
      createSetupLink({}, deps(okFetch({}, captured))),
      "one of content or path is required",
    );
    assert.deepEqual(captured, []);
  });

  it("maps a file read failure to cannot read file: <path>", async () => {
    await expectError(
      createSetupLink(
        { path: "/nope/setup.json" },
        deps(okFetch(), { readTextFile: reader({}) }),
      ),
      "cannot read file: /nope/setup.json",
    );
  });
});

describe("upstream errors and timeout", () => {
  it("maps a non-2xx reply to dashboardbase error: HTTP <status>", async () => {
    const fetchFn = makeFetch(() => ({ status: 422, body: "bad setup" }));
    await expectError(
      validateSetupFile({ content: SETUP }, deps(fetchFn)),
      "dashboardbase error: HTTP 422",
    );
  });

  it("maps a 500 reply to dashboardbase error: HTTP 500", async () => {
    const fetchFn = makeFetch(() => ({ status: 500, body: "boom" }));
    await expectError(
      createSetupLink({ content: SETUP }, deps(fetchFn)),
      "dashboardbase error: HTTP 500",
    );
  });

  it("maps a throwing fetch to dashboardbase unreachable", async () => {
    await expectError(
      validateSetupFile({ content: SETUP }, deps(throwingFetch)),
      "dashboardbase unreachable",
    );
    await expectError(
      validateWidgetResponse({ response: WIDGET_JSON }, deps(throwingFetch)),
      "dashboardbase unreachable",
    );
  });

  it("maps an abort from the timeout to dashboardbase unreachable", async () => {
    const abortingFetch: FetchFn = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    await expectError(
      validateSetupFile(
        { content: SETUP },
        deps(abortingFetch, { env: { DASHBOARDBASE_TIMEOUT_MS: "20" } }),
      ),
      "dashboardbase unreachable",
    );
  });

  it("honours a timeout override from deps", async () => {
    const abortingFetch: FetchFn = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    await expectError(
      createSetupLink({ content: SETUP }, deps(abortingFetch, { timeoutMs: 20 })),
      "dashboardbase unreachable",
    );
  });
});

/* ------------------------------------------------------------------ */
/* CLI (spawned through tsx; only pre-request paths are exercised)     */
/* ------------------------------------------------------------------ */

function runCli(args: string[], env: Record<string, string> = {}) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  return spawnSync(join(root, "node_modules", ".bin", "tsx"), ["src/cli.ts", ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, DASHBOARDBASE_API_KEY: "", DASHBOARDBASE_API_URL: "", ...env },
  });
}

describe("dashcheck CLI", () => {
  it("prints 0.1.0 for --version and exits 0", () => {
    const res = runCli(["--version"]);
    assert.equal(res.status, 0);
    assert.equal(res.stdout.trim(), "0.1.0");
  });

  it("exits 2 with usage for an unknown subcommand", () => {
    const res = runCli(["not-a-tool"]);
    assert.equal(res.status, 2);
    assert.match(res.stderr, /Usage/);
  });

  it("exits 2 for a non-JSON argument string", () => {
    const res = runCli(["validate_setup_file", "not json"]);
    assert.equal(res.status, 2);
  });

  it("exits 2 for extra arguments", () => {
    const res = runCli(["validate_setup_file", "{}", "{}"]);
    assert.equal(res.status, 2);
  });

  it("exits 1 with the one-of message when neither content nor path is given", () => {
    const res = runCli(["validate_setup_file", "{}"]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /one of content or path is required/);
  });

  it("exits 1 with cannot read file for a missing path arg", () => {
    const res = runCli(["create_setup_link", JSON.stringify({ path: "/nope/definitely-missing.json" })]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /cannot read file: \/nope\/definitely-missing\.json/);
  });
});
