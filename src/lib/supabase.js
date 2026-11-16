import { createClient } from "@supabase/supabase-js";

// The anon key is public by design; row-level security on the database
// decides what each signed-in person may read or change.
export const SUPABASE_URL = "https://prxumouufckubwioywuz.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InByeHVtb3V1ZmNrdWJ3aW95d3V6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNDc2NTIsImV4cCI6MjA5NTgyMzY1Mn0.RpK8UmfzQhXVVuuVhsj5QH3HDhwT6RAm0ID0o_MqR7U";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: "hotzonex-auth" },
});
