import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  asSchema,
  isExecutableTool,
  validateTypes,
  type ToolSet,
  type ToolExecuteFunction,
} from '@ai-sdk/provider-utils';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv-provider.js';
import type { JsonSchemaType } from '@modelcontextprotocol/sdk/validation/types.js';
import { RequestLimiter } from './antigravity-limiter.js';

export interface AntigravityHttpMcpServerConfig {
  serverUrl: string;
  headers?: Record<string, string>;
  timeoutSeconds?: number;
}

export interface AntigravityStdioMcpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  timeoutSeconds?: number;
}

export type AntigravityMcpServerConfig =
  AntigravityHttpMcpServerConfig | AntigravityStdioMcpServerConfig;

export interface McpApprovalRequest {
  toolName: string;
  input: unknown;
  toolCallId: string;
  signal: AbortSignal;
}

export interface SdkMcpServerOptions {
  tools: ToolSet;
  /** Tool-specific execution context. Does not contain a model conversation. */
  toolContext?: Record<string, unknown>;
  /** Runs for every invocation if supplied. Required for tools with needsApproval. */
  onApproval?: (request: McpApprovalRequest) => boolean | Promise<boolean>;
  maxConcurrentToolCalls?: number;
}

export interface SdkMcpServer {
  readonly url: string;
  /** Contains a credential: do not log this object or persist it in source control. */
  readonly config: AntigravityHttpMcpServerConfig;
  close(): Promise<void>;
}

/** Exposes host callbacks through the public MCP protocol; never impersonates an agy client. */
export async function createSdkMcpServer(options: SdkMcpServerOptions): Promise<SdkMcpServer> {
  const entries = Object.entries(options.tools);
  const tools = new Map(entries);
  const validator = new AjvJsonSchemaValidator();
  const definitions: Tool[] = [];
  const validators = new Map<string, ReturnType<AjvJsonSchemaValidator['getValidator']>>();
  const outputValidators = new Map<string, ReturnType<AjvJsonSchemaValidator['getValidator']>>();
  const limiter = new RequestLimiter(options.maxConcurrentToolCalls);
  for (const [name, tool] of entries) {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(name)) throw new Error(`Invalid MCP tool name: ${name}`);
    if (tool.type === 'provider' || !isExecutableTool(tool)) {
      throw new Error(`MCP tool '${name}' must be a host function with execute.`);
    }
    const schema = await asSchema(tool.inputSchema).jsonSchema;
    if (schema.type !== 'object')
      throw new Error(`MCP tool '${name}' requires an object input schema.`);
    validators.set(name, validator.getValidator(schema as JsonSchemaType));
    if (tool.outputSchema) {
      const outputSchema = await asSchema(tool.outputSchema).jsonSchema;
      outputValidators.set(name, validator.getValidator(outputSchema as JsonSchemaType));
    }
    const context = tool.contextSchema
      ? await validateTypes({ value: options.toolContext?.[name], schema: tool.contextSchema })
      : options.toolContext?.[name];
    const description =
      typeof tool.description === 'function' ? tool.description({ context }) : tool.description;
    definitions.push({ name, description, inputSchema: schema as Tool['inputSchema'] });
  }

  const token = randomBytes(32).toString('hex');
  const credential = Buffer.from(`Bearer ${token}`);
  const shutdown = new AbortController();
  const active = new Set<Server>();
  let expectedHost = '';
  let closing: Promise<void> | undefined;

  const makeServer = () => {
    const server = new Server(
      { name: 'ai-sdk-provider-antigravity-cli', version: '0.1.0' },
      {
        capabilities: { tools: {} },
      },
    );
    server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: definitions }));
    server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
      const name = request.params.name;
      const tool = tools.get(name);
      const signal = AbortSignal.any([extra.signal, shutdown.signal]);
      let release: (() => void) | undefined;
      try {
        if (!tool || !isExecutableTool(tool)) throw new Error(`Unknown MCP tool: ${name}`);
        release = await limiter.acquire(signal);
        const validation = validators.get(name)!(request.params.arguments ?? {});
        if (!validation.valid)
          throw new Error(`Invalid input for '${name}': ${validation.errorMessage}`);
        const input = await validateTypes({ value: validation.data, schema: tool.inputSchema });
        const context = tool.contextSchema
          ? await validateTypes({ value: options.toolContext?.[name], schema: tool.contextSchema })
          : options.toolContext?.[name];
        const execution = {
          toolCallId: randomUUID(),
          messages: [],
          abortSignal: signal,
          context,
        };
        const needsApproval =
          typeof tool.needsApproval === 'function'
            ? await tool.needsApproval(input, execution)
            : tool.needsApproval === true;
        const approved = options.onApproval
          ? await options.onApproval({
              toolName: name,
              input,
              toolCallId: execution.toolCallId,
              signal,
            })
          : !needsApproval;
        if (!approved) throw new Error(`Approval denied for '${name}'.`);
        signal.throwIfAborted();
        let output: unknown;
        const execute = tool.execute as ToolExecuteFunction<unknown, unknown, unknown>;
        const result = await execute(input, execution);
        if (isAsyncIterable(result)) {
          for await (const value of result) {
            signal.throwIfAborted();
            output = value;
          }
        } else {
          output = result;
        }
        signal.throwIfAborted();
        const outputValidation = outputValidators.get(name)?.(output);
        if (outputValidation && !outputValidation.valid)
          throw new Error(`Invalid output for '${name}': ${outputValidation.errorMessage}`);
        if (tool.outputSchema)
          output = await validateTypes({ value: output, schema: tool.outputSchema });
        return { content: [{ type: 'text', text: JSON.stringify(output ?? null) }] };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: error instanceof Error ? error.message : 'Tool execution failed.',
            },
          ],
        };
      } finally {
        release?.();
      }
    });
    return server;
  };

  const http = createServer((request, response) => {
    const handle = async () => {
      if (closing || shutdown.signal.aborted) {
        response.writeHead(503).end();
        return;
      }
      if (request.url !== '/mcp') {
        response.writeHead(404).end();
        return;
      }
      if (request.headers.host !== expectedHost || request.headers.origin !== undefined) {
        response.writeHead(403).end();
        return;
      }
      const supplied = Buffer.from(request.headers.authorization ?? '');
      if (supplied.length !== credential.length || !timingSafeEqual(supplied, credential)) {
        response.writeHead(401).end();
        return;
      }
      if (request.method !== 'POST') {
        response.writeHead(405, { Allow: 'POST' }).end();
        return;
      }
      let body: unknown;
      try {
        body = await readBody(request);
      } catch (error) {
        request.resume();
        response.writeHead(error instanceof RangeError ? 413 : 400).end();
        return;
      }
      const server = makeServer();
      active.add(server);
      response.once('close', () => {
        active.delete(server);
        void server.close().catch(() => {});
      });
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      await server.connect(transport);
      await transport.handleRequest(request, response, body);
    };
    void handle().catch(() => {
      if (!response.headersSent) response.writeHead(500);
      response.end();
    });
  });
  await new Promise<void>((resolveListen, reject) => {
    http.once('error', reject);
    http.listen(0, '127.0.0.1', () => {
      http.removeListener('error', reject);
      resolveListen();
    });
  });
  const address = http.address();
  if (!address || typeof address === 'string')
    throw new Error('MCP server did not obtain a TCP port.');
  expectedHost = `127.0.0.1:${address.port}`;
  const url = `http://${expectedHost}/mcp`;
  return {
    url,
    config: { serverUrl: url, headers: { Authorization: credential.toString() } },
    close() {
      closing ??= (async () => {
        shutdown.abort(new Error('MCP server closed'));
        const closed = new Promise<void>((done, reject) =>
          http.close((error) => (error ? reject(error) : done())),
        );
        await Promise.allSettled([...active].map((server) => server.close()));
        http.closeAllConnections();
        await closed;
      })();
      return closing;
    },
  };
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > 1_048_576) throw new RangeError('MCP request exceeds 1 MiB.');
    chunks.push(bytes);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return value !== null && typeof value === 'object' && Symbol.asyncIterator in value;
}

export interface McpWorkspace {
  /** New isolated CLI working directory. Pass project paths via includeDirectories. */
  readonly cwd: string;
  dispose(): Promise<void>;
}

/** Writes only into a newly created temporary directory, never the user's global/project config. */
export async function createMcpWorkspace(
  servers: Record<string, AntigravityMcpServerConfig>,
): Promise<McpWorkspace> {
  const root = resolve(tmpdir());
  const cwd = await mkdtemp(join(root, 'agy-mcp-'));
  const dispose = async () => {
    if (dirname(resolve(cwd)) !== root || !cwd.startsWith(join(root, 'agy-mcp-'))) {
      throw new Error('Refusing to remove an unexpected MCP workspace path.');
    }
    await rm(cwd, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  };
  try {
    await mkdir(join(cwd, '.agents'));
    await writeFile(
      join(cwd, '.agents', 'mcp_config.json'),
      JSON.stringify({ mcpServers: servers }),
      { mode: 0o600 },
    );
    return { cwd, dispose };
  } catch (error) {
    await dispose();
    throw error;
  }
}
