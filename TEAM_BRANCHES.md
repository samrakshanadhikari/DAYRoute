# Team Branch Plan

Use separate branches so everyone can work at the same time without overwriting each other.

## Branches

### `WeeklySchedule+TodayLogic`

Owner: Person 1

Scope:

- 7-day schedule data
- fixed events grouped by weekday
- automatic today detection
- selected day view
- Saturday/Sunday free-day behavior

### `RecommendationEngine`

Owner: Person 2

Scope:

- find open gaps between fixed events
- recommend tasks that fit inside each gap
- show total time needed
- show travel time before and after task
- show remaining buffer

### `UIPolishDemoFlow`

Owner: Person 3

Scope:

- improve layout and visual polish
- make the demo flow obvious
- improve cards, spacing, and labels
- make the app feel useful for students and adults

### `PresentationGoogleMapsStory`

Owner: Person 4

Scope:

- slides
- screenshots
- demo script
- Google Maps explanation
- Google Calendar future integration explanation

## Workflow

Start from the latest shared branch:

```bash
git checkout main
git pull
git checkout -b YourBranchName
```

Push your branch:

```bash
git push -u origin YourBranchName
```

Before demo time, merge completed branches into `main`:

```bash
git checkout main
git pull
git merge BranchName
git push
```
