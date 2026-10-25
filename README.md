# CATHILL

Live at [madnet.site](https://madnet.site/).

A local-first cycling application organized around `Calendar → Ride`.
The Calendar provides workout discovery, four-week block building, dated planning,
Zwift/Intervals.icu export, and direct Ride launch. Ride is a pinned Auuki fork for
Web Bluetooth trainers and HRMs, ERG execution, FIT recording, local history, and
optional Intervals.icu activity upload.

## Run it

Web Bluetooth and IndexedDB require the app to be served rather than opened as a
file.

```sh
cd cathill
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

Open `http://localhost:4173/index.html` in Chrome or Edge. Safari, Firefox, and
iOS browsers do not currently support the browser Bluetooth path used by Ride.

## Use it

- Click a calendar day and choose **Add workout** to search the independently
  authored built-in library. Filter or sort the results, use **Inspect** for the complete
  profile and workout notes, then add it from either view. Every result includes a power profile; hover it to inspect each
  segment's duration, `% FTP`, and watts when FTP is saved.
- Select **Build plan** to choose the purpose, start date, weekly hours, riding
  days, quality days, long-ride day, and starting TiZ. Day choices are made in
  that order, and ineligible long-ride choices are removed automatically. Preview
  all four weeks with per-week totals and interactive workout profiles. Replace
  individual draft workouts as needed; none of these preview changes touch the
  calendar until **Replace future plan** is clicked.
- Move, replace, export, delete, or start any dated workout from its detail view.
  Long descriptions sit below the controls so the detail card can be scrolled
  without pushing the primary actions away.
- Drag a workout card onto another calendar day to reschedule it. Every calendar
  week has an aligned summary column for rides, hours, TSS, TiZ, and completion.
- Use **Plans** to remove every calendar workout belonging to a generated plan;
  completed FIT history is retained.
- Set FTP once to show both `% FTP` and watts in the profile and pass that FTP to
  Ride.
- Use Settings to add or remove workout libraries and to export or restore a
  versioned local backup of the calendar, sources, FTP, and theme. API keys are
  deliberately excluded from backups.

Loading weeks keep the requested weekly volume approximately stable and progress
quality work only through target-zone time. Week four reduces volume and TiZ.
The builder does not infer readiness or adapt the plan from ride history.

## Workout-source boundary

The public build includes the independently authored Open Workouts library.
Application features depend on normalized provider-neutral workout records in
`dist/workout-library.js`. Calendar events retain a provider reference plus a
structural snapshot, so other open or user-imported libraries can replace the
built-in source without migrating planner or Ride data.

### Importing your own library

Open **Settings → Import a library**. You can select one or more `.zwo` files,
or a JSON file containing either an array of workouts or `{ "name": "My
library", "workouts": [...] }`. JSON workout records need a name and at least
two `[elapsedSeconds, percentOfFtp]` points; fractional ZWO-style power values
such as `0.85` are also accepted. Custom libraries are stored in IndexedDB in
this browser and remain separate so each can be removed independently.

Removing the built-in Open Workouts library hides it from search and block
building; it does not delete the bundled file. Removing any source also leaves
existing calendar entries rideable because each event contains a workout
snapshot. Export a backup before clearing browser data or moving computers.

## Ride and Intervals.icu

`Ride now` loads the selected workout and saved FTP into Ride. Open **Sensors**
from the fourth Ride menu item and connect the Trainer and HRM; the notification
dot clears when both are connected. Stopping saves the FIT activity locally before
any optional upload attempt. New saved rides also retain power, heart-rate, and
cadence traces for the completed workout card's scrobbable history chart.

To enable Intervals.icu, use an **Intervals.icu** action, enter the personal API
key from **Settings → Developer Settings**, and optionally enable automatic
completed-ride uploads. Failed uploads retain their local FIT record and can be
retried from Ride history. Intervals.icu is export-only; it never rewrites the
local calendar.

## Build and test

```sh
npm install --prefix vendor/auuki
npm run build:ride
npm test
```

Tests cover provider normalization, legacy-calendar migration, five-week calendar
dates, schedule reconciliation, TiZ-only plan progression, recovery-week
reduction, Ride handoff, direct Intervals.icu upload behavior, ZWO parsing, and
trainer command encoding.

Physical BLE pairing and ERG control still require verification with the real
trainer and HRM before a hardware change can be considered complete.

## Licensing and privacy

Auuki remains under AGPL-3.0; its license and upstream pin are in
`vendor/auuki/LICENSE.txt` and `vendor/auuki/UPSTREAM.md`. Browser-local plans,
FTP, imported libraries, API keys, and ride history are not sent to CATHILL.

## Source and deployment

The canonical source lives in Git and the site host is a release destination,
not the only copy of the product. The public build contains only the independently
authored workout library and user-imported data remains in the user's browser.
