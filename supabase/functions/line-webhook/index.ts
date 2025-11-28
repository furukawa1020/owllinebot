// supabase/functions/line-webhook/index.ts

import "jsr:@supabase/functions-js/edge-runtime";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ==========================================
// 1. Types & Interfaces
// ==========================================

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

type CommandKind = "help" | "now" | "summary" | "log" | "unknown";

type ParsedCommand =
    | { kind: "help" }
    | { kind: "now" }
    | { kind: "summary" }
    | { kind: "log"; text: string }
    | { kind: "unknown" };

interface GroupContext {
    groupId: string;
    groupDbId: string;
    memberDbId: string;
    displayName: string | null;
}

// ==========================================
// 2. Services (Inner Classes)
// ==========================================

class LineService {
    private channelAccessToken: string;
    private channelSecret: string;

    constructor() {
        this.channelAccessToken = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN")!;
        this.channelSecret = Deno.env.get("LINE_CHANNEL_SECRET")!;
        if (!this.channelAccessToken || !this.channelSecret) throw new Error("Missing LINE env vars");
    }

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
        await fetch("https://api.line.me/v2/bot/message/reply", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.channelAccessToken}` },
            body: JSON.stringify({ replyToken, messages }),
        });
    }

    async getMessageContent(messageId: string): Promise<ArrayBuffer> {
        const res = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
            headers: { Authorization: `Bearer ${this.channelAccessToken}` },
        });
        if (!res.ok) throw new Error(`Failed to get content: ${res.statusText}`);
        return await res.arrayBuffer();
    }
}

class FlexMessageBuilder {
    static createDailySummary(logs: { time: string; text: string }[]): any {
        const logContents = logs.map((log) => ({
            type: "box", layout: "horizontal", margin: "md",
            contents: [
                { type: "text", text: log.time, size: "sm", color: "#888888", flex: 2 },
                { type: "text", text: log.text, size: "sm", color: "#111111", flex: 5, wrap: true },
            ],
        }));

        return {
            type: "flex", altText: "きょうのまとめだよ！",
            contents: {
                type: "bubble",
                header: {
                    type: "box", layout: "vertical",
                    contents: [{ type: "text", text: "📝 きょうのきろく", weight: "bold", color: "#1DB446", size: "lg" }],
                },
                body: {
                    type: "box", layout: "vertical",
                    contents: [
                        { type: "text", text: `ぜんぶで ${logs.length}こ！`, weight: "bold", size: "xl", margin: "md" },
                        { type: "separator", margin: "lg" },
                        ...logContents,
                    ],
                },
                footer: {
                    type: "box", layout: "vertical",
                    contents: [{ type: "text", text: "みんな すごいねー！💮", color: "#aaaaaa", size: "xs", align: "center" }],
                },
            },
        };
    }

    static createBadgeNotification(badgeName: string): any {
        return {
            type: "flex", altText: "バッジをもらったよ！",
            contents: {
                type: "bubble",
                body: {
                    type: "box", layout: "vertical",
                    contents: [
                        { type: "text", text: "🎉 おめでとう！", weight: "bold", size: "xl", color: "#ff9900", align: "center" },
                        { type: "text", text: `『${badgeName}』`, weight: "bold", size: "lg", align: "center", margin: "md" },
                        { type: "text", text: "バッジをゲットしたよ！✨", size: "md", align: "center", margin: "sm" },
                    ],
                },
            },
        };
    }
}

class BiyoriPersona {
    getLogRecordedResponse(text: string) { return `メモした！📝\n『${text}』だね！\nみんなに いうねー！📢`; }
    getNowResponse(logs: any[]) {
        if (logs.length === 0) return "まだ なにもないよ！👀";
        return `これ！👀\n${logs.map(l => `・${l.time} ${l.text}`).join("\n")}\nいま ${logs.length}こ やったよ！✨`;
    }
    getSummaryResponse(logs: any[]) {
        if (logs.length === 0) return "きょうは まだないよ！";
        return `きょうの！📝\nぜんぶで ${logs.length}こ！\n\n${logs.map(l => `${l.time} ${l.text}`).join("\n")}\n\nみんな すごいねー！💮`;
    }
    getHelpText() { return "びよりだよ📛\n\n・『くさむしりした』って おしえてね。\n・『今どう？』で みれるよ。\n・『まとめ』で きょうのぜんぶ わかるよ。\n\nメモするよ！✍️"; }
    getUnknownCommandResponse() { return "ん？👀"; }
}

// ==========================================
// 3. Main Logic Class
// ==========================================

class BotApp {
    private supabase: SupabaseClient;
    private line: LineService;
    private persona: BiyoriPersona;

    constructor() {
        this.supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_ANON_KEY")!
        );
        this.line = new LineService();
        this.persona = new BiyoriPersona();
    }

    async handleRequest(req: Request): Promise<Response> {
        try {
            if (!(await this.line.verifySignature(req))) {
                return new Response("Invalid signature", { status: 401 });
            }

            const body = await req.json();
            const events: LineEvent[] = body.events ?? [];

            for (const event of events) {
                if (event.type !== "message" || !event.replyToken) continue;
                await this.processEvent(event);
            }

            return new Response("OK", { status: 200 });
        } catch (err) {
            console.error(err);
            return new Response("Internal Server Error", { status: 500 });
        }
    }

    private async processEvent(event: LineEvent) {
        const userId = event.source.userId;
        const lineGroupId = event.source.groupId ?? event.source.roomId ?? event.source.userId;
        if (!userId || !lineGroupId) return;

        // 1. Context (Get/Create Group & Member)
        const ctx = await this.getOrCreateContext(lineGroupId, userId);

        // 2. Handle Image
        if (event.message?.type === "image") {
            const imageUrl = await this.handleImageUpload(event.message.id, userId);
            if (imageUrl) {
                await this.logActivity(ctx, "📷 しゃしん", imageUrl);
                await this.line.replyMessage(event.replyToken!, [{ type: "text", text: "しゃしん メモしたよ！📸" }]);
            } else {
                await this.line.replyMessage(event.replyToken!, [{ type: "text", text: "ごめんね、しゃしん うまくとれなかった…💦" }]);
            }
            return;
        }

        // 3. Handle Text
        if (event.message?.type === "text") {
            const text = event.message.text.trim();
            const replies = await this.handleTextCommand(ctx, text);
            if (replies.length > 0) {
                await this.line.replyMessage(event.replyToken!, replies);
            }
        }
    }

    private async handleTextCommand(ctx: GroupContext, text: string): Promise<any[]> {
        // Command Parsing
        if (/^(ヘルプ|help|使い方|てつだって)$/i.test(text)) return [{ type: "text", text: this.persona.getHelpText() }];

        if (/^(今どう\？?|いまどう\？?|なにしてる\？?)$/.test(text)) {
            const logs = await this.getTodayLogs(ctx.groupDbId);
            if (logs.length > 0) return [FlexMessageBuilder.createDailySummary(logs)];
            return [{ type: "text", text: this.persona.getNowResponse(logs) }];
        }

        if (/^(今日のまとめ|きょうのまとめ|まとめ)$/i.test(text)) {
            const logs = await this.getTodayLogs(ctx.groupDbId);
            if (logs.length > 0) return [FlexMessageBuilder.createDailySummary(logs)];
            return [{ type: "text", text: this.persona.getSummaryResponse(logs) }];
        }

        // Default: Log Activity
        await this.logActivity(ctx, text);

        // Gamification Check
        const { current, isNewRecord } = await this.updateStreak(ctx.memberDbId);
        const logs = await this.getTodayLogs(ctx.groupDbId); // Re-fetch to include new log
        const newBadges = await this.checkBadges(ctx.memberDbId, logs.length, current);

        const replies: any[] = [{ type: "text", text: this.persona.getLogRecordedResponse(text) }];

        for (const badge of newBadges) {
            replies.push(FlexMessageBuilder.createBadgeNotification(badge));
        }
        if (isNewRecord && current > 1) {
            replies.push({ type: "text", text: `すごい！ ${current}にち れんぞくだよ！🔥` });
        }

        return replies;
    }

    // ---- Helpers (Database Interactions) ----

    private async getOrCreateContext(lineGroupId: string, lineUserId: string): Promise<GroupContext> {
        // Group
        let { data: group } = await this.supabase.from("groups").select("*").eq("line_group_id", lineGroupId).maybeSingle();
        if (!group) {
            const { data } = await this.supabase.from("groups").insert({ line_group_id: lineGroupId, name: "未設定" }).select().single();
            group = data;
        }
        // Member
        let { data: member } = await this.supabase.from("members").select("*").eq("group_id", group.id).eq("line_user_id", lineUserId).maybeSingle();
        if (!member) {
            const { data } = await this.supabase.from("members").insert({ group_id: group.id, line_user_id: lineUserId }).select().single();
            member = data;
        }
        return { groupId: lineGroupId, groupDbId: group.id, memberDbId: member.id, displayName: member.display_name };
    }

    private async logActivity(ctx: GroupContext, text: string, imageUrl?: string) {
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 6);
        await this.supabase.from("activities").insert({
            group_id: ctx.groupDbId,
            member_id: ctx.memberDbId,
            raw_text: text,
            activity_type: imageUrl ? "photo" : "log",
            expires_at: expiresAt.toISOString(),
            // Note: If we had a metadata column, we'd store imageUrl there. 
            // For now, we'll assume the text contains a hint or we just log it.
        });
    }

    private async getTodayLogs(groupDbId: string) {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const { data } = await this.supabase.from("activities")
            .select("*").eq("group_id", groupDbId).gte("created_at", today.toISOString()).order("created_at", { ascending: true });
        return (data || []).map((log: any) => {
            const t = new Date(log.created_at);
            return { time: `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`, text: log.raw_text };
        });
    }

    private async handleImageUpload(messageId: string, userId: string): Promise<string | null> {
        try {
            const content = await this.line.getMessageContent(messageId);
            const fileName = `${userId}/${Date.now()}.jpg`;
            const { error } = await this.supabase.storage.from("photos").upload(fileName, content, { contentType: "image/jpeg" });
            if (error) return null;
            const { data } = this.supabase.storage.from("photos").getPublicUrl(fileName);
            return data.publicUrl;
        } catch { return null; }
    }

    private async updateStreak(userId: string) {
        const today = new Date().toISOString().split('T')[0];
        const { data: streak } = await this.supabase.from("streaks").select("*").eq("user_id", userId).maybeSingle();

        if (!streak) {
            await this.supabase.from("streaks").insert({ user_id: userId, current_streak: 1, longest_streak: 1, last_activity_date: today });
            return { current: 1, isNewRecord: true };
        }

        const lastDate = new Date(streak.last_activity_date);
        const diffDays = Math.ceil(Math.abs(new Date(today).getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));

        let current = streak.current_streak;
        if (diffDays === 1) current++;
        else if (diffDays > 1) current = 1;

        const isNewRecord = current > streak.longest_streak;
        if (diffDays > 0) {
            await this.supabase.from("streaks").update({
                current_streak: current, longest_streak: isNewRecord ? current : streak.longest_streak, last_activity_date: today, updated_at: new Date().toISOString()
            }).eq("user_id", userId);
        }
        return { current, isNewRecord };
    }

    private async checkBadges(userId: string, logCount: number, streak: number) {
        const newBadges: string[] = [];
        const award = async (bid: string) => {
            const { data } = await this.supabase.from("user_badges").select("id").eq("user_id", userId).eq("badge_id", bid).maybeSingle();
            if (!data) {
                await this.supabase.from("user_badges").insert({ user_id: userId, badge_id: bid });
                newBadges.push(bid);
            }
        };

        if (logCount === 1) await award('first_log');
        if (streak >= 3) await award('streak_3');
        if (new Date().getHours() < 6) await award('early_bird');
        return newBadges;
    }
}

// ==========================================
// 4. Entry Point
// ==========================================

const bot = new BotApp();
serve((req) => bot.handleRequest(req));
