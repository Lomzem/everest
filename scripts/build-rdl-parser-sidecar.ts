import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const binaryDir = path.join(root, 'src-tauri', 'binaries');
const targetTriple =
	process.env.TAURI_ENV_TARGET_TRIPLE ??
	process.env.CARGO_BUILD_TARGET ??
	execFileSync('rustc', ['--print', 'host-tuple'], { encoding: 'utf8' }).trim();
const isWindowsTarget = targetTriple.includes('windows');
const extension = isWindowsTarget ? '.exe' : '';
const binaryName = `rdl-parser-${targetTriple}`;
const target = path.join(binaryDir, `${binaryName}${extension}`);
const parserSource = path.join(root, 'scripts', 'rdl_parser.py');

mkdirSync(binaryDir, { recursive: true });

function hasBundledParser(filePath: string) {
	if (!existsSync(filePath)) return false;
	const header = readFileSync(filePath, { encoding: 'utf8', flag: 'r' }).slice(0, 2);
	return header !== '#!';
}

function hasFreshBundledParser(filePath: string) {
	return hasBundledParser(filePath) && statSync(filePath).mtimeMs >= statSync(parserSource).mtimeMs;
}

if (hasFreshBundledParser(target)) {
	process.exit(0);
}

if (isWindowsTarget !== (process.platform === 'win32')) {
	throw new Error(
		`Cannot build ${targetTriple} parser sidecar from ${process.platform}. Build Windows installers on Windows.`,
	);
}

const uvArgs = [
	'run',
	'--with',
	'pyinstaller',
	'--with',
	'systemrdl-compiler',
	'pyinstaller',
	'--onefile',
	'--clean',
	'--noconfirm',
	'--name',
	binaryName,
	parserSource,
	'--distpath',
	binaryDir,
	'--workpath',
	path.join(root, 'out', 'pyinstaller-work'),
	'--specpath',
	path.join(root, 'out', 'pyinstaller-spec'),
];

const pythonCommand =
	process.platform === 'win32' ? 'python' : process.platform === 'darwin' ? 'python3' : 'python3';

function runWithUvFallback(): void {
	const candidates: Array<[string, string[]]> = [
		['uv', uvArgs],
		[pythonCommand, ['-m', 'uv', ...uvArgs]],
		['python', ['-m', 'uv', ...uvArgs]],
	];

	for (const [command, args] of candidates) {
		try {
			execFileSync(command, args, { stdio: 'inherit' });
			return;
		} catch (error) {
			const err = error as NodeJS.ErrnoException;
			if (err.code === 'ENOENT') {
				continue;
			}
			throw error;
		}
	}

	throw new Error(
		`Could not locate uv. Install it with "pip install uv" (Linux/Windows) or ` +
			'https://docs.astral.sh/uv/getting-started/installation/ and re-run.',
	);
}

runWithUvFallback();
