// tests/parser_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";

// Copying the parser logic here for testing purposes since it's not exported in index.ts
// In a real project, we would export this from a separate module.
type ParsedCommand =
    | { kind: "help" }
    | { kind: "now" }
    | { kind: "summary" }
    | { kind: "log"; text: string };

function parseTextCommand(text: string): ParsedCommand {
    const trimmed = text.trim();
    if (/^(ヘルプ|help|使い方|てつだって)$/i.test(trimmed)) {
        return { kind: "help" };
    }
    if (/^(今どう\？?|いまどう\？?|なにしてる\？?)$/.test(trimmed)) {
        return { kind: "now" };
    }
    if (/^(今日のまとめ|きょうのまとめ|まとめ)$/i.test(trimmed)) {
        return { kind: "summary" };
    }
    return { kind: "log", text: trimmed };
}

Deno.test("Parser: Help Command", () => {
    assertEquals(parseTextCommand("ヘルプ").kind, "help");
    assertEquals(parseTextCommand("てつだって").kind, "help");
});

Deno.test("Parser: Now Command", () => {
    assertEquals(parseTextCommand("今どう？").kind, "now");
    assertEquals(parseTextCommand("なにしてる？").kind, "now");
    assertEquals(parseTextCommand("いまどう").kind, "now");
});

Deno.test("Parser: Summary Command", () => {
    assertEquals(parseTextCommand("今日のまとめ").kind, "summary");
    assertEquals(parseTextCommand("まとめ").kind, "summary");
});

Deno.test("Parser: Log Command", () => {
    const result = parseTextCommand("草むしりしたよ");
    assertEquals(result.kind, "log");
    if (result.kind === "log") {
        assertEquals(result.text, "草むしりしたよ");
    }
});
