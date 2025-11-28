// supabase/functions/_shared/src/services/GamificationService.ts
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export class GamificationService {
    constructor(private supabase: SupabaseClient) { }

    async updateStreak(userId: string): Promise<{ current: number; isNewRecord: boolean }> {
        const today = new Date().toISOString().split('T')[0];

        // Get current streak
        const { data: streakRow } = await this.supabase
            .from("streaks")
            .select("*")
            .eq("user_id", userId)
            .maybeSingle();

        if (!streakRow) {
            // First time
            await this.supabase.from("streaks").insert({
                user_id: userId,
                current_streak: 1,
                longest_streak: 1,
                last_activity_date: today
            });
            return { current: 1, isNewRecord: true };
        }

        const lastDate = new Date(streakRow.last_activity_date);
        const currentDate = new Date(today);
        const diffTime = Math.abs(currentDate.getTime() - lastDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        let newCurrent = streakRow.current_streak;

        if (diffDays === 0) {
            // Same day, do nothing
            return { current: newCurrent, isNewRecord: false };
        } else if (diffDays === 1) {
            // Consecutive day
            newCurrent++;
        } else {
            // Streak broken
            newCurrent = 1;
        }

        const isNewRecord = newCurrent > streakRow.longest_streak;
        const newLongest = isNewRecord ? newCurrent : streakRow.longest_streak;

        await this.supabase
            .from("streaks")
            .update({
                current_streak: newCurrent,
                longest_streak: newLongest,
                last_activity_date: today,
                updated_at: new Date().toISOString()
            })
            .eq("user_id", userId);

        return { current: newCurrent, isNewRecord };
    }

    async checkAndAwardBadges(userId: string, context: { logCount: number, currentStreak: number }): Promise<string[]> {
        const newBadges: string[] = [];

        // Check First Log
        if (context.logCount === 1) {
            await this.awardBadge(userId, 'first_log', newBadges);
        }

        // Check Streak 3
        if (context.currentStreak >= 3) {
            await this.awardBadge(userId, 'streak_3', newBadges);
        }

        // Check Early Bird (Time based)
        const hour = new Date().getHours();
        if (hour < 6) {
            await this.awardBadge(userId, 'early_bird', newBadges);
        }

        return newBadges;
    }

    private async awardBadge(userId: string, badgeId: string, newBadges: string[]) {
        // Check if already has badge
        const { data } = await this.supabase
            .from("user_badges")
            .select("id")
            .eq("user_id", userId)
            .eq("badge_id", badgeId)
            .maybeSingle();

        if (!data) {
            await this.supabase.from("user_badges").insert({
                user_id: userId,
                badge_id: badgeId
            });
            newBadges.push(badgeId);
        }
    }
}
