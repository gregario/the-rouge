import { readFileSync, existsSync, statSync } from 'fs'
import { basename, join } from 'path'

export interface BuildLogTail {
  lines: string[]
  totalLines: number
  sizeBytes: number
  mtime: string | null
  truncated: boolean
  // Which file was tailed: 'phase' (active phase log with real Claude
  // output) or 'build' (rouge-loop's stdout/stderr, mostly startup
  // banners). The UI uses this to label what the user is looking at so
  // an all-quiet build.log doesn't get mistaken for a dead loop when
  // the action is actually in the phase log.
  source: 'phase' | 'build'
  sourcePath: string | null
}

const emptyTail: BuildLogTail = {
  lines: [],
  totalLines: 0,
  sizeBytes: 0,
  mtime: null,
  truncated: false,
  source: 'build',
  sourcePath: null,
}

function tailFile(path: string, tailLines: number, source: 'phase' | 'build'): BuildLogTail {
  if (!existsSync(path)) return { ...emptyTail, source, sourcePath: path }
  try {
    const stat = statSync(path)
    const mtime = stat.mtime.toISOString()
    const sizeBytes = stat.size
    if (sizeBytes === 0) {
      return { ...emptyTail, mtime, source, sourcePath: path }
    }
    const raw = readFileSync(path, 'utf-8')
    const allLines = raw.split('\n')
    if (allLines.length > 0 && allLines[allLines.length - 1] === '') allLines.pop()
    const totalLines = allLines.length
    const lines = totalLines > tailLines ? allLines.slice(-tailLines) : allLines
    return {
      lines,
      totalLines,
      sizeBytes,
      mtime,
      truncated: totalLines > tailLines,
      source,
      sourcePath: path,
    }
  } catch {
    return { ...emptyTail, source, sourcePath: path }
  }
}

/**
 * Return the last N lines of the most relevant log for this project.
 *
 * When `phaseLogPath` is provided AND the file exists AND is non-empty,
 * tail that — it's where Claude's real phase output lands. Otherwise fall
 * back to <projectDir>/build.log (rouge-loop's own stdout/stderr, which
 * only carries startup banners and crashes). The source field tells the
 * UI which file was read so the label can match.
 */
export function readBuildLog(
  projectDir: string,
  tailLines = 50,
  phaseLogPath?: string | null,
): BuildLogTail {
  if (phaseLogPath && existsSync(phaseLogPath)) {
    try {
      const size = statSync(phaseLogPath).size
      if (size > 0) return tailFile(phaseLogPath, tailLines, 'phase')
    } catch {
      // fall through to build.log
    }
  }
  const buildLogPath = join(projectDir, 'build.log')
  const result = tailFile(buildLogPath, tailLines, 'build')
  // Record which phase log we looked for so the UI can show "waiting for
  // <phase> log…" rather than implying build.log is the whole story.
  if (phaseLogPath) {
    return { ...result, sourcePath: result.sourcePath ?? phaseLogPath }
  }
  return result
}

/**
 * Derive the phase log filename for a slug + current_state. Keeps the
 * naming scheme in one place; rouge-loop writes to the same path shape.
 */
export function phaseLogPath(logDir: string, slug: string, currentState: string): string {
  // Matches `${projectName}-${currentState}.log` in rouge-loop.js.
  return join(logDir, `${slug}-${currentState}.log`)
}

// Re-exported so callers can name the log file without importing path.
export function phaseLogBasename(slug: string, currentState: string): string {
  return basename(phaseLogPath('', slug, currentState))
}
