## Response Rules

- Always be as brief and concise as possible.

## Project Rules

**Important**: You should try to use Effect in your code **as much as possible**. See @repos/effect and understand the library's patterns.

- Always use `bun` instead of `node` or `npm`.
- Always try to do things with `Tailwind CSS` rather than vanilla CSS.
- Minimum font size is 16px no matter what.
- Always try to use `shadcn-svelte` components first before making your own.

## Completion Requirements

Must pass without errors:

- `bun run format 1>/dev/null && bun run lint 1>/dev/null && bun run check 1>/dev/null && bun run test 1>/dev/null && bun run build 1>/dev/null`

## Vendored Repositories

This project vendors external repositories under @repos/

- Use vendored repositories as read-only reference material when working with related libraries
- Prefer examples and patterns from the vendored source code over generated guesses or web search results
- Do not edit files under @repos/ unless explicitly asked
- Do not import from @repos/ - application code should continue importing from normal package dependencies

When writing Effect code, inspect @repos/effect/ for examples of idiomatic usage, tests, module structure, and API design. Treat it as the source of truth for Effect patterns.

## SystemRDL Documentation and Best Practices

See @repos/PeakRDL/docs/systemrdl-tutorial.rst @repos/PeakRDL/docs/style-guide.rst @repos/PeakRDL/docs/best-practices.rst
