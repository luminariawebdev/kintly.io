import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  'https://bqdkizavhlpswjtgxdjw.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxZGtpemF2aGxwc3dqdGd4ZGp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3ODQzMDYsImV4cCI6MjA5NDM2MDMwNn0.Oedpsru9CCbKihZ-azAu4Uj2MNOF2HGNRFGFM2f86Fg',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // gotrue's default cross-tab lock uses the Web Locks API, which can
      // DEADLOCK in some browser / embedded-webview contexts — leaving sign-in
      // stuck on "Signing in…" for minutes until an internal lock timeout
      // finally releases it. This app is effectively single-tab, so we don't
      // need cross-tab token-refresh coordination: a no-op lock that just runs
      // the section immediately sidesteps the stall entirely.
      lock: (_name, _acquireTimeout, fn) => fn(),
    },
  }
)
