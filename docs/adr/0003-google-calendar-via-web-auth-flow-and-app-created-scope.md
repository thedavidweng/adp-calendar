# Google Calendar via launchWebAuthFlow and the calendar.app.created scope

The extension writes only to a Shift Calendar it creates, using the `calendar.app.created` scope, so it can never read or delete the user's other calendars and Sync may freely delete anything it finds there. It authorizes with `chrome.identity.launchWebAuthFlow` and silent `prompt=none` renewal instead of `getAuthToken`, because the tool targets any Tenant's employees and `getAuthToken` works only in Google Chrome, not other Chromium browsers. No refresh token or client secret is stored.

## Consequences

Public distribution needs Google sensitive-scope verification (privacy policy on a verified domain, demo video). Until then the OAuth app is capped at 100 users and shows an unverified-app warning.
