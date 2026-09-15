# DayRoute

**DayRoute: a weekly fixed-schedule-aware planner that uses time gaps, priority, and location to suggest what task to do next.**

Not just a to-do list. Not just navigation. The key idea is:

> "The app knows my weekly fixed schedule, knows today's date/day, finds free gaps between fixed events, and recommends the best tasks I can realistically complete based on time, priority, and location."

## Core Features To Build For Demo

### 1. Weekly Fixed Schedule

User enters non-movable commitments for the week. These can be classes, work shifts, meetings, appointments, workouts, or family commitments.

Example:

- Monday: Fixed event 9:00-10:15, Fixed event 1:00-2:15
- Tuesday: Meeting 11:00-12:15
- Saturday/Sunday: free

The app should know today is Monday/Tuesday/etc. and only use that day's fixed schedule.

### 2. Today View

Show:

- Today's date/day
- Today's fixed events
- Free time gaps
- Suggested tasks for each gap

Example:

```text
Today: Monday

9:00 AM - 10:15 AM: Data Structures / Work Block
10:15 AM - 1:00 PM: Free gap
Suggestion: Finish CS homework at Library
1:00 PM - 2:15 PM: Meeting
2:15 PM - 5:00 PM: Free gap
Suggestion: Buy groceries near H-E-B
```

### 3. Task Input

Tasks should have:

- task name
- estimated duration
- priority
- deadline
- location

Example:

```text
Task: Finish AI assignment
Duration: 90 min
Priority: High
Location: Library
Deadline: Today
```

### 4. Suggestion Engine

For each free gap, the app should choose tasks that fit.

Basic logic:

```text
Can the task fit in the gap?
Is it high priority?
Is the task location close to current/next fixed event?
Is the deadline soon?
```

The app then suggests the best task.

### 5. Navigation Category

This is where Google Maps fits.

Use Google Maps for:

- calculating travel time between current location, task location, and next fixed event
- showing whether a task is realistic before the next fixed event
- eventually opening directions to the task location

For demo today, use mock travel times. In presentation, say:

> "Google Maps integration would replace our mock travel-time table with real walking/driving/transit estimates."

## Where Google Maps Should Be Used

Use it in exactly these places:

### 1. Travel Time Between Locations

```text
Library -> Ingram Hall = 12 min
Cafe -> Meeting = 8 min
Home -> Campus = 20 min
```

### 2. Check If Task Fits

If you have a 90-minute gap:

```text
Walk to library: 8 min
Task duration: 60 min
Walk to next event: 10 min
Total: 78 min
```

So the task fits.

### 3. Recommend Nearby Tasks

If user is near campus, suggest campus tasks.
If user is near home, suggest home tasks.

### 4. Open Directions

Button:

```text
Navigate
```

It opens Google Maps with the destination.

Do **not** build full Google Maps today unless everything else is done. Use mock travel times and explain the integration.

## 4-Person Task Division

### Person 1: Weekly Schedule + Today Logic

Build:

- 7-day schedule data
- fixed events grouped by day
- app detects today's weekday
- shows only today's fixed events
- Saturday/Sunday show as free days

Their goal:

> "The app knows what day it is and loads the correct fixed schedule."

### Person 2: Gap Finder + Suggestion Engine

Build:

- find gaps between fixed events
- compare gap length with task duration
- rank tasks by priority and deadline
- suggest tasks that fit

Their goal:

> "The app tells the user what they can do between fixed schedule events."

### Person 3: UI + Demo Flow

Build/polish:

- Today screen
- Weekly schedule section
- Task cards
- Suggested task cards
- "Plan My Day" button
- clean mobile layout

Their goal:

> "The app looks polished and the demo is easy to follow."

### Person 4: Presentation + Google Maps Story

Build:

- slides
- screenshots
- demo script
- explain Google Maps/productivity connection
- explain future Google Calendar integration

Their goal:

> "The audience understands the product, problem, and technical plan."

## What To Say About Google Calendar

Do not promise full sync if it is not built.

Say:

> "For the MVP, users manually enter their weekly fixed schedule. In the next version, Google Calendar integration would import classes and events automatically."

## Presentation Angle

Your categories are **navigation** and **productivity**, so say:

> "Most productivity apps ignore location. Most navigation apps ignore tasks. DayRoute combines both by planning what you should do based on time, priority, and where you need to be next."

## Build Priority For 4 Hours

Must build:

1. weekly fixed schedule
2. today-aware schedule
3. free gap detection
4. task suggestions
5. clean demo UI

Skip:

- real Google Calendar
- real Google Maps API
- login
- database
- notifications

That gives you a strong, believable MVP.

## Setup

```bash
npm install
npx expo start --lan --clear
```

Scan the QR code with Expo Go on a phone connected to the same Wi-Fi network.

If LAN mode has trouble loading on a phone, use:

```bash
npx expo start --tunnel --clear
```

## Development

- Expo SDK: 57
- Main app: `App.js`
- Entry point: `index.js`
- App config: `app.json`
