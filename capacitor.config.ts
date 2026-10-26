import type { CapacitorConfig } from '@capacitor/cli';

// The app id is permanent once the first build reaches App Store Connect or Google Play.
const config: CapacitorConfig = {
  appId: 'com.turncloak.app',
  appName: 'Turncloak',
  webDir: 'dist',
  backgroundColor: '#0b0708',
  ios: { contentInset: 'never' },
  plugins: {
    SplashScreen: { launchShowDuration: 800, backgroundColor: '#0b0708', showSpinner: false },
    StatusBar: { style: 'DARK', backgroundColor: '#0b0708', overlaysWebView: false },
  },
};

export default config;
