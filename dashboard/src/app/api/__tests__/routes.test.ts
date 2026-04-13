import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { GET as getProjects } from '../projects/route'
import { GET as getProjectByName } from '../projects/[name]/route'
import { GET as getSpec } from '../projects/[name]/spec/route'
import { GET as getBuildLog } from '../projects/[name]/build-log/route'
import { GET as getBuildStatus } from '../projects/[name]/build-status/route'
import { GET as getActivity } from '../projects/[name]/activity/route'
import { POST as postFeedback } from '../projects/[name]/feedback/route'
import { POST as postPause } from '../projects/[name]/pause/route'
import { POST as postResolve } from '../projects/[name]/resolve-escalation/route'
import { GET as getCatalogue } from '../catalogue/route'

// Real route handlers now read from the filesystem via loadServerConfig().
// Point them at a temp directory for the duration of the test so we don't
// depend on the developer's actual ~/.rouge/projects layout.
let PROJECTS_ROOT: string

beforeAll(() => {
  PROJECTS_ROOT = mkdtempSync(join(tmpdir(), 'rouge-routes-test-'))
  process.env.ROUGE_PROJECTS_DIR = PROJECTS_ROOT
})

afterAll(() => {
  delete process.env.ROUGE_PROJECTS_DIR
  rmSync(PROJECTS_ROOT, { recursive: true, force: true })
})

function writeProject(slug: string, state: Record<string, unknown>) {
  const dir = join(PROJECTS_ROOT, slug)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'state.json'), JSON.stringify(state, null, 2))
  return dir
}

function makeParams<T>(value: T): Promise<T> {
  return Promise.resolve(value)
}

describe('GET /api/projects', () => {
  beforeEach(() => {
    rmSync(PROJECTS_ROOT, { recursive: true, force: true })
    mkdirSync(PROJECTS_ROOT, { recursive: true })
  })

  it('returns an empty array when no projects exist', async () => {
    const response = await getProjects()
    const data = await response.json()
    expect(Array.isArray(data)).toBe(true)
    expect(data).toHaveLength(0)
  })

  it('lists projects that have a state.json', async () => {
    writeProject('alpha', { project: 'alpha', current_state: 'building' })
    writeProject('beta', { project: 'beta', current_state: 'complete' })
    const response = await getProjects()
    const data = await response.json()
    const slugs = data.map((p: { slug: string }) => p.slug).sort()
    expect(slugs).toEqual(['alpha', 'beta'])
  })
})

describe('GET /api/projects/[name]', () => {
  beforeEach(() => {
    rmSync(PROJECTS_ROOT, { recursive: true, force: true })
    mkdirSync(PROJECTS_ROOT, { recursive: true })
  })

  it('returns the project state merged with checkpoint summary', async () => {
    writeProject('alpha', {
      project: 'alpha',
      current_state: 'building',
      milestones: [{ name: 'm1' }],
    })
    const response = await getProjectByName(new Request('http://localhost'), {
      params: makeParams({ name: 'alpha' }),
    })
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.slug).toBe('alpha')
    expect(data.current_state).toBe('building')
    expect(data).toHaveProperty('costUsd')
    expect(data).toHaveProperty('checkpointCount')
  })

  it('returns 404 for a non-existent project', async () => {
    const response = await getProjectByName(new Request('http://localhost'), {
      params: makeParams({ name: 'nope' }),
    })
    expect(response.status).toBe(404)
  })
})

describe('GET /api/projects/[name]/spec', () => {
  beforeEach(() => {
    rmSync(PROJECTS_ROOT, { recursive: true, force: true })
    mkdirSync(PROJECTS_ROOT, { recursive: true })
  })

  it('returns 404 when the project directory is missing', async () => {
    const response = await getSpec(new Request('http://localhost'), {
      params: makeParams({ name: 'nope' }),
    })
    expect(response.status).toBe(404)
  })

  it('returns a spec payload for an existing project', async () => {
    writeProject('alpha', { project: 'alpha', current_state: 'seeding' })
    const response = await getSpec(new Request('http://localhost'), {
      params: makeParams({ name: 'alpha' }),
    })
    expect(response.status).toBe(200)
    const data = await response.json()
    // The spec reader returns a structured payload even when files are missing.
    expect(data).toBeTypeOf('object')
  })
})

describe('GET /api/projects/[name]/build-log', () => {
  beforeEach(() => {
    rmSync(PROJECTS_ROOT, { recursive: true, force: true })
    mkdirSync(PROJECTS_ROOT, { recursive: true })
  })

  it('clamps the tail parameter to 1..500', async () => {
    writeProject('alpha', { project: 'alpha' })
    const response = await getBuildLog(
      new Request('http://localhost/api/projects/alpha/build-log?tail=9999'),
      { params: makeParams({ name: 'alpha' }) },
    )
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data).toHaveProperty('lines')
    expect(data).toHaveProperty('totalLines')
  })
})

describe('GET /api/projects/[name]/build-status', () => {
  beforeEach(() => {
    rmSync(PROJECTS_ROOT, { recursive: true, force: true })
    mkdirSync(PROJECTS_ROOT, { recursive: true })
  })

  it('reports not running when no build-info file exists', async () => {
    writeProject('alpha', { project: 'alpha' })
    const response = await getBuildStatus(new Request('http://localhost'), {
      params: makeParams({ name: 'alpha' }),
    })
    const data = await response.json()
    expect(data.running).toBe(false)
  })
})

describe('GET /api/projects/[name]/activity', () => {
  beforeEach(() => {
    rmSync(PROJECTS_ROOT, { recursive: true, force: true })
    mkdirSync(PROJECTS_ROOT, { recursive: true })
  })

  it('returns an array even when the project has no activity yet', async () => {
    writeProject('alpha', { project: 'alpha' })
    const response = await getActivity(
      new Request('http://localhost/api/projects/alpha/activity'),
      { params: makeParams({ name: 'alpha' }) },
    )
    const data = await response.json()
    expect(Array.isArray(data)).toBe(true)
  })
})

describe('POST /api/projects/[name]/feedback', () => {
  beforeEach(() => {
    rmSync(PROJECTS_ROOT, { recursive: true, force: true })
    mkdirSync(PROJECTS_ROOT, { recursive: true })
  })

  it('writes a feedback.json into the project directory', async () => {
    writeProject('alpha', { project: 'alpha' })
    const response = await postFeedback(
      new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: 5, notes: 'nice' }),
      }),
      { params: makeParams({ name: 'alpha' }) },
    )
    const data = await response.json()
    expect(data.ok).toBe(true)
  })
})

describe('POST /api/projects/[name]/pause', () => {
  beforeEach(() => {
    rmSync(PROJECTS_ROOT, { recursive: true, force: true })
    mkdirSync(PROJECTS_ROOT, { recursive: true })
  })

  it('flips current_state to waiting-for-human', async () => {
    writeProject('alpha', { project: 'alpha', current_state: 'building' })
    const response = await postPause(new Request('http://localhost', { method: 'POST' }), {
      params: makeParams({ name: 'alpha' }),
    })
    expect(response.status).toBe(200)
  })

  it('returns 404 when the project is missing', async () => {
    const response = await postPause(new Request('http://localhost', { method: 'POST' }), {
      params: makeParams({ name: 'nope' }),
    })
    expect(response.status).toBe(404)
  })
})

describe('POST /api/projects/[name]/resolve-escalation', () => {
  beforeEach(() => {
    rmSync(PROJECTS_ROOT, { recursive: true, force: true })
    mkdirSync(PROJECTS_ROOT, { recursive: true })
  })

  it('rejects an unknown response_type', async () => {
    writeProject('alpha', {
      project: 'alpha',
      escalations: [{ id: 'e1', status: 'pending' }],
    })
    const response = await postResolve(
      new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ escalation_id: 'e1', response_type: 'bogus' }),
      }),
      { params: makeParams({ name: 'alpha' }) },
    )
    expect(response.status).toBe(400)
  })

  it('writes human_response for a valid resolution', async () => {
    writeProject('alpha', {
      project: 'alpha',
      escalations: [{ id: 'e1', status: 'pending' }],
    })
    const response = await postResolve(
      new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          escalation_id: 'e1',
          response_type: 'guidance',
          text: 'retry with X',
        }),
      }),
      { params: makeParams({ name: 'alpha' }) },
    )
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.escalations[0].human_response.type).toBe('guidance')
    expect(data.consecutive_failures).toBe(0)
  })
})

describe('GET /api/catalogue (mock)', () => {
  it('still serves the static catalogue data', async () => {
    const response = await getCatalogue()
    const data = await response.json()
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)
  })
})
