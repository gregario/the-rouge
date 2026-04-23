#!/usr/bin/env node
/**
 * Validate every library/agents/<name>.md has required frontmatter
 * and tools declared are in the permitted set.
 */

const fs = require('node:fs');
const path = require('node:path');

const AGENTS_ROOT = path.resolve(__dirname, '..', '..', 'library', 'agents');

const REQUIRED_FIELDS = ['name', 'description', 'tools', 'model', 'origin', 'status'];
const PERMITTED_TOOLS = ['Read', 'Grep', 'Glob', 'Bash', 'Edit', 'Write'];
const ALLOWED_MODELS = ['opus', 'sonnet', 'haiku'];
const ALLOWED_ORIGINS = ['ECC', 'Rouge', 'community'];
const ALLOWED_STATUSES = ['active', 'shadow', 'retired'];

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const fm = {};
  for (const line of match[1].split('\n')) {
    const m = line.match(/^([a-z_]+):\s*(.+)$/);
    if (!m) continue;
    const [, k, vRaw] = m;
    let v = vRaw.trim();
    if (v.startsWith('[') && v.endsWith(']')) {
      v = v.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean);
    }
    fm[k] = v;
  }
  return fm;
}

function listAgentFiles() {
  if (!fs.existsSync(AGENTS_ROOT)) return [];
  return fs.readdirSync(AGENTS_ROOT)
    .filter((f) => f.endsWith('.md') && f !== 'README.md');
}

function main() {
  const files = listAgentFiles();
  const errors = [];

  for (const file of files) {
    const name = file.replace(/\.md$/, '');
    const full = path.join(AGENTS_ROOT, file);
    const content = fs.readFileSync(full, 'utf8');
    const fm = parseFrontmatter(content);
    if (!fm) {
      errors.push(`${file}: missing or malformed frontmatter`);
      continue;
    }
    for (const f of REQUIRED_FIELDS) {
      if (!fm[f]) errors.push(`${file}: missing field '${f}'`);
    }
    if (fm.name && fm.name !== name) {
      errors.push(`${file}: frontmatter name '${fm.name}' mismatches filename`);
    }
    if (fm.model && !ALLOWED_MODELS.includes(fm.model)) {
      errors.push(`${file}: invalid model '${fm.model}' (allowed: ${ALLOWED_MODELS.join(', ')})`);
    }
    if (fm.origin && !ALLOWED_ORIGINS.includes(fm.origin)) {
      errors.push(`${file}: invalid origin '${fm.origin}'`);
    }
    if (fm.status && !ALLOWED_STATUSES.includes(fm.status)) {
      errors.push(`${file}: invalid status '${fm.status}'`);
    }
    if (fm.tools && Array.isArray(fm.tools)) {
      for (const t of fm.tools) {
        if (!PERMITTED_TOOLS.includes(t)) {
          errors.push(`${file}: tool '${t}' not in permitted set (${PERMITTED_TOOLS.join(', ')})`);
        }
      }
    }
  }

  if (errors.length) {
    console.error(`[validate-agents] ${errors.length} error(s):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  console.log(`[validate-agents] ${files.length} agent(s) validated. OK.`);
}

main();
