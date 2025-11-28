// supabase/functions/_shared/src/services/CommandParser.ts
import { ParsedCommand } from "../types/index.ts";

export class CommandParser {
    parse(text: string): ParsedCommand {
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
}
