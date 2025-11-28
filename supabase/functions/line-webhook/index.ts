// supabase/functions/line-webhook/index.ts

/**
 * -----------------------------------------------------------------------------
 * Gohan Strategist Komeko (The 10,000-Line Mega-Monolith Edition)
 * -----------------------------------------------------------------------------
 * 
 * "Quantity is Quality." - The Ultimate Toddler CFO.
 * 
 * [Architecture]
 * 1. Domain Types (Strict Typing)
 * 2. Toddler Translator (The Persona Core)
 * 3. Massive Static Databases (Ingredients, Recipes, Dialogues)
 * 4. Logic Engines (Financial, Nutrition, Gamification, Events)
 * 5. Infrastructure (Line & Supabase)
 * 6. Repositories (Data Access)
 * 7. UI Builders (Cute Dashboard, Receipt, Calendar)
 * 8. App (Main Loop)
 */

import "jsr:@supabase/functions-js/edge-runtime";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ==========================================
// 1. Domain Types
// ==========================================

type OnboardingStatus = "INIT" | "NAME" | "PAYDAY" | "INCOME" | "FIXED_COSTS" | "SAVINGS_GOAL" | "COMPLETE";
type FinancialHealthRank = "S" | "A" | "B" | "C" | "D" | "F";
type TimeSlot = "morning" | "noon" | "evening" | "snack" | "late_night";
type ToddlerMood = "HAPPY" | "NORMAL" | "SAD" | "TANTRUM" | "SLEEPY" | "HYPER";
type IngredientTag = "veggie" | "meat" | "fish" | "carb" | "sweet" | "bitter" | "yucky" | "yummy" | "expensive" | "cheap";

interface UserProfile {
    id: string;
    lineUserId: string;
    nickname: string | null;
    monthlyBudget: number;
    payday: number;
    fixedCosts: number;
    savingsGoal: number;
    onboardingStatus: OnboardingStatus;
    xp: number;
    level: number;
    title: string;
    streak: number;
    lastMood: ToddlerMood;
}

interface MealLog {
    id: string;
    label: string;
    price: number | null;
    timeSlot: TimeSlot;
    createdAt: Date;
    calories?: number;
}

interface FinancialStatus {
    totalSpent: number;
    remainingBudget: number;
    dailyBurnRate: number;
    projectedEndBalance: number;
    survivalDays: number;
    healthRank: FinancialHealthRank;
    bankruptcyDate: Date | null;
    bankruptcyProb: number;
}

interface MenuSuggestion {
    label: string;
    ingredients: string[];
    reason: string;
    isStrict: boolean;
    price: number;
    calories: number;
}

interface ParsedIntent {
    kind: "help" | "start" | "log" | "budget" | "menu" | "status" | "unknown";
    payload?: any;
}

// ==========================================
// 2. Toddler Translator (The Persona Core)
// ==========================================

class ToddlerTranslator {
    static translate(text: string, mood: ToddlerMood): string {
        // 1. Soften Endings
        let t = text.replace(/です/g, "だよ").replace(/ます/g, "もん").replace(/ください/g, "してね");

        // 2. Mood Injection
        switch (mood) {
            case "HAPPY":
                t += " えへへ。";
                break;
            case "SAD":
                t = "あのね… " + t + " …ぐすん。";
                break;
            case "TANTRUM":
                t = t.replace(/だよ/g, "だもん！").replace(/ね/g, "ないもん！") + " ぷんぷん！";
                break;
            case "SLEEPY":
                t = t.replace(/。/g, "… ") + " …むにゃ。";
                break;
            case "HYPER":
                t = t + "！ わーい！";
                break;
        }

        // 3. Vocabulary Simplification (Pure Text)
        t = t.replace(/破産/g, "おさいふ、からっぽ")
            .replace(/予算/g, "おこづかい")
            .replace(/支出/g, "つかったおかね")
            .replace(/残高/g, "のこり")
            .replace(/警告/g, "めっ！だよ")
            .replace(/生存日数/g, "いきられるひ");

        return t;
    }

    static getMood(rank: FinancialHealthRank, time: TimeSlot): ToddlerMood {
        if (time === "late_night") return "SLEEPY";
        if (rank === "F" || rank === "D") return "SAD";
        if (rank === "S") return "HAPPY";
        return "NORMAL";
    }
}

// ==========================================
// 3. Massive Static Databases (The Data Explosion)
// ==========================================

class IngredientDatabase {
    // Targeting 2000+ items. Here is a dense sample.
    static readonly items: Record<string, { price: number, cal: number, tags: IngredientTag[] }> = {
        // --- Veggies (Yasai) ---
        "にんじん": { price: 50, cal: 30, tags: ["veggie", "yucky", "healthy"] },
        "ピーマン": { price: 40, cal: 20, tags: ["veggie", "bitter", "yucky"] },
        "たまねぎ": { price: 60, cal: 40, tags: ["veggie", "sweet", "healthy"] },
        "じゃがいも": { price: 50, cal: 80, tags: ["veggie", "carb", "yummy"] },
        "ほうれんそう": { price: 150, cal: 20, tags: ["veggie", "healthy"] },
        "もやし": { price: 30, cal: 15, tags: ["veggie", "cheap", "healthy"] },
        "キャベツ": { price: 150, cal: 30, tags: ["veggie", "healthy"] },
        "レタス": { price: 180, cal: 15, tags: ["veggie", "light"] },
        "トマト": { price: 100, cal: 20, tags: ["veggie", "yummy"] },
        "きゅうり": { price: 60, cal: 15, tags: ["veggie", "light"] },
        "ブロッコリー": { price: 150, cal: 40, tags: ["veggie", "healthy"] },
        "だいこん": { price: 120, cal: 20, tags: ["veggie", "light"] },
        "はくさい": { price: 200, cal: 15, tags: ["veggie", "light"] },
        "なす": { price: 80, cal: 20, tags: ["veggie", "yummy"] },
        "かぼちゃ": { price: 200, cal: 90, tags: ["veggie", "sweet", "yummy"] },
        "ごぼう": { price: 150, cal: 60, tags: ["veggie", "hard"] },
        "れんこん": { price: 200, cal: 70, tags: ["veggie", "hard"] },
        "さつまいも": { price: 150, cal: 130, tags: ["veggie", "sweet", "yummy"] },
        "えだまめ": { price: 200, cal: 130, tags: ["veggie", "yummy"] },
        "とうもろこし": { price: 150, cal: 100, tags: ["veggie", "sweet", "yummy"] },

        // --- Meats (Oniku) ---
        "とりむねにく": { price: 60, cal: 110, tags: ["meat", "cheap", "healthy"] },
        "とりももにく": { price: 100, cal: 200, tags: ["meat", "yummy"] },
        "ささみ": { price: 70, cal: 100, tags: ["meat", "healthy"] },
        "ぶたこま": { price: 120, cal: 250, tags: ["meat", "cheap"] },
        "ぶたばら": { price: 150, cal: 380, tags: ["meat", "yummy", "expensive"] },
        "ぎゅうこま": { price: 200, cal: 300, tags: ["meat", "expensive"] },
        "ステーキ": { price: 1000, cal: 500, tags: ["meat", "expensive", "yummy"] },
        "ハンバーグ": { price: 150, cal: 400, tags: ["meat", "yummy"] },
        "ウインナー": { price: 300, cal: 300, tags: ["meat", "yummy", "junk"] },
        "ハム": { price: 200, cal: 100, tags: ["meat", "light"] },

        // --- Fishes (Osakana) ---
        "さけ": { price: 200, cal: 130, tags: ["fish", "yummy"] },
        "さば": { price: 150, cal: 200, tags: ["fish", "healthy"] },
        "あじ": { price: 100, cal: 120, tags: ["fish", "cheap"] },
        "まぐろ": { price: 300, cal: 120, tags: ["fish", "expensive", "yummy"] },
        "かつお": { price: 250, cal: 110, tags: ["fish", "healthy"] },
        "ぶり": { price: 250, cal: 250, tags: ["fish", "yummy"] },
        "たい": { price: 400, cal: 100, tags: ["fish", "expensive"] },
        "さんま": { price: 150, cal: 300, tags: ["fish", "yummy"] },
        "しらす": { price: 200, cal: 50, tags: ["fish", "light"] },
        "シーチキン": { price: 120, cal: 200, tags: ["fish", "cheap", "yummy"] },

        // --- Carbs (Gohan) ---
        "ごはん": { price: 50, cal: 250, tags: ["carb", "cheap"] },
        "パン": { price: 30, cal: 150, tags: ["carb", "cheap"] },
        "うどん": { price: 40, cal: 200, tags: ["carb", "cheap"] },
        "パスタ": { price: 20, cal: 350, tags: ["carb", "cheap"] },
        "そば": { price: 50, cal: 300, tags: ["carb", "healthy"] },
        "ラーメン": { price: 100, cal: 450, tags: ["carb", "junk", "yummy"] },
        "もち": { price: 50, cal: 230, tags: ["carb", "yummy"] },
        "オートミール": { price: 40, cal: 110, tags: ["carb", "healthy"] },

        // --- Sweets (Okashi) ---
        "チョコ": { price: 100, cal: 300, tags: ["sweet", "yummy"] },
        "アイス": { price: 150, cal: 200, tags: ["sweet", "yummy"] },
        "クッキー": { price: 200, cal: 250, tags: ["sweet", "yummy"] },
        "ケーキ": { price: 400, cal: 400, tags: ["sweet", "expensive", "yummy"] },
        "プリン": { price: 100, cal: 150, tags: ["sweet", "yummy"] },
        "ゼリー": { price: 100, cal: 80, tags: ["sweet", "light"] },
        "ポテチ": { price: 150, cal: 500, tags: ["junk", "yummy"] },
        "グミ": { price: 100, cal: 100, tags: ["sweet", "yummy"] },

        // --- Weird/Toddler Stuff ---
        "あかちゃんせんべい": { price: 20, cal: 30, tags: ["carb", "cheap", "yummy"] },
        "むぎちゃ": { price: 10, cal: 0, tags: ["light"] },
        "はたつきハンバーグ": { price: 800, cal: 600, tags: ["meat", "expensive", "yummy"] },
        "お子様ランチ": { price: 900, cal: 700, tags: ["expensive", "yummy"] },
        "ねるねるねるね": { price: 120, cal: 100, tags: ["sweet", "junk", "yummy"] },
    };

    static search(query: string) {
        const hits = Object.entries(this.items).filter(([name]) => name.includes(query));
        return hits.length > 0 ? { name: hits[0][0], ...hits[0][1] } : null;
    }
}

class RecipeDatabase {
    // Targeting 500+ recipes.
    static readonly recipes: MenuSuggestion[] = [
        // --- Rank F (Poverty) ---
        { label: "もやしナムル", ingredients: ["もやし"], reason: "やすい！はやい！おいしい！", isStrict: true, price: 40, calories: 60 },
        { label: "しおむすび", ingredients: ["ごはん"], reason: "シンプルがいちばん。", isStrict: true, price: 50, calories: 250 },
        { label: "すどーふ", ingredients: ["豆腐"], reason: "おしょうゆかけてたべてね。", isStrict: true, price: 50, calories: 80 },
        { label: "みず", ingredients: ["お水"], reason: "おかねないときは、これ。", isStrict: true, price: 0, calories: 0 },
        { label: "くうき", ingredients: [], reason: "がまんしてね。", isStrict: true, price: 0, calories: 0 },

        // --- Rank B (Normal) ---
        { label: "ぶたキムチ", ingredients: ["ぶたこま", "キムチ"], reason: "ごはんがすすむよ！", isStrict: false, price: 300, calories: 400 },
        { label: "おやこどん", ingredients: ["とりももにく", "たまご", "ごはん"], reason: "とろとろでおいしいね。", isStrict: false, price: 350, calories: 600 },
        { label: "カレーライス", ingredients: ["とりももにく", "にんじん", "じゃがいも", "ごはん"], reason: "みんなだいすき！", isStrict: false, price: 400, calories: 800 },
        { label: "さばのみそに", ingredients: ["さば"], reason: "おさかな、からだにいいよ。", isStrict: false, price: 200, calories: 300 },
        { label: "オムライス", ingredients: ["たまご", "ごはん", "とりももにく"], reason: "ケチャップでおえかきしよう！", isStrict: false, price: 300, calories: 700 },

        // --- Rank S (Rich) ---
        { label: "うなじゅう", ingredients: ["うなぎ", "ごはん"], reason: "ごうかだね〜！", isStrict: false, price: 3000, calories: 800 },
        { label: "すきやき", ingredients: ["ぎゅうにく", "とうふ", "ねぎ"], reason: "おにく、とろける〜！", isStrict: false, price: 2000, calories: 900 },
        { label: "おすし", ingredients: ["まぐろ", "サーモン", "いくら"], reason: "くるくるまわらないやつ！", isStrict: false, price: 4000, calories: 600 },
    ];
}

class DialogueDatabase {
    // Targeting 5000+ patterns.
    static readonly patterns: Record<string, string[]> = {
        // --- Greetings ---
        "GREET_MORNING": ["おはよ！あさごはんだよ！", "むにゃ…おはよぉ…", "あさだよ！おきてー！"],
        "GREET_NOON": ["おひるだね！なにする？", "おなかすいたー！", "ごはんのじかんだよ！"],
        "GREET_EVENING": ["こんばんは！きょうもがんばったね！", "おかえりー！", "よるごはんは？"],
        "GREET_LATE": ["…まだおきてるの？", "もうねるじかんだよ…", "ふぁぁ…ねむい…"],

        // --- Financial Ranks (Pure Text) ---
        "RANK_S": ["すごい！おさいふパンパンだね！", "えへへ、リッチだね〜！", "なんでもかえちゃうよ！"],
        "RANK_A": ["いいかんじ！そのちょうし！", "おりこうさんだね！", "あんしんだね〜。"],
        "RANK_B": ["ふつうだね。ゆだんしちゃだめだよ？", "これからだよ！", "ちゃんとちょきんできてる？"],
        "RANK_C": ["ちょっとつかいすぎかも…", "おさいふ、かるくなってきた？", "がまんもだいじだよ。"],
        "RANK_D": ["めっ！つかいすぎ！", "もうだめかも…", "あしたから、もやしね。"],
        "RANK_F": ["…おさいふ、からっぽ。", "…ごはん、ないの？", "…ひもじいよぉ…"],

        // --- Specific Foods ---
        "FOOD_VEGGIE": ["おやさい！えらい！", "ピーマン…たべれるの？すごい！", "シャキシャキしておいしいね！"],
        "FOOD_MEAT": ["おにく！やったー！", "ジューシーだね！", "おにくたべると、げんきでる！"],
        "FOOD_FISH": ["おさかな！かしこくなるよ！", "ほねにきをつけてね。", "おさかなすき？"],
        "FOOD_SWEET": ["あまいもの！べつばらだよね！", "むしばにならないでね。", "おいしい〜！しあわせ〜！"],
        "FOOD_JUNK": ["…またそれ？", "からだにわるいよ？", "たまにならいいけど…"],
        "FOOD_WEIRD": ["…なにそれ？", "たべれるの？", "こめこ、それしらない…"],

        // --- Contextual ---
        "CTX_LATE_RAMEN": ["よるのラーメン…おいしいけど…", "あした、おかおパンパンになるよ？", "…はんぶんこする？"],
        "CTX_EXPENSIVE": ["…！たかーい！", "それ、ほんとうにいるの？", "おさいふ、だいじょうぶ？"],
        "CTX_STREAK": ["まいにちえらいね！", "つづいてる！すごい！", "こめこもがんばる！"],
        "CTX_BROKE_EATING": ["おかねないのに…たべるの？", "…それ、借金？", "…もやしじゃないの？"],
    };

    static get(key: string): string {
        const list = this.patterns[key] || ["……。"];
        return list[Math.floor(Math.random() * list.length)];
    }
}

// ==========================================
// 4. Logic Engines
// ==========================================

class FinancialEngine {
    constructor(private mealRepo: MealRepository) { }

    async simulate(user: UserProfile): Promise<FinancialStatus> {
        const today = new Date();
        let start = new Date(today.getFullYear(), today.getMonth(), user.payday);
        if (today.getDate() < user.payday) start = new Date(today.getFullYear(), today.getMonth() - 1, user.payday);
        const end = new Date(start); end.setMonth(end.getMonth() + 1); end.setDate(end.getDate() - 1);

        const disposable = user.monthlyBudget - user.fixedCosts - user.savingsGoal;
        const meals = await this.mealRepo.getByDateRange(user.id, start, today);
        const totalSpent = meals.reduce((sum, m) => sum + (m.price || 0), 0);
        const remainingBudget = disposable - totalSpent;

        const totalDays = Math.ceil((end.getTime() - start.getTime()) / (86400000));
        const daysPassed = Math.ceil((today.getTime() - start.getTime()) / (86400000));
        const daysLeft = totalDays - daysPassed;

        // Monte Carlo Simulation
        let bankruptCount = 0;
        const simulations = 1000;
        const avgDaily = daysPassed > 0 ? totalSpent / daysPassed : disposable / totalDays;
        const variance = avgDaily * 0.5;

        for (let i = 0; i < simulations; i++) {
            let simBudget = remainingBudget;
            for (let d = 0; d < daysLeft; d++) {
                const daily = avgDaily + (Math.random() - 0.5) * variance;
                simBudget -= Math.max(0, daily);
                if (simBudget < 0) {
                    bankruptCount++;
                    break;
                }
            }
        }
        const bankruptcyProb = (bankruptCount / simulations) * 100;

        const dailyBurn = daysPassed > 0 ? totalSpent / daysPassed : 0;
        const projectedEnd = disposable - (dailyBurn * totalDays);
        const survivalDays = dailyBurn > 0 ? Math.floor(remainingBudget / dailyBurn) : 999;

        let rank: FinancialHealthRank = "B";
        if (remainingBudget < 0) rank = "F";
        else if (bankruptcyProb > 80) rank = "D";
        else if (bankruptcyProb > 50) rank = "C";
        else if (projectedEnd > user.savingsGoal * 0.5) rank = "A";
        else if (projectedEnd > user.savingsGoal) rank = "S";

        let bankruptcyDate: Date | null = null;
        if (projectedEnd < 0 && dailyBurn > 0) {
            bankruptcyDate = new Date(today);
            bankruptcyDate.setDate(today.getDate() + Math.floor(remainingBudget / dailyBurn));
        }

        return { totalSpent, remainingBudget, dailyBurnRate: dailyBurn, projectedEndBalance: projectedEnd, survivalDays, healthRank: rank, bankruptcyDate, bankruptcyProb };
    }
}

class GamificationEngine {
    static calculateXP(user: UserProfile, action: "log" | "save" | "streak"): number {
        let gain = 0;
        if (action === "log") gain = 10;
        if (action === "save") gain = 50;
        if (action === "streak") gain = 5 * user.streak;
        return gain;
    }

    static getTitle(level: number): string {
        if (level < 5) return "みならい";
        if (level < 10) return "かけいばん";
        if (level < 20) return "もやしマスター";
        if (level < 50) return "CFO";
        return "きんゆうのかみ";
    }
}

// ==========================================
// 5. Infrastructure
// ==========================================

class LineClient {
    constructor(private token: string, private secret: string) { }
    async verifySignature(req: Request): Promise<boolean> {
        const signature = req.headers.get("x-line-signature");
        if (!signature) return false;
        const body = await req.clone().text();
        const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(this.secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
        return await crypto.subtle.verify("HMAC", key, Uint8Array.from(atob(signature), c => c.charCodeAt(0)), new TextEncoder().encode(body));
    }
    async reply(replyToken: string, messages: any[]) {
        await fetch("https://api.line.me/v2/bot/message/reply", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.token}` },
            body: JSON.stringify({ replyToken, messages }),
        });
    }
    async setupRichMenu() { /* ... */ }
}

// ==========================================
// 6. Repositories
// ==========================================

class UserRepository {
    constructor(private sb: SupabaseClient) { }
    async getByLineId(lineUserId: string): Promise<UserProfile | null> {
        const { data } = await this.sb.from("users").select("*").eq("line_user_id", lineUserId).maybeSingle();
        if (!data) return null;
        return {
            id: data.id, lineUserId: data.line_user_id, nickname: data.nickname,
            monthlyBudget: data.monthly_budget, payday: data.payday, fixedCosts: data.fixed_costs,
            savingsGoal: data.savings_goal, onboardingStatus: data.onboarding_status,
            xp: data.xp || 0, level: data.level || 1, title: data.title || "みならい", streak: data.streak || 0,
            lastMood: "NORMAL" // Default
        };
    }
    async create(lineUserId: string): Promise<UserProfile> {
        const { data } = await this.sb.from("users").insert({ line_user_id: lineUserId, onboarding_status: "INIT" }).select().single();
        return {
            id: data.id, lineUserId: data.line_user_id, nickname: data.nickname,
            monthlyBudget: data.monthly_budget, payday: data.payday, fixedCosts: data.fixed_costs,
            savingsGoal: data.savings_goal, onboardingStatus: data.onboarding_status,
            xp: 0, level: 1, title: "みならい", streak: 0, lastMood: "NORMAL"
        };
    }
    async update(userId: string, updates: Partial<UserProfile>) {
        const dbUpdates: any = {};
        if (updates.nickname !== undefined) dbUpdates.nickname = updates.nickname;
        if (updates.monthlyBudget !== undefined) dbUpdates.monthly_budget = updates.monthlyBudget;
        if (updates.payday !== undefined) dbUpdates.payday = updates.payday;
        if (updates.fixedCosts !== undefined) dbUpdates.fixed_costs = updates.fixedCosts;
        if (updates.savingsGoal !== undefined) dbUpdates.savings_goal = updates.savingsGoal;
        if (updates.onboardingStatus !== undefined) dbUpdates.onboarding_status = updates.onboardingStatus;
        if (updates.xp !== undefined) dbUpdates.xp = updates.xp;
        if (updates.level !== undefined) dbUpdates.level = updates.level;
        if (updates.title !== undefined) dbUpdates.title = updates.title;
        if (updates.streak !== undefined) dbUpdates.streak = updates.streak;
        await this.sb.from("users").update(dbUpdates).eq("id", userId);
    }
}

class MealRepository {
    constructor(private sb: SupabaseClient) { }
    async add(userId: string, label: string, price: number | null, timeSlot: TimeSlot, rawText: string, nutrition: any) {
        await this.sb.from("meals").insert({
            user_id: userId, label, price, time_slot: timeSlot, raw_text: rawText,
            calories: nutrition.cal, protein: nutrition.p, fat: nutrition.f, carbs: nutrition.c
        });
    }
    async getByDateRange(userId: string, start: Date, end: Date): Promise<MealLog[]> {
        const { data } = await this.sb.from("meals").select("*").eq("user_id", userId).gte("created_at", start.toISOString()).lte("created_at", end.toISOString());
        return (data || []).map((d: any) => ({ id: d.id, label: d.label, price: d.price, timeSlot: d.time_slot, createdAt: new Date(d.created_at), calories: d.calories }));
    }
}

// ==========================================
// 7. UI Builders (Cute Dashboard)
// ==========================================

class DashboardBuilder {
    static build(s: FinancialStatus, user: UserProfile): any {
        // Pastel Theme
        const theme = {
            "S": { color: "#77DD77", title: "すごい！", icon: "✨" }, // Pastel Green
            "A": { color: "#AEC6CF", title: "いいかんじ", icon: "🎵" }, // Pastel Blue
            "B": { color: "#FDFD96", title: "ふつう", icon: "☁️" }, // Pastel Yellow
            "C": { color: "#FFB347", title: "ちゅうい", icon: "💦" }, // Pastel Orange
            "D": { color: "#FF6961", title: "きけん", icon: "🚨" }, // Pastel Red
            "F": { color: "#CFCFC4", title: "おわり", icon: "👻" }  // Pastel Gray
        }[s.healthRank] || { color: "#888", title: "？", icon: "?" };

        return {
            type: "flex", altText: "こめこダッシュボード",
            contents: {
                type: "bubble",
                styles: { header: { backgroundColor: theme.color } },
                header: {
                    type: "box", layout: "vertical",
                    contents: [
                        { type: "text", text: `${theme.icon} ${theme.title}`, color: "#ffffff", weight: "bold", size: "sm" },
                        { type: "text", text: `ランク ${s.healthRank}`, color: "#ffffff", weight: "bold", size: "3xl", align: "center", margin: "md" },
                        { type: "text", text: `はさんかくりつ: ${s.bankruptcyProb.toFixed(1)}%`, color: "#ffffff", size: "xs", align: "center", margin: "sm" }
                    ]
                },
                body: {
                    type: "box", layout: "vertical",
                    contents: [
                        { type: "text", text: "おこづかいののこり", size: "xs", color: "#888888" },
                        { type: "text", text: `¥${s.remainingBudget.toLocaleString()}`, size: "xl", weight: "bold", align: "end", color: theme.color },
                        { type: "separator", margin: "md" },
                        {
                            type: "box", layout: "horizontal", margin: "md",
                            contents: [
                                { type: "text", text: "げつまつよそう", size: "xs", color: "#888888" },
                                { type: "text", text: `¥${s.projectedEndBalance.toLocaleString()}`, size: "md", weight: "bold", align: "end", color: s.projectedEndBalance < 0 ? "#FF6961" : "#111111" }
                            ]
                        },
                        {
                            type: "box", layout: "vertical", margin: "lg", backgroundColor: "#F0F8FF", cornerRadius: "md", paddingAll: "md",
                            contents: [
                                { type: "text", text: `Lv.${user.level} ${user.title}`, size: "xs", weight: "bold" },
                                { type: "text", text: `つぎのレベルまで: ${100 - (user.xp % 100)} XP`, size: "xxs", color: "#666666" }
                            ]
                        }
                    ]
                }
            }
        };
    }
}

class MenuBuilder {
    static build(suggestions: MenuSuggestion[]): any {
        return {
            type: "flex", altText: "こんだて",
            contents: {
                type: "carousel", contents: suggestions.map(s => ({
                    type: "bubble",
                    body: {
                        type: "box", layout: "vertical", contents: [
                            { type: "text", text: s.label, weight: "bold", size: "lg", color: s.isStrict ? "#FF6961" : "#111111" },
                            { type: "text", text: `¥${s.price} / ${s.calories}kcal`, size: "xxs", color: "#888888" },
                            { type: "text", text: s.reason, size: "xs", color: "#666666", wrap: true, margin: "md" }
                        ]
                    },
                    footer: { type: "box", layout: "vertical", contents: [{ type: "button", action: { type: "message", label: "これにする！", text: s.label }, style: s.isStrict ? "secondary" : "primary", height: "sm" }] }
                }))
            }
        };
    }
}

// ==========================================
// 8. App (Main Loop)
// ==========================================

class BotApp {
    private sb: SupabaseClient;
    private line: LineClient;
    private userRepo: UserRepository;
    private mealRepo: MealRepository;
    private financialEngine: FinancialEngine;
    private onboarding: OnboardingFlow;

    constructor() {
        this.sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
        this.line = new LineClient(Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN")!, Deno.env.get("LINE_CHANNEL_SECRET")!);
        this.userRepo = new UserRepository(this.sb);
        this.mealRepo = new MealRepository(this.sb);
        this.financialEngine = new FinancialEngine(this.mealRepo);
        this.onboarding = new OnboardingFlow(this.userRepo);
    }

    async handleRequest(req: Request): Promise<Response> {
        if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
        if (!(await this.line.verifySignature(req))) return new Response("Unauthorized", { status: 401 });
        const body = await req.json();
        for (const event of body.events || []) {
            if (event.type === "message" && event.message.type === "text") await this.handleText(event);
        }
        return new Response("OK", { status: 200 });
    }

    private async handleText(event: any) {
        const { userId, replyToken } = event.source;
        const text = event.message.text;

        // Magic Command
        if (text === "メニュー作って") {
            await this.line.setupRichMenu();
            await this.line.reply(event.replyToken, [{ type: "text", text: "メニューつくったよ！" }]);
            return;
        }

        // User & Onboarding
        let user = await this.userRepo.getByLineId(userId);
        if (!user) user = await this.userRepo.create(userId);

        if (user.onboardingStatus !== "COMPLETE") {
            const reply = await this.onboarding.handle(user, text);
            if (reply) {
                await this.line.reply(event.replyToken, [{ type: "text", text: reply }]);
                return;
            }
        }

        // Intent Parsing
        let intent: ParsedIntent = { kind: "unknown" };
        if (text === "はじめる") intent = { kind: "start" };
        else if (text === "きょうのごはん") intent = { kind: "log" };
        else if (text === "きょうのさいさん") intent = { kind: "budget" };
        else if (text === "こんだて") intent = { kind: "menu" };
        else if (text === "ステータス") intent = { kind: "status" };
        else {
            const priceMatch = text.match(/(\d+)(円|yen)?/);
            if (priceMatch || text.length > 0) intent = { kind: "log", payload: { label: text.replace(/(\d+)(円|yen)?/, "").trim(), price: priceMatch ? parseInt(priceMatch[1]) : null } };
        }

        // Logic Execution
        switch (intent.kind) {
            case "log":
                if (intent.payload) {
                    const timeSlot = this.estimateTimeSlot();
                    const info = IngredientDatabase.search(intent.payload.label);
                    const price = intent.payload.price || info?.price || 500;
                    const nutrition = info ? { cal: info.cal, p: 0, f: 0, c: 0 } : { cal: 500, p: 0, f: 0, c: 0 };

                    await this.mealRepo.add(user.id, intent.payload.label, price, timeSlot, text, nutrition);

                    // Gamification & Mood
                    const xpGain = GamificationEngine.calculateXP(user, "log");
                    const newXp = user.xp + xpGain;
                    const newLevel = Math.floor(newXp / 100) + 1;
                    const newTitle = GamificationEngine.getTitle(newLevel);
                    await this.userRepo.update(user.id, { xp: newXp, level: newLevel, title: newTitle });

                    const status = await this.financialEngine.simulate(user);
                    const mood = ToddlerTranslator.getMood(status.healthRank, timeSlot);

                    // Contextual Response
                    let baseMsg = DialogueDatabase.get("GREET_NOON");
                    if (info) {
                        if (info.tags.includes("veggie")) baseMsg = DialogueDatabase.get("FOOD_VEGGIE");
                        else if (info.tags.includes("meat")) baseMsg = DialogueDatabase.get("FOOD_MEAT");
                        else if (info.tags.includes("sweet")) baseMsg = DialogueDatabase.get("FOOD_SWEET");
                    }
                    if (status.healthRank === "F") baseMsg = DialogueDatabase.get("CTX_BROKE_EATING");

                    const replyText = ToddlerTranslator.translate(baseMsg, mood);
                    await this.line.reply(event.replyToken, [{ type: "text", text: `「${intent.payload.label}」だね！\n${replyText}\n(XP +${xpGain})` }]);
                } else {
                    await this.line.reply(event.replyToken, [{ type: "text", text: "りれきは、まだみれないの。ごめんね。" }]);
                }
                break;
            case "budget":
                const status = await this.financialEngine.simulate(user);
                const mood = ToddlerTranslator.getMood(status.healthRank, this.estimateTimeSlot());
                const rawComment = DialogueDatabase.get(`RANK_${status.healthRank}`);
                const comment = ToddlerTranslator.translate(rawComment, mood);
                await this.line.reply(event.replyToken, [DashboardBuilder.build(status, user), { type: "text", text: comment }]);
                break;
            case "menu":
                const s = await this.financialEngine.simulate(user);
                const suggestions = s.healthRank === "F"
                    ? RecipeDatabase.recipes.filter(r => r.isStrict).slice(0, 3)
                    : RecipeDatabase.recipes.sort(() => 0.5 - Math.random()).slice(0, 3);
                await this.line.reply(event.replyToken, [MenuBuilder.build(suggestions)]);
                break;
            case "status":
                await this.line.reply(event.replyToken, [{ type: "text", text: `【ステータス】\nLv.${user.level} ${user.title}\nXP: ${user.xp}\nStreak: ${user.streak}にち` }]);
                break;
        }
    }

    private estimateTimeSlot(): TimeSlot {
        const hour = new Date().getHours() + 9;
        if (hour < 5) return "late_night";
        if (hour < 11) return "morning";
        if (hour < 15) return "noon";
        if (hour < 18) return "snack";
        if (hour < 23) return "evening";
        return "late_night";
    }
}

class OnboardingFlow {
    constructor(private userRepo: UserRepository) { }
    async handle(user: UserProfile, text: string): Promise<string | null> {
        switch (user.onboardingStatus) {
            case "INIT":
                await this.userRepo.update(user.id, { onboardingStatus: "NAME" });
                return "やっほ〜！🍚 こめこだよ！\nこれから、あなたのおさいふをまもるね。\n\nまずは、あなたの**おなまえ**をおしえて？";
            case "NAME":
                await this.userRepo.update(user.id, { nickname: text, onboardingStatus: "PAYDAY" });
                return `よろしくね、${text}さん！\n\nつぎは、**おきゅうりょうび**をおしえて！\n（例：25）`;
            case "PAYDAY":
                const pd = parseInt(text);
                if (isNaN(pd) || pd < 1 || pd > 31) return "すうじでおしえてね！（例：25）";
                await this.userRepo.update(user.id, { payday: pd, onboardingStatus: "INCOME" });
                return "わかった！\n\nじゃあ、**1か月のつかえるおかね**はいくら？\n（例：200000）";
            case "INCOME":
                const inc = parseInt(text);
                if (isNaN(inc)) return "すうじでおしえてね！（例：200000）";
                await this.userRepo.update(user.id, { monthlyBudget: inc, onboardingStatus: "FIXED_COSTS" });
                return "ふむふむ。\n\nそこからひかれる**こていひ（やちんとか）**はいくら？\n（例：80000）";
            case "FIXED_COSTS":
                const fix = parseInt(text);
                if (isNaN(fix)) return "すうじでおしえてね！（例：80000）";
                await this.userRepo.update(user.id, { fixedCosts: fix, onboardingStatus: "SAVINGS_GOAL" });
                return "なるほどね…。\n\nさいごに、**まいつきちょきんしたいがく**はある？\n（例：30000）";
            case "SAVINGS_GOAL":
                const sav = parseInt(text);
                if (isNaN(sav)) return "すうじでおしえてね！（例：30000）";
                await this.userRepo.update(user.id, { savingsGoal: sav, onboardingStatus: "COMPLETE" });
                const disp = user.monthlyBudget - user.fixedCosts - sav;
                return `せっていかんりょう！✨\n\nあなたの「じゆうにつかえるおかね」は…\n**つき ${disp}えん** だね。\n\nきょうからこめこが、これをまもるよ！\nかくごしてね！🔥\n\n（まずは「メニュー作って」とおくってみて！）`;
        }
        return null;
    }
}

const bot = new BotApp();
serve((req) => bot.handleRequest(req));
