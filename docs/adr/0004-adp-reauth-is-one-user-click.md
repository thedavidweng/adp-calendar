# ADP re-auth is one user click, and Sync runs twice a week

Employers usually publish schedules weekly, so a Sync is due only when the last success is more than 3.5 days old. A daily alarm and every Workforce Now page load check whether one is due; a page load usually has a live ADP Session, so most Syncs need no sign-in at all. When a due Sync finds the ADP Session dead, the extension shows one notification; clicking it opens the ADP sign-in page, where ADP itself remembers the user ID and the browser's password manager can fill the password, and the user clicks Sign in (ADP sends any phone approval itself). The extension only watches for the tab to reach Workforce Now, then syncs.

## Considered Options

- **Store or replay the password** (what the Playwright/Selenium schedule bots do): rejected, see ADR 0002.
- **Fill or submit the ADP sign-in form**: rejected. Chrome hides autofilled passwords from scripts until a user gesture, and the form is ADP's security boundary.
- **Offscreen iframe**: `/theme/index.html` sends `X-Frame-Options: deny`; working around it means stripping ADP's security headers. Rejected.
- **Keep-alive pings** to stop the session idling out: defeats the employer's idle timeout. Rejected.
- **Silent recovery in an inactive background tab**: deferred. It only helps while ADP's `SMSESSION` is alive but the Workforce Now session is not, which is unmeasured and likely rare at a twice-weekly cadence, and tabs flashing open is a visible cost. Each Sync attempt records, locally only, the time since the last success and the outcome; revisit if that data shows recovery would often succeed.
