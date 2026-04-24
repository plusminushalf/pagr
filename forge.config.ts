import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    // Path is given without the extension. Electron Packager automatically
    // picks assets/logo/icon.icns on macOS, .ico on Windows, .png on Linux.
    // Regenerate with `npm run build:icon` when mark.svg changes.
    icon: 'assets/logo/icon',
    // Ships the CLI wrapper inside pagr.app/Contents/Resources/pagr. The
    // Homebrew cask symlinks this onto the user's PATH; other installs can
    // symlink it manually. Keeping the wrapper in the bundle means every
    // copy of pagr.app carries its own matching CLI.
    extraResource: ['bin/pagr'],
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({}),
    // DMG is a draggable disk-image installer, the standard macOS distribution
    // format. Only builds on macOS (uses hdiutil), which is fine since the
    // release workflow runs on macOS runners.
    new MakerDMG({}, ['darwin']),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application.
    //
    // resetAdHocDarwinSignature: flipping fuses modifies bytes inside the
    // Electron binary, which breaks the ad-hoc signature that
    // @electron/packager applies on macOS arm64. Without re-signing,
    // Gatekeeper treats the app as corrupted and shows "pagr is damaged and
    // can't be opened" — forcing users to run `xattr -cr`. Re-signing
    // ad-hoc restores a valid (though untrusted) signature, which
    // downgrades the first-run block to the standard "unverified developer"
    // dialog that users can bypass with right-click → Open.
    new FusesPlugin({
      version: FuseVersion.V1,
      resetAdHocDarwinSignature: true,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
