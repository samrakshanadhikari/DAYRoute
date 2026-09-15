# Recommendation Engine

This branch owns the task recommendation feature for DayRoute.

## Goal

DayRoute should look at a user's fixed schedule for the selected day, find open time gaps, and suggest realistic tasks based on:

- available time
- task duration
- travel time to the task location
- travel time from the task location to the next fixed event
- task priority
- deadline urgency

The app is not only for students. A fixed schedule item can be a class, work shift, meeting, appointment, workout, family event, or any other non-movable commitment.

## MVP Logic

For each open gap:

```text
available gap time
- travel from current/previous location to task location
- task duration
- travel from task location to next fixed event
= remaining buffer
```

If the remaining buffer is zero or positive, the task fits.

Then rank fitting tasks by:

1. High priority first
2. Earlier deadline first
3. Lower travel time first
4. Shorter duration first

## Demo Example

```text
Gap: 10:15 AM - 1:00 PM
Task: Finish AI assignment
Travel to Library: 8 min
Task duration: 90 min
Travel to next event: 10 min
Total time needed: 108 min
Result: Fits with 57 min buffer
```

## What To Show In UI

Each recommendation card should show:

- gap start and end time
- suggested task
- task location
- task priority
- total time needed
- remaining buffer

## Google Maps Future Integration

The current MVP uses mock travel times. Google Maps should later replace the mock travel table with real walking/driving/transit estimates.

Use Google Maps for:

- travel time from current location to task location
- travel time from task location to next fixed event
- opening directions to the suggested task location
