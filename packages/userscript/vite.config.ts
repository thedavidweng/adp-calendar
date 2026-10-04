import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';

export default defineConfig({
  plugins: [
    monkey({
      entry: 'src/main.ts',
      userscript: {
        name: 'ADP Schedule Export',
        namespace: 'https://github.com/thedavidweng/adp-calendar',
        version: '0.1.0',
        description: 'Export the signed-in ADP Workforce Now schedule to an ICS file.',
        author: 'Davy',
        match: ['https://workforcenow.adp.com/*'],
        grant: ['GM_getValue', 'GM_setValue'],
        noframes: true,
        'run-at': 'document-idle',
      },
      build: {
        fileName: 'adp-schedule-export.user.js',
      },
    }),
  ],
});
