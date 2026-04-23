#!/usr/bin/env node
/**
 * Validate every library/skills/<name>/SKILL.md has required frontmatter.
 * Ported in shape from everything-claude-code's scripts/ci/validate-skills.js.
 */

const fs = require('node:fs');
const path = require('node:path');

const SKILLS_ROOT = path.resolve(__dirname, '..', '..', 'library', 'skills');

const REQUIRED_FIELDS = ['name', 'description', 'origin', 'tier', 'status'];
const ALLOWED_ORIGINS = ['ECC', 'Rouge', 'community'];
const ALLOWED_TIERS = ['global', 'domain', 'personal'];
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

function listSkillDirs() {
  if (!fs.existsSync(SKILLS_ROOT)) return [];
  return fs.readdirSync(SKILLS_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

function main() {
  const skills = listSkillDirs();
  const errors = [];
  const warnings = [];

  for (const name of skills) {
    const skillMdPath = path.join(SKILLS_ROOT, name, 'SKILL.md');
    if (!fs.existsSync(skillMdPath)) {
      errors.push(`${name}: missing SKILL.md`);
      continue;
    }
    const content = fs.readFileSync(skillMdPath, 'utf8');
    const fm = parseFrontmatter(content);
    if (!fm) {
      errors.push(`${name}: missing or malformed frontmatter`);
      continue;
    }
    for (const f of REQUIRED_FIELDS) {
      if (!fm[f]) errors.push(`${name}: missing field '${f}'`);
    }
    if (fm.name && fm.name !== name) {
      errors.push(`${name}: frontmatter name '${fm.name}' mismatches directory`);
    }
    if (fm.origin && !ALLOWED_ORIGINS.includes(fm.origin)) {
      errors.push(`${name}: invalid origin '${fm.origin}' (allowed: ${ALLOWED_ORIGINS.join(', ')})`);
    }
    if (fm.tier && !ALLOWED_TIERS.includes(fm.tier)) {
      errors.push(`${name}: invalid tier '${fm.tier}' (allowed: ${ALLOWED_TIERS.join(', ')})`);
    }
    if (fm.status && !ALLOWED_STATUSES.includes(fm.status)) {
      errors.push(`${name}: invalid status '${fm.status}' (allowed: ${ALLOWED_STATUSES.join(', ')})`);
    }
    if (fm.description && typeof fm.description === 'string' && fm.description.length < 20) {
      warnings.push(`${name}: description is terse (<20 chars) — consider expanding`);
    }
  }

  if (warnings.length) {
    console.warn(`[validate-skills] ${warnings.length} warning(s):`);
    for (const w of warnings) console.warn(`  - ${w}`);
  }

  if (errors.length) {
    console.error(`[validate-skills] ${errors.length} error(s):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  console.log(`[validate-skills] ${skills.length} skill(s) validated. OK.`);
}

main();
