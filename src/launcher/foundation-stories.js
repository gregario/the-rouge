/**
 * Foundation story generator — deterministically produces foundation stories
 * from seeding artifacts (infrastructure_manifest.json, vision.json, sizing.json).
 *
 * Stories are tier-gated:
 *   XS: 2 stories (scaffold + deploy)
 *   S:  5 stories (+ database, auth, ui-shell)
 *   M:  7+ stories (+ per-integration, fixtures)
 *   L+: 10+ stories (+ observability, performance, security)
 *
 * Each story has: id, name, status, acceptance_criteria[], depends_on[], foundation: true
 *
 * Used by:
 *   - seeding-finalize.ts (inlined TypeScript equivalent — the canonical generation logic)
 *   - rouge-loop.js (reads foundation stories from task_ledger milestones)
 */

'use strict';

const fs = require('fs');
const path = require('path');

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Generate foundation stories for a project based on its tier and infrastructure.
 *
 * @param {string} projectDir — absolute path to the project directory
 * @returns {Array<Object>} array of story objects with foundation: true
 */
function generateFoundationStories(projectDir) {
  const manifest = readJson(path.join(projectDir, 'infrastructure_manifest.json')) || {};
  const vision = readJson(path.join(projectDir, 'vision.json')) || {};
  const sizing = readJson(path.join(projectDir, 'seed_spec', 'sizing.json')) || {};
  const size = sizing.project_size || 'M';

  const stories = [];

  // Always: scaffold
  stories.push({
    id: 'f-scaffold',
    name: 'Project scaffold',
    status: 'pending',
    foundation: true,
    acceptance_criteria: [
      'Framework initialized with correct config',
      'All dependencies installed',
      'Dev server starts without errors',
      'Production build succeeds',
    ],
    depends_on: [],
  });

  // S+: database
  if (['S', 'M', 'L', 'XL'].includes(size) && manifest.database && manifest.database.provider) {
    const entityCount = Array.isArray(vision.entities) ? vision.entities.length : 0;
    stories.push({
      id: 'f-database',
      name: `Database setup (${manifest.database.provider}, ${entityCount} entities)`,
      status: 'pending',
      foundation: true,
      acceptance_criteria: [
        'Schema covers all entities from vision (2+ feature area references)',
        'Foreign keys and indexes defined',
        'Migrations run cleanly on fresh database',
        'Seed data realistic and domain-appropriate',
        `Entity count: ${entityCount}`,
      ],
      depends_on: ['f-scaffold'],
    });
  }

  // S+: auth
  if (['S', 'M', 'L', 'XL'].includes(size) && manifest.auth && manifest.auth.strategy) {
    stories.push({
      id: 'f-auth',
      name: `Auth flows (${manifest.auth.strategy})`,
      status: 'pending',
      foundation: true,
      acceptance_criteria: [
        'Registration creates user and returns session',
        'Login authenticates and returns session',
        'Logout destroys session',
        'Protected routes reject unauthenticated requests',
        'Session persistence works across page refresh',
      ],
      depends_on: ['f-scaffold', ...(manifest.database && manifest.database.provider ? ['f-database'] : [])],
    });
  }

  // M+: per-integration stories
  if (['M', 'L', 'XL'].includes(size) && Array.isArray(manifest.integrations)) {
    for (const integration of manifest.integrations) {
      const name = integration.name || integration;
      stories.push({
        id: `f-integration-${name}`,
        name: `Integration: ${name}`,
        status: 'pending',
        foundation: true,
        acceptance_criteria: [
          'Client wrapper exists with TypeScript types',
          'Error handling covers timeouts, rate limits, auth failures',
          'Environment variables referenced, never hardcoded',
          'Test stubs exist and pass',
          'Setup documented in README',
        ],
        depends_on: ['f-scaffold'],
      });
    }
  }

  // S+: UI shell (skip for API-only projects)
  if (['S', 'M', 'L', 'XL'].includes(size) && manifest.deploy?.target !== 'api-only') {
    stories.push({
      id: 'f-ui-shell',
      name: 'App shell + navigation',
      status: 'pending',
      foundation: true,
      acceptance_criteria: [
        'App shell renders without errors',
        'Navigation includes links for all feature areas',
        'Theme tokens applied consistently',
        'Error boundaries catch and display errors',
        'Loading states exist for async operations',
      ],
      depends_on: ['f-scaffold'],
    });
  }

  // M+: fixtures
  if (['M', 'L', 'XL'].includes(size)) {
    stories.push({
      id: 'f-fixtures',
      name: 'Test fixtures + seed data',
      status: 'pending',
      foundation: true,
      acceptance_criteria: [
        'Seed data for every entity in schema',
        'Data is realistic (domain-appropriate names, values, dates)',
        'Data generators produce consistent output',
        'Fixtures importable by feature tests',
      ],
      depends_on: ['f-database'],
    });
  }

  // Always: deploy (depends on all previous stories)
  stories.push({
    id: 'f-deploy',
    name: `Staging deploy (${manifest.deploy?.target || 'auto'})`,
    status: 'pending',
    foundation: true,
    acceptance_criteria: [
      'Deploy to staging succeeds',
      'Staging URL accessible',
      'Health check endpoint returns 200 (or index.html exists for static)',
      'Environment variables documented',
    ],
    depends_on: stories.filter(s => s.id !== 'f-deploy').map(s => s.id),
  });

  // L+: observability, performance, security
  if (['L', 'XL'].includes(size)) {
    stories.push(
      {
        id: 'f-observability',
        name: 'Logging + monitoring',
        status: 'pending',
        foundation: true,
        acceptance_criteria: [
          'Structured logging (JSON) on all API routes',
          'Error reporting integration configured',
          'Health dashboard accessible',
        ],
        depends_on: ['f-scaffold', 'f-deploy'],
      },
      {
        id: 'f-performance',
        name: 'Performance baselines',
        status: 'pending',
        foundation: true,
        acceptance_criteria: [
          'Lighthouse scores captured (baseline)',
          'Bundle size tracked',
          'Database query performance benchmarked',
        ],
        depends_on: ['f-deploy'],
      },
      {
        id: 'f-security',
        name: 'Security hardening',
        status: 'pending',
        foundation: true,
        acceptance_criteria: [
          'CORS configured correctly',
          'CSP headers set',
          'Rate limiting on auth endpoints',
          'Input sanitization on user-facing forms',
        ],
        depends_on: ['f-scaffold', ...(manifest.auth && manifest.auth.strategy ? ['f-auth'] : [])],
      },
    );
  }

  return stories;
}

module.exports = { generateFoundationStories };
