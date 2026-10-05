# Google OAuth verification

`calendar.app.created` is **non-sensitive**, as confirmed in Google Auth Platform's Data Access page on 2026-10-04 (ADR 0003). Publish the OAuth app to Production so users beyond the test-user list can connect. The app logo requires branding verification; this scope does not require sensitive-scope verification or a demo video.

## 1. Own the domain

Google only accepts a homepage and privacy policy on a domain you have verified in [Search Console](https://search.google.com/search-console).

- The site uses `adp-shifts.blahaj.uk`, served by GitHub Pages with a DNS-only CNAME in Cloudflare.
- `blahaj.uk` ownership is verified in Search Console through the domain provider.
- Add `blahaj.uk` under **Branding › Authorized domains**. Keep `chromiumapp.org` for the extension OAuth redirect.

## 2. OAuth client

- Type: **Web application** (`launchWebAuthFlow` uses a normal web redirect, which also works in non-Google Chromium browsers).
- Authorized redirect URIs:
  - `https://dkjgilecoojembpgookbeepjdlcapchg.chromiumapp.org/` (unpacked development build, pinned by the manifest `key`)
  - `https://obccfkjmkfhljjnamibiiolagcpmjklj.chromiumapp.org/` (published item, ID shown in the Developer Dashboard)
- No client secret is used or shipped. The extension uses the implicit (`response_type=token`) flow.

## 3. Branding (OAuth consent screen)

| Field | Value |
| --- | --- |
| App name | ADP Shifts |
| User support email | your Google account email |
| App logo | `store/images/oauth-logo-120.png` (120×120) |
| Application home page | https://adp-shifts.blahaj.uk/ |
| Application privacy policy | https://adp-shifts.blahaj.uk/privacy/ |
| Application terms of service | https://adp-shifts.blahaj.uk/terms/ |
| Authorized domains | `blahaj.uk`, `chromiumapp.org` |
| Developer contact | your email |

The homepage already meets Google's homepage rules: it describes what the app does, links the privacy policy, and is publicly reachable without sign-in. The privacy policy includes the Limited Use disclosure Google requires, word for word.

## 4. Data access (scopes)

Add only `https://www.googleapis.com/auth/calendar.app.created`.

Scope justification:

```text
ADP Shifts copies the user's ADP Workforce Now work schedule into Google Calendar. It needs to create one secondary calendar named "ADP Shifts" and then create, update, and delete the events in that calendar so it matches the user's schedule. calendar.app.created is the narrowest scope that allows this: the app cannot read or modify the user's primary calendar or any calendar it did not create. All processing happens in the user's browser; no data is sent to any server we operate.
```

## 5. Optional demo video

A video is not required for this non-sensitive scope. If Google or the store reviewer specifically requests a demonstration, record an unlisted video (two to three minutes). Show, in order:

1. The extension installed in Chrome, with the setup page open.
2. Signing in to ADP Workforce Now and opening My Schedule. The setup page shows "Position captured."
3. Clicking **Connect Google**. Pause on the consent screen so the browser address bar shows the OAuth `client_id`, and the scope list shows only the secondary-calendar permission.
4. Clicking **Sync now**. Switch to Google Calendar and show the new "ADP Shifts" calendar with the synced shifts, and that other calendars are unchanged.
5. Opening one event to show the details.
6. Settings › **Disconnect and clear data**, then the app gone from https://myaccount.google.com/permissions.

Blur your name, employee ID, and employer if they appear on screen.
