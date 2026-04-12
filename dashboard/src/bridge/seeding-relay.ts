import { spawn, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'

export interface SeedingMarker {
  type: 'discipline-complete' | 'seeding-complete'
  discipline?: string
}

export function parseSeedingOutput(line: string): SeedingMarker | null {
  // Check for discipline complete: [DISCIPLINE_COMPLETE: name]
  const disciplineMatch = line.match(/\[DISCIPLINE_COMPLETE:\s*(\S+)\]/)
  if (disciplineMatch) {
    return { type: 'discipline-complete', discipline: disciplineMatch[1] }
  }

  // Check for seeding complete (exact match, not substring)
  if (/^SEEDING_COMPLETE$/.test(line.trim())) {
    return { type: 'seeding-complete' }
  }

  return null
}

export class SeedingRelay extends EventEmitter {
  private process: ChildProcess | null = null

  start(projectName: string, rougeCli: string): void {
    this.process = spawn('node', [rougeCli, 'seed', projectName], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let buffer = ''
    this.process.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const marker = parseSeedingOutput(line)
        if (marker) {
          this.emit('marker', marker)
        }
        this.emit('output', line)
      }
    })

    this.process.stderr?.on('data', (chunk: Buffer) => {
      this.emit('error', chunk.toString())
    })

    this.process.on('exit', (code) => {
      this.emit('exit', code)
      this.process = null
    })
  }

  send(message: string): void {
    if (this.process?.stdin?.writable) {
      this.process.stdin.write(message + '\n')
    }
  }

  stop(): void {
    if (this.process) {
      this.process.kill()
      this.process = null
    }
  }

  get isRunning(): boolean {
    return this.process !== null
  }
}
