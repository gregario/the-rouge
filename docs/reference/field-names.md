# Field Name Mapping

Phase prompts sometimes use different field names than the schemas define.
The eval suite accepts both. This documents the canonical names and known variants.

| Schema Field | Prompt Variant | Found In |
|---|---|---|
| `recommended_action` | `recommendation` | analyzing phase |
| `reasoning` | `recommendation_reasoning` | analyzing phase |
| `alignment` | `vision_alignment` | vision-check phase |
| `alignment_score` | (nested in vision_alignment) | vision-check phase |

**Action:** Phase prompts should be updated to use schema field names.
Until then, downstream consumers (eval suite, launcher) must accept both.
