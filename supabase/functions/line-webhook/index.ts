// supabase/functions/line-webhook/index.ts

import "jsr:@supabase/functions-js/edge-runtime";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const LINE_CHANNEL_SECRET = Deno.env.get("LINE_CHANNEL_SECRET")!;
const LINE_CHANNEL_ACCESS_TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---- Types ----
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
    type: "text";
    id: string;
    text: string;
  };
};

type GroupContext = {
  groupId: string;
  groupDbId: string;
  memberDbId: string | null;
  displayName: string | null;
};

// ---- LINE API Helpers ----
async function replyMessage(replyToken: string, messages: { type: string; text: string }[]) {
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ replyToken, messages }),
  });
}

async function verifySignature(request: Request): Promise<boolean> {
  const signature = request.headers.get("x-line-signature");
  if (!signature) return false;
  const body = await request.clone().text();
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(LINE_CHANNEL_SECRET),
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

// ---- Context Management ----
async function getOrCreateGroupContext(
  source: LineEvent["source"],
): Promise<GroupContext | null> {
  const lineGroupId = source.groupId ?? source.roomId ?? source.userId;
  if (!lineGroupId || !source.userId) return null;

  // 1. Get or Create Group
  const { data: groupRow, error: groupErr } = await supabase
    .from("groups")
    .select("*")
    .eq("line_group_id", lineGroupId)
    .maybeSingle();

  let groupDbId: string;
  if (!groupRow || groupErr) {
    const { data: inserted, error: insertErr } = await supabase
      .from("groups")
      .insert({
        line_group_id: lineGroupId,
        name: "未設定グループ",
      })
      .select()
      .single();
    if (insertErr) {
        console.error("Group insert error:", insertErr);
        throw insertErr;
    }
    groupDbId = inserted.id;
  } else {
    groupDbId = groupRow.id;
  }

  // 2. Get or Create Member
  const { data: memberRow, error: memberErr } = await supabase
    .from("members")
    .select("*")
    .eq("group_id", groupDbId)
    .eq("line_user_id", source.userId)
    .maybeSingle();

  let memberDbId: string | null = null;
  if (!memberRow || memberErr) {
    const { data: inserted, error: insertErr } = await supabase
      .from("members")
      .insert({
        group_id: groupDbId,
        line_user_id: source.userId,
        display_name: null,
      })
      .select()
      .single();
    if (!insertErr) {
      memberDbId = inserted.id;
    }
  } else {
    memberDbId = memberRow.id;
  }

  return {
    groupId: lineGroupId,
    groupDbId,
    memberDbId,
    displayName: null,
  };
}

// ---- Command Parser (Toddler Persona) ----
type ParsedCommand =
  | { kind: "help" }
  | { kind: "now" }
  | { kind: "summary" }
  | { kind: "log"; text: string };

function parseTextCommand(text: string): ParsedCommand {
  const trimmed = text.trim();

  // Simple keyword matching for toddler persona
  if (/^(ヘルプ|help|使い方|てつだって)$/i.test(trimmed)) {
    return { kind: "help" };
  }
  if (/^(今どう\？?|いまどう\？?|なにしてる\？?)$/.test(trimmed)) {
    return { kind: "now" };
  }
  if (/^(今日のまとめ|きょうのまとめ|まとめ)$/i.test(trimmed)) {
    return { kind: "summary" };
  }
  // Default to log
  return { kind: "log", text: trimmed };
}

// ---- Handlers ----
async function handleLogCommand(ctx: GroupContext, cmd: Extract<ParsedCommand, { kind: "log" }>) {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 6); // 6 hours expiration

  const { error } = await supabase.from("activities").insert({
    group_id: ctx.groupDbId,
    member_id: ctx.memberDbId,
    raw_text: cmd.text,
    activity_type: "log",
    expires_at: expiresAt.toISOString(),
  });

  if (error) {
    console.error("Log insert error:", error);
    return "ごめんね、かけなかった…💦";
  }

  // Toddler response
  return [
    "メモした！📝",
    `『${cmd.text}』だね！`,
    "みんなに いうねー！📢",
  ].join("\n");
}

async function handleNowCommand(ctx: GroupContext): Promise<string> {
  const today = new Date();
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from("activities")
    .select("created_at, raw_text")
    .eq("group_id", ctx.groupDbId)
    .gte("created_at", start.toISOString())
    .order("created_at", { ascending: true });

  if (error || !data) {
    return "ごめんね、わかんない…💦";
  }
  if (data.length === 0) {
    return "まだ なにもないよ！👀";
  }

  const lines = data.map((row) => {
    const t = new Date(row.created_at);
    const hh = String(t.getHours()).padStart(2, "0");
    const mm = String(t.getMinutes()).padStart(2, "0");
    return `・${hh}:${mm} ${row.raw_text}`;
  });

  return ["これ！👀", ...lines, `いま ${data.length}こ やったよ！✨`].join("\n");
}

async function handleSummaryCommand(ctx: GroupContext): Promise<string> {
  const today = new Date();
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from("activities")
    .select("created_at, raw_text")
    .eq("group_id", ctx.groupDbId)
    .gte("created_at", start.toISOString())
    .order("created_at", { ascending: true });

  if (error || !data) {
    return "ごめんね、まとめられない…💦";
  }
  if (data.length === 0) {
    return "きょうは まだないよ！";
  }

  const lines = data.map((row) => {
    const t = new Date(row.created_at);
    const hh = String(t.getHours()).padStart(2, "0");
    const mm = String(t.getMinutes()).padStart(2, "0");
    return `${hh}:${mm} ${row.raw_text}`;
  });

  return [
    "きょうの！📝",
    `ぜんぶで ${data.length}こ！`,
    "",
    ...lines,
    "",
    "みんな すごいねー！💮",
  ].join("\n");
}

function helpText(): string {
  return [
    "びよりだよ📛",
    "",
    "・『くさむしりした』って おしえてね。",
    "・『今どう？』で みれるよ。",
    "・『まとめ』で きょうのぜんぶ わかるよ。",
    "",
    "メモするよ！✍️",
  ].join("\n");
}

// ---- Main Server ----
serve(async (req) => {
  // 1. Signature Verification
  const ok = await verifySignature(req);
  if (!ok) {
    return new Response("invalid signature", { status: 400 });
  }

  // 2. Parse Body
  const body = await req.json();
  const events: LineEvent[] = body.events ?? [];

  // 3. Event Loop
  for (const event of events) {
    if (event.type !== "message" || event.message?.type !== "text" || !event.replyToken) continue;
    
    const source = event.source;
    const userId = source.userId;
    if (!userId) continue;

    try {
      const ctx = await getOrCreateGroupContext(source);
      if (!ctx) {
        // Should not happen if userId exists, but just in case
        continue;
      }

      const parsed = parseTextCommand(event.message.text);
      let reply: string;

      switch (parsed.kind) {
        case "help":
          reply = helpText();
          break;
        case "now":
          reply = await handleNowCommand(ctx);
          break;
        case "summary":
          reply = await handleSummaryCommand(ctx);
          break;
        case "log":
          reply = await handleLogCommand(ctx, parsed);
          break;
        default:
          reply = "ん？👀";
      }

      await replyMessage(event.replyToken, [{ type: "text", text: reply }]);

    } catch (e) {
      console.error("Error processing event:", e);
      // Optional: Reply with error message if appropriate
    }
  }

  return new Response("ok", { status: 200 });
});
