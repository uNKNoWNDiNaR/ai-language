# UI Migration Rules

1) New or edited UI uses Tailwind utilities and shared primitives when available.
2) Legacy CSS stays until a component is intentionally migrated.
3) Avoid custom CSS unless needed for global primitives or non-utility cases.
4) Prefer shared primitives for consistent buttons, cards, badges, and chips.

## Tailwind Version Note (v4)

- Use `@import "tailwindcss";` in `frontend/src/styles.css` (do not use `@tailwind base/components/utilities`).
- Keep PostCSS configured with `@tailwindcss/postcss` in `frontend/postcss.config.js`.
- Keep `frontend/tailwind.config.js` at the project root so it is auto-discovered.
