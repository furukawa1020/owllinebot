// supabase/functions/line-webhook/src/services/BudgetStrategist.ts

import { UserProfile, FinancialStatus, FinancialHealthRank } from "../types/index.ts";
import { MealRepository } from "../repositories/MealRepository.ts";

export class BudgetStrategist {
    constructor(private mealRepo: MealRepository) { }

    async analyze(user: UserProfile): Promise<FinancialStatus> {
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth(); // 0-indexed

        // 1. Determine Budget Period (based on Payday)
        // If today < payday, we are in the period starting last month's payday.
        // If today >= payday, we are in the period starting this month's payday.
        let startOfPeriod = new Date(currentYear, currentMonth, user.payday);
        if (today.getDate() < user.payday) {
            startOfPeriod = new Date(currentYear, currentMonth - 1, user.payday);
        }

        // End of period is day before next payday
        const nextPayday = new Date(startOfPeriod);
        nextPayday.setMonth(nextPayday.getMonth() + 1);
        const endOfPeriod = new Date(nextPayday);
        endOfPeriod.setDate(endOfPeriod.getDate() - 1);

        // 2. Calculate Disposable Income
        // Income (Budget) - Fixed Costs - Savings Goal
        const disposableIncome = user.monthlyBudget - user.fixedCosts - user.savingsGoal;

        // 3. Fetch Meals in Period
        const meals = await this.mealRepo.getByDateRange(user.id, startOfPeriod, today);
        const totalSpent = meals.reduce((sum, m) => sum + (m.price || 0), 0);
        const remainingBudget = disposableIncome - totalSpent;

        // 4. Time Calculation
        const totalDays = Math.ceil((endOfPeriod.getTime() - startOfPeriod.getTime()) / (1000 * 60 * 60 * 24));
        const daysPassed = Math.ceil((today.getTime() - startOfPeriod.getTime()) / (1000 * 60 * 60 * 24));
        const daysRemaining = totalDays - daysPassed;

        // 5. Burn Rate Analysis
        const dailyBurnRate = daysPassed > 0 ? totalSpent / daysPassed : 0;
        const projectedEndBalance = disposableIncome - (dailyBurnRate * totalDays);

        // 6. Survival Days (How long until 0 at current rate?)
        const survivalDays = dailyBurnRate > 0 ? Math.floor(remainingBudget / dailyBurnRate) : 999;

        // 7. Health Rank
        let healthRank: FinancialHealthRank = "B";
        if (remainingBudget < 0) healthRank = "F";
        else if (projectedEndBalance < -5000) healthRank = "D"; // Will go broke
        else if (projectedEndBalance < 0) healthRank = "C"; // Slightly over
        else if (projectedEndBalance > user.savingsGoal * 0.5) healthRank = "A"; // Good buffer
        else if (projectedEndBalance > user.savingsGoal) healthRank = "S"; // Excellent

        // 8. Bankruptcy Date Prediction
        let bankruptcyDate: Date | null = null;
        if (projectedEndBalance < 0 && dailyBurnRate > 0) {
            const daysToRuin = Math.floor(remainingBudget / dailyBurnRate);
            bankruptcyDate = new Date(today);
            bankruptcyDate.setDate(today.getDate() + daysToRuin);
        }

        return {
            totalSpent,
            remainingBudget,
            dailyBurnRate,
            projectedEndBalance,
            survivalDays,
            healthRank,
            bankruptcyDate
        };
    }
}
