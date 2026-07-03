import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';

const config: ForgeConfig = {
	packagerConfig: {
		asar: true,
		executableName: 'basecamp',
		appBundleId: 'dev.basecamp.desktop',
		icon: 'static/icon',
	},
	rebuildConfig: {},
	makers: [
		new MakerSquirrel({
			name: 'basecamp',
		}),
		new MakerDeb({
			options: {
				name: 'basecamp',
				productName: 'Basecamp',
				categories: ['Development'],
			},
		}),
		new MakerRpm({
			options: {
				name: 'basecamp',
				productName: 'Basecamp',
				categories: ['Development'],
			},
		}),
	],
};

export default config;
