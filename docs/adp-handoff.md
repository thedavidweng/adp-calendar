# ADP Workforce Now schedule export handoff

Original research notes, observed 2026-10-03 on a logged-in employee session, Canada English (`en-ca`), monthly My Schedule. Claims later overturned by live probes are marked **Correction** and link to [the probe log](probes/2026-10-03-monthlyview.md). Product decisions made after this handoff live in `docs/adr/` and override anything here.

This is an unofficial, same-origin JSON call the schedule page already makes. It is not ADP API Central, and it is not a supported iCal feed.

Do not store ADP passwords, copy session cookies off the machine, bypass MFA, or add a feature that queries someone else's `positionid`. The response includes name, employee id, and login id. The parser should drop those.

## Product constraint

The portal auth cookies are browser-session cookies (`expires` null). Observed session-scoped names: `XSRF-TOKEN`, `_nxo_id`, `WFNRAAS`, `PAASPORTAL`, `ADPPORTAL`, `dtCookie`, `WFNCDN`, `PAASVERSION`, `DUPTAB`, `JWFNID_L`. Quitting the browser drops them. No refresh token was found for this API.

Both clients must use the browser's existing ADP login. They cannot stay logged in by themselves. A background sync works only while that browser session is still valid. Google Calendar OAuth can be long-lived. ADP cannot.

Best trigger: piggyback on a visit the employee already makes (home page Clock In, or any Workforce Now page), plus an alarm while Chrome is still open. When the session is dead, ask for one normal login. Do not automate the phone prompt.

## Where the page lives

Menu: Myself → Time & Attendance → My Schedule.

Shell route:

```text
https://workforcenow.adp.com/theme/index.html#/Myself/MyselfTabTimecardsAttendanceSchCategoryMonthlySchedule
```

The calendar is not rendered by the modern shell. The shell embeds:

```text
/theme/legacyAppShell.html?href=/TLMWeb/MDFHost?pg=430&now={ms}&TLM_PFID={pfid}&TLM_POSID={positionId}
```

> **Correction:** the inner URL is URL-encoded inside the `href` query parameter. Decode `href` first, then read `TLM_POSID` from it.

That shell then loads:

```text
GET /TLMWeb/MDFHost?pg=430&now={ms}&TLM_PFID={pfid}&TLM_POSID={positionId}&dojo.preventCache={ms}
```

`pg=430` is the monthly schedule screen. The host page is a Dojo / RevIt app (Dojo 1.11.2, RevIt 3.10.2, ng-revit 2.6.0). Surrounding shell versions seen: mdf 26.29.8, mdf-components 26.29.14, mdf-wc 1.34.8, synerg 5.54.0.

The host form id is `MDFHostForm`. Paging controls exist, but do not click them. Use the JSON API below.

```text
SchedulingCalendarMonthlyView.btnPrevMonth
SchedulingCalendarMonthlyView.btnNextMonth
SchedulingCalendarMonthlyView.MonthWeekToggleButton.hiddenInput
SchedulingCalendarMonthlyView.Preferences
```

Meta documents loaded with the view, build stamp `202608201733` (this stamp will change; do not treat it as an API version):

```text
GET /metaui/meta/view/SchedulingCalendarMonthlyView/default/202608201733
GET /metaui/meta/rule/ezlm_weekcalendar/202608201733
GET /metaui/meta/servicedefinition/schedulemetadata/202608201733
GET /metaui/meta/servicedefinition/schedulemonthlyview/202608201733
```

The host HTML contains the strings `WeekView`, `WeeklyView`, and `weekView`. No weekly JSON URL was captured. Do not invent `/schedule/v1/weeklyview`. The month/week toggle can be ignored. Always call `monthlyview` with an explicit range.

`Actual vs Scheduled` is a separate menu item. It was not captured.

## The schedule API

Discovered from `performance.getEntriesByType('resource')` inside the legacy iframe. Playwright `page.on('request')` did not see these calls on the attached tab, so do not trust an empty network hook.

```http
GET /mascsr/wfntlm/schedule/v1/monthlyview?positionid={positionId}&startdate=YYYY-MM-DD&enddate=YYYY-MM-DD&pfId=&preventCache={ms}
```

Observed result: `200`, `application/json`, about 5.5 KB for one month.

Auth check that succeeded: `fetch(url, { credentials: 'include' })` from the legacy frame, with no `Authorization` header and no custom XSRF header. Same-origin session cookies were enough for this GET. `XSRF-TOKEN` exists, but this GET did not need it set as a header. Do not POST. This tool is read-only.

`preventCache` is only a cache buster. The page sends it. A client can send `Date.now()`.

`pfId` was empty in the successful call. The iframe URL does carry `TLM_PFID`, but the JSON call did not need it. Do not require it.

### How to get `positionid`

Use `TLM_POSID` from the legacy iframe `href`. That value is what `monthlyview`'s `positionid` query used.

Do not parse the employee-bar label that says "Position ID". On this tenant that label is a different display code, not the API id. After the first response, `data.details[0].positionShiftAssignments[0].position.positionId` is the same API id. A content script can also read the query string of the `monthlyview` request the page already made.

### Date range

This tenant:

- `calenderStartDayOfWeek`: `SUNDAY`
- `StartDayOfWeek`: `0`
- `MonthlyScheduleStartWeek`: `FIRST_WEEK`
- `startDateOfMonth`: `1`
- UI columns start on Sunday

The October 2026 view requested `startdate=2026-09-27` (Sunday on or before the 1st) through `enddate=2026-10-31` (last calendar day of the month). October 31 happened to be a Saturday, so it is not proven that `enddate` is padded to the end of the last week. Arbitrary ranges were not tested.

> **Correction:** arbitrary ranges work (15 days to a full year), and `enddate` is echoed exactly, never padded. A range entirely before the Position became time-tracked returns `err_nonTimeEmployee`; an inverted range returns `412`.

For sync, request the current month grid and the next month grid, or a slightly wider range if a probe shows the API accepts it. Record that probe in the repo before depending on it.

Display times on the page are 12-hour (`03:30 PM`). The JSON is 24-hour. Parse the JSON, not the DOM text. `hourssummary` says `timeFormat: "AM/PM"`. `schedulemetadata` says `TimeFormat: "C"`. Ignore both for parsing.

## Response shape

```json
{
  "status": "string",
  "data": {
    "status": "string",
    "statusCode": 0,
    "statusDescription": "string",
    "details": [
      {
        "startDate": "YYYY-MM-DD",
        "endDate": "YYYY-MM-DD",
        "startIndex": 0,
        "endIndex": 0,
        "totalRecords": 1,
        "paycycles": [],
        "shiftDefinitions": [],
        "positionShiftAssignments": []
      }
    ]
  }
}
```

`statusCode` was a number. The exact success value was not recorded. Treat HTTP 200 plus a JSON body with `details` as success. If the body is HTML, or the final URL is a login page, the session is dead.

> **Correction:** success is `data.statusCode === 200` (`statusDescription: "info_RequestSuccessful"`). Error responses are also HTTP 200 and also carry `details` (with `messages` or `err_msg` instead of a schedule). A dead session redirects to `https://online.adp.com/olp/olplanding.html` (HTML, "Federation Redirector").

### `paycycles[]`

```text
paycycleId, startDate, endDate, isLocked, hasPaycycleAccess
```

Not needed for calendar export.

### `shiftDefinitions[]`

Shared templates. This sample had 3 definitions for 7 shifts. `shiftReferenceId` is not a unique occurrence id.

```text
shiftReferenceId          string, join key
inTime                    "HH:MM:SS"   e.g. "15:30:00"
outTime                   "HH:MM:SS"   e.g. "22:30:00"
shiftType                 "REGULAR" in this sample
payCodeDesc, payCodeType, paycodeId
departmentDesc, departmentKey, departmentId
workedJobDesc, workedJobId
locationDesc, locationId
lunchPlanDesc, lunchPlanId
ptoTransactionId
templateName, templateKey
shiftRuleId, flexiTimeRuleId
laborAllocations[]        empty here, item shape unknown
qualifications[]          empty here, item shape unknown
isQualificationChanged    boolean
```

`workedJobDesc` and `locationDesc` were empty strings in this sample. Still map them when present. Title fallback: `templateName`, then `payCodeDesc`, then `"Shift"`.

> **Correction:** `templateName`, `payCodeDesc`, and `departmentDesc` were also empty on this tenant, so every title fell back to `"Shift"`.

### `positionShiftAssignments[]`

One element in this sample (one position). A future employee could have more. Export all of them, but still only the logged-in user's response. Do not add a position picker that accepts typed ids.

```text
position
shifts[]
holidays[]
pendingTimeOfRequests[]          empty, item shape unknown
hangingPendingTimeOfRequests[]   empty, item shape unknown
```

`position` includes `positionId`, names, `employeeId`, `loginId`, `pfId`, `positionTitle`, department/job/location ids, totals, and `effectiveBetween[]`. Drop identity fields in the parser output. `effectiveBetween[]` item keys, if needed later:

```text
startDate, endDate, paygroupId, departmentId, jobId, locationId,
paycycleId, activeDate, isTime, dbIsTime
```

> **Correction:** `position` also carries `middleName`, `objectId`, `oId`, `associateOID`, `companyCode`, `seniorityDate`, benefit dates, and ACA status. The parser emits no `position` field at all.

### `shifts[]`

```text
shiftReferenceId                 join to shiftDefinitions
shiftObjectId                    string, best candidate for a stable occurrence id
shiftDate                        "YYYY-MM-DD"
shiftEndDate                     "YYYY-MM-DD"
inTimeHour                       integer HHMMSS, 153000 = 15:30:00, 170000 = 17:00:00
shiftWorkedTotalSeconds          21600 = 6h, 19800 = 5.5h, 25200 = 7h
shiftNonWorkedTotalSeconds
mealDeductSeconds
noteText, editReason, editReasonDesc, quickShiftName
isHoliday                        boolean
status                           "P" on every shift that was visible on the calendar
```

`status` has no official enum in what we captured. Do not drop unknown statuses. Keep them and surface the raw code. Do not assume `"P"` means published beyond "these were the shifts on screen".

### `holidays[]`

```text
date                 "YYYY-MM-DD"
description          string
holidayProgramId
observed             boolean
```

Both holidays in this sample had `observed: false` and still appeared on the calendar (Truth and Reconciliation Day, Thanksgiving Day). Do not filter on `observed === true`. Emit them as all-day events. They are not in `shifts[]`.

## Join rules

1. Index `shiftDefinitions` by `shiftReferenceId`.
2. For each shift, attach the definition with the same `shiftReferenceId`.
3. Start local datetime is `shiftDate` + definition `inTime`.
4. End local datetime is `shiftEndDate` + definition `outTime`.
5. If the definition is missing, fall back to `inTimeHour` plus `shiftWorkedTotalSeconds`.
6. This sample was all same-day (`shiftDate === shiftEndDate`, and `outTime > inTime`). Still handle `shiftEndDate` greater than `shiftDate`, and `outTime` earlier than `inTime`, as crossing midnight.
7. Calendar uid must not be `shiftReferenceId` alone. Prefer `shiftObjectId` after a uniqueness check. Fallback: `shiftDate + inTime + outTime + shiftReferenceId`. Verify `shiftObjectId` is unique per row before shipping sync. That check was not done.
8. Time zone is the tenant's local wall time. These values had no offset. For a Vancouver user, write them as `America/Vancouver` floating/local times, not as UTC.

> **Correction:** `shiftObjectId` was present, unique, and stable across 12 overlapping requests. Stability across manager edits is still untested.

Worked seconds matched the definition span in this sample (15:30–21:30 = 21600). `mealDeductSeconds` was present but not compared. Do not subtract it unless a later sample shows the page doing so. The on-screen label matched `inTime`–`outTime` directly.

## Other calls on the same screen

Not schedule rows. Safe to ignore for v1.

```text
GET /mascsr/wfntlm/schedule/v1/schedulemetadata?preventCache={ms}
GET /mascsr/wfntlm/hourssummary/v1/settings?preventCache={ms}
GET /mascsr/wfntlm/codelists/v1/flexitime?addblank=true&preventCache={ms}
```

`schedulemetadata` is `{ key, value }[]`, about 3 KB, 62 pairs. Useful tenant flags from this session:

```text
TimeOffRequestEnabled = true
isFlextimeRuleEnabled = false
StartDayOfWeek = 0
calenderStartDayOfWeek = SUNDAY
MonthlyScheduleStartWeek = FIRST_WEEK
MonthlyScheduleStartDayOfWeek = undefined
TimeFormat = C
HoursFormat = HoursTwoDecimals
IsScheduleEditable = false
IsMonthlyScheduleEditable = false
IsActualVsScheduleEditable = false
SCHEDULE_SHIFTSWAP = false
ActualVsScheduleStartDay = PAY_PERIOD
hasTimecardAccess = false
```

`hourssummary/v1/settings` details[0]:

```text
startDayOfWeek = SUNDAY
startDateOfMonth = 1
calenderStartDayOfWeek = SUNDAY
timeFormat = AM/PM
hoursFormat = HoursTwoDecimals
hideRates = false
allowEmployeeTimeCardApproval = false
newCurrentStateEnabled = false
suppEarningsEnabled = false
FLSAOTHoursLimit = 144000
```

`flexitime` was `200`, 408 bytes: `data.options[]` of `{ value, label }`, length 5. Not needed for export. Flextime is disabled on this tenant.

`TLMWeb/bundles/Scripts/TLMCommon` did not contain the `/mascsr/wfntlm/...` path strings. The host HTML also did not contain those path strings (`apiHits` empty). The URLs showed up as XHR resource entries, so they are built in loaded view code, not as a static string in the initial HTML. Search the network log, not only the bundle, when this breaks.

## Failure and drift checklist

When the export breaks, check in this order:

1. Session dead: response is HTML or a login redirect. Ask the user to sign in. Do not scrape the login form.
2. `TLM_POSID` missing: shell changed the iframe URL. Fall back to intercepting whatever request contains `/schedule/v1/monthlyview`.
3. JSON shape drift: `details` missing, or `inTime` no longer `HH:MM:SS`. Update the parser. Keep a redacted fixture.
4. `shiftObjectId` missing or duplicated. Switch the uid fallback and force one full calendar reconcile.
5. Week view starts calling a different URL. Capture it the same way (`performance` resource entries in the legacy frame). Do not guess the path.
6. Build stamp on `/metaui/meta/.../{stamp}` changed. Irrelevant if the client never calls those meta URLs.

## Open questions

- ~~Does `monthlyview` accept a range that is not the page's month grid?~~ Yes, see the probe log.
- ~~Is `enddate` ever padded past the last day of the month?~~ No.
- Is `shiftObjectId` stable across edits? Unique and stable across requests; edits untested.
- What does `status` other than `"P"` mean? Unknown.
- Shape of `pendingTimeOfRequests`, `laborAllocations`, and `qualifications`. Empty in this capture.
- Server idle timeout while the browser stays open. Unknown. The cookie having no `Expires` does not prove the server session lasts until quit.
- Whether a weekly JSON endpoint appears after toggling WEEK. Strings exist in the host HTML. No request was captured.
- `Actual vs Scheduled` data source. Not captured.

## Out of scope

- ADP API Central, Marketplace apps, MakeShift, employer OAuth, mTLS.
- Selenium, password replay, TOTP secrets, SMS/push automation.
- Pay, tax, SIN, direct deposit, timecard edits, clock in/out.
- Querying any `positionid` other than the one in the logged-in page.
