import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifestVersion: 3,
  manifest: {
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    permissions: ['alarms', 'storage', 'notifications', 'identity'],
    // Plain fetch to Calendar REST needs Google's host. ADP cookies stay in the browser.
    host_permissions: ['https://workforcenow.adp.com/*', 'https://www.googleapis.com/*'],
  },
});
