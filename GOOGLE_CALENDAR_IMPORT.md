# Google Calendar Import Demo

This branch adds a demo-friendly Google Calendar import flow.

## What It Does Now

The app shows an **Import** button in the Google Calendar import card.

When tapped, it:

1. Loads sample Google Calendar events.
2. Merges them into the weekly fixed schedule.
3. Avoids duplicate imports by checking event IDs.
4. Shows `Imported 6 fixed events`.
5. Keeps the recommendation engine working with the imported fixed events.

## Why Demo Mode

Real Google Calendar sync requires OAuth setup:

- Google Cloud project
- OAuth consent screen
- Google Calendar API enabled
- Calendar API scopes
- mobile-safe auth flow

For the hackathon/demo, this branch shows the user experience without risking OAuth setup issues.

## Production Version

In production, the sample data in `demoGoogleCalendarEvents` should be replaced by events returned from the Google Calendar API.

Each calendar event should map into DayRoute's fixed event shape:

```js
{
  id: googleEvent.id,
  title: googleEvent.summary,
  startsAt: minutesFromStartTime,
  duration: eventDurationMinutes,
  location: googleEvent.location || defaultLocation,
  fixed: true,
  source: 'Google Calendar'
}
```
