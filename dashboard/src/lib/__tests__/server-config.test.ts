import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { loadServerConfig } from '../server-config'

// server-config reads rouge-dashboard.config.json from `process.cwd()`
// first, so we redirect cwd to a temp dir for each test. Also scrub
// relevant env vars so they don't win over the config.
let testRoot: string
let origCwd: string
let origEnvProjects: string | undefined
let origEnvCli: string | undefined

beforeEach(() => {
  testRoot = mkdtempSync(join(tmpdir(), 'server-config-'))
  origCwd = process.cwd()
  process.chdir(testRoot)

  origEnvProjects = process.env.ROUGE_PROJECTS_DIR
  origEnvCli = process.env.ROUGE_CLI
  delete process.env.ROUGE_PROJECTS_DIR
  delete process.env.ROUGE_CLI
})

afterEach(() => {
  process.chdir(origCwd)
  if (origEnvProjects === undefined) delete process.env.ROUGE_PROJECTS_DIR
  else process.env.ROUGE_PROJECTS_DIR = origEnvProjects
  if (origEnvCli === undefined) delete process.env.ROUGE_CLI
  else process.env.ROUGE_CLI = origEnvCli
  rmSync(testRoot, { recursive: true, force: true })
})

describe('loadServerConfig', () => {
  it('resolves relative rouge_cli from the config file as an absolute path', () => {
    // Layout mirrors the real repo: dashboard/rouge-dashboard.config.json
    // references ../src/launcher/rouge-cli.js. The raw relative string
    // leaking into callers like build-runner caused #159-followup
    // (node spawned with cwd of ".." and tried to resolve the loop
    // script one directory above the repo).
    writeFileSync(
      join(testRoot, 'rouge-dashboard.config.json'),
      JSON.stringify({
        rouge_cli: '../src/launcher/rouge-cli.js',
        projects_root: '../projects',
      }),
    )
    const cfg = loadServerConfig()
    // Expected: resolved against testRoot (config file's dir).
    expect(cfg.rougeCli.endsWith('/src/launcher/rouge-cli.js')).toBe(true)
    expect(cfg.rougeCli.startsWith('/')).toBe(true) // absolute
    expect(cfg.projectsRoot.endsWith('/projects')).toBe(true)
    expect(cfg.projectsRoot.startsWith('/')).toBe(true)
    // Specifically — the resolved path goes UP from cwd once. Use
    // process.cwd() rather than testRoot because macOS resolves
    // /var/folders → /private/var/folders on chdir.
    const parent = join(process.cwd(), '..')
    expect(cfg.rougeCli).toBe(join(parent, 'src/launcher/rouge-cli.js'))
  })

  it('leaves absolute paths in the config file untouched', () => {
    writeFileSync(
      join(testRoot, 'rouge-dashboard.config.json'),
      JSON.stringify({
        rouge_cli: '/absolute/path/to/rouge-cli.js',
        projects_root: '/absolute/projects',
      }),
    )
    const cfg = loadServerConfig()
    expect(cfg.rougeCli).toBe('/absolute/path/to/rouge-cli.js')
    expect(cfg.projectsRoot).toBe('/absolute/projects')
  })

  it('env vars still win over file-based paths', () => {
    writeFileSync(
      join(testRoot, 'rouge-dashboard.config.json'),
      JSON.stringify({ rouge_cli: '../src/launcher/rouge-cli.js' }),
    )
    process.env.ROUGE_CLI = '/env/override/rouge-cli.js'
    const cfg = loadServerConfig()
    expect(cfg.rougeCli).toBe('/env/override/rouge-cli.js')
  })

  it('falls back to home-dir defaults when no config and no env', () => {
    const cfg = loadServerConfig()
    // Both should end with the expected suffixes (home dir varies).
    expect(cfg.projectsRoot.endsWith('/.rouge/projects')).toBe(true)
    expect(cfg.rougeCli.endsWith('/.rouge/bin/rouge')).toBe(true)
  })
})
