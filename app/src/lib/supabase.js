import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  'https://bqdkizavhlpswjtgxdjw.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxZGtpemF2aGxwc3dqdGd4ZGp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3ODQzMDYsImV4cCI6MjA5NDM2MDMwNn0.Oedpsru9CCbKihZ-azAu4Uj2MNOF2HGNRFGFM2f86Fg'
)
