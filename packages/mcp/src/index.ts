#!/usr/bin/env node
import { PROTOCOL_VERSION, serve } from './rpc.js';
import { TOOLS } from './tools.js';

/**
 * Trazum as an MCP server.
 *
 * The point is narrow: an agent about to spend money on a prompt can ask what it
 * will cost, and whether it busts a budget, *before* sending it. Every other
 * surface here answers that for a human after the fact — a CLI you run, a page you
 * paste into, a check that fails a build. This answers it for the thing actually
 * composing the prompt.
 *
 * **It runs on the caller's machine and costs this project nothing.** One process
 * over stdio, spawned by whatever client wants it, exactly like the CLI. There is
 * no service to host, nothing to keep up, and no prompt leaves the machine. Worth
 * saying because "MCP server" reads like infrastructure and this is not.
 */

serve(process.stdin, process.stdout, TOOLS, {
  name: 'trazum',
  version: '1.8.0',
  instructions:
    'Price and budget a prompt before sending it. Every tool takes prompt text and returns '
    + 'figures; none of them read files, reach the network or call a model. Token counts are '
    + `estimates, so treat a prompt within a few percent of its budget as uncertain. `
    + `Protocol ${PROTOCOL_VERSION}, tools only.`,
});
