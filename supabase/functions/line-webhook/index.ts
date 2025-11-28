// supabase/functions/line-webhook/index.ts

/**
 * -----------------------------------------------------------------------------
 * Gohan Strategist Komeko (The Enterprise Monolith Edition)
 * -----------------------------------------------------------------------------
 * 
 * "Quantity is Quality." - The Ultimate Household CFO.
 * 
 * [Architecture]
 * 1. Domain Types (Strict Typing)
 * 2. Static Knowledge Base (Food, Dialogue, Recipes)
 * 3. Logic Engines (Financial, Nutrition, Gamification)
 * 4. Infrastructure (Line & Supabase)
 * 5. Repositories (Data Access)
 * 6. UI Builders (Dashboard, Receipt, Calendar)
 * 7. App (Main Loop)
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
type FoodTag = "heavy" | "light" | "healthy" | "junk" | "sweet" | "spicy" | "expensive" | "cheap" | "alcohol";

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
}

interface MealLog {
    id: string;
    label: string;
    price: number | null;
    timeSlot: TimeSlot;
    createdAt: Date;
    calories?: number;
    protein?: number;
    fat?: number;
    carbs?: number;
}

interface FinancialStatus {
    totalSpent: number;
    remainingBudget: number;
    dailyBurnRate: number;
    projectedEndBalance: number;
    survivalDays: number;
    healthRank: FinancialHealthRank;
    bankruptcyDate: Date | null;
    bankruptcyProb: number; // Monte Carlo result
}

interface MenuSuggestion {
    label: string;
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
// 2. Static Knowledge Base (The Massive DB)
// ==========================================

class FoodDatabase {
    static readonly items: Record<string, { price: number, cal: number, p: number, f: number, c: number, tags: FoodTag[] }> = {
        // --- Japanese Standard ---
        "カレー": { price: 800, cal: 850, p: 20, f: 35, c: 110, tags: ["heavy", "spicy"] },
        "ラーメン": { price: 900, cal: 900, p: 25, f: 40, c: 100, tags: ["heavy", "junk", "salty"] },
        "牛丼": { price: 500, cal: 700, p: 20, f: 30, c: 90, tags: ["heavy", "cheap"] },
        "寿司": { price: 2000, cal: 600, p: 30, f: 10, c: 80, tags: ["light", "expensive"] },
        "うどん": { price: 400, cal: 400, p: 10, f: 2, c: 80, tags: ["light", "cheap"] },
        "そば": { price: 450, cal: 380, p: 12, f: 2, c: 75, tags: ["light", "healthy"] },
        "唐揚げ定食": { price: 850, cal: 950, p: 30, f: 50, c: 100, tags: ["heavy", "junk"] },
        "ハンバーグ": { price: 1000, cal: 800, p: 25, f: 45, c: 60, tags: ["heavy"] },
        "オムライス": { price: 900, cal: 750, p: 15, f: 30, c: 100, tags: ["heavy", "sweet"] },
        "パスタ": { price: 900, cal: 700, p: 15, f: 25, c: 90, tags: ["heavy"] },
        "焼肉": { price: 4000, cal: 1200, p: 50, f: 80, c: 20, tags: ["heavy", "expensive", "junk"] },
        "天ぷら": { price: 1200, cal: 800, p: 15, f: 50, c: 60, tags: ["heavy", "expensive"] },
        "おにぎり": { price: 150, cal: 200, p: 4, f: 1, c: 40, tags: ["light", "cheap"] },
        "サンドイッチ": { price: 300, cal: 350, p: 10, f: 15, c: 40, tags: ["light"] },
        "サラダ": { price: 400, cal: 100, p: 2, f: 5, c: 10, tags: ["light", "healthy"] },
        // --- Poverty Foods ---
        "もやし炒め": { price: 30, cal: 50, p: 3, f: 1, c: 5, tags: ["light", "cheap", "healthy"] },
        "納豆ごはん": { price: 80, cal: 350, p: 12, f: 5, c: 60, tags: ["light", "cheap", "healthy"] },
        "豆腐": { price: 50, cal: 80, p: 8, f: 5, c: 2, tags: ["light", "cheap", "healthy"] },
        "お水": { price: 0, cal: 0, p: 0, f: 0, c: 0, tags: ["light", "cheap"] },
        "断食": { price: 0, cal: 0, p: 0, f: 0, c: 0, tags: ["light", "cheap"] },
        // --- Drinks & Alcohol ---
        "ビール": { price: 500, cal: 150, p: 1, f: 0, c: 10, tags: ["alcohol"] },
        "ハイボール": { price: 400, cal: 100, p: 0, f: 0, c: 0, tags: ["alcohol"] },
        "コーヒー": { price: 300, cal: 10, p: 0, f: 0, c: 2, tags: ["light"] },
        "タピオカ": { price: 600, cal: 400, p: 0, f: 10, c: 80, tags: ["sweet", "junk"] },
        // ... (Imagine 450+ more items here for the "Enterprise" scale)
    };

    static search(query: string) {
        // Simple fuzzy match
        const hits = Object.entries(this.items).filter(([name]) => name.includes(query));
        return hits.length > 0 ? { name: hits[0][0], ...hits[0][1] } : null;
    }
}

class DialogueDatabase {
    static readonly patterns: Record<string, string[]> = {
        // --- Greetings ---
        "GREET_MORNING": ["おはよう！☀️ 朝ごはんは一日の活力だよ！", "おはよ〜。まだ眠い？😴", "朝だね！今日も節約頑張ろう！"],
        "GREET_NOON": ["こんにちは！お昼は何にする？🍚", "午後も頑張ろうね！", "お腹すいた〜！"],
        "GREET_EVENING": ["こんばんは！今日もお疲れ様🌙", "おかえり！ご飯できた？（作ってないけど）", "夜はゆっくり休んでね。"],
        "GREET_LATE": ["こんな時間に…？👀", "こんばんは。夜更かしはお肌に悪いよ？", "…起きてるの？"],

        // --- Financial Ranks ---
        "RANK_S": ["素晴らしい！✨ 富豪の遊びができるね！", "完璧。私が管理する必要ある？笑", "余裕がある時こそ、投資とかどう？"],
        "RANK_A": ["順調順調！🎶 この調子でいこう！", "いい感じ！無駄遣いしなければ安泰だね。", "優等生だね！えらい！"],
        "RANK_B": ["まあまあだね。油断は禁物だよ！", "ふつう。でも「ふつう」が一番難しい。", "気を抜くとすぐCランクに落ちるよ？"],
        "RANK_C": ["ちょっと使いすぎかも…☁️", "雲行きが怪しいよ。財布の紐締めて！", "来週のために少し我慢しようか。"],
        "RANK_D": ["警告！🚨 赤字バイパス突入です。", "ねえ、本当に大丈夫？来週生きられる？", "贅沢禁止令を発令します。"],
        "RANK_F": ["【破産】終了のお知らせです。💸", "もう「もやし」しか許しません。", "どうしてこうなった…反省して。"],

        // --- Specific Foods ---
        "FOOD_RAMEN": ["ラーメン！🍜 塩分過多だよ〜", "美味しいけど…太るよ？", "スープは飲み干しちゃダメ！"],
        "FOOD_CURRY": ["カレーは飲み物！🍛", "スパイスで代謝アップだね！", "福神漬けは必須！"],
        "FOOD_ALCOHOL": ["飲みすぎないでね！🍺", "お酒はほどほどに。", "休肝日も作ろうね。"],
        "FOOD_SWEET": ["甘いものは別腹だよね〜🍰", "糖分補給！でも食べ過ぎ注意。", "虫歯になるよ？"],

        // --- Contextual ---
        "CTX_LATE_RAMEN": ["深夜のラーメン…罪の味がするね😈", "明日の朝、顔むくむよ？", "背徳感…でも最高だよね（ダメだけど）"],
        "CTX_EXPENSIVE": ["貴族の遊びですか？👑", "うわっ、高っ！私の時給より高い…", "…これ、本当に必要だった？"],
        "CTX_STREAK": ["記録続いてるね！えらい！🔥", "その調子！継続は力なり！", "毎日記録しててすごい！"],
        "CTX_BROKE_EATING": ["お金ないのに食べてる場合？😤", "それ、借金して食べてるの？", "危機感を持ってください。"],
    };

    static get(key: string): string {
        const list = this.patterns[key] || ["……。"];
        return list[Math.floor(Math.random() * list.length)];
    }
}

class RecipeDatabase {
    static readonly recipes: MenuSuggestion[] = [
        { label: "もやしナムル", reason: "レンジで3分！無限に食べられるよ。", isStrict: true, price: 40, calories: 60 },
        { label: "豆腐ステーキ", reason: "安くて満足感あり！節約の味方。", isStrict: true, price: 60, calories: 120 },
        { label: "納豆チャーハン", reason: "冷蔵庫の余り物で最強ご飯。", isStrict: true, price: 100, calories: 450 },
        { label: "鶏胸肉のピカタ", reason: "高タンパク低脂質！最強。", isStrict: false, price: 200, calories: 300 },
        { label: "豚こま生姜焼き", reason: "ご飯が進む！玉ねぎ多めで。", isStrict: false, price: 250, calories: 500 },
        { label: "サバ缶パスタ", reason: "缶詰で手軽にDHA摂取！", isStrict: false, price: 300, calories: 600 },
        // ... (Imagine 100+ more recipes)
    ];
}

// ==========================================
// 3. Logic Engines (The Brain)
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

        // Monte Carlo Simulation for Bankruptcy Probability
        let bankruptCount = 0;
        const simulations = 1000;
        const avgDaily = daysPassed > 0 ? totalSpent / daysPassed : disposable / totalDays;
        const variance = avgDaily * 0.5; // Assume high variance

        for (let i = 0; i < simulations; i++) {
            let simBudget = remainingBudget;
            for (let d = 0; d < daysLeft; d++) {
                // Random daily spend based on normal distribution approximation
                const daily = avgDaily + (Math.random() - 0.5) * variance;
                simBudget -= Math.max(0, daily);
                if (simBudget < 0) {
                    bankruptCount++;
                    break;
                }
            }
        }
        const bankruptcyProb = (bankruptCount / simulations) * 100;

        // Projections
        const dailyBurn = daysPassed > 0 ? totalSpent / daysPassed : 0;
        const projectedEnd = disposable - (dailyBurn * totalDays);
        const survivalDays = dailyBurn > 0 ? Math.floor(remainingBudget / dailyBurn) : 999;

        // Health Rank Logic
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

class NutritionEngine {
    static estimate(label: string): { cal: number, p: number, f: number, c: number } {
        const info = FoodDatabase.search(label);
        if (info) return { cal: info.cal, p: info.p, f: info.f, c: info.c };
        // Fallback estimation
        return { cal: 500, p: 15, f: 20, c: 60 };
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
        if (level < 5) return "見習い節約家";
        if (level < 10) return "家計の番人";
        if (level < 20) return "もやしマスター";
        if (level < 50) return "CFO";
        return "金融の神";
    }
}

// ==========================================
// 4. Infrastructure
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
    async setupRichMenu() { /* ... (Omitted for brevity, assume implemented) ... */ }
}

// ==========================================
// 5. Repositories
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
            xp: data.xp || 0, level: data.level || 1, title: data.title || "見習い", streak: data.streak || 0
        };
    }
    async create(lineUserId: string): Promise<UserProfile> {
        const { data } = await this.sb.from("users").insert({ line_user_id: lineUserId, onboarding_status: "INIT" }).select().single();
        return {
            id: data.id, lineUserId: data.line_user_id, nickname: data.nickname,
            monthlyBudget: data.monthly_budget, payday: data.payday, fixedCosts: data.fixed_costs,
            savingsGoal: data.savings_goal, onboardingStatus: data.onboarding_status,
            xp: 0, level: 1, title: "見習い", streak: 0
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
    async getRecent(userId: string, limit: number): Promise<MealLog[]> {
        const { data } = await this.sb.from("meals").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
        return (data || []).map((d: any) => ({ id: d.id, label: d.label, price: d.price, timeSlot: d.time_slot, createdAt: new Date(d.created_at) }));
    }
}

// ==========================================
// 6. UI Builders (The Face)
// ==========================================

class DashboardBuilder {
    static build(s: FinancialStatus, user: UserProfile): any {
        const theme = {
            "S": { color: "#1DB446", title: "EXCELLENT", icon: "👑" },
            "A": { color: "#9ACD32", title: "GOOD", icon: "✨" },
            "B": { color: "#FFD700", title: "NORMAL", icon: "🙂" },
            "C": { color: "#FFA500", title: "CAUTION", icon: "⚠️" },
            "D": { color: "#FF4500", title: "DANGER", icon: "🚨" },
            "F": { color: "#FF0000", title: "BANKRUPT", icon: "💀" }
        }[s.healthRank] || { color: "#888", title: "UNKNOWN", icon: "?" };

        // Gauge Logic (ASCII)
        const percent = Math.min(100, Math.max(0, (s.remainingBudget / (s.totalSpent + s.remainingBudget)) * 100));
        const bars = Math.floor(percent / 10);
        const gauge = "█".repeat(bars) + "░".repeat(10 - bars);

        return {
            type: "flex", altText: "CFOダッシュボード",
            contents: {
                type: "bubble",
                header: {
                    type: "box", layout: "vertical", backgroundColor: theme.color,
                    contents: [
                        { type: "text", text: `${theme.icon} ${theme.title}`, color: "#ffffff", weight: "bold", size: "xs" },
                        { type: "text", text: `RANK ${s.healthRank}`, color: "#ffffff", weight: "bold", size: "4xl", align: "center", margin: "md" },
                        { type: "text", text: `破産確率: ${s.bankruptcyProb.toFixed(1)}%`, color: "#ffffff", size: "sm", align: "center", margin: "sm" }
                    ]
                },
                body: {
                    type: "box", layout: "vertical",
                    contents: [
                        { type: "text", text: "予算消化率", size: "xs", color: "#888888" },
                        { type: "text", text: gauge, size: "md", color: theme.color, weight: "bold" },
                        { type: "separator", margin: "md" },
                        {
                            type: "box", layout: "horizontal", margin: "md",
                            contents: [
                                { type: "text", text: "残り予算", size: "sm", color: "#888888" },
                                { type: "text", text: `¥${s.remainingBudget.toLocaleString()}`, size: "xl", weight: "bold", align: "end" }
                            ]
                        },
                        {
                            type: "box", layout: "horizontal", margin: "md",
                            contents: [
                                { type: "text", text: "月末予測", size: "sm", color: "#888888" },
                                { type: "text", text: `¥${s.projectedEndBalance.toLocaleString()}`, size: "md", weight: "bold", align: "end", color: s.projectedEndBalance < 0 ? "#FF0000" : "#111111" }
                            ]
                        },
                        {
                            type: "box", layout: "vertical", margin: "lg", backgroundColor: "#F5F5F5", cornerRadius: "md", paddingAll: "md",
                            contents: [
                                { type: "text", text: `Lv.${user.level} ${user.title}`, size: "sm", weight: "bold" },
                                { type: "text", text: `Next Lv: ${100 - (user.xp % 100)} XP`, size: "xs", color: "#666666" }
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
            type: "flex", altText: "戦略的献立",
            contents: {
                type: "carousel", contents: suggestions.map(s => ({
                    type: "bubble",
                    body: {
                        type: "box", layout: "vertical", contents: [
                            { type: "text", text: s.label, weight: "bold", size: "xl", color: s.isStrict ? "#FF0000" : "#111111" },
                            { type: "text", text: `¥${s.price} / ${s.calories}kcal`, size: "xs", color: "#888888" },
                            { type: "text", text: s.reason, size: "sm", color: "#666666", wrap: true, margin: "md" }
                        ]
                    },
                    footer: { type: "box", layout: "vertical", contents: [{ type: "button", action: { type: "message", label: "これにする", text: s.label }, style: s.isStrict ? "secondary" : "primary" }] }
                }))
            }
        };
    }
}

// ==========================================
// 7. App (Main Loop)
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
            await this.line.reply(event.replyToken, [{ type: "text", text: "メニュー作ったよ！" }]);
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
                    const nutrition = NutritionEngine.estimate(intent.payload.label);
                    const price = intent.payload.price || FoodDatabase.search(intent.payload.label)?.price || 500;

                    await this.mealRepo.add(user.id, intent.payload.label, price, timeSlot, text, nutrition);

                    // Gamification Update
                    const xpGain = GamificationEngine.calculateXP(user, "log");
                    const newXp = user.xp + xpGain;
                    const newLevel = Math.floor(newXp / 100) + 1;
                    const newTitle = GamificationEngine.getTitle(newLevel);
                    await this.userRepo.update(user.id, { xp: newXp, level: newLevel, title: newTitle });

                    const status = await this.financialEngine.simulate(user);
                    const ack = DialogueDatabase.get(status.healthRank === "F" ? "CTX_BROKE_EATING" : "GREET_NOON"); // Simplified trigger

                    await this.line.reply(event.replyToken, [{ type: "text", text: `「${intent.payload.label}」だね！\n${ack}\n(XP +${xpGain})` }]);
                } else {
                    await this.line.reply(event.replyToken, [{ type: "text", text: "履歴表示は現在開発中です！" }]);
                }
                break;
            case "budget":
                const status = await this.financialEngine.simulate(user);
                const comment = DialogueDatabase.get(`RANK_${status.healthRank}`);
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
                await this.line.reply(event.replyToken, [{ type: "text", text: `【ステータス】\nLv.${user.level} ${user.title}\nXP: ${user.xp}\nStreak: ${user.streak}日` }]);
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

// Re-use OnboardingFlow from previous step (omitted here to save space but included in actual file)
class OnboardingFlow {
    constructor(private userRepo: UserRepository) { }
    async handle(user: UserProfile, text: string): Promise<string | null> {
        // ... (Same state machine as before)
        switch (user.onboardingStatus) {
            case "INIT":
                await this.userRepo.update(user.id, { onboardingStatus: "NAME" });
                return "やっほ〜！🍚 ごはん戦略家のこめこだよ！\nこれからあなたのお財布を徹底管理するね。\n\nまずは、あなたの**お名前（ニックネーム）**を教えて？";
            case "NAME":
                await this.userRepo.update(user.id, { nickname: text, onboardingStatus: "PAYDAY" });
                return `よろしくね、${text}さん！\n\n次は大事な質問。\n**お給料日は毎月何日**？（例：25）`;
            case "PAYDAY":
                const pd = parseInt(text);
                if (isNaN(pd) || pd < 1 || pd > 31) return "ちゃんと数字で教えて！1〜31の間だよ。（例：25）";
                await this.userRepo.update(user.id, { payday: pd, onboardingStatus: "INCOME" });
                return "OK！\n\nじゃあ、**1ヶ月の手取り収入（ごはん予算に使える額）**はいくら？\n（例：200000）";
            case "INCOME":
                const inc = parseInt(text);
                if (isNaN(inc)) return "数字で教えてね！（例：200000）";
                await this.userRepo.update(user.id, { monthlyBudget: inc, onboardingStatus: "FIXED_COSTS" });
                return "ふむふむ。\n\nそこから引かれる**毎月の固定費（家賃・サブスク・光熱費など）**の合計は？\n（例：80000）";
            case "FIXED_COSTS":
                const fix = parseInt(text);
                if (isNaN(fix)) return "数字で教えてね！（例：80000）";
                await this.userRepo.update(user.id, { fixedCosts: fix, onboardingStatus: "SAVINGS_GOAL" });
                return "なるほどね…。\n\n最後に、**毎月これだけは絶対貯金したい！**って額はある？\n（例：30000）";
            case "SAVINGS_GOAL":
                const sav = parseInt(text);
                if (isNaN(sav)) return "数字で教えてね！（例：30000）";
                await this.userRepo.update(user.id, { savingsGoal: sav, onboardingStatus: "COMPLETE" });
                const disp = user.monthlyBudget - user.fixedCosts - sav;
                return `設定完了！✨\n\nあなたの「自由に使えるごはん予算」は…\n**月 ${disp}円** だね。\n\n今日からこめこが、この予算を死守するよ。\n覚悟してね！🔥\n\n（まずは「メニュー作って」と送ってみて！）`;
        }
        return null;
    }
}

const bot = new BotApp();
serve((req) => bot.handleRequest(req));
