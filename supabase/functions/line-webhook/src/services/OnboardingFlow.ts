// supabase/functions/line-webhook/src/services/OnboardingFlow.ts

import { UserRepository } from "../repositories/UserRepository.ts";
import { OnboardingStatus } from "../types/index.ts";

export class OnboardingFlow {
    constructor(private userRepo: UserRepository) { }

    async handleInput(userId: string, text: string): Promise<string | null> {
        const user = await this.userRepo.getByLineId(userId);
        if (!user) return null; // Should be created before calling this

        const status = user.onboardingStatus;

        switch (status) {
            case "INIT":
                await this.userRepo.updateProfile(user.id, { onboardingStatus: "NAME" });
                return "やっほ〜！🍚 ごはん戦略家のこめこだよ！\nこれからあなたのお財布を徹底管理するね。\n\nまずは、あなたの**お名前（ニックネーム）**を教えて？";

            case "NAME":
                await this.userRepo.updateProfile(user.id, { nickname: text, onboardingStatus: "PAYDAY" });
                return `よろしくね、${text}さん！\n\n次は大事な質問。\n**お給料日は毎月何日**？（例：25）`;

            case "PAYDAY":
                const payday = parseInt(text);
                if (isNaN(payday) || payday < 1 || payday > 31) return "ちゃんと数字で教えて！1〜31の間だよ。（例：25）";
                await this.userRepo.updateProfile(user.id, { payday, onboardingStatus: "INCOME" });
                return "OK！\n\nじゃあ、**1ヶ月の手取り収入（ごはん予算に使える額）**はいくら？\n（例：200000）";

            case "INCOME":
                const income = parseInt(text);
                if (isNaN(income)) return "数字で教えてね！（例：200000）";
                await this.userRepo.updateProfile(user.id, { monthlyBudget: income, onboardingStatus: "FIXED_COSTS" });
                return "ふむふむ。\n\nそこから引かれる**毎月の固定費（家賃・サブスク・光熱費など）**の合計は？\n（例：80000）";

            case "FIXED_COSTS":
                const fixed = parseInt(text);
                if (isNaN(fixed)) return "数字で教えてね！（例：80000）";
                await this.userRepo.updateProfile(user.id, { fixedCosts: fixed, onboardingStatus: "SAVINGS_GOAL" });
                return "なるほどね…。\n\n最後に、**毎月これだけは絶対貯金したい！**って額はある？\n（例：30000）";

            case "SAVINGS_GOAL":
                const savings = parseInt(text);
                if (isNaN(savings)) return "数字で教えてね！（例：30000）";
                await this.userRepo.updateProfile(user.id, { savingsGoal: savings, onboardingStatus: "COMPLETE" });

                // Calculate initial disposable
                const disposable = user.monthlyBudget - user.fixedCosts - savings;
                return `設定完了！✨\n\nあなたの「自由に使えるごはん予算」は…\n**月 ${disposable}円** だね。\n\n今日からこめこが、この予算を死守するよ。\n覚悟してね！🔥\n\n（まずは「メニュー作って」と送ってみて！）`;

            case "COMPLETE":
                return null; // Already done
        }
        return null;
    }
}
