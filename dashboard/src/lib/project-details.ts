// Helpers lifted from bridge/server.ts. Keep them as pure functions so
// the project-detail route handler stays thin and so tests can cover
// them independent of the HTTP layer.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DISCIPLINE_SEQUENCE } from "@/bridge/types";
import { readSeedingState } from "@/bridge/seeding-state";

export function mergeSeedingProgress(
  projectDir: string,
  rawState: Record<string, unknown>,
): Record<string, unknown> {
  if (rawState.seedingProgress) return rawState;

  const seedState = readSeedingState(projectDir);
  if (seedState.status === "not-started" && !seedState.disciplines_complete) {
    return rawState;
  }

  const complete = new Set(seedState.disciplines_complete ?? []);
  const disciplines = DISCIPLINE_SEQUENCE.map((d) => ({
    discipline: d,
    status: complete.has(d) ? "complete" : "pending",
  }));
  return {
    ...rawState,
    seedingProgress: {
      disciplines,
      completedCount: complete.size,
      totalCount: DISCIPLINE_SEQUENCE.length,
      currentDiscipline: seedState.current_discipline,
    },
  };
}

export interface CheckpointSummary {
  costUsd: number | null;
  lastCheckpointAt: string | null;
  lastPhase: string | null;
  checkpointCount: number;
}

export function readCheckpointSummary(projectDir: string): CheckpointSummary {
  const empty: CheckpointSummary = {
    costUsd: null,
    lastCheckpointAt: null,
    lastPhase: null,
    checkpointCount: 0,
  };
  const path = join(projectDir, "checkpoints.jsonl");
  if (!existsSync(path)) return empty;
  try {
    const raw = readFileSync(path, "utf-8").trim();
    if (!raw) return empty;
    const lines = raw.split("\n").filter(Boolean);
    let costUsd: number | null = null;
    let lastCheckpointAt: string | null = null;
    let lastPhase: string | null = null;
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const cp = JSON.parse(lines[i]);
        if (lastCheckpointAt === null && typeof cp?.timestamp === "string") {
          lastCheckpointAt = cp.timestamp;
          if (typeof cp?.phase === "string") lastPhase = cp.phase;
        }
        if (
          costUsd === null &&
          typeof cp?.costs?.cumulative_cost_usd === "number"
        ) {
          costUsd = cp.costs.cumulative_cost_usd;
        }
        if (costUsd !== null && lastCheckpointAt !== null) break;
      } catch {
        continue;
      }
    }
    return { costUsd, lastCheckpointAt, lastPhase, checkpointCount: lines.length };
  } catch {
    return empty;
  }
}
