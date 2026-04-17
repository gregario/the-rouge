import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveRougeConfigPath } from '../rouge-config'

let dir: string
let originalCwd: string
let originalConfig: string | undefined
let originalCli: string | undefined

beforeEach(() => {
  originalCwd = process.cwd()
  originalConfig = process.env.ROUGE_CONFIG
  originalCli = process.env.ROUGE_CLI
  delete process.env.ROUGE_CONFIG
  delete process.env.ROUGE_CLI
})

afterEach(() => {
  process.chdir(originalCwd)
  if (originalConfig === undefined) delete process.env.ROUGE_CONFIG
  else process.env.ROUGE_CONFIG = originalConfig
  if (originalCli === undefined) delete process.env.ROUGE_CLI
  else process.env.ROUGE_CLI = originalCli
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('resolveRougeConfigPath', () => {
  it('returns ROUGE_CONFIG when set and exists', () => {
    dir = mkdtempSync(join(tmpdir(), 'rougecfg-'))
    const cfg = join(dir, 'rouge.config.json')
    writeFileSync(cfg, '{}')
    process.env.ROUGE_CONFIG = cfg
    expect(resolveRougeConfigPath()).toBe(cfg)
  })

  it('returns null when ROUGE_CONFIG points to a missing file', () => {
    dir = mkdtempSync(join(tmpdir(), 'rougecfg-'))
    process.env.ROUGE_CONFIG = join(dir, 'nope.json')
    // chdir to dir so the cwd-walk fallback finds nothing either.
    process.chdir(dir)
    expect(resolveRougeConfigPath()).toBe(null)
  })

  it('resolves via ROUGE_CLI sibling-up climb', () => {
    dir = mkdtempSync(join(tmpdir(), 'rougecfg-'))
    // Mirror real layout: <repo>/src/launcher/rouge-cli.js + <repo>/rouge.config.json
    mkdirSync(join(dir, 'src', 'launcher'), { recursive: true })
    const cli = join(dir, 'src', 'launcher', 'rouge-cli.js')
    writeFileSync(cli, '// stub')
    const cfg = join(dir, 'rouge.config.json')
    writeFileSync(cfg, '{}')
    process.env.ROUGE_CLI = cli
    // chdir somewhere unrelated so cwd-walk can't accidentally find it.
    process.chdir(tmpdir())
    expect(resolveRougeConfigPath()).toBe(cfg)
  })

  it('walks up from cwd to find rouge.config.json', () => {
    dir = mkdtempSync(join(tmpdir(), 'rougecfg-'))
    // realpath: macOS aliases /var → /private/var; cwd-walk returns the
    // real-path form, the temp dir we got back is the symlinked form.
    const real = realpathSync(dir)
    const cfg = join(real, 'rouge.config.json')
    writeFileSync(cfg, '{}')
    const sub = join(real, 'a', 'b', 'c')
    mkdirSync(sub, { recursive: true })
    process.chdir(sub)
    expect(resolveRougeConfigPath()).toBe(cfg)
  })

  it('returns null when no config exists anywhere reachable', () => {
    dir = mkdtempSync(join(tmpdir(), 'rougecfg-'))
    process.chdir(dir)
    expect(resolveRougeConfigPath()).toBe(null)
  })
})
