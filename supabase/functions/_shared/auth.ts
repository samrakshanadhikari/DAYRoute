import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const createSupabaseAdmin = () => createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

export const getUserFromRequest = async (req: Request) => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return { user: null, error: 'Missing Authorization header' };

  const supabase = createSupabaseAdmin();
  const token = authHeader.replace('Bearer ', '');
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return { user: null, error: error?.message || 'Invalid session' };
  }

  return { user: data.user, error: null };
};
