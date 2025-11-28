// supabase/functions/line-webhook/index.ts

/**
 * -----------------------------------------------------------------------------
 * Gohan Fairy Komeko (The Monolith Edition)
 * -----------------------------------------------------------------------------
 * 
 * A single-file, enterprise-grade LINE Bot architecture.
 * 
 * [Table of Contents]
 * 1. Domain Types
 * 2. Infrastructure (Supabase & LINE)
 * 3. Repositories (Data Access)
 * 4. Services (Business Logic)
 * 5. Persona Engine (Komeko)
 * 6. UI Builder (Flex Messages)
 * 7. Intent Parser (NLU)
 * 8. Controller (Main Loop)
 * 9. Entry Point
 */

import "jsr:@supabase/functions-js/edge-runtime";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ==========================================
// 1. Domain Types
// ==========================================

// LINE Types
type LineEvent = {
    type: string;
    replyToken?: string;
    source: { userId?: string; groupId?: string; roomId?: string };
    message?: { type: "text"; id: string; text: string };
};

// App Types
type TimeSlot = "morning" | "noon" | "evening" | "snack";
type MoodType = "light" | "heavy" | "eatout" | "saving" | "anything";

interface UserProfile {
    id: string;
    lineUserId: string;
    nickname: string | null;
    monthlyBudget: number;
}

interface MealLog {
    id: string;
    label: string;
    price: number | null;
    timeSlot: TimeSlot;
    createdAt: Date;
}

interface ParsedIntent {
    kind: "help" | "start" | "log" | "budget" | "menu" | "mood" | "preference" | "unknown";
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
        // Simplified Rich Menu Setup for "Grandparents"
        const menu = {
            size: { width: 2500, height: 843 },
            selected: true,
            name: "Komeko Menu",
            chatBarText: "メニュー",
            areas: [
                { bounds: { x: 0, y: 0, width: 833, height: 843 }, action: { type: "message", text: "きょうのごはん" } },
                { bounds: { x: 833, y: 0, width: 834, height: 843 }, action: { type: "message", text: "きょうのさいさん" } },
                { bounds: { x: 1667, y: 0, width: 833, height: 843 }, action: { type: "message", text: "こんだて" } }
            ]
        };
        const res = await fetch("https://api.line.me/v2/bot/richmenu", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.token}` },
            body: JSON.stringify(menu)
        });
        const { richMenuId } = await res.json();

        // Upload default image (Placeholder)
        const blob = await (await fetch("https://placehold.co/2500x843/FF9900/FFFFFF/png?text=Log+List+%7C+Budget+%7C+Menu")).blob();
        await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
            method: "POST",
            headers: { "Content-Type": "image/png", Authorization: `Bearer ${this.token}` },
            body: blob
        });

        await fetch(`https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`, {
            method: "POST",
            headers: { Authorization: `Bearer ${this.token}` }
        });
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
        return { id: data.id, lineUserId: data.line_user_id, nickname: data.nickname, monthlyBudget: data.monthly_budget };
    }

    async create(lineUserId: string, budget: number): Promise<UserProfile> {
        const { data } = await this.sb.from("users").insert({ line_user_id: lineUserId, monthly_budget: budget }).select().single();
        return { id: data.id, lineUserId: data.line_user_id, nickname: data.nickname, monthlyBudget: data.monthly_budget };
    }
}

class MealRepository {
    constructor(private sb: SupabaseClient) { }

    async add(userId: string, groupId: string | null, label: string, price: number | null, timeSlot: TimeSlot, rawText: string) {
        await this.sb.from("meals").insert({ user_id: userId, group_id: groupId, label, price, time_slot: timeSlot, raw_text: rawText });
    }

    async getToday(userId: string): Promise<MealLog[]> {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const { data } = await this.sb.from("meals").select("*").eq("user_id", userId).gte("created_at", today.toISOString());
        return (data || []).map((d: any) => ({ id: d.id, label: d.label, price: d.price, timeSlot: d.time_slot, createdAt: new Date(d.created_at) }));
    }

    async getRecent(userId: string, limit: number = 10): Promise<MealLog[]> {
        const { data } = await this.sb.from("meals").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
        return (data || []).map((d: any) => ({ id: d.id, label: d.label, price: d.price, timeSlot: d.time_slot, createdAt: new Date(d.created_at) }));
    }
}

// ==========================================
// 4. Services
// ==========================================

class BudgetService {
    constructor(private mealRepo: MealRepository, private userRepo: UserRepository) { }

    async checkDailyStatus(userId: string): Promise<{ total: number; budget: number; status: "safe" | "warning" | "danger" }> {
        const user = (await this.userRepo.getByLineId(userId))!; // Assume user exists if calling this
        const meals = await this.mealRepo.getToday(user.id);
        const total = meals.reduce((sum, m) => sum + (m.price || 0), 0);
        const dailyBudget = Math.round(user.monthlyBudget / 30);

        let status: "safe" | "warning" | "danger" = "safe";
        if (total > dailyBudget * 1.5) status = "danger";
        else if (total > dailyBudget) status = "warning";

        return { total, budget: dailyBudget, status };
    }
}

class SuggestionEngine {
    constructor(private mealRepo: MealRepository) { }

    async suggest(userId: string): Promise<string[]> {
        // Simple logic: Don't suggest what was eaten recently
        const recent = await this.mealRepo.getRecent(userId, 5);
        const recentLabels = new Set(recent.map(m => m.label));

        const candidates = ["カレー", "パスタ", "ハンバーグ", "焼き魚", "うどん", "野菜炒め", "オムライス", "唐揚げ"];
        const suggestions = candidates.filter(c => !recentLabels.has(c));

        // Shuffle and pick 3
        return suggestions.sort(() => 0.5 - Math.random()).slice(0, 3);
    }
}

// ==========================================
// 5. Persona Engine (Komeko)
// ==========================================

class KomekoPersona {
    greet() {
        return "やっほ〜！🍚 ごはん妖精のこめこだよ！\nいっしょに ごはんのこと 考えよ！\nまずは「はじめる」って送ってね！";
    }

    askBudget() {
        return "わかった！✨\nじゃあ、1ヶ月の食費予算をおしえて？\n（例：30000）";
    }

    logAck(label: string, price: number | null, status: "safe" | "warning" | "danger") {
        const comments = {
            safe: ["いいかんじ！👍", "おいしそ〜😋", "メモメモ…✍️"],
            warning: ["ちょっと使いすぎかも？💸", "あしたは節約かな？", "リッチだね〜✨"],
            danger: ["お金使いすぎだよ〜！！😱", "こめ、しんぱい…", "お財布だいじょうぶ！？💸"]
        };
        const c = comments[status][Math.floor(Math.random() * comments[status].length)];
        const p = price ? `${price}円！` : "";
        return `「${label}」だね！${p}\n${c}`;
    }

    budgetReport(total: number, budget: number, status: string) {
        const gauge = status === "danger" ? "🟥🟥🟥" : status === "warning" ? "🟨🟨🟩" : "🟩🟩🟩";
        return `【きょうのさいさん】\n使ったお金：${total}円\n目安：${budget}円\n${gauge}\n\n${status === 'danger' ? 'これ以上はキケン！🙅‍♀️' : 'まだいけるよ！🙆‍♀️'}`;
    }

    menuSuggestion(menus: string[]) {
        return `きょうのごはん、これどう？🍚\n\n1. ${menus[0]}\n2. ${menus[1]}\n3. ${menus[2]}\n\n「1がいい」とか教えてね！`;
    }
}

// ==========================================
// 6. UI Builder
// ==========================================

class FlexBuilder {
    static receipt(meals: MealLog[], total: number) {
        const rows = meals.map(m => ({
            type: "box", layout: "horizontal",
            contents: [
                { type: "text", text: m.label, flex: 3, size: "sm", color: "#555555" },
                { type: "text", text: m.price ? `¥${m.price}` : "-", flex: 1, align: "end", size: "sm", color: "#111111" }
            ]
        }));

        return {
            type: "flex", altText: "きょうのレシート",
            contents: {
                type: "bubble",
                body: {
                    type: "box", layout: "vertical",
                    contents: [
                        { type: "text", text: "🧾 きょうのごはん", weight: "bold", size: "lg", align: "center" },
                        { type: "separator", margin: "md" },
                        { type: "box", layout: "vertical", margin: "md", contents: rows },
                        { type: "separator", margin: "md" },
                        {
                            type: "box", layout: "horizontal", margin: "md",
                            contents: [
                                { type: "text", text: "合計", weight: "bold" },
                                { type: "text", text: `¥${total}`, weight: "bold", align: "end", size: "xl", color: "#ff9900" }
                            ]
                        }
                    ]
                }
            }
        };
    }
}

// ==========================================
// 7. Intent Parser
// ==========================================

class IntentParser {
    parse(text: string): ParsedIntent {
        const t = text.trim();
        if (t === "はじめる") return { kind: "start" };
        if (t === "ヘルプ") return { kind: "help" };
        if (t === "きょうのごはん") return { kind: "log" };
        if (t === "きょうのさいさん") return { kind: "budget" };
        if (t === "こんだて") return { kind: "menu" };
        if (t === "メニュー作って") return { kind: "unknown", payload: "setup_menu" }; // Magic command

        // Log Pattern: "Lunch Curry 800"
        // Heuristic: Contains number -> Price. Rest -> Label.
        const priceMatch = t.match(/(\d+)(円|yen)?/);
        if (priceMatch || t.length > 0) {
            const price = priceMatch ? parseInt(priceMatch[1]) : null;
            const label = t.replace(/(\d+)(円|yen)?/, "").trim();
            return { kind: "log", payload: { label, price } };
        }

        return { kind: "unknown" };
    }
}

// ==========================================
// 8. Controller (Main Loop)
// ==========================================

class BotApp {
    private sb: SupabaseClient;
    private line: LineClient;
    private userRepo: UserRepository;
    private mealRepo: MealRepository;
    private budgetService: BudgetService;
    private suggestionEngine: SuggestionEngine;
    private persona: KomekoPersona;
    private parser: IntentParser;

    constructor() {
        this.sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
        this.line = new LineClient(Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN")!, Deno.env.get("LINE_CHANNEL_SECRET")!);
        this.userRepo = new UserRepository(this.sb);
        this.mealRepo = new MealRepository(this.sb);
        this.budgetService = new BudgetService(this.mealRepo, this.userRepo);
        this.suggestionEngine = new SuggestionEngine(this.mealRepo);
        this.persona = new KomekoPersona();
        this.parser = new IntentParser();
    }

    async handleRequest(req: Request): Promise<Response> {
        if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
        if (!(await this.line.verifySignature(req))) return new Response("Unauthorized", { status: 401 });

        const body = await req.json();
        const events = body.events || [];

        for (const event of events) {
            if (event.type === "message" && event.message.type === "text") {
                await this.handleTextEvent(event);
            }
        }
        return new Response("OK", { status: 200 });
    }

    private async handleTextEvent(event: any) {
        const userId = event.source.userId;
        const replyToken = event.replyToken;
        const text = event.message.text;
        const intent = this.parser.parse(text);

        // Magic Command
        if (intent.payload === "setup_menu") {
            await this.line.setupRichMenu();
            await this.line.reply(replyToken, [{ type: "text", text: "メニューをつくったよ！✨" }]);
            return;
        }

        // Get User
        let user = await this.userRepo.getByLineId(userId);

        // Onboarding Flow
        if (intent.kind === "start") {
            await this.line.reply(replyToken, [{ type: "text", text: this.persona.greet() }]);
            return;
        }
        if (!user && text.match(/^\d+$/)) {
            // Assume setting budget
            user = await this.userRepo.create(userId, parseInt(text));
            await this.line.reply(replyToken, [{ type: "text", text: `予算 ${text}円でメモしたよ！\nこれからよろしくね！🍚` }]);
            return;
        }
        if (!user) {
            await this.line.reply(replyToken, [{ type: "text", text: this.persona.greet() }]);
            return;
        }

        // Main Logic
        switch (intent.kind) {
            case "log": {
                if (intent.payload) {
                    // It's a log entry
                    const { label, price } = intent.payload;
                    const timeSlot = this.estimateTimeSlot();
                    await this.mealRepo.add(user.id, null, label, price, timeSlot, text);

                    const { total, budget, status } = await this.budgetService.checkDailyStatus(userId);
                    await this.line.reply(replyToken, [{ type: "text", text: this.persona.logAck(label, price, status) }]);
                } else {
                    // "Today's meals" request
                    const meals = await this.mealRepo.getToday(user.id);
                    const { total } = await this.budgetService.checkDailyStatus(userId);
                    await this.line.reply(replyToken, [FlexBuilder.receipt(meals, total)]);
                }
                break;
            }
            case "budget": {
                const { total, budget, status } = await this.budgetService.checkDailyStatus(userId);
                await this.line.reply(replyToken, [{ type: "text", text: this.persona.budgetReport(total, budget, status) }]);
                break;
            }
            case "menu": {
                const menus = await this.suggestionEngine.suggest(user.id);
                await this.line.reply(replyToken, [{ type: "text", text: this.persona.menuSuggestion(menus) }]);
                break;
            }
            case "help":
                await this.line.reply(replyToken, [{ type: "text", text: "「昼 カレー 800」みたいに送ってね！\n「きょうのさいさん」で予算チェックできるよ！" }]);
                break;
            default:
                // Fallback: Treat as log if it looks like food? For now just echo help.
                // await this.line.reply(replyToken, [{ type: "text", text: "ん？ごはんのこと？\n「ヘルプ」って送ってみて！" }]);
                break;
        }
    }

    private estimateTimeSlot(): TimeSlot {
        const hour = new Date().getHours() + 9; // JST approximation
        if (hour < 11) return "morning";
        if (hour < 15) return "noon";
        if (hour < 18) return "snack";
        return "evening";
    }
}

// ==========================================
// 9. Entry Point
// ==========================================

const bot = new BotApp();
serve((req) => bot.handleRequest(req));
