import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { createSupabaseAdmin } from '../_shared/auth.ts';

const tokenUrl = 'https://oauth2.googleapis.com/token';
const userInfoUrl = 'https://www.googleapis.com/oauth2/v2/userinfo';

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (!code || !state) {
    return jsonResponse({ error: 'Missing Google OAuth code or state' }, 400);
  }

  const [userId] = state.split(':');
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  const redirectUri = Deno.env.get('GOOGLE_REDIRECT_URI');

  if (!clientId || !clientSecret || !redirectUri) {
    return jsonResponse({ error: 'Google OAuth is not configured' }, 500);
  }

  const tokenResponse = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok) {
    return jsonResponse({ error: 'Google token exchange failed', details: tokenData }, 400);
  }

  const userInfoResponse = await fetch(userInfoUrl, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const userInfo = userInfoResponse.ok ? await userInfoResponse.json() : {};

  const supabase = createSupabaseAdmin();
  const expiresAt = tokenData.expires_in
    ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
    : null;

  const { error } = await supabase.from('oauth_connections').upsert({
    user_id: userId,
    provider: 'google_calendar',
    provider_user_id: userInfo.id || userInfo.email || null,
    access_token_encrypted: tokenData.access_token,
    refresh_token_encrypted: tokenData.refresh_token || null,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  }, {
    onConflict: 'user_id,provider',
  });

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  return new Response(
    '<html><body><h2>Google Calendar connected.</h2><p>You can return to DayRoute.</p></body></html>',
    {
      headers: {
        ...corsHeadersForHtml(),
        'Content-Type': 'text/html',
      },
    },
  );
});

const corsHeadersForHtml = () => ({
  'Access-Control-Allow-Origin': '*',
});
