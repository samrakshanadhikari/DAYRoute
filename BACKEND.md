# DayRoute Backend Plan

DayRoute's demo is local-first. The production backend should use Supabase for user accounts, saved schedules/tasks, secure OAuth token storage, and AI calls.

## Minimum Real Backend

### 1. Create Supabase Project

1. Create a project in Supabase.
2. Open the SQL Editor.
3. Run [`supabase/schema.sql`](supabase/schema.sql).
4. Copy the project URL and anon key into `.env.local`:

```bash
EXPO_PUBLIC_SUPABASE_URL=your_project_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

Do not commit `.env.local`.

### 2. User Login/Signup

Use Supabase Auth with email/password first. This is the simplest stable flow for the hackathon version.

User flow:

```text
Sign up / log in
↓
Load fixed_events and tasks for that user
↓
Save all schedule/task changes to Supabase
```

### 3. Save Tasks/Schedules

Tables:

- `profiles`
- `fixed_events`
- `tasks`
- `oauth_connections`

The app should map current local objects like this:

```text
weeklySchedule[Monday][0]
  -> fixed_events row

tasks[0]
  -> tasks row
```

Row Level Security is enabled so users can only read/write their own fixed events and tasks.

## OAuth Integrations

OAuth should happen in backend Edge Functions, not directly in the Expo app. The mobile app should never store provider client secrets.

### Google Calendar

```text
Expo app opens google-oauth-start
↓
Google login/consent
↓
google-oauth-callback receives code
↓
Edge Function exchanges code for tokens
↓
Encrypted tokens stored in oauth_connections
↓
Calendar events become fixed_events
```

Google Calendar Edge Function skeletons are included:

- `supabase/functions/google-oauth-start`
- `supabase/functions/google-oauth-callback`
- `supabase/functions/import-google-calendar`

Required Google setup:

1. Create a Google Cloud project.
2. Enable the Google Calendar API.
3. Configure OAuth consent screen.
4. Create a Web OAuth client.
5. Add this redirect URI:

```text
https://YOUR_SUPABASE_PROJECT_REF.supabase.co/functions/v1/google-oauth-callback
```

For this project ref, the redirect URI would be:

```text
https://xhirsjyzeatqbwyihplr.supabase.co/functions/v1/google-oauth-callback
```

Set Supabase function secrets:

```bash
supabase secrets set GOOGLE_CLIENT_ID=your_google_client_id
supabase secrets set GOOGLE_CLIENT_SECRET=your_google_client_secret
supabase secrets set GOOGLE_REDIRECT_URI=https://xhirsjyzeatqbwyihplr.supabase.co/functions/v1/google-oauth-callback
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

Deploy functions:

```bash
supabase functions deploy google-oauth-start
supabase functions deploy google-oauth-callback
supabase functions deploy import-google-calendar
```

Security note: the current skeleton stores token fields in `oauth_connections` columns named `access_token_encrypted` and `refresh_token_encrypted`. Before production, encrypt these with Supabase Vault or another server-side key management system.

### Outlook Calendar

Same pattern as Google, using Microsoft identity + Microsoft Graph Calendar API.

### Canvas

Same OAuth pattern if the school Canvas instance supports developer keys. Canvas assignments become `tasks` rows with `source = 'canvas'`.

## AI Agent Calls

AI calls should also happen from an Edge Function so `OPENAI_API_KEY` stays server-side.

Suggested endpoint:

```text
POST /functions/v1/ai-plan
```

Input:

```json
{
  "today": "Monday",
  "fixedEvents": [],
  "tasks": [],
  "location": {
    "latitude": 29.883,
    "longitude": -97.941
  }
}
```

Output:

```json
{
  "suggestions": [
    {
      "title": "Finish Data Structures Homework 4",
      "reason": "High priority, due today, and fits before your next event."
    }
  ]
}
```

## Presentation Wording

Use this wording:

> "The MVP demonstrates the workflow locally. The production backend uses Supabase Auth, Postgres, and Edge Functions to securely sync schedules/tasks and handle OAuth integrations with Canvas, Google Calendar, and Outlook. AI planning calls are server-side so API keys never ship in the mobile app."
