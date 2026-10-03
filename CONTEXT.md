# ADP Schedule Export

Copies the signed-in employee's ADP Workforce Now schedule into their own calendar, using only the ADP login that already exists in their browser.

## Language

### ADP side

**Tenant**:
One employer's ADP Workforce Now account, with its own settings (week start, time zone, enabled features).
_Avoid_: Company, org, instance

**ADP Session**:
The employee's signed-in Workforce Now state in a browser. It ends when the browser quits or ADP expires it, and it cannot be renewed without the employee.
_Avoid_: Login, auth, cookie

**Position**:
One job assignment of the signed-in employee in ADP. An employee can hold more than one, and the schedule is keyed by it.
_Avoid_: Role, job, employee

**Shift**:
One scheduled block of work on a specific date for a Position.
_Avoid_: Shift occurrence, slot, booking

**Shift Definition**:
A reusable template (times, department, pay code) that many Shifts point to. It is not itself on the calendar.
_Avoid_: Shift template, shift type

**Holiday**:
A day the Tenant marks as a holiday on the employee's schedule. It is all-day and separate from Shifts.
_Avoid_: Day off, PTO

### Calendar side

**Calendar Event**:
A Shift or Holiday, normalized into a form any calendar can take.
_Avoid_: Entry, item, appointment

**Shift Calendar**:
The dedicated Google calendar the extension creates and fully owns. Nothing outside it is ever written or deleted.
_Avoid_: Work calendar, ADP calendar

**Sync**:
Making the Shift Calendar match the Calendar Events in the Schedule Window, from today onward: create, update, and delete. Past Calendar Events are frozen history and never changed.
_Avoid_: Import, refresh

**Export**:
Producing an ICS file of Calendar Events for the user to import by hand. It never deletes anything.
_Avoid_: Sync, download

**Schedule Window**:
The date range fetched from ADP and reconciled in one Sync or Export.
_Avoid_: Range, period, month
