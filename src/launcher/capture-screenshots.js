#!/usr/bin/env node
/**
 * Capture screenshots of key screens for a Rouge project.
 * Uses GStack browse ($B) for headless screenshot capture.
 *
 * Usage: node capture-screenshots.js <project-dir> <loop-number>
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const B = path.join(process.env.HOME || '', '.claude/skills/gstack/browse/dist/browse');
const ROUGE_ROOT = path.resolve(__dirname, '../..');

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

function log(msg) {
  console.log(`[screenshot] ${msg}`);
}

function browse(cmd) {
  try {
    return execSync(`${B} ${cmd}`, { encoding: 'utf8', timeout: 30000 }).trim();
  } catch (err) {
    log(`Browse command failed: ${cmd} — ${(err.message || '').slice(0, 100)}`);
    return null;
  }
}

function captureScreenshots(projectDir, loopNumber) {
  const projectName = path.basename(projectDir);
  const ctx = readJson(path.join(projectDir, 'cycle_context.json'));
  const stagingUrl = ctx?.infrastructure?.staging_url || ctx?.deployment_url;

  if (!stagingUrl) {
    log('No staging URL — skipping screenshots');
    return [];
  }

  if (!fs.existsSync(B)) {
    log(`GStack browse not found at ${B} — skipping screenshots`);
    return [];
  }

  // Create screenshot directory
  const screenshotDir = path.join(projectDir, 'screenshots', `loop-${loopNumber}`);
  fs.mkdirSync(screenshotDir, { recursive: true });

  // Determine key screens from vision/spec
  const screens = [];
  const vision = ctx?.vision;
  if (vision?.feature_areas) {
    // Home/landing is always first
    screens.push({ name: 'home', path: '/' });

    // Extract screen paths from design artifact if available
    const designFile = path.join(projectDir, 'seed_spec', 'design-artifact.yaml');
    if (fs.existsSync(designFile)) {
      const designContent = fs.readFileSync(designFile, 'utf8');
      const pathMatches = designContent.match(/path:\s*"([^"]+)"/g) || [];
      for (const match of pathMatches) {
        const p = match.match(/path:\s*"([^"]+)"/)[1];
        if (p !== '/' && !p.includes(':')) { // skip parameterized routes
          const name = p.replace(/^\//, '').replace(/\//g, '-') || 'home';
          if (!screens.find(s => s.path === p)) {
            screens.push({ name, path: p });
          }
        }
      }
    }
  }

  // Fallback: at least capture home
  if (screens.length === 0) {
    screens.push({ name: 'home', path: '/' });
  }

  // Limit to 5 screens max
  const toCapture = screens.slice(0, 5);
  const captured = [];

  log(`Capturing ${toCapture.length} screens for ${projectName} (loop ${loopNumber})`);

  // Navigate to staging URL first
  browse(`goto ${stagingUrl}`);

  for (const screen of toCapture) {
    const url = `${stagingUrl}${screen.path}`;
    const filename = `${screen.name}.png`;
    const filepath = path.join(screenshotDir, filename);

    log(`  ${screen.name}: ${url}`);
    browse(`goto ${url}`);

    // Wait for page to settle
    execSync('sleep 1');

    // Capture screenshot
    const result = browse(`screenshot ${filepath}`);
    if (result !== null && fs.existsSync(filepath)) {
      captured.push({ name: screen.name, path: screen.path, file: filepath });
      log(`  ✓ ${filename} (${(fs.statSync(filepath).size / 1024).toFixed(0)}KB)`);
    } else {
      log(`  ✗ ${filename} failed`);
    }
  }

  log(`Captured ${captured.length}/${toCapture.length} screenshots`);
  return captured;
}

// CLI mode
if (require.main === module) {
  const projectDir = process.argv[2];
  const loopNumber = process.argv[3] || '0';
  if (!projectDir) {
    console.error('Usage: node capture-screenshots.js <project-dir> <loop-number>');
    process.exit(1);
  }
  const results = captureScreenshots(projectDir, loopNumber);
  console.log(JSON.stringify(results, null, 2));
}

module.exports = { captureScreenshots };
