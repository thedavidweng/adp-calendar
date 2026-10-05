# Google Calendar via launchWebAuthFlow and the calendar.app.created scope

The extension writes only to a Shift Calendar it creates, using the `calendar.app.created` scope, so it can never read or delete the user's other calendars and Sync may freely delete anything it finds there. It authorizes with `chrome.identity.launchWebAuthFlow` and silent `prompt=none` renewal instead of `getAuthToken`, because the tool targets any Tenant's employees and `getAuthToken` works only in Google Chrome, not other Chromium browsers. No refresh token or client secret is stored.

## Consequences

Google Auth Platform classifies `calendar.app.created` as non-sensitive (confirmed in the project's Data Access page on 2026-10-04). Public distribution requires publishing the OAuth app to Production. The app's logo requires branding verification, including a homepage and privacy policy on a verified domain; sensitive-scope verification and its demo video are not required for this scope.

The scope does not allow listing the user's calendars (`calendarList.list` returns 403), so the extension remembers the Shift Calendar's id when it creates it and reads it back with `calendars.get`. If that id is lost (Disconnect, reinstall), the next Sync creates a new Shift Calendar and the old one stays in the user's account.
