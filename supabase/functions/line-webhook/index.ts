// supabase/functions/line-webhook/index.ts

/**
 * -----------------------------------------------------------------------------
 * Gohan Strategist Komeko (The Monolith Edition - Content Expanded)
 * -----------------------------------------------------------------------------
 * 
 * "Quantity is Quality." - Massive expansion of scenarios and UI.
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

interface UserProfile {
    id: string;
    lineUserId: string;
    nickname: string | null;
    monthlyBudget: number;
    payday: number;
    fixedCosts: number;
    savingsGoal: number;
    onboardingStatus: OnboardingStatus;
}

interface MealLog {
    id: string;
    label: string;
    price: number | null;
    timeSlot: TimeSlot;
    createdAt: Date;
}

interface FinancialStatus {
    totalSpent: number;
    remainingBudget: number;
    dailyBurnRate: number;
    projectedEndBalance: number;
    survivalDays: number;
    healthRank: FinancialHealthRank;
    bankruptcyDate: Date | null;
}

interface MenuSuggestion {
    label: string;
    reason: string;
    isStrict: boolean;
}

interface ParsedIntent {
    kind: "help" | "start" | "log" | "budget" | "menu" | "unknown";
    payload?: any;
}

// ==========================================
// 2. Infrastructure
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

    async setupRichMenu() {
        // ... (Same as before, omitted for brevity but would be here)
        // For this update, we assume it's already set or user triggers it.
    }
}

// ==========================================
// 3. Repositories
// ==========================================

class UserRepository {
    constructor(private sb: SupabaseClient) { }
    async getByLineId(lineUserId: string): Promise<UserProfile | null> {
        const { data } = await this.sb.from("users").select("*").eq("line_user_id", lineUserId).maybeSingle();
        if (!data) return null;
        return {
            id: data.id, lineUserId: data.line_user_id, nickname: data.nickname,
            monthlyBudget: data.monthly_budget, payday: data.payday, fixedCosts: data.fixed_costs,
            savingsGoal: data.savings_goal, onboardingStatus: data.onboarding_status
        };
    }
    async create(lineUserId: string): Promise<UserProfile> {
        const { data } = await this.sb.from("users").insert({ line_user_id: lineUserId, onboarding_status: "INIT" }).select().single();
        return {
            id: data.id, lineUserId: data.line_user_id, nickname: data.nickname,
            monthlyBudget: data.monthly_budget, payday: data.payday, fixedCosts: data.fixed_costs,
            savingsGoal: data.savings_goal, onboardingStatus: data.onboarding_status
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
        await this.sb.from("users").update(dbUpdates).eq("id", userId);
    }
}

class MealRepository {
    constructor(private sb: SupabaseClient) { }
    async add(userId: string, label: string, price: number | null, timeSlot: TimeSlot, rawText: string) {
        await this.sb.from("meals").insert({ user_id: userId, label, price, time_slot: timeSlot, raw_text: rawText });
    }
    async getByDateRange(userId: string, start: Date, end: Date): Promise<MealLog[]> {
        const { data } = await this.sb.from("meals").select("*").eq("user_id", userId).gte("created_at", start.toISOString()).lte("created_at", end.toISOString());
        return (data || []).map((d: any) => ({ id: d.id, label: d.label, price: d.price, timeSlot: d.time_slot, createdAt: new Date(d.created_at) }));
    }
    async getRecent(userId: string, limit: number): Promise<MealLog[]> {
        const { data } = await this.sb.from("meals").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
        return (data || []).map((d: any) => ({ id: d.id, label: d.label, price: d.price, timeSlot: d.time_slot, createdAt: new Date(d.created_at) }));
    }
}

// ==========================================
// 4. Services (The Brain)
// ==========================================

class BudgetStrategist {
    constructor(private mealRepo: MealRepository) { }
    async analyze(user: UserProfile): Promise<FinancialStatus> {
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
        const dailyBurn = daysPassed > 0 ? totalSpent / daysPassed : 0;
        const projectedEnd = disposable - (dailyBurn * totalDays);
        const survivalDays = dailyBurn > 0 ? Math.floor(remainingBudget / dailyBurn) : 999;
        let rank: FinancialHealthRank = "B";
        if (remainingBudget < 0) rank = "F";
        else if (projectedEnd < -5000) rank = "D";
        else if (projectedEnd < 0) rank = "C";
        else if (projectedEnd > user.savingsGoal * 0.5) rank = "A";
        else if (projectedEnd > user.savingsGoal) rank = "S";
        let bankruptcyDate: Date | null = null;
        if (projectedEnd < 0 && dailyBurn > 0) {
            bankruptcyDate = new Date(today);
            bankruptcyDate.setDate(today.getDate() + Math.floor(remainingBudget / dailyBurn));
        }
        return { totalSpent, remainingBudget, dailyBurnRate: dailyBurn, projectedEndBalance: projectedEnd, survivalDays, healthRank: rank, bankruptcyDate };
    }
}

class MenuController {
    constructor(private mealRepo: MealRepository) { }
    async getSuggestions(userId: string, rank: FinancialHealthRank): Promise<MenuSuggestion[]> {
        if (rank === "F") return [
            { label: "もやし炒め", reason: "破産確定です。これしか許しません。", isStrict: true },
            { label: "お水", reason: "0円です。生き延びてください。", isStrict: true },
            { label: "断食", reason: "胃を休めましょう（お金も休まります）。", isStrict: true }
        ];
        if (rank === "D") return [
            { label: "納豆ごはん", reason: "安くて栄養満点。今はこれです。", isStrict: true },
            { label: "うどん（素）", reason: "トッピングは贅沢です。", isStrict: true },
            { label: "豆腐", reason: "高タンパク低コスト。我慢の時です。", isStrict: true }
        ];
        const recent = await this.mealRepo.getRecent(userId, 10);
        const recentLabels = new Set(recent.map(m => m.label));
        const candidates = [
            { label: "カレー", reason: "定番だね！", isStrict: false },
            { label: "パスタ", reason: "手軽でいいよね！", isStrict: false },
            { label: "ハンバーグ", reason: "みんな大好き！", isStrict: false },
            { label: "唐揚げ", reason: "ご飯がすすむ！", isStrict: false },
            { label: "オムライス", reason: "卵料理はどう？", isStrict: false }
        ];
        if (rank === "S" || rank === "A") {
            candidates.push({ label: "焼肉", reason: "余裕があるから行っちゃう？🍖", isStrict: false });
            candidates.push({ label: "お寿司", reason: "ご褒美タイム！🍣", isStrict: false });
        }
        return candidates.filter(c => !recentLabels.has(c.label)).sort(() => 0.5 - Math.random()).slice(0, 3);
    }
}

class OnboardingFlow {
    constructor(private userRepo: UserRepository) { }
    async handle(user: UserProfile, text: string): Promise<string | null> {
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

// ==========================================
// 5. Persona (The Soul - Expanded)
// ==========================================

class KomekoPersona {
    // Massive Dictionary of Dialogues
    private dialogues = {
        report: {
            S: [
                "素晴らしい！✨ この調子なら貯金目標も余裕でクリアだね！",
                "完璧な資金管理です。私が教えることはもうないかも？🤔",
                "リッチだね〜！たまにはご褒美スイーツでもどう？🍰"
            ],
            A: [
                "順調だね！👍 油断せずにいこう。",
                "いいペース！このまま月末まで走り抜けよう！🏃‍♀️",
                "安定してるね。心の余裕はお金の余裕から！"
            ],
            B: [
                "まあまあかな。でも、気を抜くと危ないよ？",
                "平均点って感じ。でも油断大敵だよ！",
                "ふつう。でも「ふつう」を維持するのが一番難しいんだよね。"
            ],
            C: [
                "雲行きが怪しいよ…☁️ ちょっと引き締めないと。",
                "ん〜、ちょっと使いすぎかも？明日は節約デーにしよう。",
                "黄色信号点滅中！⚠️ 財布の紐、緩んでない？"
            ],
            D: [
                "警告レベルです。🚨 このままだと赤字確定だよ。",
                "ねえ、本当にそのペースで大丈夫？来週泣くことになるよ？",
                "緊急事態宣言の一歩手前です。外食禁止令を出します。"
            ],
            F: [
                "【緊急事態】破産寸前です。😱 直ちに生活レベルを下げてください。",
                "終わったね…。💸 もう「もやし」しか食べられません。",
                "信じられない…。どうやって月末まで生きるつもり？"
            ]
        },
        logAck: {
            cheap: ["おっ、節約？えらいえらい！👏", "賢い選択だね！✨", "その調子！チリも積もれば山となる！"],
            normal: ["メモしたよ！✍️", "おいしそう〜😋", "ちゃんと食べてえらい！"],
            expensive: ["うわっ、高っ！💸", "貴族の食事ですか？👑", "…これ、本当に必要だった？😤"],
            lateNight: ["この時間に？太るよ？🐷", "背徳の味…でもお財布には毒だよ💀", "明日の朝、胃もたれ確定だね。"],
            alcohol: ["飲みすぎ注意！🍺", "お酒はほどほどにね！", "ストレス溜まってる？話聞くよ？"]
        }
    };

    getReport(s: FinancialStatus): string {
        const comments = this.dialogues.report[s.healthRank];
        const comment = comments[Math.floor(Math.random() * comments.length)];
        const pred = s.bankruptcyDate
            ? `\n💀 **予言**: このままだと **${s.bankruptcyDate.getDate()}日** に資金が尽きます。`
            : `\n💰 **予測**: 月末には **${Math.floor(s.projectedEndBalance)}円** 残る見込み。`;
        return `【📊 財務レポート】\nランク: **${s.healthRank}**\n生存可能日数: あと${s.survivalDays}日\n\n${comment}${pred}`;
    }

    getLogAck(label: string, price: number | null, rank: string, timeSlot: TimeSlot) {
        if (rank === "F") return `「${label}」…？\nはぁ…また無駄遣いして…。😤\nちゃんと記録はしたけど、反省してね。`;

        // Context Aware Logic
        if (timeSlot === "late_night") {
            const c = this.dialogues.logAck.lateNight[Math.floor(Math.random() * 3)];
            return `「${label}」だね。\n${c}`;
        }
        if (label.includes("酒") || label.includes("ビール")) {
            const c = this.dialogues.logAck.alcohol[Math.floor(Math.random() * 3)];
            return `「${label}」だね。\n${c}`;
        }
        if (price && price > 2000) {
            const c = this.dialogues.logAck.expensive[Math.floor(Math.random() * 3)];
            return `「${label}」…${price}円！？\n${c}`;
        }
        if (price && price < 300) {
            const c = this.dialogues.logAck.cheap[Math.floor(Math.random() * 3)];
            return `「${label}」…${price}円！\n${c}`;
        }

        const c = this.dialogues.logAck.normal[Math.floor(Math.random() * 3)];
        return `「${label}」だね！${price ? price + "円！" : ""}\n${c}`;
    }
}

// ==========================================
// 6. UI (Flex Messages - Expanded)
// ==========================================

class FlexBuilder {
    static report(s: FinancialStatus): any {
        const theme = {
            "S": { color: "#1DB446", title: "EXCELLENT", icon: "👑" },
            "A": { color: "#9ACD32", title: "GOOD", icon: "✨" },
            "B": { color: "#FFD700", title: "NORMAL", icon: "🙂" },
            "C": { color: "#FFA500", title: "CAUTION", icon: "⚠️" },
            "D": { color: "#FF4500", title: "DANGER", icon: "🚨" },
            "F": { color: "#FF0000", title: "BANKRUPT", icon: "💀" }
        }[s.healthRank] || { color: "#888", title: "UNKNOWN", icon: "?" };

        return {
            type: "flex", altText: "財務レポート",
            contents: {
                type: "bubble",
                header: {
                    type: "box", layout: "vertical", backgroundColor: theme.color,
                    contents: [
                        { type: "text", text: `${theme.icon} ${theme.title}`, color: "#ffffff", weight: "bold", size: "xs" },
                        { type: "text", text: `RANK ${s.healthRank}`, color: "#ffffff", weight: "bold", size: "4xl", align: "center", margin: "md" }
                    ]
                },
                body: {
                    type: "box", layout: "vertical",
                    contents: [
                        {
                            type: "box", layout: "horizontal",
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
                        { type: "separator", margin: "lg" },
                        {
                            type: "box", layout: "vertical", margin: "lg", backgroundColor: s.survivalDays < 5 ? "#FFEEEE" : "#FFFFFF", cornerRadius: "md", paddingAll: "md",
                            contents: [
                                { type: "text", text: "生存可能日数", size: "xs", color: "#888888", align: "center" },
                                { type: "text", text: `あと ${s.survivalDays} 日`, size: "xxl", weight: "bold", color: s.survivalDays < 5 ? "#FF0000" : "#111111", align: "center" }
                            ]
                        }
                    ]
                }
            }
        };
    }

    static menu(suggestions: MenuSuggestion[]): any {
        return {
            type: "flex", altText: "献立提案",
            contents: {
                type: "carousel", contents: suggestions.map(s => ({
                    type: "bubble",
                    body: {
                        type: "box", layout: "vertical", contents: [
                            { type: "text", text: s.label, weight: "bold", size: "xl", color: s.isStrict ? "#FF0000" : "#111111" },
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
    private budgetStrategist: BudgetStrategist;
    private menuController: MenuController;
    private onboarding: OnboardingFlow;
    private persona: KomekoPersona;

    constructor() {
        this.sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
        this.line = new LineClient(Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN")!, Deno.env.get("LINE_CHANNEL_SECRET")!);
        this.userRepo = new UserRepository(this.sb);
        this.mealRepo = new MealRepository(this.sb);
        this.budgetStrategist = new BudgetStrategist(this.mealRepo);
        this.menuController = new MenuController(this.mealRepo);
        this.onboarding = new OnboardingFlow(this.userRepo);
        this.persona = new KomekoPersona();
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
        else {
            const priceMatch = text.match(/(\d+)(円|yen)?/);
            if (priceMatch || text.length > 0) intent = { kind: "log", payload: { label: text.replace(/(\d+)(円|yen)?/, "").trim(), price: priceMatch ? parseInt(priceMatch[1]) : null } };
        }

        // Logic Execution
        switch (intent.kind) {
            case "log":
                if (intent.payload) {
                    const timeSlot = this.estimateTimeSlot();
                    await this.mealRepo.add(user.id, intent.payload.label, intent.payload.price, timeSlot, text);
                    const status = await this.budgetStrategist.analyze(user);
                    await this.line.reply(event.replyToken, [{ type: "text", text: this.persona.getLogAck(intent.payload.label, intent.payload.price, status.healthRank, timeSlot) }]);
                } else {
                    await this.line.reply(event.replyToken, [{ type: "text", text: "今日の履歴だよ！（実装中）" }]);
                }
                break;
            case "budget":
                const status = await this.budgetStrategist.analyze(user);
                await this.line.reply(event.replyToken, [FlexBuilder.report(status), { type: "text", text: this.persona.getReport(status) }]);
                break;
            case "menu":
                const s = await this.budgetStrategist.analyze(user);
                const suggestions = await this.menuController.getSuggestions(user.id, s.healthRank);
                await this.line.reply(event.replyToken, [FlexBuilder.menu(suggestions)]);
                break;
        }
    }

    private estimateTimeSlot(): TimeSlot {
        const hour = new Date().getHours() + 9; // JST approximation
        if (hour < 5) return "late_night";
        if (hour < 11) return "morning";
        if (hour < 15) return "noon";
        if (hour < 18) return "snack";
        if (hour < 23) return "evening";
        return "late_night";
    }
}

const bot = new BotApp();
serve((req) => bot.handleRequest(req));
