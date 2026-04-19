import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDMG } from '@electron-forge/maker-dmg';

// electron-vite writes main/preload/renderer to `./out`. Electron Forge defaults
// to the same folder for packaged apps and sets packager ignore `/^\/out\//`,
// which would omit the entire app bundle. Ship Forge artifacts under `release/`
// instead and only ignore that path when copying the source tree.
const PACKAGER_IGNORE = [
  /^\/release\//,
  /^\/package-lock\.json$/,
  /^\/yarn\.lock$/,
  /^\/pnpm-lock\.yaml$/,
  /^\/\.git(\/|$)/,
  /^\/node_modules\/\.bin(\/|$)/,
  /\.o(bj)?$/,
  /^\/node_gyp_bins(\/|$)/,
] as RegExp[];

const config: ForgeConfig = {
  outDir: 'release',
  packagerConfig: {
    name: 'Clik',
    executableName: 'Clik',
    appBundleId: 'com.cliklabs.clik',
    appCategoryType: 'public.app-category.utilities',
    icon: undefined,
    ignore: PACKAGER_IGNORE,
    extraResource: [
      'resources/clik-helper',
      'resources/trayTemplate.png',
      'resources/trayTemplate@2x.png',
    ],
    // TODO: signing + notarize
    // osxSign: { identity: 'Developer ID Application: ...' },
    // osxNotarize: { appleId, appleIdPassword, teamId },
  },
  rebuildConfig: {},
  makers: [
    new MakerZIP({}, ['darwin']),
    new MakerDMG({ name: 'Clik' }, ['darwin']),
  ],
  plugins: [],
};

export default config;
