# Google OAuth verification

`calendar.app.created` is a sensitive scope. Until Google verifies the app, the consent screen shows an "unverified app" warning and the project is capped at 100 users (ADR 0003). This is what the [verification](https://support.google.com/cloud/answer/13463073) needs.

## 1. Own the domain

Google only accepts a homepage and privacy policy on a domain you have verified in [Search Console](https://search.google.com/search-console).

- `github.io` is a public suffix, so the domain to verify is `thedavidweng.github.io`.
- A project site lives under `/adp-calendar/`, but Search Console verifies a domain from its root. Either:
  - create a `thedavidweng.github.io` user-site repo and put Google's HTML verification file at its root, or
  - point a custom domain at this site (add `site/CNAME`) and verify it with a DNS TXT record. This is the more reliable route, and it also gives a nicer Official URL in the store.
- Add the verified domain under **Branding › Authorized domains**.

## 2. OAuth client

- Type: **Web application** (`launchWebAuthFlow` uses a normal web redirect, which also works in non-Google Chromium browsers).
- Authorized redirect URIs:
  - `https://dkjgilecoojembpgookbeepjdlcapchg.chromiumapp.org/` (unpacked development build, pinned by the manifest `key`)
  - `https://<store-item-id>.chromiumapp.org/` (published item, ID shown in the Developer Dashboard)
- No client secret is used or shipped. The extension uses the implicit (`response_type=token`) flow.

## 3. Branding (OAuth consent screen)

| Field | Value |
| --- | --- |
| App name | ADP Shifts |
| User support email | your Google account email |
| App logo | `store/images/oauth-logo-120.png` (120×120) |
| Application home page | https://thedavidweng.github.io/adp-calendar/ |
| Application privacy policy | https://thedavidweng.github.io/adp-calendar/privacy/ |
| Application terms of service | https://thedavidweng.github.io/adp-calendar/terms/ |
| Authorized domains | `thedavidweng.github.io` (or your custom domain) |
| Developer contact | your email |

The homepage already meets Google's homepage rules: it describes what the app does, links the privacy policy, and is publicly reachable without sign-in. The privacy policy includes the Limited Use disclosure Google requires, word for word.

## 4. Data access (scopes)

Add only `https://www.googleapis.com/auth/calendar.app.created`.

Scope justification:

```text
ADP Shifts copies the user's ADP Workforce Now work schedule into Google Calendar. It needs to create one secondary calendar named "ADP Shifts" and then create, update, and delete the events in that calendar so it matches the user's schedule. calendar.app.created is the narrowest scope that allows this: the app cannot read or modify the user's primary calendar or any calendar it did not create. All processing happens in the user's browser; no data is sent to any server we operate.
```

## 5. Demo video

Upload an unlisted YouTube video (two to three minutes) and paste the link in the verification form and in the store's test instructions. Show, in order:

1. The extension installed in Chrome, with the setup page open.
2. Signing in to ADP Workforce Now and opening My Schedule. The setup page shows "Position captured."
3. Clicking **Connect Google**. Pause on the consent screen so the browser address bar shows the OAuth `client_id`, and the scope list shows only the secondary-calendar permission.
4. Clicking **Sync now**. Switch to Google Calendar and show the new "ADP Shifts" calendar with the synced shifts, and that other calendars are unchanged.
5. Opening one event to show the details.
6. Settings › **Disconnect and clear data**, then the app gone from https://myaccount.google.com/permissions.

Blur your name, employee ID, and employer if they appear on screen.
