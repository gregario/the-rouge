const { test, describe } = require('node:test');
const assert = require('node:assert');

const {
  runPhaseViaSdk,
  buildSystemBlocks,
  buildStructuredOutputTool,
  extractStructuredOutput,
  DEFAULT_MODEL,
} = require('../../../src/launcher/harness/sdk-adapter.js');

// Mock Anthropic client. Each test instantiates with a stub
// messages.create and asserts on the request shape + the output the
// adapter constructs from a stub response.
function makeMockClient(stubResponse, options = {}) {
  const captured = { request: null };
  return {
    messages: {
      create: async (req) => {
        captured.request = req;
        if (options.throwError) throw options.throwError;
        return stubResponse;
      },
    },
    captured,
  };
}

function textResponse(text, usage = {}) {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: DEFAULT_MODEL,
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 10, output_tokens: 5, ...usage },
  };
}

function toolUseResponse(name, input, usage = {}) {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: DEFAULT_MODEL,
    content: [{ type: 'tool_use', id: 'toolu_test', name, input }],
    stop_reason: 'tool_use',
    usage: { input_tokens: 10, output_tokens: 5, ...usage },
  };
}

describe('buildSystemBlocks', () => {
  test('returns undefined when systemText is empty / missing', () => {
    assert.equal(buildSystemBlocks(undefined, true), undefined);
    assert.equal(buildSystemBlocks('', true), undefined);
    assert.equal(buildSystemBlocks(null, true), undefined);
  });

  test('returns plain string when cache=false', () => {
    assert.equal(buildSystemBlocks('hello', false), 'hello');
  });

  test('returns content-block array with cache_control when cache=true', () => {
    const blocks = buildSystemBlocks('hello', true);
    assert.deepEqual(blocks, [
      { type: 'text', text: 'hello', cache_control: { type: 'ephemeral' } },
    ]);
  });
});

describe('buildStructuredOutputTool', () => {
  test('throws if toolName missing', () => {
    assert.throws(
      () => buildStructuredOutputTool({ schema: { type: 'object' } }),
      /toolName and schema required/
    );
  });

  test('throws if schema missing', () => {
    assert.throws(
      () => buildStructuredOutputTool({ toolName: 'emit_result' }),
      /toolName and schema required/
    );
  });

  test('returns a tool definition with the schema as input_schema', () => {
    const schema = {
      type: 'object',
      properties: { verdict: { type: 'string' } },
      required: ['verdict'],
    };
    const tool = buildStructuredOutputTool({
      toolName: 'emit_verdict',
      toolDescription: 'Emit the verdict.',
      schema,
    });
    assert.equal(tool.name, 'emit_verdict');
    assert.equal(tool.description, 'Emit the verdict.');
    assert.deepEqual(tool.input_schema, schema);
  });

  test('synthesises a description if none provided', () => {
    const tool = buildStructuredOutputTool({
      toolName: 'emit_verdict',
      schema: { type: 'object' },
    });
    assert.match(tool.description, /emit_verdict/);
  });
});

describe('extractStructuredOutput', () => {
  test('returns the tool_use input when matching block present', () => {
    const response = toolUseResponse('emit_verdict', { verdict: 'pass' });
    const out = extractStructuredOutput(response, 'emit_verdict');
    assert.deepEqual(out, { verdict: 'pass' });
  });

  test('throws when response.content missing', () => {
    assert.throws(
      () => extractStructuredOutput({}, 'emit_verdict'),
      /response\.content missing/
    );
  });

  test('throws when no matching tool_use block', () => {
    const response = textResponse('plain text only');
    assert.throws(
      () => extractStructuredOutput(response, 'emit_verdict'),
      /no tool_use block named 'emit_verdict'/
    );
  });

  test('throws when matching block has wrong tool name', () => {
    const response = toolUseResponse('something_else', { x: 1 });
    assert.throws(
      () => extractStructuredOutput(response, 'emit_verdict'),
      /no tool_use block named 'emit_verdict'/
    );
  });

  test('throws when tool_use.input is missing', () => {
    const response = {
      content: [{ type: 'tool_use', id: 'toolu_test', name: 'emit_verdict', input: null }],
    };
    assert.throws(
      () => extractStructuredOutput(response, 'emit_verdict'),
      /tool_use\.input is missing/
    );
  });
});

describe('runPhaseViaSdk — request construction', () => {
  test('rejects missing prompt', async () => {
    await assert.rejects(
      () => runPhaseViaSdk({ client: makeMockClient(textResponse('x')) }),
      /prompt \(string\) is required/
    );
  });

  test('default model is claude-haiku-4-5', async () => {
    const client = makeMockClient(textResponse('ok'));
    await runPhaseViaSdk({ prompt: 'test', client });
    assert.equal(client.captured.request.model, 'claude-haiku-4-5-20251001');
    assert.equal(client.captured.request.max_tokens, 4096);
  });

  test('passes model and maxTokens through', async () => {
    const client = makeMockClient(textResponse('ok'));
    await runPhaseViaSdk({
      prompt: 'test',
      model: 'claude-opus-4-7-20251101',
      maxTokens: 8192,
      client,
    });
    assert.equal(client.captured.request.model, 'claude-opus-4-7-20251101');
    assert.equal(client.captured.request.max_tokens, 8192);
  });

  test('user message contains the prompt', async () => {
    const client = makeMockClient(textResponse('ok'));
    await runPhaseViaSdk({ prompt: 'analyse this', client });
    const msg = client.captured.request.messages[0];
    assert.equal(msg.role, 'user');
    assert.equal(msg.content, 'analyse this');
  });

  test('system block is omitted when no system prompt provided', async () => {
    const client = makeMockClient(textResponse('ok'));
    await runPhaseViaSdk({ prompt: 'test', client });
    assert.equal(client.captured.request.system, undefined);
  });

  test('system block uses cache_control by default', async () => {
    const client = makeMockClient(textResponse('ok'));
    await runPhaseViaSdk({
      prompt: 'test',
      system: 'You are an evaluator.',
      client,
    });
    const sys = client.captured.request.system;
    assert.ok(Array.isArray(sys));
    assert.equal(sys[0].type, 'text');
    assert.equal(sys[0].text, 'You are an evaluator.');
    assert.deepEqual(sys[0].cache_control, { type: 'ephemeral' });
  });

  test('cache=false produces plain string system', async () => {
    const client = makeMockClient(textResponse('ok'));
    await runPhaseViaSdk({
      prompt: 'test',
      system: 'You are an evaluator.',
      cache: false,
      client,
    });
    assert.equal(client.captured.request.system, 'You are an evaluator.');
  });

  test('schema triggers tool definition + tool_choice forcing', async () => {
    const schema = {
      type: 'object',
      properties: { verdict: { type: 'string' } },
      required: ['verdict'],
    };
    const client = makeMockClient(toolUseResponse('emit_result', { verdict: 'pass' }));
    await runPhaseViaSdk({
      prompt: 'test',
      schema,
      client,
    });
    const req = client.captured.request;
    assert.ok(Array.isArray(req.tools));
    assert.equal(req.tools.length, 1);
    assert.equal(req.tools[0].name, 'emit_result');
    assert.deepEqual(req.tools[0].input_schema, schema);
    assert.deepEqual(req.tool_choice, { type: 'tool', name: 'emit_result' });
  });

  test('custom toolName flows through', async () => {
    const client = makeMockClient(toolUseResponse('emit_final_review_report', { ship: true }));
    await runPhaseViaSdk({
      prompt: 'test',
      schema: { type: 'object' },
      toolName: 'emit_final_review_report',
      client,
    });
    const req = client.captured.request;
    assert.equal(req.tools[0].name, 'emit_final_review_report');
    assert.deepEqual(req.tool_choice, { type: 'tool', name: 'emit_final_review_report' });
  });

  test('no schema = no tools field on request', async () => {
    const client = makeMockClient(textResponse('plain'));
    await runPhaseViaSdk({ prompt: 'test', client });
    assert.equal(client.captured.request.tools, undefined);
    assert.equal(client.captured.request.tool_choice, undefined);
  });
});

describe('runPhaseViaSdk — response handling', () => {
  test('text response: result is concatenated text', async () => {
    const client = makeMockClient({
      content: [
        { type: 'text', text: 'hello ' },
        { type: 'text', text: 'world' },
      ],
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    const out = await runPhaseViaSdk({ prompt: 'test', client });
    assert.equal(out.result, 'hello world');
  });

  test('schema response: result is the structured tool_use input', async () => {
    const client = makeMockClient(
      toolUseResponse('emit_result', { recommendation: 'ship', confidence: 0.91 })
    );
    const out = await runPhaseViaSdk({
      prompt: 'test',
      schema: { type: 'object' },
      client,
    });
    assert.deepEqual(out.result, { recommendation: 'ship', confidence: 0.91 });
  });

  test('returns full SDK response so callers can inspect it', async () => {
    const stub = toolUseResponse('emit_result', { x: 1 });
    const client = makeMockClient(stub);
    const out = await runPhaseViaSdk({
      prompt: 'test',
      schema: { type: 'object' },
      client,
    });
    assert.equal(out.response, stub);
  });

  test('returns usage including cache_creation / cache_read fields when present', async () => {
    const stub = toolUseResponse(
      'emit_result',
      { x: 1 },
      { input_tokens: 100, output_tokens: 20, cache_creation_input_tokens: 8000, cache_read_input_tokens: 0 }
    );
    const client = makeMockClient(stub);
    const out = await runPhaseViaSdk({
      prompt: 'test',
      schema: { type: 'object' },
      client,
    });
    assert.equal(out.usage.input_tokens, 100);
    assert.equal(out.usage.cache_creation_input_tokens, 8000);
    assert.equal(out.usage.cache_read_input_tokens, 0);
  });

  test('schema path throws when model returns text instead of tool_use', async () => {
    const client = makeMockClient(textResponse('I refuse to use the tool'));
    await assert.rejects(
      () =>
        runPhaseViaSdk({
          prompt: 'test',
          schema: { type: 'object' },
          client,
        }),
      /no tool_use block named 'emit_result'/
    );
  });

  test('SDK error propagates to caller', async () => {
    const err = Object.assign(new Error('rate_limit'), { status: 429 });
    const client = makeMockClient(null, { throwError: err });
    await assert.rejects(
      () => runPhaseViaSdk({ prompt: 'test', client }),
      /rate_limit/
    );
  });
});

describe('runPhaseViaSdk — caching round-trip simulation', () => {
  test('first call emits cache_creation_input_tokens; second call simulates cache_read', async () => {
    // Simulate two sequential calls — first creates the cache (large
    // cache_creation_input_tokens), second reads it (cache_read_input
    // _tokens), with the same system prompt. The adapter doesn't do
    // anything stateful between calls — caching is entirely a
    // server-side concern keyed on the system block content. This
    // test exists to document the expected usage shape across calls.
    const SYSTEM = 'a'.repeat(2000); // pretend it's a big system prompt
    const firstStub = {
      content: [{ type: 'text', text: 'first' }],
      usage: { input_tokens: 50, output_tokens: 5, cache_creation_input_tokens: 2000, cache_read_input_tokens: 0 },
    };
    const secondStub = {
      content: [{ type: 'text', text: 'second' }],
      usage: { input_tokens: 50, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 2000 },
    };
    const client1 = makeMockClient(firstStub);
    const client2 = makeMockClient(secondStub);

    const r1 = await runPhaseViaSdk({ prompt: 'p1', system: SYSTEM, client: client1 });
    const r2 = await runPhaseViaSdk({ prompt: 'p2', system: SYSTEM, client: client2 });

    // Both calls used the cache_control system block.
    assert.deepEqual(client1.captured.request.system[0].cache_control, { type: 'ephemeral' });
    assert.deepEqual(client2.captured.request.system[0].cache_control, { type: 'ephemeral' });

    // The first call paid the create cost; the second call read from
    // cache. (This is what we expect Anthropic's API to do in
    // production — caching is server-driven, the adapter just sets
    // the marker.)
    assert.ok(r1.usage.cache_creation_input_tokens > 0);
    assert.equal(r1.usage.cache_read_input_tokens, 0);
    assert.equal(r2.usage.cache_creation_input_tokens, 0);
    assert.ok(r2.usage.cache_read_input_tokens > 0);
  });
});
