// supabase/functions/line-webhook/src/services/MenuController.ts

import { MealRepository } from "../repositories/MealRepository.ts";
import { FinancialHealthRank, MenuSuggestion } from "../types/index.ts";

export class MenuController {
    constructor(private mealRepo: MealRepository) { }

    async getSuggestions(userId: string, healthRank: FinancialHealthRank): Promise<MenuSuggestion[]> {
        // 1. Strict Locking Logic (The "CFO" Hammer)
        if (healthRank === "F") {
            return [
                { label: "もやし炒め", reason: "破産確定です。これしか許しません。", isStrict: true },
                { label: "お水", reason: "0円です。生き延びてください。", isStrict: true },
                { label: "断食", reason: "胃を休めましょう（お金も休まります）。", isStrict: true }
            ];
        }

        if (healthRank === "D") {
            return [
                { label: "納豆ごはん", reason: "安くて栄養満点。今はこれです。", isStrict: true },
                { label: "うどん（素）", reason: "トッピングは贅沢です。", isStrict: true },
                { label: "豆腐", reason: "高タンパク低コスト。我慢の時です。", isStrict: true }
            ];
        }

        // 2. Standard Logic (S/A/B/C)
        const candidates = this.getCandidates(healthRank);

        // 3. Deduplication (Don't suggest what was eaten recently)
        const recentMeals = await this.mealRepo.getRecent(userId, 10);
        const recentLabels = new Set(recentMeals.map(m => m.label));

        const suggestions = candidates
            .filter(c => !recentLabels.has(c.label))
            .sort(() => 0.5 - Math.random()) // Shuffle
            .slice(0, 3);

        return suggestions;
    }

    private getCandidates(rank: FinancialHealthRank): MenuSuggestion[] {
        const common: MenuSuggestion[] = [
            { label: "カレー", reason: "定番だね！", isStrict: false },
            { label: "パスタ", reason: "手軽でいいよね！", isStrict: false },
            { label: "野菜炒め", reason: "野菜もとろう！", isStrict: false },
        ];

        if (rank === "S" || rank === "A") {
            return [
                ...common,
                { label: "焼肉", reason: "余裕があるから行っちゃう？🍖", isStrict: false },
                { label: "お寿司", reason: "ご褒美タイム！🍣", isStrict: false },
                { label: "デリバリー", reason: "たまには楽しよう！🍕", isStrict: false }
            ];
        }

        // Rank B/C (Standard)
        return [
            ...common,
            { label: "ハンバーグ", reason: "みんな大好き！", isStrict: false },
            { label: "唐揚げ", reason: "ご飯がすすむ！", isStrict: false },
            { label: "オムライス", reason: "卵料理はどう？", isStrict: false }
        ];
    }
}
