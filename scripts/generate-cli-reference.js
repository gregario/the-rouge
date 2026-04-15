#!/usr/bin/env node
/**
 * Generates docs/reference/cli.md from `rouge` help text.
 *
 * Run: node scripts/generate-cli-reference.js
 * CI:  compared against the committed file; mismatch fails the build so
 *      docs can't drift from the CLI.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROUGE_CLI = path.resolve(__dirname, '..', 'src', 'launcher', 'rouge-cli.js');
const OUT = path.resolve(__dirname, '..', 'docs', 'reference', 'cli.md');

function help() {
  // Run with no args to get the grouped help output.
  return execSync(`node ${JSON.stringify(ROUGE_CLI)}`, { encoding: 'utf8' });
}

function render(helpText) {
  return `# CLI Reference

**Auto-generated from \`rouge\` help output.** Do not edit by hand —
run \`node scripts/generate-cli-reference.js\` to regenerate.

The dashboard is Rouge's primary control surface. Most users only need the
SETUP & LIFECYCLE commands. Everything else is power-user territory.

\`\`\`
${helpText.trim()}
\`\`\`

## Environment variables

- \`ROUGE_DASHBOARD_PORT\` — override the default dashboard port (3001)
- \`ROUGE_PROJECTS_DIR\` — override the projects directory (default: \`~/.rouge/projects\` globally, \`./projects\` in source checkouts)
- \`ROUGE_HOME\` — override the Rouge home dir (default: \`~/.rouge\`)
- \`ROUGE_CLI\` — absolute path to \`rouge-cli.js\` (set automatically by the launcher; consumed by the dashboard)
- \`ROUGE_SUPPRESS_EXPERIMENTAL_WARNING=1\` — silence \`--experimental\` warnings on demoted CLI verbs (useful for automation)

## Exit codes

- \`0\` — success
- \`1\` — blocker (e.g., \`doctor\` found missing prereqs, \`setup\` failed, invalid args)

Commands marked \`EXPERIMENTAL\` in the help output still work but are no
longer the recommended path — the dashboard is the primary control surface.
They print a warning on use; suppress with \`ROUGE_SUPPRESS_EXPERIMENTAL_WARNING=1\`.
`;
}

function main() {
  const text = help();
  const md = render(text);
  const mode = process.argv.includes('--check') ? 'check' : 'write';
  if (mode === 'check') {
    if (!fs.existsSync(OUT)) {
      console.error(`FAIL: ${OUT} is missing. Run: node scripts/generate-cli-reference.js`);
      process.exit(1);
    }
    const existing = fs.readFileSync(OUT, 'utf8');
    if (existing !== md) {
      console.error(`FAIL: ${OUT} is out of date. Run: node scripts/generate-cli-reference.js`);
      process.exit(1);
    }
    console.log('OK: CLI reference in sync with rouge --help');
  } else {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, md);
    console.log(`Wrote ${OUT}`);
  }
}

main();
