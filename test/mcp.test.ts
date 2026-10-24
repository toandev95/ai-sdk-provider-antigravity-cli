import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { generateText, jsonSchema, tool } from 'ai';
import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import {
  createAntigravity,
  createSdkMcpServer,
  createMcpWorkspace,
  type SdkMcpServer,
} from '../src/index.js';

async function connect(server: SdkMcpServer) {
  const client = new Client({ name: 'local-integration-test', version: '1.0.0' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(server.url), {
      requestInit: { headers: server.config.headers },
    }),
  );
  return client;
}

describe('local SDK MCP bridge', () => {
  it('rejects invalid callback output even for a plain JSON schema without a custom validator', async () => {
    const server = await createSdkMcpServer({
      tools: {
        count: tool({
          inputSchema: z.object({}),
          outputSchema: jsonSchema<{ count: number }>({
            type: 'object',
            properties: { count: { type: 'number' } },
            required: ['count'],
          }),
          execute: () => JSON.parse('{"count":"invalid"}') as { count: number },
        }),
      },
    });
    const client = await connect(server);
    try {
      const result = await client.callTool({ name: 'count', arguments: {} });
      expect(result.isError).toBe(true);
      expect(result.content).toEqual([
        expect.objectContaining({ text: expect.stringContaining('Invalid output') }),
      ]);
    } finally {
      await client.close();
      await server.close();
    }
  });
  it('connects AI SDK through a child CLI, workspace config, MCP, and a host callback', async () => {
    const execute = vi.fn(({ id }: { id: string }) => ({ id, status: 'shipped' }));
    const server = await createSdkMcpServer({
      tools: { lookupOrder: tool({ inputSchema: z.object({ id: z.string() }), execute }) },
    });
    const workspace = await createMcpWorkspace({ app: server.config });
    try {
      const provider = createAntigravity({
        defaultSettings: {
          agyPath: process.execPath,
          agyArgs: [fileURLToPath(new URL('./fixtures/mock-agy.mjs', import.meta.url))],
          cwd: workspace.cwd,
          logger: false,
        },
      });
      const result = await generateText({ model: provider(), prompt: 'RUN_MCP_ORDER' });
      expect(result.text).toBe('Order A42: shipped');
      expect(result.dynamicToolCalls).toHaveLength(1);
      expect(result.dynamicToolCalls[0]?.providerExecuted).toBe(true);
      expect(result.dynamicToolResults).toHaveLength(1);
      expect(execute).toHaveBeenCalledOnce();
    } finally {
      await workspace.dispose();
      await server.close();
    }
  });
  it('discovers schemas and invokes a real Node callback through MCP HTTP', async () => {
    const execute = vi.fn(({ id }: { id: string }) => ({ id, status: 'shipped' }));
    const server = await createSdkMcpServer({
      tools: {
        lookupOrder: tool({
          description: 'Look up an order',
          inputSchema: z.object({ id: z.string() }),
          execute,
        }),
      },
    });
    const client = await connect(server);
    try {
      const definitions = await client.listTools();
      expect(definitions.tools[0]).toMatchObject({
        name: 'lookupOrder',
        inputSchema: { type: 'object' },
      });
      const result = await client.callTool({ name: 'lookupOrder', arguments: { id: 'A42' } });
      expect(result.isError).not.toBe(true);
      expect(result.content).toEqual([{ type: 'text', text: '{"id":"A42","status":"shipped"}' }]);
      expect(execute).toHaveBeenCalledOnce();
      const invalid = await client.callTool({ name: 'lookupOrder', arguments: { id: 42 } });
      expect(invalid.isError).toBe(true);
      expect(execute).toHaveBeenCalledOnce();
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('denies approval-required tools by default and lets the application approve explicitly', async () => {
    const execute = vi.fn(() => 'changed');
    const tools = { writeOrder: tool({ inputSchema: z.object({}), needsApproval: true, execute }) };
    for (const approved of [false, true]) {
      const server = await createSdkMcpServer({
        tools,
        ...(approved ? { onApproval: () => true } : {}),
      });
      const client = await connect(server);
      try {
        const result = await client.callTool({ name: 'writeOrder', arguments: {} });
        expect(result.isError === true).toBe(!approved);
      } finally {
        await client.close();
        await server.close();
      }
    }
    expect(execute).toHaveBeenCalledOnce();
  });

  it('honors an application denial even for a tool without needsApproval', async () => {
    const execute = vi.fn(() => 'must not execute');
    const server = await createSdkMcpServer({
      tools: { action: tool({ inputSchema: z.object({}), execute }) },
      onApproval: () => false,
    });
    const client = await connect(server);
    try {
      expect((await client.callTool({ name: 'action', arguments: {} })).isError).toBe(true);
      expect(execute).not.toHaveBeenCalled();
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('returns tool failures as MCP errors instead of successful results', async () => {
    const server = await createSdkMcpServer({
      tools: {
        fail: tool({
          inputSchema: z.object({}),
          execute: (): string => {
            throw new Error('database unavailable');
          },
        }),
      },
    });
    const client = await connect(server);
    try {
      const result = await client.callTool({ name: 'fail', arguments: {} });
      expect(result.isError).toBe(true);
      expect(result.content).toEqual([{ type: 'text', text: 'database unavailable' }]);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('validates context and collects the final output of async generator tools', async () => {
    const server = await createSdkMcpServer({
      toolContext: { count: { initial: 2 } },
      tools: {
        count: tool({
          inputSchema: z.object({}),
          contextSchema: z.object({ initial: z.number() }),
          execute: async function* (_, { context }) {
            yield context.initial;
            yield context.initial + 1;
          },
        }),
      },
    });
    const client = await connect(server);
    try {
      const result = await client.callTool({ name: 'count', arguments: {} });
      expect(result.content).toEqual([{ type: 'text', text: '3' }]);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('requires authentication, rejects browser origins, and limits request size', async () => {
    const server = await createSdkMcpServer({ tools: {} });
    try {
      expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:/);
      expect((await fetch(server.url, { method: 'POST', body: '{}' })).status).toBe(401);
      const headers = server.config.headers;
      expect(
        (
          await fetch(server.url, {
            method: 'POST',
            headers: { ...headers, Origin: 'https://example.com' },
            body: '{}',
          })
        ).status,
      ).toBe(403);
      expect(
        (await fetch(server.url, { method: 'POST', headers, body: 'x'.repeat(1_048_577) })).status,
      ).toBe(413);
    } finally {
      await server.close();
      await server.close();
    }
  });

  it('writes credentials only into a new workspace and removes it on dispose', async () => {
    const server = await createSdkMcpServer({ tools: {} });
    const workspace = await createMcpWorkspace({ app: server.config });
    try {
      const data = JSON.parse(
        await readFile(join(workspace.cwd, '.agents', 'mcp_config.json'), 'utf8'),
      ) as { mcpServers: { app: unknown } };
      expect(data.mcpServers.app).toEqual(server.config);
    } finally {
      await workspace.dispose();
      await server.close();
    }
    await expect(access(workspace.cwd)).rejects.toThrow();
    await workspace.dispose();
  });
});
