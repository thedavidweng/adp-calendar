<p align="center"><img src="brand/icon-tight.svg" width="72" height="72" alt="" /></p>

<h1 align="center">ADP Shifts</h1>

<p align="center">Your ADP Workforce Now schedule, kept current in a Google Calendar of its own.<br />No passwords. No servers. Nothing else touched.</p>

<p align="center"><a href="https://chromewebstore.google.com/detail/adp-shifts/obccfkjmkfhljjnamibiiolagcpmjklj">Chrome Web Store</a> · <a href="https://greasyfork.org/scripts/599050-adp-schedule-export">Greasy Fork</a> · <a href="https://adp-shifts.blahaj.uk/">Website</a> · <a href="https://adp-shifts.blahaj.uk/privacy/">Privacy</a> · <a href="https://github.com/thedavidweng/adp-calendar/issues">Issues</a></p>

![ADP Shifts](store/images/promo-marquee-1400x560.png)

## Install

There are two versions. Both read your own schedule with the ADP session already in your browser and never see your password.

- **[ADP Shifts](https://chromewebstore.google.com/detail/adp-shifts/obccfkjmkfhljjnamibiiolagcpmjklj)** (Chrome extension): keeps a dedicated Google Calendar in sync, and can also export an `.ics` file.
- **[ADP Schedule Export](https://greasyfork.org/scripts/599050-adp-schedule-export)** (userscript): adds an **Export .ics** button to Workforce Now. No Google account.

| | ADP Shifts (extension) | ADP Schedule Export (userscript) |
| --- | --- | --- |
| Get it from | Chrome Web Store | Greasy Fork |
| Browsers | Chrome, Edge, Brave, Arc, other Chromium browsers | Any browser with Tampermonkey or another userscript manager |
| Sync to Google Calendar | Yes, into its own ADP Shifts calendar | No |
| Stays up to date on its own | Yes, checks daily and when you open ADP | No, export again when ADP changes |
| Removes canceled shifts | Yes, on the next Sync | No, imported events stay until you delete them |
| Download an `.ics` file | Yes, **Export .ics** in the toolbar popup | Yes, **Export .ics** button on ADP pages, or the userscript manager menu |
| Google account | Needed for Sync, not for `.ics` | Not used |
| Setup | Open Calendar in ADP once, connect Google | Open Calendar in ADP once |
| Time zone override | Extension Settings | Userscript manager menu |

## Packages

| Path | What it is |
| --- | --- |
| `packages/core` | Schedule parsing, Position lookup, ICS export, and Sync reconciliation. No browser APIs. |
| `packages/extension` | Manifest V3 extension (WXT) that syncs to a Google Calendar it owns and exports `.ics` files ([Chrome Web Store](https://chromewebstore.google.com/detail/adp-shifts/obccfkjmkfhljjnamibiiolagcpmjklj)). |
| `packages/userscript` | Userscript that adds an Export .ics button to Workforce Now ([Greasy Fork](https://greasyfork.org/scripts/599050-adp-schedule-export), [source](packages/userscript)). |
| `site` | The website and privacy policy, deployed to GitHub Pages. |
| `store` | Chrome Web Store listing copy, OAuth verification notes, and image sources. |

## Develop

```sh
pnpm install
pnpm test
pnpm typecheck
pnpm build:extension      # packages/extension/.output/chrome-mv3
pnpm build:userscript     # packages/userscript/dist/adp-schedule-export.user.js
pnpm --filter @adp-calendar/extension zip:store
python3 store/render.py   # regenerate store images and the social card
```

Set `WXT_GOOGLE_OAUTH_CLIENT_ID` in `packages/extension/.env.local` to enable Google sign-in. Domain language is in [CONTEXT.md](CONTEXT.md) and decisions in [docs/adr](docs/adr).

ADP Shifts is an independent project, not affiliated with ADP, Inc. or Google LLC. MIT licensed.
