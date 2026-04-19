const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  createPhaseEventWriter,
  extractEventsFromRecord,
  summarizeToolUse,
  summarizeToolResult,
  EVENTS_FILENAME,
} = require('../../src/launcher/phase-events.js');

function mkTmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-phase-events-'));
}

describe('summarizeToolUse', () => {
  test('Edit/Write/Read return file_path', () => {
    assert.equal(summarizeToolUse('Edit', { file_path: '/a/b.ts' }), '/a/b.ts');
    assert.equal(summarizeToolUse('Write', { file_path: '/c/d.md' }), '/c/d.md');
    assert.equal(summarizeToolUse('Read', { file_path: '/e.json' }), '/e.json');
  });
  test('Bash returns command', () => {
    assert.equal(summarizeToolUse('Bash', { command: 'npm test' }), 'npm test');
  });
  test('Grep/Glob return pattern', () => {
    assert.equal(summarizeToolUse('Grep', { pattern: 'foo' }), 'foo');
    assert.equal(summarizeToolUse('Glob', { pattern: 'src/**/*.ts' }), 'src/**/*.ts');
  });
  test('unknown tool falls back to JSON stringify', () => {
    const s = summarizeToolUse('Mystery', { a: 1, b: 'x' });
    assert.ok(s.includes('"a":1'));
  });
  test('missing input is empty', () => {
    assert.equal(summarizeToolUse('Edit', null), '');
    assert.equal(summarizeToolUse('Edit', undefined), '');
  });
});

describe('summarizeToolResult', () => {
  test('string content returns string', () => {
    assert.equal(summarizeToolResult('ok then'), 'ok then');
  });
  test('array of text blocks is joined', () => {
    const s = summarizeToolResult([{ type: 'text', text: 'hi' }, { type: 'text', text: 'there' }]);
    assert.equal(s, 'hi there');
  });
  test('caps at ~200 chars', () => {
    const long = 'a'.repeat(500);
    const s = summarizeToolResult(long);
    assert.ok(s.length <= 200);
  });
});

describe('extractEventsFromRecord', () => {
  test('assistant text + tool_use produces two events', () => {
    const record = {
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Let me look at the schema.' },
          { type: 'tool_use', id: 't1', name: 'Read', input: { file_path: '/x.ts' } },
        ],
      },
    };
    const events = extractEventsFromRecord(record);
    assert.equal(events.length, 2);
    assert.equal(events[0].type, 'text');
    assert.equal(events[0].text, 'Let me look at the schema.');
    assert.equal(events[1].type, 'tool_use');
    assert.equal(events[1].name, 'Read');
    assert.equal(events[1].summary, '/x.ts');
  });

  test('user tool_result produces a tool_result event', () => {
    const record = {
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 't1', content: 'file contents...' }],
      },
    };
    const events = extractEventsFromRecord(record);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'tool_result');
    assert.equal(events[0].id, 't1');
    assert.equal(events[0].status, 'ok');
  });

  test('error flag surfaces as status:error', () => {
    const record = {
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 't2', is_error: true, content: 'boom' }],
      },
    };
    const [ev] = extractEventsFromRecord(record);
    assert.equal(ev.status, 'error');
  });

  test('system and result records produce no events', () => {
    assert.deepEqual(extractEventsFromRecord({ type: 'system', subtype: 'init' }), []);
    assert.deepEqual(extractEventsFromRecord({ type: 'result', subtype: 'success' }), []);
  });

  test('empty/null record returns []', () => {
    assert.deepEqual(extractEventsFromRecord(null), []);
    assert.deepEqual(extractEventsFromRecord({}), []);
  });
});

describe('createPhaseEventWriter', () => {
  test('writes phase_start and phase_end around a session', () => {
    const dir = mkTmpProject();
    try {
      const w = createPhaseEventWriter({ projectDir: dir, phase: 'foundation', pid: 99, model: 'opus' });
      w.onEnd(0);
      const lines = fs.readFileSync(path.join(dir, EVENTS_FILENAME), 'utf8')
        .split('\n').filter(Boolean).map((l) => JSON.parse(l));
      assert.equal(lines.length, 2);
      assert.equal(lines[0].type, 'phase_start');
      assert.equal(lines[0].phase, 'foundation');
      assert.equal(lines[0].pid, 99);
      assert.equal(lines[0].model, 'opus');
      assert.equal(lines[1].type, 'phase_end');
      assert.equal(lines[1].exit_code, 0);
      assert.equal(typeof lines[1].duration_ms, 'number');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('parses stream-json chunks incrementally and writes events', () => {
    const dir = mkTmpProject();
    try {
      const w = createPhaseEventWriter({ projectDir: dir, phase: 'foundation', pid: 1, model: 'opus' });
      // First chunk is a partial line
      w.onChunk(Buffer.from('{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"a","name":"Edit","input":{"file_path":"/p/x.ts"}}'));
      // Second chunk completes the line and adds another full record
      w.onChunk(Buffer.from(']}}\n{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"a","content":"ok"}]}}\n'));
      w.onEnd(0);
      const lines = fs.readFileSync(path.join(dir, EVENTS_FILENAME), 'utf8')
        .split('\n').filter(Boolean).map((l) => JSON.parse(l));
      // phase_start + tool_use + tool_result + phase_end
      assert.equal(lines.length, 4);
      assert.equal(lines[1].type, 'tool_use');
      assert.equal(lines[1].name, 'Edit');
      assert.equal(lines[1].summary, '/p/x.ts');
      assert.equal(lines[2].type, 'tool_result');
      assert.equal(lines[2].status, 'ok');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('non-JSON lines are teed to onRawLine, not events', () => {
    const dir = mkTmpProject();
    const rawSeen = [];
    try {
      const w = createPhaseEventWriter({
        projectDir: dir, phase: 'foundation', pid: 1, model: 'opus',
        onRawLine: (l) => rawSeen.push(l),
      });
      w.onChunk(Buffer.from('not json at all\n'));
      w.onEnd(0);
      const lines = fs.readFileSync(path.join(dir, EVENTS_FILENAME), 'utf8')
        .split('\n').filter(Boolean).map((l) => JSON.parse(l));
      // Only phase_start and phase_end
      assert.equal(lines.length, 2);
      assert.deepEqual(rawSeen, ['not json at all']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('stamps storyId + milestoneName on every event when provided', () => {
    const dir = mkTmpProject();
    try {
      const w = createPhaseEventWriter({
        projectDir: dir, phase: 'story-building', pid: 1, model: 'opus',
        storyId: 'st-auth-1', milestoneName: 'Foundation & First-Run Setup',
      });
      w.onChunk(Buffer.from(
        '{"type":"assistant","message":{"role":"assistant","content":[' +
        '{"type":"tool_use","id":"t1","name":"Edit","input":{"file_path":"/a.ts"}}' +
        ']}}\n',
      ));
      w.onEnd(0);
      const lines = fs.readFileSync(path.join(dir, EVENTS_FILENAME), 'utf8')
        .split('\n').filter(Boolean).map((l) => JSON.parse(l));
      for (const line of lines) {
        assert.equal(line.story_id, 'st-auth-1');
        assert.equal(line.milestone_name, 'Foundation & First-Run Setup');
      }
      // Make sure the event's own fields aren't clobbered
      const toolUse = lines.find((l) => l.type === 'tool_use');
      assert.equal(toolUse.name, 'Edit');
      assert.equal(toolUse.summary, '/a.ts');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('omits story_id / milestone_name when not provided (project-level phase)', () => {
    const dir = mkTmpProject();
    try {
      const w = createPhaseEventWriter({
        projectDir: dir, phase: 'foundation', pid: 1, model: 'opus',
      });
      w.onEnd(0);
      const lines = fs.readFileSync(path.join(dir, EVENTS_FILENAME), 'utf8')
        .split('\n').filter(Boolean).map((l) => JSON.parse(l));
      for (const line of lines) {
        assert.equal('story_id' in line, false, 'story_id should not be present when unspecified');
        assert.equal('milestone_name' in line, false);
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
