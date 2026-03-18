# Rouge Schemas

JSON Schema definitions for the data files that Rouge phases read and write.

## Files

| Schema | Used By | Description |
|--------|---------|-------------|
| `state.json` | Launcher + all phases | State machine position. Launcher reads to decide which phase to run. |
| `cycle-context.json` | All phases | Shared workspace. Each phase reads context, does work, writes results back. |
| `vision.json` | Seeding phase (writes), all phases (reads) | Product vision. The north star. |
| `library-entry.json` | Library heuristic files | Individual heuristic entry format. |
| `po-check-template.json` | PO Review phase | Parameterized quality check template. |

## How phases use these

1. Launcher reads `state.json` → determines which phase to run
2. Phase reads `cycle_context.json` → gets full context
3. Phase does its work (build, evaluate, analyze, etc.)
4. Phase writes results back to `cycle_context.json`
5. Phase exits. Launcher reads `state.json` again on next iteration.

Phases do NOT write `state.json` directly. The launcher manages state transitions based on phase outcomes written to `cycle_context.json`.

Exception: The launcher transitions state based on `cycle_context.json` outputs, and the Slack bot writes `state.json` for control commands (start/pause/resume).
