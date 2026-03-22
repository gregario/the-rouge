#!/usr/bin/env node
/**
 * Generate visual evolution comparisons from screenshot history.
 * Compiles matching screenshots across loops into side-by-side or GIF.
 *
 * Usage: node visual-evolution.js <project-dir> [screen-name]
 *
 * Requires: ImageMagick (`brew install imagemagick`)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function hasImageMagick() {
  try {
    execSync('convert --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function generateEvolution(projectDir, screenName) {
  const screenshotBase = path.join(projectDir, 'screenshots');
  if (!fs.existsSync(screenshotBase)) {
    console.log('No screenshots directory');
    return null;
  }

  // Find all loop directories
  const loops = fs.readdirSync(screenshotBase)
    .filter(d => d.startsWith('loop-'))
    .sort((a, b) => {
      const numA = parseInt(a.replace('loop-', ''));
      const numB = parseInt(b.replace('loop-', ''));
      return numA - numB;
    });

  if (loops.length < 2) {
    console.log('Need at least 2 loops for evolution comparison');
    return null;
  }

  // Find matching screenshots across loops
  const target = screenName || 'home';
  const frames = loops
    .map(loop => path.join(screenshotBase, loop, `${target}.png`))
    .filter(f => fs.existsSync(f));

  if (frames.length < 2) {
    console.log(`Only ${frames.length} frames for "${target}" — need at least 2`);
    return null;
  }

  const outputDir = path.join(screenshotBase, 'evolution');
  fs.mkdirSync(outputDir, { recursive: true });

  if (!hasImageMagick()) {
    console.log('ImageMagick not installed — generating HTML comparison instead');

    // HTML side-by-side as fallback
    const html = `<!DOCTYPE html>
<html><head><title>${target} Evolution</title>
<style>
  body { font-family: sans-serif; background: #111; color: #fff; padding: 20px; }
  .frames { display: flex; gap: 10px; overflow-x: auto; }
  .frame { flex-shrink: 0; }
  .frame img { max-height: 400px; border: 1px solid #333; }
  .frame p { text-align: center; font-size: 12px; color: #888; }
</style></head><body>
<h1>${target} — Visual Evolution</h1>
<div class="frames">
${frames.map((f, i) => `  <div class="frame">
    <img src="${path.relative(outputDir, f)}" />
    <p>Loop ${loops[i]?.replace('loop-', '') || i}</p>
  </div>`).join('\n')}
</div>
</body></html>`;

    const htmlPath = path.join(outputDir, `${target}-evolution.html`);
    fs.writeFileSync(htmlPath, html);
    console.log(`HTML comparison: ${htmlPath}`);
    return htmlPath;
  }

  // Generate GIF with ImageMagick
  const gifPath = path.join(outputDir, `${target}-evolution.gif`);
  const frameArgs = frames.map(f => `"${f}"`).join(' ');

  try {
    execSync(
      `convert -delay 100 -loop 0 -resize 800x ${frameArgs} "${gifPath}"`,
      { timeout: 30000 }
    );
    console.log(`GIF: ${gifPath} (${(fs.statSync(gifPath).size / 1024).toFixed(0)}KB)`);
    return gifPath;
  } catch (err) {
    console.log(`GIF generation failed: ${err.message.slice(0, 100)}`);
    return null;
  }
}

if (require.main === module) {
  const projectDir = process.argv[2];
  const screenName = process.argv[3];
  if (!projectDir) {
    console.error('Usage: node visual-evolution.js <project-dir> [screen-name]');
    process.exit(1);
  }
  generateEvolution(projectDir, screenName);
}

module.exports = { generateEvolution };
