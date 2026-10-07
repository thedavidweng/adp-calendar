import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';
import pkg from './package.json' with { type: 'json' };

const tagVersion = process.env.TAG_VERSION?.replace(/^v/, '');
const version = tagVersion || pkg.version;

export default defineConfig({
  plugins: [
    monkey({
      entry: 'src/main.ts',
      userscript: {
        name: 'ADP Schedule Export',
        namespace: 'https://github.com/thedavidweng/adp-calendar',
        version,
        description: 'Adds an Export .ics button to ADP Workforce Now that downloads your own schedule as a calendar file. No Google account, no servers.',
        author: 'Davy',
        license: 'MIT',
        icon: 'https://adp-shifts.blahaj.uk/assets/icon.svg',
        homepageURL: 'https://adp-shifts.blahaj.uk/',
        supportURL: 'https://github.com/thedavidweng/adp-calendar/issues',
        downloadURL: 'https://github.com/thedavidweng/adp-calendar/releases/latest/download/adp-schedule-export.user.js',
        updateURL: 'https://github.com/thedavidweng/adp-calendar/releases/latest/download/adp-schedule-export.user.js',
        match: ['https://workforcenow.adp.com/*'],
        grant: ['GM_getValue', 'GM_setValue', 'GM_registerMenuCommand'],
        noframes: true,
        'run-at': 'document-idle',
      },
      build: {
        fileName: 'adp-schedule-export.user.js',
      },
    }),
  ],
});
