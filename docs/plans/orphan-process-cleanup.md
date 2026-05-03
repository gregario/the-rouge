# Plan: Orphan Process Cleanup

**Status:** PLANNED
**Priority:** P1 — orphaned processes burn API credits and corrupt state

## Problem

Rouge spawns detached subprocesses (claude -p sessions, seed daemons,
rouge-loop instances) that outlive their parent. When a build is stopped,
the dashboard restarts, or the loop crashes, child processes continue
running unsupervised:

- Claude Code sessions keep generating tokens (API cost)
- Zombie loops write to state.json for projects that have moved on
- Daemon processes hold file locks, blocking new sessions
- Multiple orphaned processes for the same project can write concurrently

In this session alone, 6+ orphaned processes were manually killed.

## Scope

Three cleanup surfaces:

### 1. On dashboard start — reap stale PIDs
When the dashboard boots, scan all projects for:
- `.build-pid` files where the PID is dead → delete the file
- `.seed-pid` files where the PID is dead → delete the file
- `seed-heartbeat.json` where lastTickAt is >5min stale → warn in UI
- Lock files with dead PIDs → delete

### 2. On project stop — kill process tree
When user clicks Stop Build:
- Kill the rouge-loop process (already done)
- Kill ALL child processes of that PID (claude -p subprocesses)
- Use process group kill: `kill(-pid)` or walk /proc to find children
- Wait for confirmation (process.kill(pid, 0) returns false)
- Clean up PID files

### 3. Periodic reaper — background sweep
A background interval (every 60s) in the dashboard watcher:
- Scan all project .build-pid and .seed-pid files
- Check if PIDs are alive
- If dead: clean up file, emit event so UI updates
- If alive but project is in terminal state (complete/paused): warn

### 4. On rouge-loop tick — check for orphaned Claude sessions
Before spawning a new claude -p subprocess for a phase:
- Check if a previous claude process is still running for this project
- If so, kill it before starting the new one
- Log the orphan detection

## Implementation

### File: dashboard/src/bridge/process-reaper.ts
- `reapStaleProcesses(projectsRoot)` — scan + clean
- `killProcessTree(pid)` — kill parent + all children
- `startPeriodicReaper(projectsRoot, intervalMs)` — background sweep

### File: src/launcher/rouge-loop.js
- Before each `spawn('claude', ...)` call, check for existing child
- After each phase completes, verify child exited

### File: dashboard/src/bridge/build-runner.ts
- `stopBuild()` calls `killProcessTree()` instead of just `kill(pid)`

## Edge Cases

- PID reuse (new process gets same PID as dead one) — check process
  start time, not just PID existence
- Graceful vs forced kill — SIGTERM first, SIGKILL after 5s timeout
- macOS vs Linux process tree walking (different /proc behavior)
- Dashboard restart during active build — don't kill builds that are
  legitimately running, only truly orphaned ones
