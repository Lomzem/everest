## Project Configuration

- **Language**: TypeScript
- **Package Manager**: bun
- **Add-ons**: prettier, eslint, vitest, playwright, tailwindcss, sveltekit-adapter, ai-tools

---

## Project Rules

- A **top priority** of our app is (assuming input .rdl files are in a normalised state), edits to `.rdl` files with our app cause the smallest `git diff` possible.
- When using example `.rdl` files as reference, do not include any identifying information from them in code or tests, including filenames, register names, field names, etc.
- Use @read-only as a read-only reference.

### TypeScript

- When working with TypeScript, it is important to try to use Effect code as much as possible.
- When working with Typescript, Always use `bun` instead of `node` or `npm` when working with TypeScript.

### UI Development

- When doing UI, Always try to do things with `Tailwind CSS` rather than vanilla CSS.
- Always try to use `shadcn-svelte` components first before making your own.
- Application-level component classes should primarily control layout, width, positioning, and overflow.
- Use semantic theme variables. Do not use fixed Tailwind palette colors for application states.
- Test hover, focus, selected, invalid, disabled, open-popup, and destructive-action states when changing interactive UI.

## Example RDL

See @read-only/example-rdl for test `.rdl` files.
