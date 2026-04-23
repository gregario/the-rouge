/**
 * profile-loader.js
 *
 * Loads a product-shape profile from profiles/<name>.json and resolves its
 * referenced rules, agents, MCPs, and skills to the actual filesystem paths.
 *
 * Used by (future) preamble-injector to scope what gets injected into the
 * factory's context based on the active product's profile. Until that wiring
 * lands, this module is additive: calling it has no effect on the live loop.
 *
 * Graceful degradation is a design goal:
 *   - Missing profile file → returns the 'all' fallback with a warning
 *   - Profile references a non-existent rule/agent/MCP/skill → logs skip, continues
 *   - Invalid JSON → throws with filename context
 *
 * No external deps beyond node:fs/node:path.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const PROFILES_DIR = path.join(ROOT, 'profiles');
const LIBRARY_DIR = path.join(ROOT, 'library');
const MCP_DIR = path.join(ROOT, 'mcp-configs');

// "all" fallback: loaded when no profile is selected. Preserves
// pre-profile behavior by listing every catalog entry.
const ALL_FALLBACK = {
  name: 'all',
  description: 'Fallback profile: everything available. Used when no specific profile selected.',
  stack_hints: {},
  seeding_phases: 'all',
  loop_phases: 'all',
  rules_to_load: 'all',
  agents_to_enable: 'all',
  mcps_to_enable: 'all',
  skills_to_load: 'all',
  quality_bar: {},
};

function listDirEntries(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir);
}

function listRuleDirs() {
  return listDirEntries(path.join(LIBRARY_DIR, 'rules'))
    .filter((e) => {
      const full = path.join(LIBRARY_DIR, 'rules', e);
      return fs.existsSync(full) && fs.statSync(full).isDirectory();
    });
}

function listAgentNames() {
  return listDirEntries(path.join(LIBRARY_DIR, 'agents'))
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .map((f) => f.replace(/\.md$/, ''));
}

function listSkillNames() {
  return listDirEntries(path.join(LIBRARY_DIR, 'skills'))
    .filter((e) => {
      const full = path.join(LIBRARY_DIR, 'skills', e);
      return fs.existsSync(full) && fs.statSync(full).isDirectory();
    });
}

function listMcpNames() {
  return listDirEntries(MCP_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''));
}

/**
 * Load raw profile JSON by name. Returns null if not found.
 */
function loadProfileRaw(name, opts = {}) {
  const dir = opts.profilesDir || PROFILES_DIR;
  const file = path.join(dir, `${name}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`profile-loader: invalid JSON in ${file}: ${e.message}`);
  }
}

/**
 * Resolve a profile's references to actual on-disk entries.
 * Returns { profile, resolved: { rules, agents, skills, mcps }, warnings }.
 *
 * @param {string} name - profile name, or falsy for 'all' fallback
 * @param {object} opts
 *   - profilesDir / libraryDir / mcpDir : override roots for testing
 *   - silent: don't log warnings to console
 */
function loadProfile(name, opts = {}) {
  const warnings = [];
  let profile = name ? loadProfileRaw(name, opts) : null;
  if (!profile) {
    if (name) warnings.push(`profile '${name}' not found; using 'all' fallback`);
    profile = ALL_FALLBACK;
  }

  const libDir = opts.libraryDir || LIBRARY_DIR;
  const mcpDir = opts.mcpDir || MCP_DIR;

  const availableRules = fs.existsSync(path.join(libDir, 'rules'))
    ? fs.readdirSync(path.join(libDir, 'rules')).filter((e) => {
        const full = path.join(libDir, 'rules', e);
        return fs.existsSync(full) && fs.statSync(full).isDirectory();
      })
    : [];
  const availableAgents = fs.existsSync(path.join(libDir, 'agents'))
    ? fs.readdirSync(path.join(libDir, 'agents'))
        .filter((f) => f.endsWith('.md') && f !== 'README.md')
        .map((f) => f.replace(/\.md$/, ''))
    : [];
  const availableSkills = fs.existsSync(path.join(libDir, 'skills'))
    ? fs.readdirSync(path.join(libDir, 'skills')).filter((e) => {
        const full = path.join(libDir, 'skills', e);
        return fs.existsSync(full) && fs.statSync(full).isDirectory();
      })
    : [];
  const availableMcps = fs.existsSync(mcpDir)
    ? fs.readdirSync(mcpDir).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''))
    : [];

  function resolve(listOrAll, available, kind) {
    if (listOrAll === 'all') return available;
    if (!Array.isArray(listOrAll)) return [];
    const resolved = [];
    for (const item of listOrAll) {
      if (available.includes(item)) resolved.push(item);
      else warnings.push(`profile '${profile.name}' references ${kind} '${item}' which does not exist`);
    }
    return resolved;
  }

  const resolved = {
    rules: resolve(profile.rules_to_load, availableRules, 'rule dir'),
    agents: resolve(profile.agents_to_enable, availableAgents, 'agent'),
    skills: resolve(profile.skills_to_load, availableSkills, 'skill'),
    mcps: resolve(profile.mcps_to_enable, availableMcps, 'MCP'),
  };

  if (!opts.silent && warnings.length > 0) {
    for (const w of warnings) console.warn(`[profile-loader] ${w}`);
  }

  return {
    profile,
    resolved,
    warnings,
  };
}

/** List available profile names */
function listProfiles(opts = {}) {
  const dir = opts.profilesDir || PROFILES_DIR;
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''));
}

module.exports = {
  loadProfileRaw,
  loadProfile,
  listProfiles,
  ALL_FALLBACK,
};
