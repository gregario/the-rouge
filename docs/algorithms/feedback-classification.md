# Feedback Classification Algorithm

Used by the **analyzing phase** when processing feedback from `feedback.json`.

## Input

```json
{
  "text": "The nav should always be visible, even on mobile",
  "timestamp": "2026-03-18T10:00:00Z"
}
```

## Step 1: Classify

Determine the feedback type:

| Type | Signal | Example |
|------|--------|---------|
| `product-change` | References specific UI, bug, or feature | "The login form doesn't show errors" |
| `global-learning` | Applies to all products | "Loading indicators should always appear after 500ms" |
| `domain-learning` | Applies to a domain | "Web apps should always have persistent nav" |
| `personal-preference` | Subjective taste | "I prefer darker color schemes" |
| `direction` | Strategic | "Focus on the dashboard first" |

## Step 2: Determine scope

- `this-product`: Only affects the current project
- `all-products`: Should update global Library
- `domain`: Should update domain-specific Library

## Step 3: Confidence check

If confidence < 0.7, set `needs_confirmation: true`. The analyzer writes a Slack message asking:

> I classified your feedback as **{classification}** ({scope}). Is that right?
> - Yes
> - Actually it's {alternative}
> - Ignore this feedback

## Step 4: Derive artifacts

### For `global-learning` or `domain-learning`:
Convert to a Library heuristic entry:
- `id`: kebab-case from the rule
- `rule`: the feedback rephrased as a testable rule
- `measurement`: infer from rule content
- `threshold`: infer from rule content
- `source`: "human-feedback"

### For `personal-preference`:
Convert to a taste fingerprint entry:
- `id`: kebab-case from the preference
- `preference`: the feedback text
- `evidence`: [{date, source_quote}]
- `strength`: 0.3 (first mention)

### For `product-change`:
Generate a change spec via the change-spec-generation phase.

### For `direction`:
Update vision alignment in cycle_context.json.

## Strength Calculation (Taste Fingerprint)

| Mentions | Strength |
|----------|----------|
| 1 | 0.3 |
| 2 | 0.5 |
| 3+ | 0.7 |
| 5+ (no contradictions) | 1.0 |

Contradictions reduce strength by 0.2 each.

## Decay

Preferences not reinforced in 6+ months decay 0.1/month to a floor of 0.2.

Formula: `new_strength = max(0.2, current_strength - 0.1 * months_since_last_expressed)`
