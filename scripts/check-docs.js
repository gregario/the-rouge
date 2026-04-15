#!/usr/bin/env node
/**
 * Docs integrity check — two cheap guards against rot:
 *
 *   1. Link check: every relative link in every .md file resolves to an
 *      existing file on disk.
 *   2. Command check: every `rouge <verb>` mentioned in docs exists in
 *      the CLI dispatcher (rouge-cli.js). Catches stale command names.
 *
 * Wired into CI via .github/workflows/docs-check.yml.
 *
 * Run manually: node scripts/check-docs.js
 * Exit 1 on any failure.
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const DOCS = path.join(REPO, 'docs');

function walkMarkdown(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip plans (gitignored, often reference non-existent branches) and archive
      // Skip plans (gitignored working docs), archive, design (aspirational
      // specs often reference commands that don't exist yet), and drafts.
      if (['plans', 'archive', 'design', 'drafts', 'research', 'node_modules'].includes(entry.name)) continue;
      walkMarkdown(full, acc);
    } else if (entry.name.endsWith('.md')) {
      acc.push(full);
    }
  }
  return acc;
}

// --- Link check -------------------------------------------------------------

// Match [label](path) where path is relative (no protocol, no #-only, no mailto)
const LINK_RE = /\[(?:[^\]]+)\]\(([^)]+)\)/g;

function checkLinks() {
  const failures = [];
  const files = walkMarkdown(DOCS);
  files.push(path.join(REPO, 'README.md'));
  files.push(path.join(REPO, 'CLAUDE.md'));
  files.push(path.join(REPO, 'VISION.md'));
  files.push(path.join(REPO, 'COMMERCIAL.md'));

  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, 'utf8');
    const dir = path.dirname(file);
    let match;
    while ((match = LINK_RE.exec(content)) !== null) {
      let target = match[1].trim();
      // Strip fragment + title
      target = target.split('#')[0].split(' ')[0];
      if (!target) continue;
      // Skip protocols, anchors, mailto, absolute URLs
      if (/^(https?:|mailto:|tel:|ftp:|#)/.test(target)) continue;
      // Skip template placeholders
      if (target.startsWith('<') || target.includes('{')) continue;
      const resolved = path.resolve(dir, target);
      const relFromRepo = path.relative(REPO, resolved);
      // Skip links pointing into gitignored / ephemeral directories. These
      // exist on some dev machines but not in CI clones, and flagging them
      // as broken produces noisy false positives. Keep the list small and
      // literal — matches the .gitignore entries.
      if (/^(projects|docs\/plans|docs\/archive|docs\/drafts|docs\/research)(\/|$)/.test(relFromRepo)) {
        continue;
      }
      if (!fs.existsSync(resolved)) {
        failures.push({ file: path.relative(REPO, file), link: match[1], resolved: relFromRepo });
      }
    }
  }
  return failures;
}

// --- Command check ----------------------------------------------------------

function extractCliVerbs() {
  const cli = fs.readFileSync(path.join(REPO, 'src/launcher/rouge-cli.js'), 'utf8');
  const verbs = new Set();
  // Match `command === 'verb'` in the dispatcher
  const re = /command === ['"]([a-z-]+)['"]/g;
  let m;
  while ((m = re.exec(cli)) !== null) verbs.add(m[1]);
  return verbs;
}

function checkCommands() {
  const verbs = extractCliVerbs();
  const failures = [];
  const files = walkMarkdown(DOCS);
  files.push(path.join(REPO, 'README.md'));

  // Match `rouge <verb>` in backticks OR inline code
  const cmdRe = /`rouge ([a-z][a-z-]*)`/g;
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, 'utf8');
    let m;
    while ((m = cmdRe.exec(content)) !== null) {
      const verb = m[1];
      // Allow known flags-as-first-arg
      if (verb.startsWith('-')) continue;
      if (!verbs.has(verb)) {
        failures.push({ file: path.relative(REPO, file), cmd: `rouge ${verb}` });
      }
    }
  }
  return failures;
}

// --- Runner -----------------------------------------------------------------

function main() {
  let failed = false;
  const linkFails = checkLinks();
  if (linkFails.length > 0) {
    failed = true;
    console.error(`\n❌ Broken links (${linkFails.length}):`);
    for (const f of linkFails) {
      console.error(`   ${f.file}  →  ${f.link}  (resolved: ${f.resolved})`);
    }
  } else {
    console.log('✅ Links: all relative links resolve');
  }

  const cmdFails = checkCommands();
  if (cmdFails.length > 0) {
    failed = true;
    console.error(`\n❌ Unknown CLI verbs referenced in docs (${cmdFails.length}):`);
    for (const f of cmdFails) {
      console.error(`   ${f.file}  →  \`${f.cmd}\``);
    }
  } else {
    console.log('✅ Commands: every `rouge <verb>` in docs exists in the CLI');
  }

  if (failed) process.exit(1);
}

main();
