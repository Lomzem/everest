# Everest

A visual SystemRDL editor that runs in your browser. Open one `.rdl` file, edit registers and fields, review the exact source diff, and save the result.

The app uses Svelte 5, TypeScript, Effect 4, shadcn-svelte, and Tailwind CSS. It is a static site with no application backend. RDL files are processed locally in a worker.

## Use

Visit [Everest](https://lomzem.github.io/everest/). Open a file or create a document.

- Select a component in the tree to inspect its properties.
- Use visual controls to change the document. Invalid changes are not applied.
- Open **Changes** to review a read-only diff. Undo and redo update the diff.
- Browsers with a native file picker can save back to the opened file.
- Other browsers, including Firefox, download an updated `.rdl`. The diff remains relative to the opened file after a download.

External includes and embedded Perl are not supported. An error is shown if an opened file contains these constructs. Invalid files remain unchanged and cannot be edited until corrected and reopened. See [language support and limits](docs/support.md).

## Development

Use Bun 1.4 or later.

```sh
bun install --frozen-lockfile
bun run dev
```

Open `http://localhost:5173/everest/`. The `/everest` base path matches GitHub Pages. Set `BASE_PATH` to override it for another host.

```sh
bun run check
bun run lint
bun run test:unit --run
bunx playwright install chromium firefox
bun run test:e2e
bun run build
```

The browser tests build the site and start a preview server. CI installs browser system dependencies and runs the same checks before deployment. See [deployment](docs/deployment.md).

## Structure

- `src/lib/rdl`: lexer, parser, semantic analysis, source edits, and compiler tests.
- `src/lib/editor`: Effect file services, worker transport, document session, history, and source diff.
- `src/lib/components/editor`: visual editing, navigation, definitions, and diff panels.
- `src/lib/components/ui`: shared shadcn-svelte controls.
- `src/lib/ui`: reusable reactive presentation logic.
- `tests`: browser workflow tests.

Source text is the document authority. Compilation produces a separate resolved model. Visual commands apply small edits to source ranges and validate the candidate document before acceptance. Display preferences never rewrite source text.

`read-only/` contains local reference material. It is excluded from version control and builds. Tests use synthetic examples, not identifying content from those references.
