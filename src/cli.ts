#!/usr/bin/env node
/**
 * dashcheck CLI.
 *
 *   dashcheck validate_setup_file '<json>'
 *   dashcheck validate_widget_response '<json>'
 *   dashcheck create_setup_link '<json>'
 *   dashcheck mcp
 *   dashcheck --version
 *
 * Each tool subcommand takes one JSON argument string with the
 * tool's arguments and prints the tool's result text. Exit
 * codes: 0 success, 1 runtime error, 2 usage error.
 */
import {
  createSetupLink,
  validateSetupFile,
  validateWidgetResponse,
  VERSION,
} from "./validate.js";

const TOOL_NAMES = [
  "validate_setup_file",
  "validate_widget_response",
  "create_setup_link",
] as const;

function usage(): never {
  console.error(`Usage:
  dashcheck <tool> '<json-args>'     one of: ${TOOL_NAMES.join(", ")}
  dashcheck mcp
  dashcheck --version`);
  process.exit(2);
}

async function runTool(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case "validate_setup_file":
      return validateSetupFile(args as never);
    case "validate_widget_response":
      return validateWidgetResponse(args as never);
    case "create_setup_link":
      return createSetupLink(args as never);
    default:
      usage();
  }
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "--version" || cmd === "-v") {
    console.log(VERSION);
    return;
  }
  if (cmd === "mcp") {
    if (rest.length !== 0) usage();
    await import("./mcp.js");
    return;
  }
  if (!(TOOL_NAMES as readonly string[]).includes(cmd ?? "")) usage();
  if (rest.length > 1) usage();
  let args: Record<string, unknown> = {};
  if (rest.length === 1) {
    try {
      const parsed: unknown = JSON.parse(rest[0]);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) usage();
      args = parsed as Record<string, unknown>;
    } catch {
      console.error("error: argument must be a JSON object string");
      process.exit(2);
    }
  }
  try {
    const out = await runTool(cmd, args);
    console.log(out);
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

void main();
