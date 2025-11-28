// supabase/functions/_shared/src/services/LineService.ts

export class LineService {
    private channelAccessToken: string;
    private channelSecret: string;

    constructor() {
        this.channelAccessToken = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN")!;
        this.channelSecret = Deno.env.get("LINE_CHANNEL_SECRET")!;

        if (!this.channelAccessToken || !this.channelSecret) {
            throw new Error("Missing LINE environment variables");
        }
    }

    async verifySignature(request: Request): Promise<boolean> {
        const signature = request.headers.get("x-line-signature");
        if (!signature) return false;

        const body = await request.clone().text();

        const key = await crypto.subtle.importKey(
            "raw",
            new TextEncoder().encode(this.channelSecret),
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["verify"],
        );

        const ok = await crypto.subtle.verify(
            "HMAC",
            key,
            Uint8Array.from(
                Array.from(
                    atob(signature),
                    (c) => c.charCodeAt(0),
                ),
            ),
            new TextEncoder().encode(body),
        );

        return ok;
    }

    async replyMessage(replyToken: string, messages: any[]) {
        await fetch("https://api.line.me/v2/bot/message/reply", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.channelAccessToken}`,
            },
            body: JSON.stringify({ replyToken, messages }),
        });
    }

    async pushMessage(to: string, messages: any[]) {
        await fetch("https://api.line.me/v2/bot/message/push", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.channelAccessToken}`,
            },
            body: JSON.stringify({ to, messages }),
        });
    }

    async getMessageContent(messageId: string): Promise<ArrayBuffer> {
        const res = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
            headers: {
                Authorization: `Bearer ${this.channelAccessToken}`,
            },
        });

        if (!res.ok) {
            throw new Error(`Failed to get content: ${res.statusText}`);
        }

        return await res.arrayBuffer();
    }
}
