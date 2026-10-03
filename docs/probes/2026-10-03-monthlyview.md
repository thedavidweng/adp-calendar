# Probe: `schedule/v1/monthlyview` (2026-10-03)

Live, read-only GETs from a signed-in Workforce Now page (`workforcenow.adp.com`, `en-ca`, one Position). Requests were same-origin `fetch(url, { credentials: 'include' })`. Redacted results are in `packages/parser/test/fixtures/`.

## Getting `positionid`

The `TLM_POSID` value is inside the URL-encoded `href` parameter of the `legacyAppShell.html` iframe, not a top-level query parameter:

```js
const src = [...document.querySelectorAll('iframe')].map(f => f.src).find(s => s.includes('TLM_POSID'));
const href = new URL(src).searchParams.get('href'); // "/TLMWeb/MDFHost?pg=430&...&TLM_POSID=..."
const positionId = new URLSearchParams(href.split('?')[1]).get('TLM_POSID');
```

## Success and failure detection

HTTP status is not enough. Every case below was HTTP 200 with `application/json`.

| Case | `status` | `data.status` | `data.statusCode` | `data.statusDescription` | `data.details[0]` |
| --- | --- | --- | --- | --- | --- |
| Normal | `success` | (not checked) | `200` | `info_RequestSuccessful` | schedule payload |
| Range entirely before the Position became time-tracked | `success` | `failure` | `401` | `err_nonTimeEmployee` | `{ messages: [...] }` |
| `enddate` before `startdate` | `success` | `failure` | `412` | `err_UnexpectedError_Business_Validation` | `{ err_msg }` |

Success rule: `data.statusCode === 200` and `details[0].positionShiftAssignments` is an array. "Has `details`" is not sufficient; error responses also have `details`.

ADP Session dead (simulated with `credentials: 'omit'`): the fetch is redirected (`response.redirected === true`) to `https://online.adp.com/olp/olplanding.html`, HTTP 200, no content type, HTML body titled "Federation Redirector". Detect it with `redirected`, a non-`workforcenow.adp.com` final host, or a body that does not parse as JSON.

`err_nonTimeEmployee` is not a dead ADP Session. It fires when the whole range falls before the Position's time-tracked period (`position.effectiveBetween[].isTime`). Ranges that overlap the time-tracked period succeed and return only what exists.

## Date ranges

The API accepts arbitrary ranges. `enddate` is echoed back exactly and never padded.

| Range | Days | Result |
| --- | --- | --- |
| 2026-09-27 to 2026-10-31 (page's October grid) | 35 | ok, 7 shifts |
| 2026-10-01 to 2026-10-15 | 15 | ok, 5 shifts |
| 2026-10-15 to 2026-11-15 | 32 | ok, 0 shifts, 1 holiday |
| 2026-10-01 to 2026-11-30 | 61 | ok |
| 2026-09-01 to 2026-11-30 | 91 | ok |
| 2026-06-01 to 2026-11-30 | 183 | ok |
| 2026-01-01 to 2026-12-31 | 365 | ok, 8 shifts |
| 2026-08-01 to 2026-08-31 | 31 | `err_nonTimeEmployee` |
| 2026-10-31 to 2026-10-01 | inverted | `412` |

On this Tenant, Shifts were published only up to 2026-10-09 (6 days ahead). Holidays are returned for the whole range, including months with no Shifts.

## `shiftObjectId`

- Present on every Shift (0 missing across all responses).
- Unique within every response.
- Stable across 12 overlapping requests: each (`shiftDate`, `shiftReferenceId`) pair always had the same `shiftObjectId`.
- Not tested: whether it survives a manager editing the Shift. The schedule is not editable from the employee side.

## Other observations

- `status`: only `"P"` seen (8 distinct Shifts).
- No Shift crossed midnight. `mealDeductSeconds` was `0` on every Shift.
- `templateName`, `payCodeDesc`, `departmentDesc`, `workedJobDesc`, `locationDesc` were all empty strings on this Tenant, so the title falls back to `"Shift"`.
- `totalRecords` was `1` with one Position; `startIndex`/`endIndex` suggest paging per Position. Not exercised.
- `position` carries more identity than the handoff listed: `firstName`, `middleName`, `lastName`, `employeeId`, `loginId`, `pfId`, `objectId`, `oId`, `associateOID`, `companyCode`, `seniorityDate`, benefit dates, ACA status. The parser must not pass any `position` field through except `positionId` (used only to request, never emitted).
