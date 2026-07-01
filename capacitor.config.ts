import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.animetracker.app',
  appName: '追番记录',
  webDir: 'www',
  server: {
    androidScheme: 'https'
  },
  android: {
    backgroundColor: '#f8f9fb',
    allowMixedContent: true
  },
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#f8f9fb'
  },
  plugins: {}
};

export default config;
