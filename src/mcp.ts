/**
 * dashcheck MCP server. Tools: validate_setup_file,
 * validate_widget_response, create_setup_link.
 *
 * Why the low-level Server instead of McpServer: the
 * high-level helper converts zod schemas to JSON Schema and
 * injects keys that are not in this tool set's documented
 * spec ("$schema" and "additionalProperties"), which breaks
 * exact tool-list/schema parity with the spec. This file
 * serves tools/list with the spec's exact input schemas as
 * explicit literals, and the core validates every tools/call
 * argument set itself.
 *
 * Every tool returns a single text item carrying the upstream
 * body verbatim; validation, file-read and upstream failures
 * come back as isError results carrying the documented error
 * strings.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import {
  createSetupLink,
  validateSetupFile,
  validateWidgetResponse,
  VERSION,
} from "./validate.js";

const TOOLS = [
  {
    name: "validate_setup_file",
    description:
      "Validates a dashboardbase setup file (JSON) and returns any schema, layout, binding, or contents errors.",
    inputSchema: {
      type: "object" as const,
      properties: {
        content: { type: "string" , description: "Content for this call." },
        path: { type: "string" , description: "File path for this call." },
      },
    },
  },
  {
    name: "validate_widget_response",
    description:
      "Validates a widget endpoint's JSON response against the dashboardbase widget contract for its type (kpi | timeseries | bar | table | text).",
    inputSchema: {
      type: "object" as const,
      properties: {
        response: { type: "string" , description: "The response for this call." },
        path: { type: "string" , description: "File path for this call." },
        widgetType: { type: "string" , description: "The widget type for this call." },
      },
    },
  },
  {
    name: "create_setup_link",
    description:
      "Creates a shareable, read-only setup link for a setup file. The link expires after 48 hours.",
    inputSchema: {
      type: "object" as const,
      properties: {
        content: { type: "string" , description: "Content for this call." },
        path: { type: "string" , description: "File path for this call." },
      },
    },
  },
];

function textResult(text: string) {
  return {
    content: [{ type: "text" as const, text }],
  };
}

function errorResult(err: unknown) {
  return {
    content: [
      { type: "text" as const, text: err instanceof Error ? err.message : String(err) },
    ],
    isError: true,
  };
}

const server = new Server(
  { name: "dashcheck", version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = (args ?? {}) as Record<string, unknown>;
  try {
    let out: string;
    switch (name) {
      case "validate_setup_file":
        out = await validateSetupFile(a as never);
        break;
      case "validate_widget_response":
        out = await validateWidgetResponse(a as never);
        break;
      case "create_setup_link":
        out = await createSetupLink(a as never);
        break;
      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
    return textResult(out);
  } catch (err) {
    if (err instanceof McpError) throw err;
    return errorResult(err);
  }
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

void main();
