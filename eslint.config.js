import { defineConfig, globalIgnores } from 'eslint/config';
import js from '@eslint/js';
import globals from 'globals';
import svelte from 'eslint-plugin-svelte';
import tailwindcss from 'eslint-plugin-tailwindcss';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier/flat';

export default defineConfig(
	globalIgnores([
		'repos/**',
		'node_modules/**',
		'.svelte-kit/**',
		'build/**',
		'out/**',
		'src/lib/components/ui/**',
		'src-tauri/target/**',
		'coverage/**',
		'vite.config.js.timestamp-*',
		'vite.config.ts.timestamp-*',
	]),
	js.configs.recommended,
	...tseslint.configs.recommended,
	...svelte.configs['flat/recommended'],
	{
		name: 'basecamp/svelte-typescript',
		files: ['**/*.svelte', '**/*.svelte.ts'],
		languageOptions: {
			parserOptions: {
				parser: tseslint.parser,
				extraFileExtensions: ['.svelte'],
			},
		},
	},
	{
		name: 'basecamp/browser-globals',
		files: ['src/**/*.{ts,svelte}'],
		languageOptions: {
			globals: {
				...globals.browser,
			},
		},
	},
	{
		name: 'basecamp/node-globals',
		files: ['*.{js,cjs,mjs,ts,cts,mts}', 'scripts/**/*.{ts,cts,mts}'],
		languageOptions: {
			globals: {
				...globals.node,
			},
		},
	},
	{
		name: 'basecamp/test-globals',
		files: ['**/*.test.ts'],
		languageOptions: {
			globals: globals.vitest,
		},
	},
	{
		name: 'basecamp/project-rules',
		rules: {
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/no-empty-object-type': 'off',
			'svelte/no-at-html-tags': 'error',
			'svelte/prefer-const': 'warn',
		},
	},
	{
		name: 'basecamp/shadcn-svelte',
		files: ['src/lib/components/ui/**/*.svelte'],
		rules: {
			'svelte/no-navigation-without-resolve': 'off',
		},
	},
	{
		name: 'basecamp/tailwind',
		...tailwindcss.configs.recommended,
		files: ['**/*.ts', '**/*.js', '**/*.svelte'],
		settings: {
			tailwindcss: {
				cssConfigPath: './src/routes/layout.css',
			},
		},
		rules: {
			...tailwindcss.configs.recommended.rules,
			'tailwindcss/no-contradicting-classname': 'warn',
			'tailwindcss/no-arbitrary-value': 'warn',
		},
	},
	eslintConfigPrettier,
);
