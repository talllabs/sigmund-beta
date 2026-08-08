import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error(
    "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see .env.example). " +
      "The service role key is required because writes bypass row-level security.",
  );
}

export const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
});
