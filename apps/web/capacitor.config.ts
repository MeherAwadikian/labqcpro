import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.labqcpro.app',
  appName: 'LabQC Pro',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    buildOptions: {
      keystorePath: '../../labqcpro-release.keystore',
      keystorePassword: 'LabQCPro2026',
      keystoreAlias: 'labqcpro',
      keystoreAliasPassword: 'LabQCPro2026',
      releaseType: 'AAB',
    },
  },
}

export default config
