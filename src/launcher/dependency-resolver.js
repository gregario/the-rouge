/**
 * V3 Linked project dependency resolver.
 * Checks infrastructure_manifest.json for depends_on_projects,
 * resolves against the project registry, detects circular deps.
 */

const { isProjectShipped } = require('./project-registry.js');

function resolveDependencies(manifest, registryPath, opts = {}) {
  const maxDepth = opts.maxDepth ?? 3;
  const deps = manifest.depends_on_projects || [];

  if (deps.length === 0) return { resolved: true, unresolved: [] };

  const unresolved = [];

  for (const dep of deps) {
    if (maxDepth <= 0) {
      unresolved.push({
        ...dep,
        reason_blocked: `Max dependency depth exceeded (depth limit: ${opts.maxDepth ?? 3})`,
      });
      continue;
    }

    if (!isProjectShipped(registryPath, dep.name)) {
      unresolved.push(dep);
    }
  }

  return {
    resolved: unresolved.length === 0,
    unresolved,
  };
}

/**
 * Detect circular dependencies in a dependency graph.
 * @param {Object} depGraph - { projectName: [depName, ...], ... }
 * @returns {string[][]} Array of cycles found (each cycle is an array of project names)
 */
function checkCircularDeps(depGraph) {
  const cycles = [];
  const visited = new Set();
  const inStack = new Set();

  function dfs(node, path) {
    if (inStack.has(node)) {
      // Found a cycle — extract it
      const cycleStart = path.indexOf(node);
      cycles.push(path.slice(cycleStart).concat(node));
      return;
    }
    if (visited.has(node)) return;

    visited.add(node);
    inStack.add(node);
    path.push(node);

    for (const dep of depGraph[node] || []) {
      dfs(dep, [...path]);
    }

    inStack.delete(node);
  }

  for (const node of Object.keys(depGraph)) {
    dfs(node, []);
  }

  return cycles;
}

module.exports = { resolveDependencies, checkCircularDeps };
