import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDMG } from '@electron-forge/maker-dmg';

const config: ForgeConfig = {
  packagerConfig: {
    name: 'Clik',
    executableName: 'Clik',
    appBundleId: 'com.cliklabs.clik',
    appCategoryType: 'public.app-category.utilities',
    icon: undefined,
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
