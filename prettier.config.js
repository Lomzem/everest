/** @type {import('prettier').Config} */
export default {
	printWidth: 100,
	useTabs: true,
	tabWidth: 2,
	semi: true,
	singleQuote: true,
	quoteProps: 'as-needed',
	trailingComma: 'all',
	bracketSpacing: true,
	bracketSameLine: false,
	arrowParens: 'always',
	proseWrap: 'preserve',
	endOfLine: 'lf',
	htmlWhitespaceSensitivity: 'css',
	plugins: ['prettier-plugin-svelte', 'prettier-plugin-tailwindcss'],
	tailwindStylesheet: './src/routes/layout.css',
	tailwindFunctions: ['cn', 'clsx', 'tv', 'cva'],
	overrides: [
		{
			files: ['*.json', '*.jsonc', '*.yaml', '*.yml', '*.md'],
			options: {
				useTabs: false,
				tabWidth: 2,
			},
		},
	],
};
