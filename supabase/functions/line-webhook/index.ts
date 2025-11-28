// supabase/functions/line-webhook/index.ts

/**
 * -----------------------------------------------------------------------------
 * Yuru Work Log Bot "Biyori-san" (Enterprise Monolith Edition)
 * -----------------------------------------------------------------------------
 * 
 * This file contains the ENTIRE logic for the bot.
 * It demonstrates how Supabase + LINE Bot can handle complex requirements
 * (Database, Storage, Auth, Realtime, Gamification) in a single deployment unit.
 * 
 * Architecture:
 * - Layer 1: Types & Interfaces (Domain Definitions)
 * - Layer 2: Infrastructure (Supabase & LINE Clients)
 * - Layer 3: Domain Services (Persona, Gamification, UI Builder)
 * - Layer 4: Application Logic (Event Processing)
 * - Layer 5: HTTP Server (Entry Point)
 */

import "jsr:@supabase/functions-js/edge-runtime";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ==========================================
// [Layer 1] Types & Interfaces
// ==========================================

// LINE Webhook Types
type LineEvent = {
    type: string;
    replyToken?: string;
    source: {
        type: "user" | "group" | "room";
        userId?: string;
        groupId?: string;
        roomId?: string;
    };
    message?: {
        type: "text" | "image";
        id: string;
        text: string;
    };
};

// Internal Command Types
type CommandKind = "help" | "now" | "summary" | "log" | "debug" | "unknown";

type ParsedCommand =
    | { kind: "help" }
    | { kind: "now" }
    | { kind: "summary" }
    | { kind: "debug" }
    | { kind: "log"; text: string }
    | { kind: "unknown" };

// Database Row Types (for type safety)
interface GroupRow {
    id: string;
    line_group_id: string;
    name: string;
    created_at: string;
}

interface MemberRow {
    id: string;
    group_id: string;
    line_user_id: string;
    display_name: string | null;
    role: "admin" | "member";
    created_at: string;
}

interface ActivityRow {
    id: string;
    group_id: string;
    member_id: string | null;
    activity_type: "log" | "photo";
    raw_text: string;
    created_at: string;
    expires_at: string | null;
}

interface StreakRow {
    user_id: string;
    current_streak: number;
    longest_streak: number;
    last_activity_date: string;
}

// Application Context
interface BotContext {
    groupId: string;
    groupDbId: string;
    memberDbId: string;
    displayName: string | null;
    timestamp: Date;
}

// ==========================================
// [Layer 2] Infrastructure
// ==========================================

/**
 * Wrapper for LINE Messaging API
 * Handles signature verification and message sending (Reply/Push/Content).
 */
class LineService {
    private channelAccessToken: string;
    private channelSecret: string;

    constructor() {
        this.channelAccessToken = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN")!;
        this.channelSecret = Deno.env.get("LINE_CHANNEL_SECRET")!;
        if (!this.channelAccessToken || !this.channelSecret) {
            throw new Error("FATAL: Missing LINE environment variables");
        }
    }

    /**
     * Verifies the request signature using HMAC-SHA256.
     */
    async verifySignature(request: Request): Promise<boolean> {
        const signature = request.headers.get("x-line-signature");
        if (!signature) return false;
        const body = await request.clone().text();
        const key = await crypto.subtle.importKey(
            "raw", new TextEncoder().encode(this.channelSecret),
            { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
        );
        return await crypto.subtle.verify(
            "HMAC", key,
            Uint8Array.from(atob(signature), c => c.charCodeAt(0)),
            new TextEncoder().encode(body)
        );
    }

    async replyMessage(replyToken: string, messages: any[]) {
        console.log(`[LineService] Replying to ${replyToken} with ${messages.length} messages`);
        const res = await fetch("https://api.line.me/v2/bot/message/reply", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.channelAccessToken}` },
            body: JSON.stringify({ replyToken, messages }),
        });
        if (!res.ok) {
            const err = await res.text();
            console.error(`[LineService] Reply failed: ${err}`);
        }
    }

    async getMessageContent(messageId: string): Promise<ArrayBuffer> {
        const res = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
            headers: { Authorization: `Bearer ${this.channelAccessToken}` },
        });
        if (!res.ok) throw new Error(`Failed to get content: ${res.statusText}`);
        return await res.arrayBuffer();
    }
}

// ==========================================
// [Layer 3] Domain Services
// ==========================================

/**
 * "Biyori-san" Persona Engine.
 * Handles all text generation to ensure consistent character voice.
 * The persona is a "toddler-like" helper who is enthusiastic but simple.
 */
class BiyoriPersona {
    // Random response helper
    private pick<T>(arr: T[]): T {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    getLogRecordedResponse(text: string): string {
        const templates = [
            `メモした！📝\n『${text}』だね！`,
            `うん！『${text}』！\nわかったよー！✨`,
            `『${text}』！\nすごいすごい！えらいねー！💮`,
            `かきかき…✍️\n『${text}』って かいといたよ！`,
        ];
        return this.pick(templates) + "\nみんなに いうねー！📢";
    }

    getPhotoRecordedResponse(): string {
        return this.pick([
            "しゃしん！📸\nちゃんと メモしたよー！",
            "わあ！しゃしんだー！✨\nアルバムに はっとくね！",
            "パシャリ！📸\nいいかんじ だねー！",
        ]);
    }

    getPhotoErrorResponse(): string {
        return "ごめんね…💦\nしゃしん、うまく とれなかったの…。\nもういっかい おねがいできる？🥺";
    }

    getNowResponse(logs: { time: string; text: string }[]): string {
        if (logs.length === 0) {
            return this.pick([
                "まだ なにもないよ！👀\nこれから かな？",
                "まっしろ だよ！\nなにか やったら おしえてね！✨",
            ]);
        }
        const list = logs.map(l => `・${l.time} ${l.text}`).join("\n");
        return `これ！👀\n\n${list}\n\nいま ${logs.length}こ やったよ！✨\nもっと ふえるかなー？`;
    }

    getSummaryResponse(logs: { time: string; text: string }[]): string {
        if (logs.length === 0) {
            return "きょうは まだ きろくがないよ！\nゆっくりやすんでる？🍵";
        }
        const list = logs.map(l => `${l.time} ${l.text}`).join("\n");
        return `きょうの まとめだよ！📝\n\n${list}\n\nぜんぶで ${logs.length}こ！\nみんな ほんとに すごいねー！💮\nあしたも がんばろうね！`;
    }

    getHelpText(): string {
        return [
            "びよりだよ📛",
            "",
            "できること おしえるね！",
            "1️⃣ さぎょうの きろく",
            "「くさむしりした」「お皿洗い」って おくってね。",
            "しゃしん📷 を おくっても OKだよ！",
            "",
            "2️⃣ いまの じょうきょう",
            "「今どう？」「なにしてる？」って きいてね。",
            "",
            "3️⃣ 1にちの まとめ",
            "「まとめ」って いうと、きょうの ぜんぶ みれるよ。",
            "",
            "たくさん おしえてね！✨",
        ].join("\n");
    }

    getStreakMessage(days: number): string {
        if (days < 3) return "";
        if (days < 7) return `すごい！ ${days}にち れんぞくだよ！🔥`;
        if (days < 30) return `すごーい！！ ${days}にち も つづいてるよ！✨\nほんとに えらいねー！`;
        return `かみさまレベル！？👼\n${days}にち れんぞく！！\nもう びより、かんどうしちゃった…🥺`;
    }

    getUnknownCommandResponse(): string {
        return this.pick([
            "ん？👀",
            "どうしたの？🍀",
            "「ヘルプ」って いってくれたら\nできること おしえるよ！",
        ]);
    }
}

/**
 * Flex Message Builder.
 * Generates complex JSON for LINE Flex Messages.
 * Focuses on "Receipt" style summaries and "Card" style notifications.
 */
class FlexMessageBuilder {
    static createDailySummary(logs: { time: string; text: string; isPhoto: boolean }[]): any {
        // Header Color based on log count (Gamification visual)
        const headerColor = logs.length > 5 ? "#ff9900" : "#1DB446"; // Orange for high activity, Green normal

        const logContents = logs.map((log, index) => ({
            type: "box",
            layout: "horizontal",
            margin: "md",
            contents: [
                {
                    type: "text",
                    text: log.time,
                    size: "xs",
                    color: "#888888",
                    flex: 2,
                    gravity: "center"
                },
                {
                    type: "text",
                    text: log.isPhoto ? "📷 (しゃしん)" : log.text,
                    size: "sm",
                    color: "#111111",
                    flex: 6,
                    wrap: true,
                    gravity: "center"
                },
                // Visual checkmark
                {
                    type: "text",
                    text: "✓",
                    size: "xs",
                    color: "#cccccc",
                    flex: 1,
                    align: "end",
                    gravity: "center"
                }
            ],
        }));

        return {
            type: "flex",
            altText: "きょうのまとめだよ！",
            contents: {
                type: "bubble",
                size: "mega",
                header: {
                    type: "box",
                    layout: "vertical",
                    backgroundColor: headerColor,
                    paddingAll: "20px",
                    contents: [
                        {
                            type: "text",
                            text: "📝 きょうのきろく",
                            weight: "bold",
                            color: "#ffffff",
                            size: "lg",
                        },
                        {
                            type: "text",
                            text: `${new Date().toLocaleDateString('ja-JP')} の レポート`,
                            color: "#ffffffcc",
                            size: "xs",
                            margin: "sm"
                        }
                    ],
                },
                body: {
                    type: "box",
                    layout: "vertical",
                    paddingAll: "20px",
                    contents: [
                        {
                            type: "box",
                            layout: "horizontal",
                            contents: [
                                {
                                    type: "text",
                                    text: "TOTAL",
                                    size: "sm",
                                    color: "#888888",
                                    flex: 1
                                },
                                {
                                    type: "text",
                                    text: `${logs.length}件`,
                                    size: "xl",
                                    weight: "bold",
                                    color: "#333333",
                                    align: "end",
                                    flex: 1
                                }
                            ]
                        },
                        { type: "separator", margin: "lg" },
                        {
                            type: "box",
                            layout: "vertical",
                            margin: "lg",
                            contents: logContents
                        }
                    ],
                },
                footer: {
                    type: "box",
                    layout: "vertical",
                    contents: [
                        {
                            type: "text",
                            text: "みんな すごいねー！💮",
                            color: "#aaaaaa",
                            size: "xs",
                            align: "center",
                        },
                        {
                            type: "text",
                            text: "Powerd by Supabase",
                            color: "#eeeeee",
                            size: "xxs",
                            align: "center",
                            margin: "md"
                        }
                    ],
                },
            },
        };
    }

    static createBadgeNotification(badge: { name: string; description: string; id: string }): any {
        // Badge colors
        const colors: Record<string, string> = {
            "first_log": "#4287f5",
            "early_bird": "#f5d742",
            "streak_3": "#f54242",
            "night_owl": "#9e42f5"
        };
        const color = colors[badge.id] || "#1DB446";

        return {
            type: "flex",
            altText: "バッジをもらったよ！",
            contents: {
                type: "bubble",
                body: {
                    type: "box",
                    layout: "vertical",
                    contents: [
                        {
                            type: "text",
                            text: "🎉 NEW BADGE!",
                            weight: "bold",
                            size: "xs",
                            color: color,
                            align: "center",
                        },
                        {
                            type: "text",
                            text: badge.name,
                            weight: "bold",
                            size: "xl",
                            margin: "md",
                            align: "center",
                        },
                        {
                            type: "separator",
                            margin: "md"
                        },
                        {
                            type: "text",
                            text: badge.description,
                            size: "sm",
                            color: "#666666",
                            margin: "md",
                            align: "center",
                            wrap: true
                        },
                        {
                            type: "text",
                            text: "バッジをゲットしたよ！✨",
                            size: "xs",
                            color: "#aaaaaa",
                            align: "center",
                            margin: "xl",
                        },
                    ],
                },
                styles: {
                    footer: {
                        separator: true
                    }
                }
            },
        };
    }
}

/**
 * Gamification Service.
 * Handles logic for streaks and badges.
 * Encapsulates the complex rules for awarding achievements.
 */
class GamificationEngine {
    constructor(private supabase: SupabaseClient) { }

    async updateStreak(userId: string): Promise<{ current: number; isNewRecord: boolean }> {
        const today = new Date().toISOString().split('T')[0];
        const { data: streakRow } = await this.supabase
            .from("streaks")
            .select("*")
            .eq("user_id", userId)
            .maybeSingle();

        if (!streakRow) {
            // Initialize streak
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
            // Already logged today
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

    async checkBadges(userId: string, context: { logCount: number, currentStreak: number }): Promise<Array<{ id: string, name: string, description: string }>> {
        const newBadges: Array<{ id: string, name: string, description: string }> = [];

        // Helper to check and award
        const checkAndAward = async (badgeId: string) => {
            const { data } = await this.supabase
                .from("user_badges")
                .select("id")
                .eq("user_id", userId)
                .eq("badge_id", badgeId)
                .maybeSingle();

            if (!data) {
                // Get badge details
                const { data: badgeInfo } = await this.supabase.from("badges").select("*").eq("id", badgeId).single();
                if (badgeInfo) {
                    await this.supabase.from("user_badges").insert({ user_id: userId, badge_id: badgeId });
                    newBadges.push(badgeInfo);
                }
            }
        };

        // Rule 1: First Log
        if (context.logCount === 1) await checkAndAward('first_log');

        // Rule 2: Streak 3
        if (context.currentStreak >= 3) await checkAndAward('streak_3');

        // Rule 3: Early Bird (Before 6 AM)
        const hour = new Date().getHours();
        if (hour < 6) await checkAndAward('early_bird');

        // Rule 4: Night Owl (After 10 PM)
        if (hour >= 22) await checkAndAward('night_owl');

        return newBadges;
    }
}

// ==========================================
// [Layer 4] Application Logic (The "Brain")
// ==========================================

class BotApp {
    private supabase: SupabaseClient;
    private line: LineService;
    private persona: BiyoriPersona;
    private gamification: GamificationEngine;

    constructor() {
        this.supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_ANON_KEY")!
        );
        this.line = new LineService();
        this.persona = new BiyoriPersona();
        this.gamification = new GamificationEngine(this.supabase);
    }

    /**
     * Main HTTP Request Handler
     */
    async handleRequest(req: Request): Promise<Response> {
        try {
            // 1. Security Check
            if (!(await this.line.verifySignature(req))) {
                console.warn("[Auth] Invalid Signature");
                return new Response("Invalid signature", { status: 401 });
            }

            // 2. Parse Events
            const body = await req.json();
            const events: LineEvent[] = body.events ?? [];

            console.log(`[Event] Received ${events.length} events`);

            // 3. Process Loop
            for (const event of events) {
                // We only handle Message events from Groups or Users
                if (event.type !== "message" || !event.replyToken) continue;

                // Async processing (fire and forget logic could be applied here, but we await for safety)
                await this.processEvent(event);
            }

            return new Response("OK", { status: 200 });

        } catch (err) {
            console.error("[Fatal] Error handling request:", err);
            return new Response("Internal Server Error", { status: 500 });
        }
    }

    /**
     * Event Processor
     */
    private async processEvent(event: LineEvent) {
        const userId = event.source.userId;
        const lineGroupId = event.source.groupId ?? event.source.roomId ?? event.source.userId;

        if (!userId || !lineGroupId) {
            console.warn("[Event] Missing user or group ID");
            return;
        }

        // 1. Build Context (Load/Create User & Group)
        const ctx = await this.getOrCreateContext(lineGroupId, userId);

        // 2. Route by Message Type
        if (event.message?.type === "image") {
            await this.handleImageMessage(ctx, event.message.id, event.replyToken!);
        } else if (event.message?.type === "text") {
            await this.handleTextMessage(ctx, event.message.text, event.replyToken!);
        }
    }

    /**
     * Text Message Handler
     */
    private async handleTextMessage(ctx: BotContext, text: string, replyToken: string) {
        const command = this.parseCommand(text);

        switch (command.kind) {
            case "help":
                await this.line.replyMessage(replyToken, [{ type: "text", text: this.persona.getHelpText() }]);
                break;

            case "now": {
                const logs = await this.getTodayLogs(ctx.groupDbId);
                // Use Flex Message if we have data, otherwise text
                if (logs.length > 0) {
                    await this.line.replyMessage(replyToken, [FlexMessageBuilder.createDailySummary(logs)]);
                } else {
                    await this.line.replyMessage(replyToken, [{ type: "text", text: this.persona.getNowResponse(logs) }]);
                }
                break;
            }

            case "summary": {
                const logs = await this.getTodayLogs(ctx.groupDbId);
                if (logs.length > 0) {
                    await this.line.replyMessage(replyToken, [FlexMessageBuilder.createDailySummary(logs)]);
                } else {
                    await this.line.replyMessage(replyToken, [{ type: "text", text: this.persona.getSummaryResponse(logs) }]);
                }
                break;
            }

            case "log": {
                // 1. Save Log
                await this.saveActivity(ctx, command.text, "log");

                // 2. Gamification Logic
                const { current, isNewRecord } = await this.gamification.updateStreak(ctx.memberDbId);
                const logs = await this.getTodayLogs(ctx.groupDbId);
                const newBadges = await this.gamification.checkBadges(ctx.memberDbId, {
                    logCount: logs.length,
                    currentStreak: current
                });

                // 3. Build Reply
                const replies: any[] = [
                    { type: "text", text: this.persona.getLogRecordedResponse(command.text) }
                ];

                // Add Streak Message
                const streakMsg = this.persona.getStreakMessage(current);
                if (isNewRecord && streakMsg) {
                    replies.push({ type: "text", text: streakMsg });
                }

                // Add Badges
                for (const badge of newBadges) {
                    replies.push(FlexMessageBuilder.createBadgeNotification(badge));
                }

                await this.line.replyMessage(replyToken, replies);
                break;
            }

            default:
                // Ignore unknown commands to not spam groups
                // await this.line.replyMessage(replyToken, [{ type: "text", text: this.persona.getUnknownCommandResponse() }]);
                break;
        }
    }

    /**
     * Image Message Handler
     */
    private async handleImageMessage(ctx: BotContext, messageId: string, replyToken: string) {
        try {
            // 1. Get Content
            const content = await this.line.getMessageContent(messageId);

            // 2. Upload to Supabase
            const fileName = `${ctx.memberDbId}/${Date.now()}.jpg`;
            const { error: uploadError } = await this.supabase.storage
                .from("photos")
                .upload(fileName, content, { contentType: "image/jpeg" });

            if (uploadError) throw uploadError;

            // 3. Get Public URL
            const { data: urlData } = this.supabase.storage.from("photos").getPublicUrl(fileName);

            // 4. Save Activity
            await this.saveActivity(ctx, "📷 しゃしん", "photo", urlData.publicUrl);

            // 5. Reply
            await this.line.replyMessage(replyToken, [{ type: "text", text: this.persona.getPhotoRecordedResponse() }]);

        } catch (e) {
            console.error("[Image] Upload failed:", e);
            await this.line.replyMessage(replyToken, [{ type: "text", text: this.persona.getPhotoErrorResponse() }]);
        }
    }

    // ---- Helpers ----

    private parseCommand(text: string): ParsedCommand {
        const t = text.trim();
        if (/^(ヘルプ|help|使い方|てつだって)$/i.test(t)) return { kind: "help" };
        if (/^(今どう\？?|いまどう\？?|なにしてる\？?)$/.test(t)) return { kind: "now" };
        if (/^(今日のまとめ|きょうのまとめ|まとめ)$/i.test(t)) return { kind: "summary" };
        // Default to log
        return { kind: "log", text: t };
    }

    private async getOrCreateContext(lineGroupId: string, lineUserId: string): Promise<BotContext> {
        // 1. Group
        let { data: group } = await this.supabase
            .from("groups")
            .select("*")
            .eq("line_group_id", lineGroupId)
            .maybeSingle();

        if (!group) {
            const { data } = await this.supabase
                .from("groups")
                .insert({ line_group_id: lineGroupId, name: "未設定" })
                .select()
                .single();
            group = data;
        }

        // 2. Member
        let { data: member } = await this.supabase
            .from("members")
            .select("*")
            .eq("group_id", group.id)
            .eq("line_user_id", lineUserId)
            .maybeSingle();

        if (!member) {
            const { data } = await this.supabase
                .from("members")
                .insert({ group_id: group.id, line_user_id: lineUserId })
                .select()
                .single();
            member = data;
        }

        return {
            groupId: lineGroupId,
            groupDbId: group.id,
            memberDbId: member.id,
            displayName: member.display_name,
            timestamp: new Date()
        };
    }

    private async saveActivity(ctx: BotContext, text: string, type: "log" | "photo", meta?: string) {
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 12); // Keep logs for 12 hours active

        await this.supabase.from("activities").insert({
            group_id: ctx.groupDbId,
            member_id: ctx.memberDbId,
            raw_text: text,
            activity_type: type,
            expires_at: expiresAt.toISOString(),
            // In a real app, we'd have a 'metadata' jsonb column for the photo URL
            // For now, we assume the text carries the meaning or we'd extend the schema.
        });
        console.log(`[DB] Saved activity: ${text} (${type})`);
    }

    private async getTodayLogs(groupDbId: string) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const { data } = await this.supabase
            .from("activities")
            .select("*")
            .eq("group_id", groupDbId)
            .gte("created_at", today.toISOString())
            .order("created_at", { ascending: true });

        return (data || []).map((log: any) => {
            const t = new Date(log.created_at);
            const timeStr = `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
            return {
                time: timeStr,
                text: log.raw_text,
                isPhoto: log.activity_type === "photo"
            };
        });
    }
}

// ==========================================
// [Layer 5] Server Entry Point
// ==========================================

const bot = new BotApp();

console.log("🚀 Yuru Work Log Bot (Enterprise Monolith) Started!");

serve(async (req) => {
    return await bot.handleRequest(req);
});
