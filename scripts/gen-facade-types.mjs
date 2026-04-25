#!/usr/bin/env node
/**
 * Snapshot the JSDoc-derived TypeScript shape of the launcher facade
 * for drift detection.
 *
 * Two files coexist:
 *
 *   dashboard/src/types/facade.d.ts          — HAND-AUTHORED. The
 *                                              dashboard-facing named
 *                                              interfaces (Facade,
 *                                              FacadeMode, etc.) the
 *                                              bridge/facade.ts shim
 *                                              imports.
 *
 *   dashboard/src/types/facade.snapshot.d.ts — AUTO-GENERATED. Captures
 *                                              what the JSDoc on the
 *                                              actual launcher facade
 *                                              currently emits via tsc.
 *                                              Committed so CI can
 *                                              detect when the JSDoc
 *                                              has changed.
 *
 * The script:
 *
 *   1. Uses tsc programmatically with `allowJs: true`, `declaration:
 *      true`, `emitDeclarationOnly: true` against the three facade
 *      source files (facade.js + facade/lock.js + facade/events.js).
 *   2. Concatenates the emitted .d.ts content into one snapshot file
 *      with a regen-warning header.
 *   3. Compares against the on-disk snapshot. If different, writes
 *      and exits 0; if `--check` was passed, exits 1 instead so CI
 *      can flag drift.
 *
 * The drift-detection contract: when this script's `--check` mode
 * fails, the JSDoc on facade.js has changed since the last snapshot.
 * Reviewer:
 *   - Decides whether the change matters for dashboard consumers.
 *   - If yes, updates the hand-authored `facade.d.ts` to match.
 *   - Re-runs without `--check` to refresh the snapshot.
 *
 * Usage:
 *
 *   bun run gen:facade-types         # refresh snapshot
 *   bun run gen:facade-types -- --check  # exit 1 on drift
 */

import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve as pathResolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
// Resolves either to the root devDep (preferred) or, as a fallback,
// the dashboard's already-installed copy. Either is fine — TypeScript
// is API-compatible across the 5.x line we use.
let ts
try {
  ts = require('typescript')
} catch {
  ts = require('../dashboard/node_modules/typescript')
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = pathResolve(__dirname, '..')

const SOURCES = [
  pathResolve(ROOT, 'src/launcher/facade.js'),
  pathResolve(ROOT, 'src/launcher/facade/lock.js'),
  pathResolve(ROOT, 'src/launcher/facade/events.js'),
]

const OUT_PATH = pathResolve(ROOT, 'dashboard/src/types/facade.snapshot.d.ts')

const COMPILER_OPTIONS = {
  allowJs: true,
  declaration: true,
  emitDeclarationOnly: true,
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2022,
  moduleResolution: ts.ModuleResolutionKind.NodeJs,
  esModuleInterop: true,
  skipLibCheck: true,
  strict: false,
}

const HEADER = `/**
 * AUTO-GENERATED snapshot of the JSDoc-derived facade shape.
 *
 * Source: src/launcher/facade.js + facade/lock.js + facade/events.js.
 * Generator: scripts/gen-facade-types.mjs.
 *
 * DO NOT EDIT BY HAND. Run \`bun run gen:facade-types\` to refresh.
 * CI runs \`bun run gen:facade-types -- --check\` to detect drift.
 *
 * This file is the drift-detector. The dashboard imports from
 * facade.d.ts (hand-authored named interfaces); when this snapshot
 * disagrees with the JSDoc on the launcher facade, CI fails and a
 * reviewer decides whether to update facade.d.ts to match.
 */

`

function emit() {
  const host = ts.createCompilerHost(COMPILER_OPTIONS)
  const outputs = new Map()

  // Override writeFile so we capture artifacts in memory rather than
  // letting tsc write them next to the source files.
  host.writeFile = (fileName, contents) => {
    outputs.set(fileName, contents)
  }

  const program = ts.createProgram(SOURCES, COMPILER_OPTIONS, host)
  const emitResult = program.emit()

  const diagnostics = ts
    .getPreEmitDiagnostics(program)
    .concat(emitResult.diagnostics)

  if (diagnostics.length > 0) {
    for (const d of diagnostics) {
      const message = ts.flattenDiagnosticMessageText(d.messageText, '\n')
      if (d.file) {
        const { line, character } = ts.getLineAndCharacterOfPosition(
          d.file,
          d.start ?? 0,
        )
        console.error(`${d.file.fileName}:${line + 1}:${character + 1} — ${message}`)
      } else {
        console.error(message)
      }
    }
  }

  // Concatenate the .d.ts emits in source order, dropping reference
  // comments tsc adds (the dashboard imports the file directly; we
  // don't need to point at the .js sources from the .d.ts).
  const parts = []
  for (const src of SOURCES) {
    const baseName = src
      .replace(ROOT + '/', '')
      .replace(/\.js$/, '.d.ts')
    // tsc names the emit by the source path; locate it in our map.
    let emitted
    for (const [name, content] of outputs) {
      if (name.endsWith(baseName.replace(/^src\//, ''))) {
        emitted = content
        break
      }
      if (name.endsWith('/' + baseName.split('/').pop())) {
        emitted = content
        break
      }
    }
    if (!emitted) {
      console.error(`gen-facade-types: missing emit for ${baseName}`)
      process.exit(1)
    }
    // Strip /// reference directives + the export {} sentinel tsc adds.
    const cleaned = emitted
      .split('\n')
      .filter((line) => !line.startsWith('/// <reference'))
      .join('\n')
    parts.push(`// ----- from ${baseName} -----\n${cleaned}`)
  }

  return HEADER + parts.join('\n')
}

function main() {
  const checkOnly = process.argv.includes('--check')
  const generated = emit()

  if (checkOnly) {
    if (!existsSync(OUT_PATH)) {
      console.error(`gen-facade-types --check: ${OUT_PATH} does not exist; run without --check to regenerate.`)
      process.exit(1)
    }
    const onDisk = readFileSync(OUT_PATH, 'utf8')
    if (onDisk !== generated) {
      console.error(`gen-facade-types --check: ${OUT_PATH} is out of date.`)
      console.error(`Run: node scripts/gen-facade-types.mjs`)
      process.exit(1)
    }
    console.log(`gen-facade-types: ${OUT_PATH} is up to date.`)
    return
  }

  writeFileSync(OUT_PATH, generated)
  console.log(`gen-facade-types: wrote ${OUT_PATH}`)
}

main()
