# prompts

Versioned prompt files, one per agent responsibility, as artifacts — not string literals inlined in code.

Each file's frontmatter records `id`, `version`, and `agent`. A prompt change is a diff here, reviewable and citable from an ADR or the evaluation report, the same way a code change is reviewable from a diff in `src/`.
