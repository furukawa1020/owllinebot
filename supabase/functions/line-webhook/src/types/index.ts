// supabase/functions/line-webhook/src/types/index.ts

// ==========================================
// 1. LINE Platform Types
// ==========================================

export type LineEvent = {
    type: string;
    replyToken?: string;
    source: {
        type: "user" | "group" | "room";
        userId?: string;
        groupId?: string;
        roomId?: string;
    };
    message?: {
        type: "text" | "image" | "audio";
        id: string;
        text: string;
    };
    postback?: {
        data: string;
    };
};

// ==========================================
// 2. Domain Entities
// ==========================================

export type OnboardingStatus =
    | "INIT"
    | "NAME"
    | "PAYDAY"
    | "INCOME"
    | "FIXED_COSTS"
    | "SAVINGS_GOAL"
    | "COMPLETE";

export interface UserProfile {
    id: string;
    lineUserId: string;
    nickname: string | null;
    monthlyBudget: number;
    payday: number; // 1-31
    fixedCosts: number;
    savingsGoal: number;
    onboardingStatus: OnboardingStatus;
}

export type TimeSlot = "morning" | "noon" | "evening" | "snack";

export interface MealLog {
    id: string;
    userId: string;
    groupId: string | null;
    label: string;
    price: number | null;
    timeSlot: TimeSlot;
    rawText: string;
    createdAt: Date;
}

// ==========================================
// 3. Strategic Types (CFO Logic)
// ==========================================

export type FinancialHealthRank = "S" | "A" | "B" | "C" | "D" | "F";

export interface FinancialStatus {
    totalSpent: number;
    remainingBudget: number;
    dailyBurnRate: number; // Average spent per day
    projectedEndBalance: number; // Forecasted balance at end of month
    survivalDays: number; // Days until budget hits 0 at current rate
    healthRank: FinancialHealthRank;
    bankruptcyDate: Date | null; // Predicted date of ruin
}

export interface MenuSuggestion {
    label: string;
    reason: string; // e.g., "Cheap", "Healthy", "You love this"
    isStrict: boolean; // If true, this is a forced option (e.g. "Bean Sprouts")
}
