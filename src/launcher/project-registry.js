/**
 * V3 Project registry — tracks shipped projects and their provided artifacts.
 * Used by the dependency resolver to check if dependencies are satisfied.
 */

const fs = require('fs');

function readRegistry(registryPath) {
  if (!fs.existsSync(registryPath)) return { projects: {} };
  try {
    return JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  } catch {
    return { projects: {} };
  }
}

function registerProject(registryPath, name, { path: projectPath, provides }) {
  const registry = readRegistry(registryPath);
  registry.projects[name] = {
    path: projectPath,
    status: 'shipped',
    provides: provides || {},
    shipped_at: new Date().toISOString(),
  };
  // Ensure parent directory exists
  const dir = require('path').dirname(registryPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2), 'utf8');
}

function isProjectShipped(registryPath, name) {
  const registry = readRegistry(registryPath);
  return registry.projects[name]?.status === 'shipped';
}

function getProjectArtifacts(registryPath, name) {
  const registry = readRegistry(registryPath);
  return registry.projects[name]?.provides || {};
}

module.exports = { readRegistry, registerProject, isProjectShipped, getProjectArtifacts };
