// supabase/functions/_shared/src/types/index.ts

export type LineEvent = {
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

export type GroupContext = {
    groupId: string; // LINE Group ID
    groupDbId: string; // DB UUID
    memberDbId: string | null; // DB UUID
    displayName: string | null;
};

export type CommandKind = "help" | "now" | "summary" | "log" | "unknown";

export type ParsedCommand =
    | { kind: "help" }
    | { kind: "now" }
    | { kind: "summary" }
    | { kind: "log"; text: string }
    | { kind: "unknown" };

// Database Row Types (Mirroring the SQL schema)
export interface GroupRow {
    id: string;
    line_group_id: string;
    name: string;
    created_at: string;
}

export interface MemberRow {
    id: string;
    group_id: string;
    line_user_id: string;
    display_name: string | null;
    role: string;
    created_at: string;
}

export interface ActivityRow {
    id: string;
    group_id: string;
    member_id: string | null;
    activity_type: string;
    raw_text: string;
    created_at: string;
    expires_at: string | null;
}
