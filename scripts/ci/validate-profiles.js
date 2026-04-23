#!/usr/bin/env node
/**
 * Validate profiles/*.json: required fields, referenced rules/agents/MCPs/skills exist.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const PROFILES_DIR = path.join(ROOT, 'profiles');
const LIBRARY_DIR = path.join(ROOT, 'library');
const MCP_DIR = path.join(ROOT, 'mcp-configs');

const REQUIRED_FIELDS = [
  'name', 'description', 'stack_hints',
  'seeding_phases', 'loop_phases',
  'rules_to_load', 'agents_to_enable', 'mcps_to_enable', 'skills_to_load',
  'quality_bar',
];

function listDir(dir, filter) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(filter);
}

function main() {
  if (!fs.existsSync(PROFILES_DIR)) {
    console.log('[validate-profiles] no profiles/ directory — skipping');
    return;
  }

  const availableRules = listDir(
    path.join(LIBRARY_DIR, 'rules'),
    (e) => fs.statSync(path.join(LIBRARY_DIR, 'rules', e)).isDirectory()
  );
  const availableAgents = listDir(
    path.join(LIBRARY_DIR, 'agents'),
    (f) => f.endsWith('.md') && f !== 'README.md'
  ).map((f) => f.replace(/\.md$/, ''));
  const availableSkills = listDir(
    path.join(LIBRARY_DIR, 'skills'),
    (e) => fs.statSync(path.join(LIBRARY_DIR, 'skills', e)).isDirectory()
  );
  const availableMcps = listDir(
    MCP_DIR,
    (f) => f.endsWith('.json')
  ).map((f) => f.replace(/\.json$/, ''));

  const files = fs.readdirSync(PROFILES_DIR).filter((f) => f.endsWith('.json'));
  const errors = [];
  const warnings = [];

  for (const file of files) {
    const full = path.join(PROFILES_DIR, file);
    let profile;
    try {
      profile = JSON.parse(fs.readFileSync(full, 'utf8'));
    } catch (e) {
      errors.push(`${file}: invalid JSON — ${e.message}`);
      continue;
    }
    for (const f of REQUIRED_FIELDS) {
      if (profile[f] === undefined) errors.push(`${file}: missing field '${f}'`);
    }
    if (profile.name && profile.name !== file.replace(/\.json$/, '')) {
      errors.push(`${file}: name '${profile.name}' mismatches filename`);
    }

    // Reference checks — warnings, not errors (profile may intentionally reference future additions)
    if (Array.isArray(profile.rules_to_load)) {
      for (const r of profile.rules_to_load) {
        if (!availableRules.includes(r)) warnings.push(`${file}: rule dir '${r}' not found`);
      }
    }
    if (Array.isArray(profile.agents_to_enable)) {
      for (const a of profile.agents_to_enable) {
        if (!availableAgents.includes(a)) warnings.push(`${file}: agent '${a}' not found`);
      }
    }
    if (Array.isArray(profile.mcps_to_enable)) {
      for (const m of profile.mcps_to_enable) {
        if (!availableMcps.includes(m)) warnings.push(`${file}: MCP '${m}' not found`);
      }
    }
    if (Array.isArray(profile.skills_to_load)) {
      for (const s of profile.skills_to_load) {
        if (!availableSkills.includes(s)) warnings.push(`${file}: skill '${s}' not found`);
      }
    }
  }

  if (warnings.length) {
    console.warn(`[validate-profiles] ${warnings.length} warning(s):`);
    for (const w of warnings) console.warn(`  - ${w}`);
  }

  if (errors.length) {
    console.error(`[validate-profiles] ${errors.length} error(s):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  console.log(`[validate-profiles] ${files.length} profile(s) validated. OK.`);
}

main();
