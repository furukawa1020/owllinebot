// supabase/functions/line-webhook/src/repositories/MealRepository.ts

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { MealLog, TimeSlot } from "../types/index.ts";

export class MealRepository {
    constructor(private sb: SupabaseClient) { }

    async add(userId: string, groupId: string | null, label: string, price: number | null, timeSlot: TimeSlot, rawText: string) {
        await this.sb.from("meals").insert({
            user_id: userId,
            group_id: groupId,
            label,
            price,
            time_slot: timeSlot,
            raw_text: rawText
        });
    }

    async getByDateRange(userId: string, startDate: Date, endDate: Date): Promise<MealLog[]> {
        const { data } = await this.sb
            .from("meals")
            .select("*")
            .eq("user_id", userId)
            .gte("created_at", startDate.toISOString())
            .lte("created_at", endDate.toISOString())
            .order("created_at", { ascending: true });

        return (data || []).map((d: any) => ({
            id: d.id,
            userId: d.user_id,
            groupId: d.group_id,
            label: d.label,
            price: d.price,
            timeSlot: d.time_slot,
            rawText: d.raw_text,
            createdAt: new Date(d.created_at)
        }));
    }

    async getRecent(userId: string, limit: number = 10): Promise<MealLog[]> {
        const { data } = await this.sb
            .from("meals")
            .select("*")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(limit);

        return (data || []).map((d: any) => ({
            id: d.id,
            userId: d.user_id,
            groupId: d.group_id,
            label: d.label,
            price: d.price,
            timeSlot: d.time_slot,
            rawText: d.raw_text,
            createdAt: new Date(d.created_at)
        }));
    }
}
