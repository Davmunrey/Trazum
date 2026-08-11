/**
 * JSON-RPC 2.0 over stdio, by hand, because of what this package is.
 *
 * The obvious implementation imports `@modelcontextprotocol/sdk`. It was written
 * that way first, and thirteen tests passed against a real process. Then
 * `publish.test.js` refused it: *every* publishable package in this repository
 * carries no runtime dependencies, and the reason `security.test.js` gives is
 * "the core and the CLI process untrusted text; every runtime dependency is code
 * that would run on that text with no review from this project."
 *
 * That argument applies here with **more** force than anywhere else in the
 * repository, not less. An MCP server reads prompts handed to it by a model, in a
 * process the user did not start by hand, and the SDK plus its own dependency
 * tree is a large amount of somebody else's code sitting on that path. Relaxing
 * the invariant at the exact point it matters most would have been the wrong
 * trade, so the invariant won and this file exists.
 *
 * **What that costs, stated plainly.** A hand-written protocol is where subtle
 * incompatibility lives. This implements the parts a tools-only server needs —
 * `initialize`, `notifications/initialized`, `tools/list`, `tools/call`, and
 * `ping` — and nothing else. No resources, no prompts, no sampling, no
 * completion, no server-initiated requests. A client asking for any of those gets
 * a proper `-32601 Method not found` rather than silence. It has been driven by a
 * raw newline-delimited client in the tests; it has not been driven by every real
 * MCP client in existence, and that is the honest limit of the claim.
 */

/** The version this server implements. Echoed back when the client asks for it. */
export const PROTOCOL_VERSION = '2025-06-18';

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: unknown;
}

/** Standard JSON-RPC codes, plus the one MCP adds for bad tool arguments. */
export const ERROR = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
} as const;

export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  /** JSON Schema, written out, since there is no schema library to build one. */
  inputSchema: Record<string, unknown>;
  /**
   * Validates and coerces the arguments, or throws with a message the model can
   * act on. Returns the text to send back.
   */
  run: (args: Record<string, unknown>) => string;
}

/** Thrown by a tool when its arguments are wrong. Distinguished from a crash. */
export class InvalidArguments extends Error {}

export interface ServerInfo {
  name: string;
  version: string;
  instructions: string;
}

/**
 * Handles one decoded message and returns the response, or `null` for a
 * notification.
 *
 * Pure: takes a message, returns a message. The transport below is what touches
 * streams, so every dispatch rule here is testable without a process.
 */
export function handle(
  message: unknown,
  tools: readonly ToolDefinition[],
  info: ServerInfo,
): object | null {
  if (typeof message !== 'object' || message === null) {
    return errorFor(null, ERROR.invalidRequest, 'a message must be an object');
  }

  const request = message as JsonRpcRequest;
  const id = request.id ?? null;
  const isNotification = request.id === undefined;

  if (request.jsonrpc !== '2.0') {
    return isNotification ? null : errorFor(id, ERROR.invalidRequest, 'jsonrpc must be "2.0"');
  }
  if (typeof request.method !== 'string') {
    return isNotification ? null : errorFor(id, ERROR.invalidRequest, 'method must be a string');
  }

  /**
   * Notifications get no reply, ever — and this check belongs *before* the switch.
   *
   * It was inside it at first, listing the two `notifications/*` methods by name,
   * which is the wrong rule: a notification is defined by the **absence of an
   * id**, not by its method. `{"jsonrpc":"2.0","method":"initialize"}` with no id
   * is a notification, and that version answered it. Replying to a notification
   * is a protocol violation some clients tolerate and others hang on, which is
   * the worst kind to have because it works in testing. Found by a test that
   * asked for the rule rather than for the two names.
   */
  if (isNotification) return null;

  switch (request.method) {
    case 'initialize': {
      const params = (request.params ?? {}) as { protocolVersion?: unknown };
      /**
       * Echo the client's version when it is a string, otherwise offer ours.
       *
       * A client that speaks a version this server has never heard of is still
       * better served by being told what it asked for than by a hard refusal:
       * every method below is version-independent, and the alternative is
       * refusing to start over a string.
       */
      const version =
        typeof params.protocolVersion === 'string' ? params.protocolVersion : PROTOCOL_VERSION;
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: version,
          // Tools only. Declaring capabilities this server does not implement is
          // how a client comes to ask for one and get an error it did not expect.
          capabilities: { tools: {} },
          serverInfo: { name: info.name, version: info.version },
          instructions: info.instructions,
        },
      };
    }

    case 'ping':
      return { jsonrpc: '2.0', id, result: {} };

    case 'tools/list':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          tools: tools.map((tool) => ({
            name: tool.name,
            title: tool.title,
            description: tool.description,
            inputSchema: tool.inputSchema,
          })),
        },
      };

    case 'tools/call': {
      const params = (request.params ?? {}) as { name?: unknown; arguments?: unknown };
      if (typeof params.name !== 'string') {
        return errorFor(id, ERROR.invalidParams, 'name must be a string');
      }
      const tool = tools.find((candidate) => candidate.name === params.name);
      if (!tool) {
        return errorFor(id, ERROR.invalidParams, `unknown tool: ${params.name}`);
      }

      const args =
        typeof params.arguments === 'object' && params.arguments !== null
          ? (params.arguments as Record<string, unknown>)
          : {};

      try {
        return {
          jsonrpc: '2.0',
          id,
          result: { content: [{ type: 'text', text: tool.run(args) }] },
        };
      } catch (error) {
        /**
         * A tool failure is a *result* with `isError`, not a JSON-RPC error.
         *
         * The distinction is the whole point of that flag: a protocol error means
         * the client is broken, while `isError` means the model asked for
         * something it should ask differently, and the model is the one that
         * needs to read the message. Sending a protocol error here would hide the
         * explanation from the only party able to act on it.
         */
        const text =
          error instanceof InvalidArguments
            ? error.message
            : `the tool failed: ${error instanceof Error ? error.message : String(error)}`;
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], isError: true } };
      }
    }

    default:
      return errorFor(
        id,
        ERROR.methodNotFound,
        `this server implements tools only: ${request.method}`,
      );
  }
}

function errorFor(
  id: string | number | null,
  code: number,
  message: string,
): object {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

/**
 * Reads newline-delimited JSON from a stream and writes replies to another.
 *
 * Line-delimited rather than the Content-Length framing LSP uses, because that is
 * what MCP's stdio transport specifies. A message may not contain a raw newline,
 * which `JSON.stringify` guarantees.
 */
export function serve(
  input: NodeJS.ReadableStream,
  output: NodeJS.WritableStream,
  tools: readonly ToolDefinition[],
  info: ServerInfo,
): void {
  let buffer = '';

  /**
   * A cap, because the peer is not necessarily well behaved.
   *
   * Without one, a stream that never sends a newline grows this string until the
   * process dies of memory exhaustion — a denial of service that needs no
   * malice, just a client with a bug.
   */
  const MAX_LINE = 8 * 1024 * 1024;

  input.setEncoding('utf8');
  input.on('data', (chunk: string) => {
    buffer += chunk;
    if (buffer.length > MAX_LINE) {
      buffer = '';
      write(output, errorFor(null, ERROR.invalidRequest, 'message exceeded 8 MiB'));
      return;
    }

    let newline = buffer.indexOf('\n');
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line !== '') {
        let decoded: unknown;
        try {
          decoded = JSON.parse(line);
        } catch {
          write(output, errorFor(null, ERROR.parse, 'not valid JSON'));
          newline = buffer.indexOf('\n');
          continue;
        }
        const response = handle(decoded, tools, info);
        if (response !== null) write(output, response);
      }
      newline = buffer.indexOf('\n');
    }
  });
}

function write(output: NodeJS.WritableStream, message: object): void {
  output.write(`${JSON.stringify(message)}\n`);
}
