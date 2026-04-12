import { readFileSync, existsSync, statSync } from 'fs'
import { join } from 'path'

export interface BuildLogTail {
  lines: string[]
  totalLines: number
  sizeBytes: number
  mtime: string | null
  truncated: boolean
}

/**
 * Return the last N lines of <projectDir>/build.log. KISS: reads the whole
 * file. Build logs are sized by Rouge loop output, which is bounded per
 * cycle, so this is fine for interactive use. Switch to a streaming tail
 * if we ever see multi-MB logs in practice.
 */
export function readBuildLog(projectDir: string, tailLines = 50): BuildLogTail {
  const path = join(projectDir, 'build.log')
  const empty: BuildLogTail = {
    lines: [],
    totalLines: 0,
    sizeBytes: 0,
    mtime: null,
    truncated: false,
  }
  if (!existsSync(path)) return empty
  try {
    const stat = statSync(path)
    const mtime = stat.mtime.toISOString()
    const sizeBytes = stat.size
    if (sizeBytes === 0) return { ...empty, mtime }
    const raw = readFileSync(path, 'utf-8')
    const allLines = raw.split('\n')
    // Trailing newline creates an empty last element
    if (allLines.length > 0 && allLines[allLines.length - 1] === '') allLines.pop()
    const totalLines = allLines.length
    const lines = totalLines > tailLines ? allLines.slice(-tailLines) : allLines
    return {
      lines,
      totalLines,
      sizeBytes,
      mtime,
      truncated: totalLines > tailLines,
    }
  } catch {
    return empty
  }
}
