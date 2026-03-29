/**
 * Feasibility assessment for Rouge self-improvement.
 *
 * Before building anything new (integration, stack, evaluation change),
 * assess whether Rouge can deliver it to quality. Four checks: scope,
 * knowledge, tools, testability.
 *
 * @param {object} proposal — { title, description, type: 'integration'|'stack'|'prompt'|'evaluation'|'other' }
 * @returns {object} — { verdict, checks, reasoning, missing }
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROUGE_ROOT = path.resolve(__dirname, '../..');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadVision() {
  const visionPath = path.join(ROUGE_ROOT, 'rouge-vision.json');
  return JSON.parse(fs.readFileSync(visionPath, 'utf8'));
}

/**
 * Search integration library for entries related to a keyword.
 * Returns an array of { tier, filename } objects.
 */
function findRelatedIntegrations(keyword) {
  const results = [];
  const libraryRoot = path.join(ROUGE_ROOT, 'library', 'integrations');
  if (!fs.existsSync(libraryRoot)) return results;

  const tiers = ['tier-1', 'tier-2', 'tier-3'];
  const lower = keyword.toLowerCase();

  for (const tier of tiers) {
    const tierDir = path.join(libraryRoot, tier);
    if (!fs.existsSync(tierDir)) continue;

    const files = fs.readdirSync(tierDir);
    for (const file of files) {
      if (file.toLowerCase().includes(lower)) {
        results.push({ tier, filename: file });
      } else {
        // Check file contents for the keyword
        try {
          const content = fs.readFileSync(path.join(tierDir, file), 'utf8').toLowerCase();
          if (content.includes(lower)) {
            results.push({ tier, filename: file });
          }
        } catch { /* skip unreadable files */ }
      }
    }
  }

  return results;
}

/**
 * Check if eval assertion files exist for a given phase keyword.
 * Returns an array of matching assertion filenames.
 */
function findEvalCoverage(keyword) {
  const evalDir = path.join(ROUGE_ROOT, 'tests', 'eval');
  if (!fs.existsSync(evalDir)) return [];

  const lower = keyword.toLowerCase();
  const files = fs.readdirSync(evalDir).filter((f) => f.endsWith('-assertions.md'));

  return files.filter((f) => f.toLowerCase().includes(lower));
}

/**
 * Check if a CLI tool is installed by running its version command.
 * Returns the version string or null.
 */
function checkToolInstalled(tool) {
  try {
    const output = execSync(`${tool} --version`, {
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 5000,
    }).trim();
    return output || 'installed';
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

/**
 * Check 1: Is the proposal within Rouge's domain scope?
 */
function checkScope(proposal, vision) {
  const { in_scope, out_of_scope } = vision.domain_boundaries;
  const text = `${proposal.title} ${proposal.description}`.toLowerCase();

  // Check against out_of_scope first
  for (const excluded of out_of_scope) {
    if (text.includes(excluded.toLowerCase())) {
      return {
        name: 'scope',
        status: 'fail',
        detail: `"${excluded}" is out of scope for Rouge`,
      };
    }
  }

  // Check for in_scope match
  for (const included of in_scope) {
    if (text.includes(included.toLowerCase())) {
      return {
        name: 'scope',
        status: 'pass',
        detail: `${included} is within Rouge's domain`,
      };
    }
  }

  // Check feature areas
  for (const area of vision.feature_areas) {
    if (text.includes(area.name.toLowerCase()) || text.includes(area.description.toLowerCase().slice(0, 30))) {
      return {
        name: 'scope',
        status: 'pass',
        detail: `Relates to Rouge feature area: ${area.name}`,
      };
    }
  }

  // Not clearly in or out — it's in the software domain but not explicitly listed
  if (vision.domain === 'software') {
    return {
      name: 'scope',
      status: 'caveat',
      detail: 'Not explicitly listed in scope, but within the software domain. Verify intent.',
    };
  }

  return {
    name: 'scope',
    status: 'caveat',
    detail: 'Could not determine scope match. Verify manually.',
  };
}

/**
 * Check 2: Does Rouge have knowledge/patterns for this?
 */
function checkKnowledge(proposal) {
  const text = `${proposal.title} ${proposal.description}`.toLowerCase();
  const type = proposal.type || 'other';

  if (type === 'integration' || type === 'stack') {
    // Look for related entries in the integration library
    const keywords = text.split(/\s+/).filter((w) => w.length > 3);
    let allMatches = [];
    for (const kw of keywords) {
      const matches = findRelatedIntegrations(kw);
      allMatches = allMatches.concat(matches);
    }
    // Deduplicate
    const unique = [...new Map(allMatches.map((m) => [`${m.tier}/${m.filename}`, m])).values()];

    if (unique.length > 0) {
      const entries = unique.map((m) => `${m.tier}/${m.filename}`).join(', ');
      return {
        name: 'knowledge',
        status: 'pass',
        detail: `Found related library entries: ${entries}`,
      };
    }

    return {
      name: 'knowledge',
      status: 'partial',
      detail: 'No existing integration patterns found. Research needed before building.',
    };
  }

  if (type === 'prompt' || type === 'evaluation') {
    // Check if eval assertions exist for the affected phase
    const keywords = text.split(/\s+/).filter((w) => w.length > 3);
    let allMatches = [];
    for (const kw of keywords) {
      const matches = findEvalCoverage(kw);
      allMatches = allMatches.concat(matches);
    }
    const unique = [...new Set(allMatches)];

    if (unique.length > 0) {
      return {
        name: 'knowledge',
        status: 'pass',
        detail: `Eval coverage exists: ${unique.join(', ')}`,
      };
    }

    return {
      name: 'knowledge',
      status: 'partial',
      detail: 'No eval assertions cover this area. Add assertions before modifying.',
    };
  }

  // Generic — check if any docs/patterns exist
  return {
    name: 'knowledge',
    status: 'caveat',
    detail: 'No specific knowledge check for this proposal type. Review manually.',
  };
}

/**
 * Check 3: Are the required tools available?
 */
function checkTools(proposal) {
  const text = `${proposal.title} ${proposal.description}`.toLowerCase();
  const missing = [];
  const found = [];

  // Always check core tools
  const coreTools = ['node', 'git'];
  for (const tool of coreTools) {
    const version = checkToolInstalled(tool);
    if (version) {
      found.push(tool);
    } else {
      missing.push(tool);
    }
  }

  // Check for API key requirements — look for common patterns
  // Only check using getSecret if available
  let secretsMissing = [];
  try {
    const { getSecret, INTEGRATION_KEYS } = require('./secrets.js');

    // Check if the proposal text mentions any known integration
    for (const [integration, keys] of Object.entries(INTEGRATION_KEYS)) {
      if (text.includes(integration.toLowerCase())) {
        for (const key of keys) {
          const value = getSecret(integration, key);
          if (value) {
            found.push(key);
          } else {
            secretsMissing.push(key);
          }
        }
      }
    }
  } catch { /* secrets module not available — skip */ }

  const allMissing = [...missing, ...secretsMissing];

  if (allMissing.length === 0) {
    return {
      name: 'tools',
      status: 'pass',
      detail: 'All detected tool/key requirements satisfied',
      missing: [],
    };
  }

  // Missing API keys are caveats (human can set them up)
  // Missing core tools are failures
  if (missing.length > 0) {
    return {
      name: 'tools',
      status: 'fail',
      detail: `Missing core tools: ${missing.join(', ')}`,
      missing: allMissing,
    };
  }

  return {
    name: 'tools',
    status: 'caveat',
    detail: `API keys not configured: ${secretsMissing.join(', ')}`,
    missing: allMissing,
  };
}

/**
 * Check 4: Can the output be tested?
 */
function checkTestability(proposal) {
  const type = proposal.type || 'other';
  const text = `${proposal.title} ${proposal.description}`.toLowerCase();

  if (type === 'integration') {
    // Check for sandbox/test mode indicators
    const sandboxTerms = ['free tier', 'sandbox', 'test mode', 'dev mode', 'localhost'];
    const hasSandboxMention = sandboxTerms.some((term) => text.includes(term));

    if (hasSandboxMention) {
      return {
        name: 'testability',
        status: 'pass',
        detail: 'Sandbox/test mode indicated in proposal',
      };
    }

    // For integrations, testability depends on whether there's a way to verify
    return {
      name: 'testability',
      status: 'caveat',
      detail: 'Integration testability unclear. Verify sandbox/test mode is available before building.',
    };
  }

  if (type === 'prompt') {
    const evalFiles = findEvalCoverage('');
    if (evalFiles.length > 0) {
      return {
        name: 'testability',
        status: 'pass',
        detail: `Eval suite exists (${evalFiles.length} assertion files). Run evals before and after.`,
      };
    }

    return {
      name: 'testability',
      status: 'caveat',
      detail: 'No eval assertions found. Create baseline assertions before modifying prompts.',
    };
  }

  if (type === 'evaluation') {
    return {
      name: 'testability',
      status: 'pass',
      detail: 'Evaluation changes are testable by running the eval suite itself.',
    };
  }

  if (type === 'stack') {
    return {
      name: 'testability',
      status: 'caveat',
      detail: 'Stack additions need a hello-world build to verify. Plan a test project.',
    };
  }

  // Generic
  return {
    name: 'testability',
    status: 'caveat',
    detail: 'Testability approach not determined. Define how to verify before building.',
  };
}

// ---------------------------------------------------------------------------
// Main assessment
// ---------------------------------------------------------------------------

/**
 * Run a full feasibility assessment.
 *
 * @param {object} proposal — { title, description, type }
 * @returns {object} — { verdict, checks, reasoning, missing }
 */
function assess(proposal) {
  if (!proposal || !proposal.title) {
    throw new Error('Proposal must have at least a title');
  }

  const vision = loadVision();
  const checks = [];
  const allMissing = [];

  // Run all four checks
  const scopeResult = checkScope(proposal, vision);
  checks.push(scopeResult);

  const knowledgeResult = checkKnowledge(proposal);
  checks.push(knowledgeResult);

  const toolsResult = checkTools(proposal);
  checks.push(toolsResult);
  if (toolsResult.missing) allMissing.push(...toolsResult.missing);

  const testResult = checkTestability(proposal);
  checks.push(testResult);

  // Determine verdict
  const statuses = checks.map((c) => c.status);
  let verdict;
  let reasoning;

  if (scopeResult.status === 'fail') {
    verdict = 'defer';
    reasoning = `Out of scope: ${scopeResult.detail}. Defer until scope expands.`;
  } else if (knowledgeResult.status === 'insufficient') {
    verdict = 'defer';
    reasoning = `Insufficient knowledge: ${knowledgeResult.detail}. Research first.`;
  } else if (statuses.some((s) => s === 'fail')) {
    verdict = 'defer';
    const failures = checks.filter((c) => c.status === 'fail');
    reasoning = `Blocking issues: ${failures.map((c) => c.detail).join('; ')}`;
  } else if (allMissing.length > 0) {
    verdict = 'escalate';
    reasoning = `Needs human action: ${allMissing.join(', ')}. Set up required resources then proceed.`;
  } else if (statuses.some((s) => s === 'caveat' || s === 'partial')) {
    verdict = 'proceed-with-caveats';
    const caveats = checks.filter((c) => c.status === 'caveat' || c.status === 'partial');
    reasoning = `Caveats: ${caveats.map((c) => c.detail).join('; ')}`;
  } else {
    verdict = 'proceed';
    reasoning = 'All checks passed. Clear to build.';
  }

  return { verdict, checks, reasoning, missing: allMissing };
}

module.exports = { assess, checkScope, checkKnowledge, checkTools, checkTestability };
