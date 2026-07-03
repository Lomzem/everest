# Basecamp

Electron desktop app scaffolded with Bun, SvelteKit, Tailwind CSS, Effect, shadcn-svelte, and TypeScript.

## Development

Install dependencies:

```sh
bun install
```

Run the SvelteKit app in a browser:

```sh
bun run dev
```

Run the Electron desktop app:

```sh
bun run electron:dev
```

## Build

Typecheck:

```sh
bun run check
```

Build SvelteKit and compile Electron main/preload files:

```sh
bun run build
```

Package the app without creating installers:

```sh
bun run package
```

Create the current platform installer:

```sh
bun run make
```

Create a Windows Squirrel installer on a Windows machine or Windows CI:

```sh
bun run make:win
```

The Windows installer output is written under `out/make/squirrel.windows/x64/`.

Create a single-file Windows portable executable:

```sh
bun run make:win:portable
```

The portable output is written under `out/win-portable/`. Electron still needs native DLLs at runtime; this target packages them into one self-extracting `.exe` for distribution.

Create Linux package formats:

```sh
bun run make:deb
bun run make:rpm
```

Create a Linux AppImage:

```sh
bun run make:appimage
```

Linux `.deb` and `.rpm` makers require host packaging tools. On Debian/Ubuntu, install at least:

```sh
sudo apt install dpkg fakeroot rpm
```

Windows `.exe` output should be made on Windows CI or a Windows build machine.

## Stack

- Bun for package management and scripts.
- SvelteKit static adapter for Electron production loading.
- Tailwind CSS v4 and shadcn-svelte using preset `b3ZNhQgWmu`.
- Effect for typed app workflows and service code.
- Electron Forge makers for Squirrel.Windows, Debian, and RPM packages.
- Electron Builder for Linux AppImage output.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.
