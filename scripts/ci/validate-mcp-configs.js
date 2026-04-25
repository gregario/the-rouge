#!/usr/bin/env node
/**
 * Validate mcp-configs/*.json manifests.
 * Confirms required fields, allowed statuses, phase names, profile names.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..', 'library', 'integrations', 'mcp-configs');

const REQUIRED_FIELDS = [
  'name', 'description', 'origin', 'status', 'command',
  'read_only_recommended', 'wire_into_phases', 'profiles_recommended',
];
const ALLOWED_ORIGINS = ['ECC', 'Rouge', 'community'];
const ALLOWED_STATUSES = ['active', 'draft', 'retired'];

const VALID_PHASE_NAMES = new Set([
  // seeding phases
  'seeding.brainstorm', 'seeding.competition', 'seeding.taste',
  'seeding.spec', 'seeding.design', 'seeding.legal', 'seeding.infrastructure',
  'seeding.marketing',
  // loop phases
  'loop.foundation', 'loop.building', 'loop.test-integrity',
  'loop.code-review', 'loop.product-walk', 'loop.evaluation',
  'loop.re-walk', 'loop.qa-fixing', 'loop.analyzing',
  'loop.change-spec', 'loop.vision-check', 'loop.ship-promote',
  'loop.document-release', 'loop.retrospective', 'loop.final-review',
]);

const VALID_PROFILES = new Set([
  'saas-webapp', 'api-service', 'mcp-server', 'cli-tool', 'internal-dashboard',
  'marketplace', 'all',
]);

function main() {
  if (!fs.existsSync(ROOT)) {
    console.log(`[validate-mcp-configs] no mcp-configs directory at ${ROOT} — skipping`);
    return;
  }

  const files = fs.readdirSync(ROOT).filter((f) => f.endsWith('.json'));
  const errors = [];

  for (const file of files) {
    const full = path.join(ROOT, file);
    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(full, 'utf8'));
    } catch (e) {
      errors.push(`${file}: invalid JSON — ${e.message}`);
      continue;
    }

    for (const f of REQUIRED_FIELDS) {
      if (manifest[f] === undefined) errors.push(`${file}: missing field '${f}'`);
    }
    if (manifest.read_only_recommended !== undefined
        && typeof manifest.read_only_recommended !== 'boolean') {
      errors.push(`${file}: read_only_recommended must be a boolean (got ${typeof manifest.read_only_recommended})`);
    }
    if (manifest.origin && !ALLOWED_ORIGINS.includes(manifest.origin)) {
      errors.push(`${file}: invalid origin '${manifest.origin}'`);
    }
    if (manifest.status && !ALLOWED_STATUSES.includes(manifest.status)) {
      errors.push(`${file}: invalid status '${manifest.status}'`);
    }
    if (manifest.name && manifest.name !== file.replace(/\.json$/, '')) {
      errors.push(`${file}: name '${manifest.name}' mismatches filename`);
    }
    if (Array.isArray(manifest.wire_into_phases)) {
      for (const phase of manifest.wire_into_phases) {
        if (!VALID_PHASE_NAMES.has(phase)) {
          errors.push(`${file}: invalid phase '${phase}' in wire_into_phases`);
        }
      }
    }
    if (Array.isArray(manifest.profiles_recommended)) {
      for (const p of manifest.profiles_recommended) {
        if (!VALID_PROFILES.has(p)) {
          errors.push(`${file}: invalid profile '${p}' in profiles_recommended`);
        }
      }
    }
  }

  if (errors.length) {
    console.error(`[validate-mcp-configs] ${errors.length} error(s):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  console.log(`[validate-mcp-configs] ${files.length} manifest(s) validated. OK.`);
}

main();
