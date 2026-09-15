import { createSupabaseAdmin, getUserFromRequest } from '../_shared/auth.ts';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

const calendarEventsUrl = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const tokenUrl = 'https://oauth2.googleapis.com/token';
const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const minutesSinceMidnight = (date: Date) => date.getHours() * 60 + date.getMinutes();

const refreshGoogleToken = async (refreshToken: string) => {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');

  if (!clientId || !clientSecret) {
    return { token: null, expiresAt: null, error: 'Google OAuth is not configured' };
  }

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    return { token: null, expiresAt: null, error: data.error_description || data.error || 'Refresh failed' };
  }

  return {
    token: data.access_token,
    expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : null,
    error: null,
  };
};

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const { user, error } = await getUserFromRequest(req);
  if (error || !user) {
    return jsonResponse({ error }, 401);
  }

  const supabase = createSupabaseAdmin();
  const { data: connection, error: connectionError } = await supabase
    .from('oauth_connections')
    .select('*')
    .eq('user_id', user.id)
    .eq('provider', 'google_calendar')
    .single();

  if (connectionError || !connection) {
    return jsonResponse({ error: 'Google Calendar is not connected yet' }, 400);
  }

  let accessToken = connection.access_token_encrypted;

  if (connection.expires_at && new Date(connection.expires_at).getTime() < Date.now() + 60_000 && connection.refresh_token_encrypted) {
    const refreshed = await refreshGoogleToken(connection.refresh_token_encrypted);
    if (refreshed.error || !refreshed.token) {
      return jsonResponse({ error: refreshed.error }, 400);
    }

    accessToken = refreshed.token;
    await supabase.from('oauth_connections').update({
      access_token_encrypted: refreshed.token,
      expires_at: refreshed.expiresAt,
      updated_at: new Date().toISOString(),
    }).eq('id', connection.id);
  }

  const now = new Date();
  const twoWeeksFromNow = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: twoWeeksFromNow.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '25',
  });

  const eventsResponse = await fetch(`${calendarEventsUrl}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const eventsData = await eventsResponse.json();
  if (!eventsResponse.ok) {
    return jsonResponse({ error: 'Google Calendar import failed', details: eventsData }, 400);
  }

  const fixedEvents = (eventsData.items || [])
    .filter((event: Record<string, any>) => event.start?.dateTime && event.end?.dateTime)
    .map((event: Record<string, any>) => {
      const start = new Date(event.start.dateTime);
      const end = new Date(event.end.dateTime);
      const durationMinutes = Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000));

      return {
        user_id: user.id,
        weekday: weekdays[start.getDay()],
        title: event.summary || 'Google Calendar event',
        starts_at_minutes: minutesSinceMidnight(start),
        duration_minutes: durationMinutes,
        location: event.location || 'No location set',
        source: 'Google Calendar',
        external_id: event.id,
        updated_at: new Date().toISOString(),
      };
    });

  if (!fixedEvents.length) {
    return jsonResponse({ imported: 0, message: 'No timed Google Calendar events found in the next 14 days' });
  }

  const { error: upsertError } = await supabase.from('fixed_events').upsert(fixedEvents, {
    onConflict: 'user_id,source,external_id',
  });

  if (upsertError) {
    return jsonResponse({ error: upsertError.message }, 500);
  }

  return jsonResponse({
    imported: fixedEvents.length,
    message: `Imported ${fixedEvents.length} Google Calendar events`,
  });
});
