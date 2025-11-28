// supabase/functions/_shared/src/utils/supabaseClient.ts
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const getSupabaseClient = (): SupabaseClient => {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        throw new Error("Missing Supabase environment variables");
    }

    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
};
