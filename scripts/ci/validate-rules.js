#!/usr/bin/env node
/**
 * Validate every library/rules/<lang>/<rule>.md has required frontmatter
 * and that `applies_to` matches the directory location.
 */

const fs = require('node:fs');
const path = require('node:path');

const RULES_ROOT = path.resolve(__dirname, '..', '..', 'library', 'rules');

const REQUIRED_FIELDS = ['id', 'name', 'applies_to', 'severity', 'tier', 'origin'];
const ALLOWED_SEVERITIES = ['blocking', 'warning', 'informational'];
const ALLOWED_TIERS = ['language', 'framework', 'cross-cutting'];
const ALLOWED_ORIGINS = ['ECC', 'Rouge', 'community'];

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

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'README.md') {
      files.push(full);
    }
  }
  return files;
}

function main() {
  const files = walk(RULES_ROOT);
  const errors = [];

  for (const file of files) {
    const rel = path.relative(RULES_ROOT, file);
    const langDir = rel.split(path.sep)[0];
    const content = fs.readFileSync(file, 'utf8');
    const fm = parseFrontmatter(content);
    if (!fm) {
      errors.push(`${rel}: missing or malformed frontmatter`);
      continue;
    }
    for (const f of REQUIRED_FIELDS) {
      if (!fm[f]) errors.push(`${rel}: missing field '${f}'`);
    }
    if (fm.severity && !ALLOWED_SEVERITIES.includes(fm.severity)) {
      errors.push(`${rel}: invalid severity '${fm.severity}'`);
    }
    if (fm.tier && !ALLOWED_TIERS.includes(fm.tier)) {
      errors.push(`${rel}: invalid tier '${fm.tier}'`);
    }
    if (fm.origin && !ALLOWED_ORIGINS.includes(fm.origin)) {
      errors.push(`${rel}: invalid origin '${fm.origin}'`);
    }
    if (fm.applies_to && Array.isArray(fm.applies_to)) {
      if (!fm.applies_to.includes(langDir)) {
        errors.push(`${rel}: applies_to [${fm.applies_to.join(',')}] does not include directory '${langDir}'`);
      }
    }
  }

  if (errors.length) {
    console.error(`[validate-rules] ${errors.length} error(s):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  console.log(`[validate-rules] ${files.length} rule(s) validated. OK.`);
}

main();
