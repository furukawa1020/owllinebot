// tests/komeko_persona_test.ts
import { assertEquals, assertStringIncludes, assert } from "https://deno.land/std@0.224.0/testing/asserts.ts";

// ===== Re-export the testable persona logic inline =====
// (mirroring the pattern in parser_test.ts)

type KomekoMood = "HAPPY" | "NORMAL" | "SAD" | "TANTRUM" | "SLEEPY";
type FinancialHealthRank = "S" | "A" | "B" | "C" | "D" | "F";

function applyToddlerVocab(text: string): string {
    return text
        .replace(/破産/g, "おさいふ、からっぽ")
        .replace(/予算/g, "おこづかい")
        .replace(/支出/g, "つかったおかね")
        .replace(/残高/g, "のこり")
        .replace(/警告/g, "めっ！だよ")
        .replace(/生存日数/g, "いきられるひ")
        .replace(/です/g, "だよ")
        .replace(/ます/g, "もん")
        .replace(/ください/g, "してね");
}

function applyMood(text: string, mood: KomekoMood): string {
    switch (mood) {
        case "HAPPY":   return text + " えへへ。";
        case "SAD":     return "あのね… " + text + " …ぐすん。";
        case "TANTRUM": return text.replace(/だよ/g, "だもん！").replace(/ね$/g, "ないもん！") + " ぷんぷん！";
        case "SLEEPY":  return text.replace(/。/g, "… ") + " …むにゃ。";
        default:        return text;
    }
}

function pick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

class KomekoPersona {
    getMoodForRank(rank: FinancialHealthRank): KomekoMood {
        if (rank === "F" || rank === "D") return "SAD";
        if (rank === "S")                 return "HAPPY";
        return "NORMAL";
    }

    greet(mood: KomekoMood = "NORMAL"): string {
        const lines = [
            "やっほ〜！こめこだよ！「はじめる」って送って、あなたのおさいふをおしえてね。",
            "こめこ、きたよ！さいせつやくのプロだよ。「はじめる」っておくってね！",
            "はじめまして！こめこっていうの。おさいふのまもりびとだよ。「はじめる」からはじめてね。",
        ];
        return applyMood(applyToddlerVocab(pick(lines)), mood);
    }

    getMenuRefusal(menu: string, mood: KomekoMood = "TANTRUM"): string {
        const lines = [
            `「${menu}」なんてたべてるばあいじゃないよ。もやしにしなさい。`,
            `ちがうちがう！いまのおさいふで「${menu}」は、ゆるさないよ。`,
            `こめこ、「${menu}」はみとめないよ。もやしいためにしてね。`,
        ];
        return applyMood(pick(lines), mood);
    }

    getLogAck(label: string, price: number | null, healthRank: string, mood?: KomekoMood): string {
        const effectiveMood: KomekoMood = mood ?? (
            healthRank === "F" || healthRank === "D" ? "SAD" : "NORMAL"
        );

        if (healthRank === "F" || healthRank === "D") {
            const lines = [
                `「${label}」…おかねないのに…たべるの？きろくはしたよ。はんせいしてね。`,
                `「${label}」…もやしじゃないの？…ちゃんとかいたよ…ぐすん。`,
                `「${label}」…また…むだづかい…きろくした。`,
            ];
            return applyMood(pick(lines), effectiveMood);
        }

        const lines = [
            `「${label}」だね！${price !== null ? price + "えん！" : ""}メモしたよ！`,
            `「${label}」、りょうかい！${price !== null ? price + "えん、" : ""}きろくしたよ。`,
            `「${label}」たべたんだね！${price !== null ? price + "えんね！" : ""}ちゃんとかいた！`,
        ];
        return applyMood(pick(lines), effectiveMood);
    }
}

// ===== Tests =====

const persona = new KomekoPersona();

// ------------------------------------------------------------------
// getMoodForRank
// ------------------------------------------------------------------
Deno.test("getMoodForRank: rank S → HAPPY", () => {
    assertEquals(persona.getMoodForRank("S"), "HAPPY");
});

Deno.test("getMoodForRank: rank A/B/C → NORMAL", () => {
    assertEquals(persona.getMoodForRank("A"), "NORMAL");
    assertEquals(persona.getMoodForRank("B"), "NORMAL");
    assertEquals(persona.getMoodForRank("C"), "NORMAL");
});

Deno.test("getMoodForRank: rank D/F → SAD", () => {
    assertEquals(persona.getMoodForRank("D"), "SAD");
    assertEquals(persona.getMoodForRank("F"), "SAD");
});

// ------------------------------------------------------------------
// greet
// ------------------------------------------------------------------
Deno.test("greet: returns a non-empty string by default", () => {
    const result = persona.greet();
    assert(result.length > 0, "greet() should return a non-empty string");
});

Deno.test("greet: HAPPY mood appends えへへ", () => {
    const result = persona.greet("HAPPY");
    assertStringIncludes(result, "えへへ");
});

Deno.test("greet: SAD mood wraps with ぐすん", () => {
    const result = persona.greet("SAD");
    assertStringIncludes(result, "ぐすん");
});

Deno.test("greet: TANTRUM mood appends ぷんぷん！", () => {
    const result = persona.greet("TANTRUM");
    assertStringIncludes(result, "ぷんぷん！");
});

Deno.test("greet: SLEEPY mood appends むにゃ", () => {
    const result = persona.greet("SLEEPY");
    assertStringIncludes(result, "むにゃ");
});

// ------------------------------------------------------------------
// getMenuRefusal
// ------------------------------------------------------------------
Deno.test("getMenuRefusal: includes the menu item name", () => {
    const result = persona.getMenuRefusal("うなぎ");
    assertStringIncludes(result, "うなぎ");
});

Deno.test("getMenuRefusal: default mood is TANTRUM (contains ぷんぷん！)", () => {
    const result = persona.getMenuRefusal("ステーキ");
    assertStringIncludes(result, "ぷんぷん！");
});

Deno.test("getMenuRefusal: override mood SAD wraps with ぐすん", () => {
    const result = persona.getMenuRefusal("トリュフ", "SAD");
    assertStringIncludes(result, "ぐすん");
});

// ------------------------------------------------------------------
// getLogAck — healthy rank
// ------------------------------------------------------------------
Deno.test("getLogAck: healthy rank includes label", () => {
    const result = persona.getLogAck("からあげ", 300, "A");
    assertStringIncludes(result, "からあげ");
});

Deno.test("getLogAck: healthy rank with price includes price in えん", () => {
    const result = persona.getLogAck("からあげ", 300, "B");
    assertStringIncludes(result, "300えん");
});

Deno.test("getLogAck: healthy rank with null price does not include えん price", () => {
    const result = persona.getLogAck("おかし", null, "A");
    // Should not include a price figure followed by えん
    assert(!result.includes("nullえん"), "Should not output 'nullえん'");
});

// ------------------------------------------------------------------
// getLogAck — critical rank
// ------------------------------------------------------------------
Deno.test("getLogAck: rank F uses SAD mood (wraps with ぐすん)", () => {
    const result = persona.getLogAck("ステーキ", 3000, "F");
    assertStringIncludes(result, "ぐすん");
});

Deno.test("getLogAck: rank D includes label", () => {
    const result = persona.getLogAck("ケーキ", 500, "D");
    assertStringIncludes(result, "ケーキ");
});

// ------------------------------------------------------------------
// applyToddlerVocab (inline test via greet content)
// ------------------------------------------------------------------
Deno.test("applyToddlerVocab: replaces 予算 with おこづかい", () => {
    const translated = applyToddlerVocab("今月の予算は5000円です");
    assertStringIncludes(translated, "おこづかい");
    assert(!translated.includes("予算"), "Adult word '予算' should be removed");
});

Deno.test("applyToddlerVocab: replaces 破産 with おさいふ、からっぽ", () => {
    const translated = applyToddlerVocab("破産しました");
    assertStringIncludes(translated, "おさいふ、からっぽ");
    assert(!translated.includes("破産"), "Adult word '破産' should be removed");
});

Deno.test("applyToddlerVocab: replaces です with だよ", () => {
    const translated = applyToddlerVocab("大丈夫です");
    assertStringIncludes(translated, "だよ");
});
