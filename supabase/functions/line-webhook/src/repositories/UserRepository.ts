// supabase/functions/line-webhook/src/repositories/UserRepository.ts

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { UserProfile, OnboardingStatus } from "../types/index.ts";

export class UserRepository {
    constructor(private sb: SupabaseClient) { }

    async getByLineId(lineUserId: string): Promise<UserProfile | null> {
        const { data } = await this.sb
            .from("users")
            .select("*")
            .eq("line_user_id", lineUserId)
            .maybeSingle();

        if (!data) return null;

        return {
            id: data.id,
            lineUserId: data.line_user_id,
            nickname: data.nickname,
            monthlyBudget: data.monthly_budget,
            payday: data.payday,
            fixedCosts: data.fixed_costs,
            savingsGoal: data.savings_goal,
            onboardingStatus: data.onboarding_status as OnboardingStatus,
        };
    }

    async create(lineUserId: string): Promise<UserProfile> {
        const { data } = await this.sb
            .from("users")
            .insert({
                line_user_id: lineUserId,
                monthly_budget: 30000, // Default
                onboarding_status: "INIT"
            })
            .select()
            .single();

        return {
            id: data.id,
            lineUserId: data.line_user_id,
            nickname: data.nickname,
            monthlyBudget: data.monthly_budget,
            payday: data.payday,
            fixedCosts: data.fixed_costs,
            savingsGoal: data.savings_goal,
            onboardingStatus: data.onboarding_status as OnboardingStatus,
        };
    }

    async updateProfile(userId: string, updates: Partial<UserProfile>) {
        // Map camelCase to snake_case
        const dbUpdates: any = {};
        if (updates.nickname !== undefined) dbUpdates.nickname = updates.nickname;
        if (updates.monthlyBudget !== undefined) dbUpdates.monthly_budget = updates.monthlyBudget;
        if (updates.payday !== undefined) dbUpdates.payday = updates.payday;
        if (updates.fixedCosts !== undefined) dbUpdates.fixed_costs = updates.fixedCosts;
        if (updates.savingsGoal !== undefined) dbUpdates.savings_goal = updates.savingsGoal;
        if (updates.onboardingStatus !== undefined) dbUpdates.onboarding_status = updates.onboardingStatus;

        await this.sb.from("users").update(dbUpdates).eq("id", userId);
    }
}
