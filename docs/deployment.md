# Static deployment

The site is published at <https://lomzem.github.io/everest/>. GitHub Pages uses
GitHub Actions as its build source. The default branch is `main`.

`bun run build` writes the complete static site to `build/`. All routes are
prerendered. The deployed site does not need a server runtime. Browser JavaScript
handles RDL files and editor operations.

The default base path is `/everest` for development, builds, previews and browser
tests. Open `http://localhost:5173/everest/` during development. Set `BASE_PATH` to
an empty string when a separate deployment must use the domain root.

The workflow checks formatting, lint, types, unit tests and browser tests in
Chromium and Firefox. It tests the production build at `/everest/`. Pull requests
run the checks. A successful push to `main`, or a manual run on `main`, deploys
the checked `build/` artifact. Deployment uses the `github-pages` environment.

To run the checks locally:

```sh
bun install --frozen-lockfile
bunx playwright install chromium firefox
bun run lint
bun run check
bun run test:unit --run
bun run test:e2e
```

The browser test command builds the site before it starts the preview server.
In CI, the workflow builds it once before the browser tests. Browser tests use
`page.goto('./')` so navigation includes the deployment base path.

Configuration follows the [SvelteKit static adapter documentation](https://svelte.dev/docs/kit/adapter-static),
the [GitHub Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
and the [Playwright configuration documentation](https://playwright.dev/docs/test-configuration).
