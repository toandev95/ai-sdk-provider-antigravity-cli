const args = process.argv.slice(2);
if (args.includes('models')) {
  process.stdout.write(
    'Fetching available models...\ngemini-3.8-flash-medium\tGemini 3.8 Flash (Medium)\nfuture-model-v9\tFuture Model\n',
  );
  process.exit(0);
}
let input = '';

for await (const chunk of process.stdin) input += chunk;

const request = JSON.parse(input.trim());
const content = request.message.content;
const emit = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);
const usage = {
  cache_read_tokens: 3,
  input_tokens: 10,
  output_tokens: 5,
  thinking_tokens: 2,
  total_tokens: 15,
};

emit({
  event: 'init',
  conversation_id: 'mock-conversation',
  init: { argv: args, cwd: process.cwd(), permission_mode: 'request-review', tools: ['mock_tool'] },
});

if (content.includes('RUN_MCP_ORDER')) {
  const { URL } = await import('node:url');
  const { readFile } = await import('node:fs/promises');
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StreamableHTTPClientTransport } =
    await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
  const config = JSON.parse(await readFile('.agents/mcp_config.json', 'utf8')).mcpServers.app;
  const client = new Client({ name: 'mock-agy', version: '1.0.0' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(config.serverUrl), {
      requestInit: { headers: config.headers },
    }),
  );
  const definitions = await client.listTools();
  const name = definitions.tools[0].name;
  emit({
    event: 'step_update',
    step_update: {
      step_index: 1,
      step_type: 'tool',
      state: 'ACTIVE',
      tool_name: name,
      tool_info: { name, parameters: { id: 'A42' } },
    },
  });
  const result = await client.callTool({ name, arguments: { id: 'A42' } });
  emit({
    event: 'step_update',
    step_update: {
      step_index: 1,
      step_type: 'tool',
      state: result.isError ? 'ERROR' : 'DONE',
      tool_name: name,
      tool_info: { name, output: result, ...(result.isError ? { error: result } : {}) },
    },
  });
  await client.close();
  emit({
    event: 'result',
    result: {
      conversation_id: 'mock-conversation',
      status: 'SUCCESS',
      response: result.isError ? 'Tool denied' : 'Order A42: shipped',
      usage,
    },
  });
} else if (content.includes('ABORT_FOREVER')) {
  setTimeout(() => {}, 60_000);
} else if (content.includes('FAIL_REQUEST')) {
  emit({
    event: 'result',
    result: {
      conversation_id: 'mock-conversation',
      error: 'mock failure',
      response: '',
      status: 'ERROR',
      usage,
    },
  });
} else if (args.includes('--json-schema')) {
  emit({
    event: 'step_update',
    step_update: {
      conversation_id: 'mock-conversation',
      state: 'DONE',
      step_index: 1,
      step_type: 'agent_response',
      text_delta: 'unvalidated wrapper text',
    },
  });
  emit({
    event: 'result',
    result: {
      conversation_id: 'mock-conversation',
      duration_seconds: 0.1,
      num_turns: 1,
      response: 'unvalidated wrapper text',
      status: 'SUCCESS',
      structured_output: { profile: { name: 'Agy', tags: ['agent', 'cli'] } },
      usage,
    },
  });
} else if (content.includes('SPLIT_NDJSON')) {
  const line = `${JSON.stringify({
    event: 'result',
    result: {
      conversation_id: 'mock-conversation',
      response: 'split stream',
      status: 'SUCCESS',
      usage,
    },
  })}\n`;
  const middle = Math.floor(line.length / 2);
  process.stdout.write(line.slice(0, middle));
  await new Promise((resolve) => setTimeout(resolve, 5));
  process.stdout.write(line.slice(middle));
} else {
  emit({
    event: 'step_update',
    step_update: {
      conversation_id: 'mock-conversation',
      state: 'ACTIVE',
      step_index: 1,
      step_type: 'agent_response',
      text_delta: 'hello ',
    },
  });
  emit({
    event: 'step_update',
    step_update: {
      conversation_id: 'mock-conversation',
      state: 'ACTIVE',
      step_index: 2,
      step_type: 'tool',
      tool_info: { name: 'mock_tool', parameters: { value: 42 } },
      tool_name: 'mock_tool',
    },
  });
  emit({
    event: 'step_update',
    step_update: {
      conversation_id: 'mock-conversation',
      state: 'DONE',
      step_index: 2,
      step_type: 'tool',
      tool_info: { name: 'mock_tool', output: { accepted: true }, parameters: { value: 42 } },
      tool_name: 'mock_tool',
    },
  });
  emit({
    event: 'step_update',
    step_update: {
      conversation_id: 'mock-conversation',
      state: 'DONE',
      step_index: 3,
      step_type: 'agent_response',
      text_delta: 'world',
      usage,
    },
  });
  emit({
    event: 'result',
    result: {
      conversation_id: 'mock-conversation',
      duration_seconds: 0.2,
      num_turns: 1,
      response: 'hello world',
      status: 'SUCCESS',
      usage,
    },
  });
}
