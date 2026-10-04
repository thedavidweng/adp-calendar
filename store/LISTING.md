# Chrome Web Store listing

Copy-paste source for every field in the [Developer Dashboard](https://chrome.google.com/webstore/devconsole). Images are in `store/images/` (regenerate with `python3 store/render.py`).

## Package

Build the upload zip. The store build omits the manifest `key` (the store assigns its own extension ID and rejects a `key`):

```sh
WXT_GOOGLE_OAUTH_CLIENT_ID=<client-id>.apps.googleusercontent.com pnpm --filter @adp-calendar/extension zip:store
# -> packages/extension/.output/adp-shifts-<version>-chrome.zip
```

## Store listing tab

| Field | Value |
| --- | --- |
| Name | ADP Shifts (from the manifest, `extName`) |
| Summary | Copies your ADP Workforce Now schedule into a Google Calendar it owns. No passwords, no servers, no tracking. (from `extDescription`, 109 of 132 characters) |
| Category | Productivity › Workflow & Planning |
| Language | English |
| Store icon | `store-icon-128.png` (96 px artwork in a 128 px canvas, as the store asks) |
| Screenshots (1280×800) | `screenshot-1-calendar.png`, `screenshot-2-setup.png`, `screenshot-3-scope.png`, `screenshot-4-privacy.png` |
| Small promo tile (440×280) | `promo-small-440x280.png` |
| Marquee promo tile (1400×560) | `promo-marquee-1400x560.png` |
| Official URL | Choose `thedavidweng.github.io` after verifying it in Search Console (optional) |
| Homepage URL | https://thedavidweng.github.io/adp-calendar/ |
| Support URL | https://github.com/thedavidweng/adp-calendar/issues |
| Mature content | No |

### Description

```text
ADP Shifts copies your ADP Workforce Now schedule into a Google Calendar of its own, then keeps it up to date for you.

HOW IT WORKS
1. Sign in to ADP Workforce Now in this browser, the way you already do.
2. Open My Schedule once so the extension learns which Position is yours.
3. Connect Google. The extension creates a calendar named "ADP Shifts" and fills it with your shifts.

After that it checks once a day and when you visit Workforce Now, and runs a Sync whenever the last one is more than three and a half days old. Press "Sync now" in the toolbar any time.

WHAT YOU GET
• Every upcoming shift, with department, job, location and pay code in the event details
• Your employer's holidays as all-day events
• Updates and cancellations in ADP are reflected in your calendar
• Past shifts are never rewritten
• A time zone override for when you work somewhere else
• One notification when ADP signs you out. Click it, sign in, and the Sync finishes.

PRIVATE BY DESIGN
• Never asks for your ADP password. It uses the session already in your browser and never copies your cookies.
• Uses Google's narrowest Calendar permission (calendar.app.created). It can manage only the calendar it creates and cannot see or change your other calendars.
• No servers. Your schedule goes from ADP to Google directly from your browser.
• No analytics, no ads, no tracking. Nothing is sold or shared.
• "Disconnect and clear data" revokes Google access and erases everything the extension stored.

Free and open source under the MIT License: https://github.com/thedavidweng/adp-calendar
Privacy policy: https://thedavidweng.github.io/adp-calendar/privacy/

ADP Shifts is an independent project. It is not affiliated with, endorsed by, or sponsored by ADP, Inc. or Google LLC. ADP and Workforce Now are registered trademarks of ADP, Inc.
```

## Privacy practices tab

### Single purpose

```text
Copy the signed-in user's own ADP Workforce Now work schedule into a dedicated Google Calendar that the extension creates, and keep that calendar in sync with ADP.
```

### Permission justifications

| Permission | Justification |
| --- | --- |
| `alarms` | Schedules one daily check so the user's calendar stays in sync without them opening the extension. A Sync runs only when the last successful one is more than 3.5 days old. |
| `storage` | Saves the user's ADP Position identifier, a short-lived Google access token, the time zone override, and the last Sync status in local extension storage. Nothing is stored remotely. |
| `notifications` | Tells the user when their ADP session has ended and a sign-in is needed, and reports the result of a Sync. One notification per event, never promotional. |
| `identity` | Runs Google OAuth with `chrome.identity.launchWebAuthFlow` to get permission for the `calendar.app.created` scope, so the extension can create and manage its own calendar. |
| Host `https://workforcenow.adp.com/*` | Reads the signed-in user's schedule from the same JSON endpoint the Workforce Now My Schedule page uses, and runs a content script there to learn the user's Position from the schedule page address. |
| Host `https://www.googleapis.com/*` | Calls the Google Calendar API to create the ADP Shifts calendar and to list, create, update, and delete events in it. |
| Host `https://oauth2.googleapis.com/*` | Revokes the Google access token when the user chooses "Disconnect and clear data". |

### Remote code

`No, I am not using remote code.` All JavaScript ships in the package. The extension only exchanges JSON with ADP and Google.

### Data usage

Check these categories:

- **Website content**: the user's schedule read from ADP Workforce Now (shift times, shift name, department, job, location, pay code, holidays), sent only to the user's own Google Calendar.
- **Authentication information**: the Google OAuth access token, stored locally and sent only to Google.

Leave the rest unchecked. The extension never reads ADP passwords or copies cookies, and it discards the name, employee ID, and login ID in ADP's response.

Check all three certifications:

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

Privacy policy URL: `https://thedavidweng.github.io/adp-calendar/privacy/`

## Distribution tab

- Visibility: Public (or Unlisted for a soft launch)
- Pricing: Free
- Regions: All regions

## Test instructions (for the reviewer)

```text
This extension needs an ADP Workforce Now employee account, which the review team will not have. A demo video of the full flow is here: <link to unlisted YouTube video>.

What to verify without an ADP account:
1. Install the extension. The setup page opens automatically.
2. "Connect Google" opens Google's consent screen asking only for "calendar.app.created" (make and manage secondary calendars the app creates).
3. After consent, open Google Calendar: no calendar is touched until a Sync runs.
4. Settings > "Disconnect and clear data" revokes the token and clears local storage.

Without a Workforce Now account, "Sync now" explains what ADP step is missing and changes nothing.
Source code: https://github.com/thedavidweng/adp-calendar
```

## Before you submit

- [ ] The store item ID's redirect URI `https://<store-item-id>.chromiumapp.org/` is added to the Google OAuth client (see `store/OAUTH.md`).
- [ ] The package was built with the production `WXT_GOOGLE_OAUTH_CLIENT_ID`.
- [ ] The privacy policy URL loads and matches what the extension does.
- [ ] Version in `packages/extension/package.json` is bumped for every new upload.
- [ ] Name check. The store rejects listings that look like they come from another brand. "ADP Shifts" leads with ADP's trademark. If review flags it, rename to something like "Shift Sync for ADP Workforce Now" (same `extName` key).
