# Probe: current Calendar Position capture (2026-10-05)

The top-right **Calendar** button opens `/mascsr/mdf/timeoffrequest/calendarESS.html` inside the Workforce Now SPA. The top-level URL can remain `/theme/index.html#/home`. The rendered Calendar has **no iframe** and no `TLM_POSID` URL. Legacy-iframe capture alone therefore cannot identify this page's Position.

## Source of the selected Position

Calendar requests:

```text
/mascsr/timeoffrequest/ess/metaservices/emppositions/getemployeepositions/?pfid=<selected-pfid>&requestoid=<request-id>&preventcache=<time>
```

The response has `employeePositinDto.positionList` (ADP's spelling). Each entry includes `pFid`, `positionId`, and `primaryPosition`. Match the request's `pfid` to the entry's `pFid`; do not guess the first or primary Position. Employee names and all other response fields are discarded.

A read-only monthly schedule request using that entry's `positionId` returned HTTP 200, ADP `data.statusCode: 200`, and `positionShiftAssignments` on the live logged-in session.

## Reproduction and verification

- Downloaded the actual Chrome Web Store CRX, version **0.1.0**. Its seven JS/HTML runtime files matched the published GitHub build byte for byte.
- Added only the public manifest key to retain store ID `obccfkjmkfhljjnamibiiolagcpmjklj` when loaded unpacked. Removed store `_metadata`, which is not executable code. Same OAuth client and host permissions; disabled the old development-ID extension.
- Reloaded ADP, opened Calendar, and confirmed the production-ID 0.1.0 extension still had no stored Position. Refreshing did not resolve it.
- Loaded **0.1.3** under the same ID and permissions, reloaded ADP and opened the same Calendar. The content script automatically saved the selected Position; setup displayed “Schedule detected. ADP is ready.”
- Compared the stored Position to the live lookup's selected entry: exact match. No Position or OAuth token was manually inserted for the test.

The fix observes Calendar's resource requests, repeats the selected-Position lookup with the existing same-origin session, and stores only the matching `positionId`. Each request URL is processed once, including resource entries already buffered at content-script startup. Legacy schedule pages retain their existing iframe capture.
