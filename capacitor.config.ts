import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'com.example.blackholeinfinity',
  appName: 'Black Hole Infinity',
  webDir: 'dist',
  android: { backgroundColor: '#090d21', allowMixedContent: false },
  server: { androidScheme: 'https' }
};
export default config;
