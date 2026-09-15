import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { getUserFromRequest } from '../_shared/auth.ts';

const googleAuthUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
const scopes = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'openid',
  'email',
  'profile',
];

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

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const redirectUri = Deno.env.get('GOOGLE_REDIRECT_URI');

  if (!clientId || !redirectUri) {
    return jsonResponse({ error: 'Google OAuth is not configured' }, 500);
  }

  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: scopes.join(' '),
    state: `${user.id}:${state}`,
  });

  return jsonResponse({
    url: `${googleAuthUrl}?${params.toString()}`,
  });
});
