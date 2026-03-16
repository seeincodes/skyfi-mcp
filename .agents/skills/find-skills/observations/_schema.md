# Observation Schema

Each observation is a markdown file named `<YYYY-MM-DDTHH-MM-SS>.md`.

## Frontmatter (required)
- `task`: string — what the user asked for
- `skill`: string — skill name
- `skill_version`: string — version from CHANGELOG.md (e.g., "v1")
- `success`: boolean
- `critical`: boolean — if true, triggers inspect immediately
- `timestamp`: ISO 8601
- `duration_seconds`: number
- `tokens_used`: number

## Body Sections
### Error
What went wrong. *None* if success.

### Context
Relevant circumstances.

### Files Touched
List of files created/modified/deleted with action prefix.

### User Feedback
Direct user feedback, if any. *None* if not provided.

## Critical Flag
Set when:
1. User passes `--critical` to observe
2. Error involves data loss, corruption, or security issues
3. Skill output contradicts its own instructions

## Retention
Observations older than 90 days are archived to `observations/archive/` during inspect runs.
