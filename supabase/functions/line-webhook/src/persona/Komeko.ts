// supabase/functions/line-webhook/src/persona/Komeko.ts

import { FinancialStatus, FinancialHealthRank } from "../types/index.ts";

// ==========================================
// Mood System
// ==========================================

export type KomekoMood = "HAPPY" | "NORMAL" | "SAD" | "TANTRUM" | "SLEEPY";

// ==========================================
// Toddler Speech Helpers
// ==========================================

/** Replace formal adult vocabulary with こめこ-style toddler words. */
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

/** Colour a message with こめこ's current mood. */
function applyMood(text: string, mood: KomekoMood): string {
    switch (mood) {
        case "HAPPY":   return text + " えへへ。";
        case "SAD":     return "あのね… " + text + " …ぐすん。";
        case "TANTRUM": return text.replace(/だよ/g, "だもん！").replace(/ね$/g, "ないもん！") + " ぷんぷん！";
        case "SLEEPY":  return text.replace(/。/g, "… ") + " …むにゃ。";
        default:        return text;
    }
}

/** Pick a random element from an array. */
function pick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

// ==========================================
// KomekoPersona
// ==========================================

export class KomekoPersona {

    // ------------------------------------------------------------------
    // Derive mood from financial health (convenience helper for callers).
    // ------------------------------------------------------------------
    getMoodForRank(rank: FinancialHealthRank): KomekoMood {
        if (rank === "F" || rank === "D") return "SAD";
        if (rank === "S")                 return "HAPPY";
        return "NORMAL";
    }

    // ------------------------------------------------------------------
    // greet — first contact message.
    // mood is optional; defaults to NORMAL.
    // ------------------------------------------------------------------
    greet(mood: KomekoMood = "NORMAL"): string {
        const lines = [
            "やっほ〜！こめこだよ！「はじめる」って送って、あなたのおさいふをおしえてね。",
            "こめこ、きたよ！さいせつやくのプロだよ。「はじめる」っておくってね！",
            "はじめまして！こめこっていうの。おさいふのまもりびとだよ。「はじめる」からはじめてね。",
        ];
        return applyMood(applyToddlerVocab(pick(lines)), mood);
    }

    // ------------------------------------------------------------------
    // getFinancialReport — monthly budget health summary.
    // mood is optional; derived from healthRank when not provided.
    // ------------------------------------------------------------------
    getFinancialReport(status: FinancialStatus, mood?: KomekoMood): string {
        const { healthRank, projectedEndBalance, bankruptcyDate, survivalDays } = status;
        const effectiveMood: KomekoMood = mood ?? this.getMoodForRank(healthRank);

        const comments: Record<FinancialHealthRank, string[]> = {
            "S": [
                "すごい！おさいふパンパンだね！",
                "えへへ、リッチだね〜！なんでもかえちゃうよ！",
                "ちょきん、たくさん！こめこ、うれしいな！",
            ],
            "A": [
                "いいかんじ！そのちょうし！",
                "おりこうさんだね！あんしんだね〜。",
                "じゅんちょうだよ。このままいこう！",
            ],
            "B": [
                "ふつうだね。ゆだんしちゃだめだよ。",
                "コツコツがだいじ。まあまあだね。",
                "これからだよ！きをぬかないでね。",
            ],
            "C": [
                "ちょっとつかいすぎかも…きいろしんごう！",
                "おさいふ、かるくなってきた？ちょっとしんぱい…",
                "むだづかいしてない？がまんもだいじだよ。",
            ],
            "D": [
                "めっ！つかいすぎ！あしたから、もやしね。",
                "ピーポーピーポー！こめこ、かなしい…",
                "もうだめかも…おさいふ、ないない…",
            ],
            "F": [
                "…おさいふ、からっぽ。…ごはん、ないの？",
                "…ひもじいよぉ…おみず、おいしいね。",
                "…ぐすん。…なにもない。…さむいよぉ。",
            ],
        };

        const comment = applyMood(pick(comments[healthRank]), effectiveMood);

        const prediction = bankruptcyDate
            ? `\nこのままだと ${bankruptcyDate.getDate()}にちに おさいふからっぽになるよ。`
            : `\nつきまつには ${Math.floor(projectedEndBalance)}えん のこるとおもう。`;

        return `【おかねのほうこく】\nランク: ${healthRank}\nいきられるひ: あと${survivalDays}にち\n\n${comment}${prediction}`;
    }

    // ------------------------------------------------------------------
    // getMenuRefusal — reject a luxurious meal when budget is critical.
    // mood defaults to TANTRUM (こめこ is annoyed).
    // ------------------------------------------------------------------
    getMenuRefusal(menu: string, mood: KomekoMood = "TANTRUM"): string {
        const lines = [
            `「${menu}」なんてたべてるばあいじゃないよ。もやしにしなさい。`,
            `ちがうちがう！いまのおさいふで「${menu}」は、ゆるさないよ。`,
            `こめこ、「${menu}」はみとめないよ。もやしいためにしてね。`,
        ];
        return applyMood(pick(lines), mood);
    }

    // ------------------------------------------------------------------
    // getLogAck — acknowledge a meal log entry.
    // mood is optional; derived from healthRank when not provided.
    // ------------------------------------------------------------------
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
