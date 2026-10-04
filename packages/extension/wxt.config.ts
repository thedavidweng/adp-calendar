import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifestVersion: 3,
  zip: {
    artifactTemplate: 'adp-shifts-{{version}}-{{browser}}.zip',
  },
  manifest: {
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    // Pins the extension id (dkjgilecoojembpgookbeepjdlcapchg) so the OAuth redirect
    // https://<id>.chromiumapp.org/ stays stable across unpacked loads. The Chrome Web Store
    // assigns its own id and rejects uploads that carry a key, so store builds leave it out.
    ...(process.env.STORE_BUILD ? {} : { key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtGZhU7pZLzBBMXNOt5nauODaDX9Z/X6oj+Dd7SA5uiZOMUIotracl3mJxKq8aS43vLYppWoPIyGvALJG6KkfeSLSca8r6P63pChlsNG7lKXDTc+n7n9gtIyWI5K0VEQFnyl18o/GCuN+MgYpvbITggEafV/DLUpjvak//u/CuZyOBDizTn6OzEe4q/tAZIlOzOih+QYPawqXSWCI9Neaslfiv+pB59D1dDl0BKX/GHRL9T0q29FkiTyM2Fl5JdTucF5b+OLIo6P7bsyw6FVoFggMbseL1pZ0ypEX14Was6sSjic7PeaPBIBXDZsfKh2+XPdoahmbSf+i5jZj/BYfIQIDAQAB' }),
    permissions: ['alarms', 'storage', 'notifications', 'identity'],
    icons: {
      16: 'icon-16.png',
      32: 'icon-32.png',
      48: 'icon-48.png',
      128: 'icon-128.png',
    },
    action: {
      default_icon: {
        16: 'icon-16.png',
        32: 'icon-32.png',
      },
    },
    homepage_url: 'https://thedavidweng.github.io/adp-calendar/',
    // Plain fetch to Calendar REST needs Google's host. ADP cookies stay in the browser.
    host_permissions: [
      'https://workforcenow.adp.com/*',
      'https://www.googleapis.com/*',
      'https://oauth2.googleapis.com/*',
    ],
  },
});
