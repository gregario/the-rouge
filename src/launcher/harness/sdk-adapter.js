/**
 * SDK harness adapter — single-shot phase invocation via @anthropic-ai/sdk.
 *
 * P5.9 PoC scope: prove the SDK path works for non-tool-using phases
 * with two features that are blocked under the current `claude -p`
 * spawn approach:
 *   1. Prompt caching via cache_control: { type: 'ephemeral' } on the
 *      system block. Cuts repeated-input cost ~90% across cycles that
 *      reuse the same system prompt (every recurring loop phase).
 *   2. Structured output via tool_choice forcing — the model MUST call
 *      a tool whose `input_schema` is the desired JSON shape. Replaces
 *      the regex-based JSON extraction that today's `claude -p` outputs
 *      require.
 *
 * Out of scope for this PoC: tool-using phases (build, fix, deploy)
 * that need the Read/Edit/Bash agentic loop. Those continue using
 * `claude -p` and will move to the Claude Agent SDK in a separate
 * PoC if/when it makes sense.
 *
 * The adapter is dependency-injected — pass a client (or factory) so
 * unit tests can mock without touching the network or requiring an
 * API key in CI.
 */

'use strict';

const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

/**
 * Create the Anthropic client. Lazy-loaded so tests can run without
 * the SDK package + so the import cost only hits when actually used.
 *
 * @param {object} opts
 * @param {string} [opts.apiKey] — defaults to process.env.ANTHROPIC_API_KEY
 * @returns {object} Anthropic client instance
 */
function createDefaultClient(opts = {}) {
  // Lazy require to keep the rest of the launcher import-cost-free.
  // Three fallbacks because @anthropic-ai/sdk has shifted its export
  // shape across minor versions: ESM-built pkgs export `.default`, the
  // CJS shim sometimes exports `.Anthropic`, and v0.90.x ships
  // `module.exports = Anthropic` directly (so the module itself is
  // callable). Belt-and-braces avoids breaking on a future SDK bump.
  const sdk = require('@anthropic-ai/sdk');
  const Anthropic = sdk.default || sdk.Anthropic || (typeof sdk === 'function' ? sdk : null);
  if (!Anthropic) {
    throw new Error('Failed to load @anthropic-ai/sdk — package not installed or unrecognised export shape');
  }
  return new Anthropic({ apiKey: opts.apiKey || process.env.ANTHROPIC_API_KEY });
}

/**
 * Build the system content block array with optional cache_control.
 *
 * The first cached block + every subsequent block up to the cache
 * point share the same cache. Anthropic supports up to 4 cache
 * breakpoints — for our PoC scope (one big system prompt) we use one.
 *
 * @param {string} systemText — full system prompt text
 * @param {boolean} cache — whether to set cache_control on the block
 * @returns {Array} content blocks suitable for messages.create system field
 */
function buildSystemBlocks(systemText, cache) {
  if (typeof systemText !== 'string' || systemText.length === 0) {
    return undefined;
  }
  if (!cache) {
    // Plain string form is also accepted by the SDK; either works.
    return systemText;
  }
  return [
    {
      type: 'text',
      text: systemText,
      cache_control: { type: 'ephemeral' },
    },
  ];
}

/**
 * Wrap a JSON Schema as a tool definition that forces structured output.
 *
 * The model is told (via tool_choice: { type: 'tool', name }) to call
 * exactly this tool — the tool's `input` is the structured payload
 * we extract on the response side.
 *
 * @param {object} opts
 * @param {string} opts.toolName — what to call the tool (e.g. 'emit_final_review_report')
 * @param {string} opts.toolDescription — one-sentence purpose
 * @param {object} opts.schema — JSON Schema for the structured output
 * @returns {object} tool definition for messages.create
 */
function buildStructuredOutputTool({ toolName, toolDescription, schema, strict = true }) {
  if (!toolName || !schema) {
    throw new Error('buildStructuredOutputTool: toolName and schema required');
  }
  // Anthropic's docs recommend strict: true to guarantee schema
  // conformance — without it, the model can emit extra fields, miss
  // required ones, or invent enum values, and our extractStructuredOutput
  // would return the malformed input as-is. Default true for the
  // judgment-layer use case where wrong enum values silently corrupt
  // routing (e.g. `recommendation: 'sometimes'` on a 3-value enum).
  // Callers can opt out via strict: false if they want lenient parsing.
  return {
    name: toolName,
    description: toolDescription || `Emit the structured ${toolName} result.`,
    input_schema: schema,
    strict,
  };
}

/**
 * Extract the structured payload from a messages.create response.
 *
 * With tool_choice: { type: 'tool', name }, the response's content
 * array contains one tool_use block whose `input` is the schema-typed
 * payload. Throws if the expected shape isn't present so callers can
 * fail loud rather than getting silent partial data.
 *
 * @param {object} response — response from messages.create
 * @param {string} toolName — the tool name to look for
 * @returns {object} the structured payload (tool_use.input)
 */
function extractStructuredOutput(response, toolName) {
  if (!response || !Array.isArray(response.content)) {
    throw new Error('extractStructuredOutput: response.content missing or not an array');
  }
  const toolUse = response.content.find(
    (block) => block && block.type === 'tool_use' && block.name === toolName
  );
  if (!toolUse) {
    const types = response.content.map((b) => b && b.type).join(', ');
    throw new Error(
      `extractStructuredOutput: no tool_use block named '${toolName}' (got: ${types || 'empty'})`
    );
  }
  if (!toolUse.input || typeof toolUse.input !== 'object') {
    throw new Error(
      `extractStructuredOutput: tool_use.input is missing or not an object`
    );
  }
  return toolUse.input;
}

/**
 * Run a phase via the SDK. Single-shot — no tool-using agentic loop.
 *
 * @param {object} opts
 * @param {string} opts.prompt — the user-message prompt text (the phase's task)
 * @param {string} [opts.system] — system prompt (cached if cache: true)
 * @param {boolean} [opts.cache=true] — whether to set cache_control on system
 * @param {string} [opts.model=claude-haiku-4-5-20251001] — model id
 * @param {number} [opts.maxTokens=4096] — max output tokens
 * @param {object} [opts.schema] — JSON schema; when present, forces structured output
 * @param {string} [opts.toolName='emit_result'] — name of the structured-output tool
 * @param {string} [opts.toolDescription] — one-sentence tool purpose
 * @param {boolean} [opts.strict=true] — set strict: true on the tool definition (recommended)
 * @param {AbortSignal} [opts.signal] — abort signal for the SDK request (e.g. AbortSignal.timeout(60_000))
 * @param {object} [opts.client] — pre-built Anthropic client (for testing). Otherwise built from process.env.ANTHROPIC_API_KEY.
 * @param {string} [opts.apiKey] — override api key (otherwise env)
 * @returns {Promise<{result: any, response: object, usage: object}>}
 *   - result: structured payload (when schema given) or raw text (when not)
 *   - response: the full SDK response
 *   - usage: { input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens }
 */
async function runPhaseViaSdk(opts) {
  const {
    prompt,
    system,
    cache = true,
    model = DEFAULT_MODEL,
    maxTokens = DEFAULT_MAX_TOKENS,
    schema,
    toolName = 'emit_result',
    toolDescription,
    strict = true,
    signal,
    client: providedClient,
    apiKey,
  } = opts || {};

  if (!prompt || typeof prompt !== 'string') {
    throw new Error('runPhaseViaSdk: prompt (string) is required');
  }

  const client = providedClient || createDefaultClient({ apiKey });

  const request = {
    model,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  };

  const sysBlocks = buildSystemBlocks(system, cache);
  if (sysBlocks !== undefined) request.system = sysBlocks;

  if (schema) {
    const tool = buildStructuredOutputTool({ toolName, toolDescription, schema, strict });
    request.tools = [tool];
    request.tool_choice = { type: 'tool', name: toolName };
  }

  // The SDK accepts a second-arg request-options bag for AbortSignal,
  // timeout, and per-request headers.
  const requestOpts = signal ? { signal } : {};
  const response = await client.messages.create(request, requestOpts);

  let result;
  if (schema) {
    result = extractStructuredOutput(response, toolName);
  } else {
    // Non-schema path: concatenate text blocks.
    result = (response.content || [])
      .filter((b) => b && b.type === 'text')
      .map((b) => b.text)
      .join('');
  }

  return {
    result,
    response,
    usage: response.usage || {},
  };
}

module.exports = {
  runPhaseViaSdk,
  // Exported for unit tests + advanced callers.
  buildSystemBlocks,
  buildStructuredOutputTool,
  extractStructuredOutput,
  createDefaultClient,
  DEFAULT_MODEL,
  DEFAULT_MAX_TOKENS,
};
