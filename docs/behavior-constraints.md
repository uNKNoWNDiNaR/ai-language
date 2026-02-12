# Behavior Constraints (Do Not Change Without Explicit Request)

These behaviors are intentionally stable and should not be altered unless explicitly requested.

## Tutor Transitions (Instruction-Language Aware)
- Use instruction language (IL) for short transition lines and the “Next question” label.
- Keep transitions deterministic and concise (max 5 words per line).
- Keep the “Next question” label present on advance/forced-advance flows.

## Support Rendering (UI)
- Support text should render as a single line when short.
- Only expand to multi-line when the support content is long.
