CATHILL

1. Unzip the folder.
2. Double-click index.html.

The browser runs entirely on your Mac and does not need an internet connection.
Keep all included files together in the same folder.

Features:
- Search names, descriptions, workout goals, structures, and durations such as "60 min"
- Filter by training system, duration, TSS, progression level, and interval structure
- Explore workouts on an interactive duration-vs-TSS chart
- Save FTP locally and inspect workout targets as both % FTP and calculated watts
- Hover across expanded workout profiles to inspect each portion by elapsed time
- Save favorites locally in the browser
- Download any selected workout for Zwift as a ready-to-import ZWO file

BLOCK BUILDER
- Open blocks.html directly, or choose Block Builder from the navigation
- Generate a four-week Base 1, Base 2, Build 1, or Build 2 block
- Configure cycling days, hard days, week-one volume, long-ride day, and starting load
- Review weekly hours, TSS, hard-work time in zone, and recovery-week reduction
- Preview every planned workout with a practical one-line description
- Change any planned workout using a searchable similar-workout or full-library picker
- Save, duplicate, reopen, and delete blocks locally in the browser
- Download the complete block as a Zwift ZIP containing weekly ZWO files, CSV manifest, and JSON plan

ZWIFT
- Choose a workout, open Inspect, and click Download for Zwift
- Move the downloaded .zwo file into Documents/Zwift/Workouts/<your Zwift ID>
- Restart Zwift and find it under Workouts > Custom

INTERVALS.ICU
- Choose a workout and click Send to Intervals.icu, or send a complete generated block
- Enter the personal API key from Intervals.icu Settings > Developer Settings
- Select a workout date or the Monday of week one
- Enable planned-workout upload in Intervals.icu's Garmin or Zwift connection settings for automatic delivery

The workouts.json file is an optional copy of the embedded data for reuse in other tools.
CATHILL — LOCAL USE

Run from this folder's parent with:
  python3 -m http.server 4173 --bind 127.0.0.1 --directory dist

Then open:
  http://localhost:4173/index.html

Do not double-click index.html: the integrated Ride screen needs localhost for
Web Bluetooth and IndexedDB. Use Chrome or Edge for trainer/HRM connections.
