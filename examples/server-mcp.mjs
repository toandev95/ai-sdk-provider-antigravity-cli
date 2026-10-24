import process from 'node:process';
import console from 'node:console';
import { generateText, tool } from 'ai';
import { z } from 'zod';
import { createAntigravity, createSdkMcpServer, createMcpWorkspace } from '../dist/index.js';

// Explicit opt-in: this example sends a real model request using your CLI authentication.
if (process.env.AGY_EXAMPLE_LIVE !== '1') {
  console.log('Build first, review docs/google-policy.md, then set AGY_EXAMPLE_LIVE=1 to run.');
  process.exit(0);
}

const server = await createSdkMcpServer({
  tools: {
    lookupOrder: tool({
      description: 'Look up an order from the demo data.',
      inputSchema: z.object({ id: z.string() }),
      execute: ({ id }) => ({ id, status: 'shipped' }),
    }),
  },
});
let workspace;
try {
  workspace = await createMcpWorkspace({ app: server.config });
  const provider = createAntigravity({
    maxConcurrentRequests: 2,
    defaultSettings: {
      cwd: workspace.cwd,
      permissionMode: process.env.AGY_PERMISSION_MODE ?? 'sandbox',
      unsupportedFeatures: 'error',
      timeoutMs: 60_000,
    },
  });
  const result = await generateText({
    model: provider(process.env.AGY_MODEL ?? 'gemini-3.8-flash-medium'),
    prompt: 'Use the app MCP server to look up order A42, then report its status.',
  });
  console.log(result.text);
} finally {
  await server.close();
  await workspace?.dispose();
}
