// supabase/functions/_shared/src/repositories/ActivityRepository.ts
import { BaseRepository } from "./BaseRepository.ts";
import { ActivityRow } from "../types/index.ts";

export class ActivityRepository extends BaseRepository {
    async createLog(
        groupId: string,
        memberId: string | null,
        text: string,
        expiresAt: Date
    ): Promise<ActivityRow> {
        const { data, error } = await this.supabase
            .from("activities")
            .insert({
                group_id: groupId,
                member_id: memberId,
                raw_text: text,
                activity_type: "log",
                expires_at: expiresAt.toISOString(),
            })
            .select()
            .single();

        if (error) throw error;
        return data as ActivityRow;
    }

    async getTodayLogs(groupId: string): Promise<ActivityRow[]> {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const { data, error } = await this.supabase
            .from("activities")
            .select("*")
            .eq("group_id", groupId)
            .gte("created_at", today.toISOString())
            .order("created_at", { ascending: true });

        if (error) throw error;
        return (data as ActivityRow[]) || [];
    }
}
