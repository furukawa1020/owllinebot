// supabase/functions/_shared/src/repositories/BaseRepository.ts
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export abstract class BaseRepository {
    constructor(protected supabase: SupabaseClient) { }
}
