/**
 * Vendor auto-discovery.
 *
 * Scans `library/vendors/<name>/manifest.json` at startup, validates each
 * manifest against the contract in schemas/vendor-manifest.json, and exposes
 * merged allow/deny patterns plus the declared intent list.
 *
 * Boot-time validation policy: fail loud. Invalid manifest or missing handler
 * export aborts before any Claude subprocess is spawned. See
 * docs/contributing/adding-a-vendor.md.
 *
 * Note: PR (b) ships discovery + merged deny surface only. Auto-wiring of
 * declared intents into INFRA_ACTION_HANDLERS is a follow-up — today, handlers
 * still live inline in rouge-loop.js.
 */

const fs = require('fs');
const path = require('path');

const VENDORS_DIR = path.resolve(__dirname, '../../library/vendors');

const REQUIRED_FIELDS = ['name', 'version', 'intents', 'ownership_fence'];
const REQUIRED_FENCE_FIELDS = ['manifest_field', 'verify'];

function validateManifest(manifest, vendorDir) {
  const errors = [];
  for (const field of REQUIRED_FIELDS) {
    if (!(field in manifest)) errors.push(`missing required field: ${field}`);
  }
  if (manifest.name && !/^[a-z][a-z0-9-]*$/.test(manifest.name)) {
    errors.push(`name must be lowercase kebab-case, got: ${manifest.name}`);
  }
  const expectedName = path.basename(vendorDir);
  if (manifest.name && manifest.name !== expectedName) {
    errors.push(`manifest.name '${manifest.name}' must match directory '${expectedName}'`);
  }
  if (manifest.version !== undefined && !Number.isInteger(manifest.version)) {
    errors.push(`version must be an integer, got: ${manifest.version}`);
  }
  if (Array.isArray(manifest.intents)) {
    if (manifest.intents.length === 0) errors.push('intents must be non-empty');
    for (const [i, intent] of manifest.intents.entries()) {
      if (!intent || typeof intent !== 'object') {
        errors.push(`intents[${i}] must be an object`);
        continue;
      }
      if (!intent.name) errors.push(`intents[${i}].name is required`);
      if (!intent.handler) errors.push(`intents[${i}].handler is required`);
    }
  } else if (manifest.intents !== undefined) {
    errors.push('intents must be an array');
  }
  if (manifest.ownership_fence && typeof manifest.ownership_fence === 'object') {
    for (const field of REQUIRED_FENCE_FIELDS) {
      if (!(field in manifest.ownership_fence)) {
        errors.push(`ownership_fence.${field} is required`);
      }
    }
  }
  return errors;
}

function loadVendors(vendorsDir = VENDORS_DIR) {
  if (!fs.existsSync(vendorsDir)) return { vendors: [], errors: [] };
  const entries = fs.readdirSync(vendorsDir, { withFileTypes: true });
  const vendors = [];
  const errors = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const vendorDir = path.join(vendorsDir, entry.name);
    const manifestPath = path.join(vendorDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) continue; // silent — allows placeholder dirs

    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (err) {
      errors.push(`${entry.name}: manifest.json parse error — ${err.message}`);
      continue;
    }

    const manifestErrors = validateManifest(manifest, vendorDir);
    if (manifestErrors.length > 0) {
      errors.push(`${entry.name}: ${manifestErrors.join('; ')}`);
      continue;
    }

    // Verify handler exports for every declared intent.
    const handlerPath = path.join(vendorDir, 'handler.js');
    if (fs.existsSync(handlerPath)) {
      try {
        const handler = require(handlerPath);
        const missing = manifest.intents
          .map(i => i.handler)
          .filter(name => typeof handler[name] !== 'function');
        if (missing.length > 0) {
          errors.push(`${entry.name}: handler.js missing exports: ${missing.join(', ')}`);
          continue;
        }
        if (manifest.ownership_fence?.verify &&
            typeof handler[manifest.ownership_fence.verify] !== 'function') {
          errors.push(`${entry.name}: handler.js missing ownership_fence.verify export '${manifest.ownership_fence.verify}'`);
          continue;
        }
        manifest._handler = handler;
      } catch (err) {
        errors.push(`${entry.name}: handler.js load error — ${err.message}`);
        continue;
      }
    }
    // handler.js absence is tolerated for PR (b) — some vendors are declaration-only
    // while the launcher-side wiring catches up.

    manifest._dir = vendorDir;
    vendors.push(manifest);
  }

  return { vendors, errors };
}

function mergedDenyPatterns(vendors) {
  const all = vendors.flatMap(v => v.deny_patterns || []);
  return [...new Set(all)];
}

function mergedAllowPatterns(vendors) {
  const all = vendors.flatMap(v => v.allow_patterns || []);
  return [...new Set(all)];
}

module.exports = {
  loadVendors,
  mergedDenyPatterns,
  mergedAllowPatterns,
  validateManifest,
  VENDORS_DIR,
};
