import { existsSync, mkdirSync, readFileSync } from 'node:fs';
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

mkdirSync(binaryDir, { recursive: true });

function hasBundledParser(filePath: string) {
	if (!existsSync(filePath)) return false;
	const header = readFileSync(filePath, { encoding: 'utf8', flag: 'r' }).slice(0, 2);
	return header !== '#!';
}

if (hasBundledParser(target)) {
	process.exit(0);
}

if (isWindowsTarget !== (process.platform === 'win32')) {
	throw new Error(
		`Cannot build ${targetTriple} parser sidecar from ${process.platform}. Build Windows installers on Windows.`,
	);
}

execFileSync(
	'uv',
	[
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
		path.join(root, 'scripts', 'rdl_parser.py'),
		'--distpath',
		binaryDir,
		'--workpath',
		path.join(root, 'out', 'pyinstaller-work'),
		'--specpath',
		path.join(root, 'out', 'pyinstaller-spec'),
	],
	{ stdio: 'inherit' },
);
