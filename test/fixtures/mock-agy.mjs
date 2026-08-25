const args = process.argv.slice(2);
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

if (content.includes('ABORT_FOREVER')) {
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
