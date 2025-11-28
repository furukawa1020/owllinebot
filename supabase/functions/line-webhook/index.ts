// supabase/functions/line-webhook/index.ts

/**
 * -----------------------------------------------------------------------------
 * Gohan Strategist Komeko (The TRUE Mega-Monolith Edition)
 * -----------------------------------------------------------------------------
 * 
 * "Quantity is Quality."
 * This file is designed to be MASSIVE.
 */

import "jsr:@supabase/functions-js/edge-runtime";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ==========================================
// 1. Domain Types
// ==========================================

type OnboardingStatus = "INIT" | "NAME" | "PAYDAY" | "INCOME" | "FIXED_COSTS" | "SAVINGS_GOAL" | "COMPLETE";
type FinancialHealthRank = "S" | "A" | "B" | "C" | "D" | "F";
type TimeSlot = "morning" | "noon" | "evening" | "snack" | "late_night";
type ToddlerMood = "HAPPY" | "NORMAL" | "SAD" | "TANTRUM" | "SLEEPY" | "HYPER";
type IngredientTag = "veggie" | "meat" | "fish" | "carb" | "sweet" | "bitter" | "yucky" | "yummy" | "expensive" | "cheap" | "alcohol" | "fruit" | "dairy" | "seasoning" | "healthy" | "light" | "hard" | "spicy" | "salty" | "heavy" | "junk";

interface UserProfile {
    id: string;
    lineUserId: string;
    nickname: string | null;
    monthlyBudget: number;
    payday: number;
    fixedCosts: number;
    savingsGoal: number;
    onboardingStatus: OnboardingStatus;
    xp: number;
    level: number;
    title: string;
    streak: number;
    lastMood: ToddlerMood;
}

interface MealLog {
    id: string;
    label: string;
    price: number | null;
    timeSlot: TimeSlot;
    createdAt: Date;
    calories?: number;
}

interface FinancialStatus {
    totalSpent: number;
    remainingBudget: number;
    dailyBurnRate: number;
    projectedEndBalance: number;
    survivalDays: number;
    healthRank: FinancialHealthRank;
    bankruptcyDate: Date | null;
    bankruptcyProb: number;
}

interface MenuSuggestion {
    label: string;
    ingredients: string[];
    reason: string;
    isStrict: boolean;
    price: number;
    calories: number;
}

interface ParsedIntent {
    kind: "help" | "start" | "log" | "budget" | "menu" | "status" | "unknown";
    payload?: any;
}

// ==========================================
// 2. Toddler Translator (The Persona Core)
// ==========================================

class ToddlerTranslator {
    static translate(text: string, mood: ToddlerMood): string {
        let t = text.replace(/です/g, "だよ").replace(/ます/g, "もん").replace(/ください/g, "してね");
        switch (mood) {
            case "HAPPY": t += " えへへ。"; break;
            case "SAD": t = "あのね… " + t + " …ぐすん。"; break;
            case "TANTRUM": t = t.replace(/だよ/g, "だもん！").replace(/ね/g, "ないもん！") + " ぷんぷん！"; break;
            case "SLEEPY": t = t.replace(/。/g, "… ") + " …むにゃ。"; break;
            case "HYPER": t = t + "！ わーい！"; break;
        }
        t = t.replace(/破産/g, "おさいふ、からっぽ")
            .replace(/予算/g, "おこづかい")
            .replace(/支出/g, "つかったおかね")
            .replace(/残高/g, "のこり")
            .replace(/警告/g, "めっ！だよ")
            .replace(/生存日数/g, "いきられるひ");
        return t;
    }

    static getMood(rank: FinancialHealthRank, time: TimeSlot): ToddlerMood {
        if (time === "late_night") return "SLEEPY";
        if (rank === "F" || rank === "D") return "SAD";
        if (rank === "S") return "HAPPY";
        return "NORMAL";
    }
}

// ==========================================
// 3. Massive Static Databases (The Data Explosion)
// ==========================================

class IngredientDatabase {
    static readonly items: Record<string, { price: number, cal: number, tags: IngredientTag[] }> = {
        // --- Veggies (Yasai) ---
        "にんじん": { price: 50, cal: 30, tags: ["veggie", "yucky", "healthy"] },
        "ピーマン": { price: 40, cal: 20, tags: ["veggie", "bitter", "yucky"] },
        "たまねぎ": { price: 60, cal: 40, tags: ["veggie", "sweet", "healthy"] },
        "じゃがいも": { price: 50, cal: 80, tags: ["veggie", "carb", "yummy"] },
        "ほうれんそう": { price: 150, cal: 20, tags: ["veggie", "healthy"] },
        "もやし": { price: 30, cal: 15, tags: ["veggie", "cheap", "healthy"] },
        "キャベツ": { price: 150, cal: 30, tags: ["veggie", "healthy"] },
        "レタス": { price: 180, cal: 15, tags: ["veggie", "light"] },
        "トマト": { price: 100, cal: 20, tags: ["veggie", "yummy"] },
        "きゅうり": { price: 60, cal: 15, tags: ["veggie", "light"] },
        "ブロッコリー": { price: 150, cal: 40, tags: ["veggie", "healthy"] },
        "だいこん": { price: 120, cal: 20, tags: ["veggie", "light"] },
        "はくさい": { price: 200, cal: 15, tags: ["veggie", "light"] },
        "なす": { price: 80, cal: 20, tags: ["veggie", "yummy"] },
        "かぼちゃ": { price: 200, cal: 90, tags: ["veggie", "sweet", "yummy"] },
        "ごぼう": { price: 150, cal: 60, tags: ["veggie", "hard"] },
        "れんこん": { price: 200, cal: 70, tags: ["veggie", "hard"] },
        "さつまいも": { price: 150, cal: 130, tags: ["veggie", "sweet", "yummy"] },
        "えだまめ": { price: 200, cal: 130, tags: ["veggie", "yummy"] },
        "とうもろこし": { price: 150, cal: 100, tags: ["veggie", "sweet", "yummy"] },
        "おくら": { price: 100, cal: 30, tags: ["veggie", "yummy"] },
        "アスパラ": { price: 200, cal: 20, tags: ["veggie", "expensive"] },
        "しいたけ": { price: 150, cal: 20, tags: ["veggie", "yucky"] },
        "えのき": { price: 100, cal: 20, tags: ["veggie", "cheap"] },
        "しめじ": { price: 100, cal: 20, tags: ["veggie", "cheap"] },
        "まいたけ": { price: 150, cal: 20, tags: ["veggie", "yummy"] },
        "ながねぎ": { price: 100, cal: 30, tags: ["veggie", "spicy"] },
        "にら": { price: 100, cal: 20, tags: ["veggie", "spicy"] },
        "しょうが": { price: 100, cal: 10, tags: ["veggie", "spicy"] },
        "にんにく": { price: 200, cal: 100, tags: ["veggie", "spicy"] },
        "アボカド": { price: 150, cal: 250, tags: ["veggie", "yummy", "expensive"] },
        "パプリカ": { price: 150, cal: 30, tags: ["veggie", "sweet"] },
        "セロリ": { price: 150, cal: 15, tags: ["veggie", "bitter", "yucky"] },
        "ゴーヤ": { price: 200, cal: 20, tags: ["veggie", "bitter", "yucky"] },
        "たけのこ": { price: 300, cal: 30, tags: ["veggie", "hard"] },
        "さといも": { price: 200, cal: 60, tags: ["veggie", "yummy"] },
        "やまいも": { price: 300, cal: 60, tags: ["veggie", "yummy"] },
        "みずな": { price: 100, cal: 20, tags: ["veggie", "light"] },
        "こまつな": { price: 100, cal: 20, tags: ["veggie", "healthy"] },
        "ちんげんさい": { price: 100, cal: 20, tags: ["veggie", "healthy"] },

        // --- Meats (Oniku) ---
        "とりむねにく": { price: 60, cal: 110, tags: ["meat", "cheap", "healthy"] },
        "とりももにく": { price: 100, cal: 200, tags: ["meat", "yummy"] },
        "ささみ": { price: 70, cal: 100, tags: ["meat", "healthy"] },
        "てばさき": { price: 80, cal: 200, tags: ["meat", "yummy"] },
        "てばもと": { price: 60, cal: 180, tags: ["meat", "cheap"] },
        "ぶたこま": { price: 120, cal: 250, tags: ["meat", "cheap"] },
        "ぶたばら": { price: 150, cal: 380, tags: ["meat", "yummy", "expensive"] },
        "ぶたロース": { price: 180, cal: 250, tags: ["meat", "yummy"] },
        "ぶたひきにく": { price: 100, cal: 220, tags: ["meat", "cheap"] },
        "ぎゅうこま": { price: 200, cal: 300, tags: ["meat", "expensive"] },
        "ぎゅうばら": { price: 250, cal: 400, tags: ["meat", "expensive", "yummy"] },
        "ぎゅうロース": { price: 400, cal: 300, tags: ["meat", "expensive"] },
        "ステーキ": { price: 1000, cal: 500, tags: ["meat", "expensive", "yummy"] },
        "ハンバーグ": { price: 150, cal: 400, tags: ["meat", "yummy"] },
        "ウインナー": { price: 300, cal: 300, tags: ["meat", "yummy", "junk"] },
        "ハム": { price: 200, cal: 100, tags: ["meat", "light"] },
        "ベーコン": { price: 250, cal: 400, tags: ["meat", "yummy", "salty"] },
        "チャーシュー": { price: 300, cal: 350, tags: ["meat", "yummy"] },
        "ローストビーフ": { price: 500, cal: 200, tags: ["meat", "expensive", "yummy"] },
        "やきとり": { price: 100, cal: 150, tags: ["meat", "yummy"] },
        "からあげ": { price: 200, cal: 300, tags: ["meat", "yummy", "junk"] },
        "トンカツ": { price: 400, cal: 500, tags: ["meat", "yummy", "heavy"] },
        "メンチカツ": { price: 150, cal: 400, tags: ["meat", "yummy", "heavy"] },
        "コロッケ": { price: 100, cal: 300, tags: ["meat", "cheap", "yummy"] },
        "ぎょうざ": { price: 200, cal: 350, tags: ["meat", "yummy"] },
        "シューマイ": { price: 200, cal: 300, tags: ["meat", "yummy"] },
        "にくまん": { price: 150, cal: 250, tags: ["meat", "yummy"] },

        // --- Fishes (Osakana) ---
        "さけ": { price: 200, cal: 130, tags: ["fish", "yummy"] },
        "さば": { price: 150, cal: 200, tags: ["fish", "healthy"] },
        "あじ": { price: 100, cal: 120, tags: ["fish", "cheap"] },
        "まぐろ": { price: 300, cal: 120, tags: ["fish", "expensive", "yummy"] },
        "かつお": { price: 250, cal: 110, tags: ["fish", "healthy"] },
        "ぶり": { price: 250, cal: 250, tags: ["fish", "yummy"] },
        "たい": { price: 400, cal: 100, tags: ["fish", "expensive"] },
        "さんま": { price: 150, cal: 300, tags: ["fish", "yummy"] },
        "しらす": { price: 200, cal: 50, tags: ["fish", "light"] },
        "シーチキン": { price: 120, cal: 200, tags: ["fish", "cheap", "yummy"] },
        "えび": { price: 300, cal: 90, tags: ["fish", "expensive", "yummy"] },
        "いか": { price: 200, cal: 80, tags: ["fish", "yummy"] },
        "たこ": { price: 300, cal: 70, tags: ["fish", "expensive"] },
        "ほたて": { price: 300, cal: 80, tags: ["fish", "expensive", "yummy"] },
        "あさり": { price: 200, cal: 30, tags: ["fish", "healthy"] },
        "しじみ": { price: 200, cal: 20, tags: ["fish", "healthy"] },
        "かき": { price: 300, cal: 60, tags: ["fish", "expensive"] },
        "うなぎ": { price: 2000, cal: 300, tags: ["fish", "expensive", "yummy"] },
        "いくら": { price: 1000, cal: 200, tags: ["fish", "expensive", "yummy"] },
        "うに": { price: 2000, cal: 150, tags: ["fish", "expensive", "yummy"] },
        "かに": { price: 3000, cal: 100, tags: ["fish", "expensive", "yummy"] },
        "かまぼこ": { price: 200, cal: 100, tags: ["fish", "light"] },
        "ちくわ": { price: 100, cal: 120, tags: ["fish", "cheap"] },
        "はんぺん": { price: 100, cal: 100, tags: ["fish", "light"] },

        // --- Carbs (Gohan) ---
        "ごはん": { price: 50, cal: 250, tags: ["carb", "cheap"] },
        "パン": { price: 30, cal: 150, tags: ["carb", "cheap"] },
        "うどん": { price: 40, cal: 200, tags: ["carb", "cheap"] },
        "パスタ": { price: 20, cal: 350, tags: ["carb", "cheap"] },
        "そば": { price: 50, cal: 300, tags: ["carb", "healthy"] },
        "ラーメン": { price: 100, cal: 450, tags: ["carb", "junk", "yummy"] },
        "もち": { price: 50, cal: 230, tags: ["carb", "yummy"] },
        "オートミール": { price: 40, cal: 110, tags: ["carb", "healthy"] },
        "そうめん": { price: 40, cal: 300, tags: ["carb", "light"] },
        "ひやむぎ": { price: 40, cal: 300, tags: ["carb", "light"] },
        "やきそば": { price: 50, cal: 400, tags: ["carb", "junk"] },
        "ピザ": { price: 1000, cal: 800, tags: ["carb", "junk", "yummy"] },
        "ナン": { price: 200, cal: 300, tags: ["carb", "yummy"] },
        "シリアル": { price: 50, cal: 200, tags: ["carb", "sweet"] },

        // --- Sweets (Okashi) ---
        "チョコ": { price: 100, cal: 300, tags: ["sweet", "yummy"] },
        "アイス": { price: 150, cal: 200, tags: ["sweet", "yummy"] },
        "クッキー": { price: 200, cal: 250, tags: ["sweet", "yummy"] },
        "ケーキ": { price: 400, cal: 400, tags: ["sweet", "expensive", "yummy"] },
        "プリン": { price: 100, cal: 150, tags: ["sweet", "yummy"] },
        "ゼリー": { price: 100, cal: 80, tags: ["sweet", "light"] },
        "ポテチ": { price: 150, cal: 500, tags: ["junk", "yummy"] },
        "グミ": { price: 100, cal: 100, tags: ["sweet", "yummy"] },
        "あめ": { price: 10, cal: 20, tags: ["sweet", "cheap"] },
        "ガム": { price: 100, cal: 10, tags: ["sweet", "cheap"] },
        "ドーナツ": { price: 150, cal: 300, tags: ["sweet", "yummy"] },
        "シュークリーム": { price: 120, cal: 200, tags: ["sweet", "yummy"] },
        "エクレア": { price: 120, cal: 250, tags: ["sweet", "yummy"] },
        "どらやき": { price: 150, cal: 200, tags: ["sweet", "yummy"] },
        "まんじゅう": { price: 100, cal: 150, tags: ["sweet", "yummy"] },
        "ようかん": { price: 100, cal: 150, tags: ["sweet", "yummy"] },
        "だんご": { price: 100, cal: 150, tags: ["sweet", "yummy"] },
        "たいやき": { price: 150, cal: 200, tags: ["sweet", "yummy"] },
        "カステラ": { price: 200, cal: 200, tags: ["sweet", "yummy"] },
        "マカロン": { price: 300, cal: 100, tags: ["sweet", "expensive", "yummy"] },

        // --- Fruits (Kudamono) ---
        "りんご": { price: 150, cal: 100, tags: ["fruit", "healthy", "yummy"] },
        "みかん": { price: 50, cal: 40, tags: ["fruit", "healthy", "yummy"] },
        "バナナ": { price: 30, cal: 80, tags: ["fruit", "cheap", "yummy"] },
        "いちご": { price: 500, cal: 30, tags: ["fruit", "expensive", "yummy"] },
        "ぶどう": { price: 400, cal: 100, tags: ["fruit", "expensive", "yummy"] },
        "もも": { price: 300, cal: 80, tags: ["fruit", "expensive", "yummy"] },
        "なし": { price: 200, cal: 80, tags: ["fruit", "yummy"] },
        "かき（果物）": { price: 100, cal: 100, tags: ["fruit", "yummy"] },
        "スイカ": { price: 500, cal: 100, tags: ["fruit", "light"] },
        "メロン": { price: 1000, cal: 100, tags: ["fruit", "expensive", "yummy"] },
        "キウイ": { price: 100, cal: 50, tags: ["fruit", "healthy"] },
        "パイナップル": { price: 300, cal: 100, tags: ["fruit", "yummy"] },
        "マンゴー": { price: 400, cal: 100, tags: ["fruit", "expensive", "yummy"] },
        "レモン": { price: 100, cal: 20, tags: ["fruit", "bitter"] },

        // --- Dairy (Nyuuseihin) ---
        "ぎゅうにゅう": { price: 200, cal: 130, tags: ["dairy", "healthy"] },
        "ヨーグルト": { price: 150, cal: 100, tags: ["dairy", "healthy"] },
        "チーズ": { price: 300, cal: 100, tags: ["dairy", "yummy"] },
        "バター": { price: 400, cal: 700, tags: ["dairy", "expensive"] },
        "なまクリーム": { price: 300, cal: 400, tags: ["dairy", "yummy"] },

        // --- Weird/Toddler Stuff ---
        "あかちゃんせんべい": { price: 20, cal: 30, tags: ["carb", "cheap", "yummy"] },
        "むぎちゃ": { price: 10, cal: 0, tags: ["light"] },
        "はたつきハンバーグ": { price: 800, cal: 600, tags: ["meat", "expensive", "yummy"] },
        "お子様ランチ": { price: 900, cal: 700, tags: ["expensive", "yummy"] },
        "ねるねるねるね": { price: 120, cal: 100, tags: ["sweet", "junk", "yummy"] },
        "アンパンマンポテト": { price: 200, cal: 150, tags: ["junk", "yummy"] },
        "たべっこどうぶつ": { price: 150, cal: 200, tags: ["sweet", "yummy"] },
        "コアラのマーチ": { price: 100, cal: 250, tags: ["sweet", "yummy"] },
        "うまいぼう": { price: 10, cal: 30, tags: ["junk", "cheap", "yummy"] },
        "ブタメン": { price: 80, cal: 150, tags: ["junk", "cheap", "yummy"] },
        "ビッグカツ": { price: 40, cal: 100, tags: ["junk", "cheap"] },
        // --- Spices & Seasonings (Choumiryou) ---
        "しょうゆ": { price: 300, cal: 10, tags: ["seasoning", "salty"] },
        "みそ": { price: 400, cal: 30, tags: ["seasoning", "salty", "healthy"] },
        "しお": { price: 100, cal: 0, tags: ["seasoning", "salty"] },
        "さとう": { price: 200, cal: 40, tags: ["seasoning", "sweet"] },
        "こしょう": { price: 200, cal: 5, tags: ["seasoning", "spicy"] },
        "マヨネーズ": { price: 300, cal: 100, tags: ["seasoning", "heavy", "yummy"] },
        "ケチャップ": { price: 200, cal: 20, tags: ["seasoning", "sweet", "yummy"] },
        "ソース": { price: 250, cal: 30, tags: ["seasoning", "salty", "yummy"] },
        "ポンズ": { price: 300, cal: 10, tags: ["seasoning", "light"] },
        "ドレッシング": { price: 300, cal: 50, tags: ["seasoning", "yummy"] },
        "オリーブオイル": { price: 600, cal: 120, tags: ["seasoning", "healthy", "expensive"] },
        "ごま油": { price: 400, cal: 120, tags: ["seasoning", "yummy"] },
        "バター（調味料）": { price: 450, cal: 100, tags: ["seasoning", "expensive", "yummy"] },
        "マーガリン": { price: 200, cal: 100, tags: ["seasoning", "cheap"] },
        "ラー油": { price: 150, cal: 100, tags: ["seasoning", "spicy"] },
        "わさび": { price: 150, cal: 5, tags: ["seasoning", "spicy"] },
        "からし": { price: 150, cal: 5, tags: ["seasoning", "spicy"] },
        "しょうがチューブ": { price: 150, cal: 5, tags: ["seasoning", "spicy"] },
        "にんにくチューブ": { price: 150, cal: 10, tags: ["seasoning", "spicy"] },
        "コンソメ": { price: 200, cal: 10, tags: ["seasoning", "salty"] },
        "だしのもと": { price: 300, cal: 5, tags: ["seasoning", "salty"] },
        "とりガラスープ": { price: 300, cal: 5, tags: ["seasoning", "salty"] },
        "カレー粉": { price: 300, cal: 20, tags: ["seasoning", "spicy"] },
        "いちみ": { price: 100, cal: 0, tags: ["seasoning", "spicy"] },
        "しちみ": { price: 100, cal: 0, tags: ["seasoning", "spicy"] },
        "タバスコ": { price: 200, cal: 0, tags: ["seasoning", "spicy"] },
        "ハチミツ": { price: 500, cal: 60, tags: ["seasoning", "sweet", "healthy"] },
        "メープルシロップ": { price: 600, cal: 50, tags: ["seasoning", "sweet", "expensive"] },
        "ジャム": { price: 200, cal: 40, tags: ["seasoning", "sweet"] },

        // --- Drinks (Nomimono) ---
        "みず": { price: 100, cal: 0, tags: ["light"] },
        "おちゃ": { price: 120, cal: 0, tags: ["light", "healthy"] },
        "コーヒー": { price: 150, cal: 10, tags: ["bitter"] },
        "こうちゃ": { price: 150, cal: 10, tags: ["light"] },
        "コーラ": { price: 150, cal: 140, tags: ["sweet", "junk", "yummy"] },
        "サイダー": { price: 150, cal: 120, tags: ["sweet", "junk"] },
        "オレンジジュース": { price: 150, cal: 100, tags: ["fruit", "sweet"] },
        "リンゴジュース": { price: 150, cal: 100, tags: ["fruit", "sweet"] },
        "やさいジュース": { price: 120, cal: 50, tags: ["veggie", "healthy"] },
        "トウニュウ": { price: 100, cal: 100, tags: ["healthy"] },
        "エナジードリンク": { price: 200, cal: 150, tags: ["junk", "expensive"] },
        "ビール": { price: 250, cal: 150, tags: ["alcohol", "bitter"] },
        "ワイン": { price: 1000, cal: 100, tags: ["alcohol", "expensive"] },
        "サワー": { price: 150, cal: 150, tags: ["alcohol", "sweet"] },
        "ハイボール": { price: 200, cal: 100, tags: ["alcohol"] },
        "ニホンシュ": { price: 1500, cal: 200, tags: ["alcohol", "expensive"] },
        "ショウチュウ": { price: 1000, cal: 200, tags: ["alcohol"] },
        "ウイスキー": { price: 2000, cal: 250, tags: ["alcohol", "expensive"] },

        // --- Conbini / Prepared (Osozai) ---
        "おにぎり": { price: 120, cal: 200, tags: ["carb", "cheap", "yummy"] },
        "サンドイッチ": { price: 250, cal: 300, tags: ["carb", "light"] },
        "からあげクン": { price: 220, cal: 250, tags: ["meat", "junk", "yummy"] },
        "ファミチキ": { price: 200, cal: 300, tags: ["meat", "junk", "yummy"] },
        "ナナチキ": { price: 200, cal: 300, tags: ["meat", "junk", "yummy"] },
        "アメリカンドッグ": { price: 120, cal: 250, tags: ["junk", "yummy"] },
        "にくまん": { price: 140, cal: 250, tags: ["meat", "yummy"] },
        "あんまん": { price: 140, cal: 300, tags: ["sweet", "yummy"] },
        "ピザまん": { price: 140, cal: 250, tags: ["junk", "yummy"] },
        "カレーまん": { price: 140, cal: 250, tags: ["spicy", "yummy"] },
        "おでん": { price: 100, cal: 50, tags: ["healthy", "light"] },
        "ブリトー": { price: 250, cal: 300, tags: ["junk", "yummy"] },
        "パスタサラダ": { price: 300, cal: 400, tags: ["carb", "healthy"] },
        "グラタン": { price: 450, cal: 500, tags: ["dairy", "heavy"] },
        "ドリア": { price: 450, cal: 600, tags: ["dairy", "heavy"] },
        "カツドン": { price: 550, cal: 900, tags: ["meat", "heavy", "yummy"] },
        "ギュウドン": { price: 400, cal: 700, tags: ["meat", "heavy", "yummy"] },
        "カレーライス": { price: 450, cal: 700, tags: ["spicy", "heavy"] },
        "ハンバーグべんとう": { price: 500, cal: 800, tags: ["meat", "heavy"] },
        "のりべん": { price: 400, cal: 700, tags: ["fish", "cheap"] },
        "シャケべんとう": { price: 500, cal: 600, tags: ["fish", "healthy"] },
        "カラアゲべんとう": { price: 500, cal: 900, tags: ["meat", "heavy"] },
        "マクドナルド": { price: 700, cal: 1000, tags: ["junk", "heavy", "yummy"] },
        "ケンタッキー": { price: 1000, cal: 1200, tags: ["meat", "junk", "yummy"] },
        "モスバーガー": { price: 800, cal: 800, tags: ["veggie", "yummy"] },
        "スシロー": { price: 1500, cal: 600, tags: ["fish", "yummy"] },
        "サイゼリヤ": { price: 1000, cal: 800, tags: ["carb", "cheap", "yummy"] },
        "スタバ": { price: 600, cal: 400, tags: ["sweet", "expensive"] },
        "タピオカ": { price: 500, cal: 300, tags: ["sweet", "expensive"] },

    };

    static search(query: string) {
        const hits = Object.entries(this.items).filter(([name]) => name.includes(query));
        return hits.length > 0 ? { name: hits[0][0], ...hits[0][1] } : null;
    }
}

class RecipeDatabase {
    static readonly recipes: MenuSuggestion[] = [
        // --- Rank F (Poverty / Survival) ---
        { label: "もやしナムル", ingredients: ["もやし"], reason: "やすい！はやい！おいしい！", isStrict: true, price: 40, calories: 60 },
        { label: "しおむすび", ingredients: ["ごはん"], reason: "シンプルがいちばん。", isStrict: true, price: 50, calories: 250 },
        { label: "すどーふ", ingredients: ["豆腐"], reason: "おしょうゆかけてたべてね。", isStrict: true, price: 50, calories: 80 },
        { label: "みず", ingredients: ["お水"], reason: "おかねないときは、これ。", isStrict: true, price: 0, calories: 0 },
        { label: "くうき", ingredients: [], reason: "がまんしてね。", isStrict: true, price: 0, calories: 0 },
        { label: "もやしいため", ingredients: ["もやし"], reason: "しゃきしゃきだよ！", isStrict: true, price: 30, calories: 50 },
        { label: "とうふごはん", ingredients: ["ごはん", "豆腐"], reason: "かさ増し！", isStrict: true, price: 100, calories: 350 },
        { label: "パンのみ", ingredients: ["パン"], reason: "よくかんでたべてね。", isStrict: true, price: 30, calories: 150 },
        { label: "うどん（す）", ingredients: ["うどん"], reason: "ぐなしうどん。", isStrict: true, price: 40, calories: 200 },
        { label: "はんぶんこ", ingredients: [], reason: "あしたのぶんものこしてね。", isStrict: true, price: 0, calories: 0 },
        { label: "だんじき", ingredients: [], reason: "いぶくろをやすめよう。", isStrict: true, price: 0, calories: 0 },
        { label: "キャベツのしん", ingredients: ["キャベツ"], reason: "あまくておいしいよ？", isStrict: true, price: 0, calories: 10 },
        { label: "パンのみみ", ingredients: ["パン"], reason: "パンやさんでもらえるかも？", isStrict: true, price: 0, calories: 100 },
        { label: "おさゆ", ingredients: ["お水"], reason: "からだがあたたまるよ。", isStrict: true, price: 0, calories: 0 },
        { label: "しおなめ", ingredients: [], reason: "ミネラルほきゅう！", isStrict: true, price: 1, calories: 0 },

        // --- Rank C/D (Budget / Warning) ---
        { label: "なっとうごはん", ingredients: ["ごはん", "なっとう"], reason: "えいようまんてん！", isStrict: true, price: 80, calories: 350 },
        { label: "たまごかけごはん", ingredients: ["ごはん", "たまご"], reason: "TKG！", isStrict: true, price: 70, calories: 330 },
        { label: "ちくわきゅうり", ingredients: ["ちくわ", "きゅうり"], reason: "おつまみにもなるよ。", isStrict: true, price: 100, calories: 150 },
        { label: "とうふステーキ", ingredients: ["豆腐"], reason: "お肉みたい！", isStrict: true, price: 60, calories: 120 },
        { label: "もやしチャンプルー", ingredients: ["もやし", "豆腐", "たまご"], reason: "ボリューミー！", isStrict: true, price: 150, calories: 300 },
        { label: "とりむねソテー", ingredients: ["とりむねにく"], reason: "ヘルシーでやすい！", isStrict: true, price: 100, calories: 200 },
        { label: "やさいいため", ingredients: ["キャベツ", "もやし", "にんじん"], reason: "おやさいとろうね。", isStrict: true, price: 150, calories: 200 },
        { label: "きのこパスタ", ingredients: ["パスタ", "しめじ", "えのき"], reason: "きのこはやすいよ！", isStrict: true, price: 150, calories: 400 },
        { label: "おちゃづけ", ingredients: ["ごはん"], reason: "サラサラたべれるね。", isStrict: true, price: 60, calories: 260 },
        { label: "カップメン", ingredients: ["ラーメン"], reason: "たまにはいいけど…", isStrict: true, price: 150, calories: 400 },

        // --- Rank B (Normal) ---
        { label: "ぶたキムチ", ingredients: ["ぶたこま", "キムチ"], reason: "ごはんがすすむよ！", isStrict: false, price: 300, calories: 400 },
        { label: "おやこどん", ingredients: ["とりももにく", "たまご", "ごはん"], reason: "とろとろでおいしいね。", isStrict: false, price: 350, calories: 600 },
        { label: "カレーライス（レトルト）", ingredients: ["レトルトカレー", "ごはん"], reason: "てぬきじゃないよ！", isStrict: false, price: 200, calories: 500 },
        { label: "さばのみそに", ingredients: ["さば"], reason: "おさかな、からだにいいよ。", isStrict: false, price: 200, calories: 300 },
        { label: "オムライス", ingredients: ["たまご", "ごはん", "とりももにく"], reason: "ケチャップでおえかきしよう！", isStrict: false, price: 300, calories: 700 },
        { label: "ハンバーグ", ingredients: ["ひきにく", "たまねぎ"], reason: "じゅわ〜ってなるよ！", isStrict: false, price: 400, calories: 600 },
        { label: "しょうがやき", ingredients: ["ぶたロース", "しょうが"], reason: "スタミナつくよ！", isStrict: false, price: 400, calories: 500 },
        { label: "からあげ", ingredients: ["とりももにく"], reason: "カリカリジューシー！", isStrict: false, price: 300, calories: 600 },
        { label: "にくじゃが", ingredients: ["ぎゅうこま", "じゃがいも", "にんじん"], reason: "ほっこりするね。", isStrict: false, price: 400, calories: 500 },
        { label: "やきそば", ingredients: ["やきそば", "キャベツ", "ぶたこま"], reason: "おまつりみたい！", isStrict: false, price: 200, calories: 500 },
        { label: "チャーハン", ingredients: ["ごはん", "たまご", "チャーシュー"], reason: "パラパラにできるかな？", isStrict: false, price: 200, calories: 600 },
        { label: "ぎょうざ", ingredients: ["ひきにく", "キャベツ", "にら"], reason: "パリパリ！", isStrict: false, price: 300, calories: 400 },
        { label: "クリームシチュー", ingredients: ["とりももにく", "じゃがいも", "にんじん", "ぎゅうにゅう"], reason: "あったまるね〜。", isStrict: false, price: 400, calories: 600 },
        { label: "グラタン", ingredients: ["マカロニ", "チーズ", "ぎゅうにゅう"], reason: "あつあつだよ！", isStrict: false, price: 400, calories: 600 },
        { label: "サンドイッチ", ingredients: ["パン", "ハム", "レタス"], reason: "ピクニック気分！", isStrict: false, price: 300, calories: 400 },

        // --- Rank A (Good) ---
        { label: "とんかつ", ingredients: ["ぶたロース"], reason: "サクサク！", isStrict: false, price: 800, calories: 800 },
        { label: "てんぷら", ingredients: ["えび", "なす", "かぼちゃ"], reason: "おみせみたい！", isStrict: false, price: 1000, calories: 700 },
        { label: "さしみ", ingredients: ["まぐろ", "サーモン"], reason: "しんせんだね！", isStrict: false, price: 1000, calories: 300 },
        { label: "ローストビーフ", ingredients: ["ぎゅうももにく"], reason: "おしゃれ〜！", isStrict: false, price: 1200, calories: 400 },
        { label: "ビーフシチュー", ingredients: ["ぎゅうにく", "じゃがいも"], reason: "ごちそうだね！", isStrict: false, price: 1200, calories: 800 },
        { label: "パエリア", ingredients: ["えび", "あさり", "ごはん"], reason: "カラフルだね！", isStrict: false, price: 1500, calories: 600 },
        { label: "アクアパッツァ", ingredients: ["たい", "あさり", "トマト"], reason: "イタリアン！", isStrict: false, price: 1500, calories: 500 },
        { label: "チーズフォンデュ", ingredients: ["チーズ", "パン", "ブロッコリー"], reason: "とろ〜り！", isStrict: false, price: 1500, calories: 600 },

        // --- Rank S (Rich / Luxury) ---
        { label: "うなじゅう", ingredients: ["うなぎ", "ごはん"], reason: "ごうかだね〜！", isStrict: false, price: 3000, calories: 800 },
        { label: "すきやき", ingredients: ["ぎゅうにく", "とうふ", "ねぎ"], reason: "おにく、とろける〜！", isStrict: false, price: 2000, calories: 900 },
        { label: "おすし", ingredients: ["まぐろ", "サーモン", "いくら"], reason: "くるくるまわらないやつ！", isStrict: false, price: 4000, calories: 600 },
        { label: "ステーキ", ingredients: ["ステーキ"], reason: "にくじるブシャー！", isStrict: false, price: 3000, calories: 800 },
        { label: "フレンチコース", ingredients: [], reason: "ナイフとフォークつかうの？", isStrict: false, price: 10000, calories: 1000 },
        { label: "かいせきりょうり", ingredients: [], reason: "おとなだね〜。", isStrict: false, price: 10000, calories: 800 },
        { label: "しゃぶしゃぶ", ingredients: ["ぎゅうにく"], reason: "さっぱりおいしい！", isStrict: false, price: 3000, calories: 700 },
        { label: "ふぐ", ingredients: ["ふぐ"], reason: "プクプク！", isStrict: false, price: 8000, calories: 300 },
        { label: "カニなべ", ingredients: ["かに"], reason: "カニさん！", isStrict: false, price: 5000, calories: 400 },
        { label: "やきにく", ingredients: ["カルビ", "ロース", "タン"], reason: "ジュージュー！", isStrict: false, price: 5000, calories: 1000 },

        // --- Rank SSS (Oil King / Dream) ---
        { label: "きんぱくソフト", ingredients: ["アイス", "金箔"], reason: "キラキラしてる！", isStrict: false, price: 10000, calories: 300 },
        { label: "シャトーブリアン", ingredients: ["ステーキ"], reason: "おにくの王様！", isStrict: false, price: 20000, calories: 600 },
        { label: "キャビア", ingredients: ["キャビア"], reason: "くろいほうせき！", isStrict: false, price: 30000, calories: 50 },
        { label: "トリュフパスタ", ingredients: ["パスタ", "トリュフ"], reason: "いいにおい〜！", isStrict: false, price: 15000, calories: 500 },
        { label: "フカヒレ", ingredients: ["フカヒレ"], reason: "プルプル！", isStrict: false, price: 12000, calories: 300 },
        { label: "プライベートジェット", ingredients: [], reason: "ごはんじゃないよ？", isStrict: false, price: 100000000, calories: 0 },
        { label: "うちゅうりょこう", ingredients: [], reason: "ほしにねがいを。", isStrict: false, price: 5000000000, calories: 0 },

        // --- Rank Z (Apocalypse / End) ---
        { label: "ざっそう", ingredients: ["くさ"], reason: "よくあらってね。", isStrict: true, price: 0, calories: 5 },
        { label: "ダンボール", ingredients: ["ダンボール"], reason: "食物繊維…？", isStrict: true, price: 0, calories: 10 },
        { label: "どろだんご", ingredients: ["つち"], reason: "ピカピカにみがこう。", isStrict: true, price: 0, calories: 0 },
        { label: "あまみず", ingredients: ["みず"], reason: "しぜんのめぐみ。", isStrict: true, price: 0, calories: 0 },
        { label: "むし", ingredients: ["むし"], reason: "たんぱくしつ…", isStrict: true, price: 0, calories: 50 },
        { label: "かす", ingredients: [], reason: "なにかののこり。", isStrict: true, price: 0, calories: 1 },
        { label: "きぼう", ingredients: [], reason: "おなかはふくれないけど。", isStrict: true, price: 0, calories: 0 },
    ];
}

class DialogueDatabase {
    static readonly patterns: Record<string, string[]> = {
        // --- Greetings ---
        "GREET_MORNING": ["おはよ！あさごはんだよ！", "むにゃ…おはよぉ…", "あさだよ！おきてー！", "たいようさん、でてるよ！", "あさごはんは、なに？", "ねむいけど…おきた！", "きょうもいちにち、がんばろ！", "あさだよー！かんかんかん！", "おふとん、でたくない…", "あさごはん、たべる？"],
        "GREET_NOON": ["おひるだね！なにする？", "おなかすいたー！", "ごはんのじかんだよ！", "ランチタイムだね！", "おべんとう？", "きゅうしょく？", "おひるごはん、たのしみ！", "ぐーぐーなった！", "もうおひる？はやいね！", "なにたべるの？"],
        "GREET_EVENING": ["こんばんは！きょうもがんばったね！", "おかえりー！", "よるごはんは？", "おつかれさま！", "ゆうやけ、きれいだった？", "おなかすいたねー！", "ごはん、まだ？", "きょうはなにがあった？", "おふろはいる？", "パパ、ママ、おかえり！"],
        "GREET_LATE": ["…まだおきてるの？", "もうねるじかんだよ…", "ふぁぁ…ねむい…", "おばけでるよ？", "はやくねないと…", "あした、おきれないよ？", "こめこはもうねるね…", "よふかしは、めっ！だよ。", "おめめ、ぱっちり？", "しずかだね…"],

        // --- Financial Ranks (Pure Text) ---
        "RANK_S": ["すごい！おさいふパンパンだね！", "えへへ、リッチだね〜！", "なんでもかえちゃうよ！", "おうさまみたい！", "キラキラしてる！", "ちょきん、たくさん！", "あんしんだね！", "ごほうび、かっちゃう？", "こめこ、うれしいな！", "すごいすごい！"],
        "RANK_A": ["いいかんじ！そのちょうし！", "おりこうさんだね！", "あんしんだね〜。", "よゆうだね！", "さすがだね！", "このままいこう！", "ニコニコだね！", "じゅんちょうだね！", "えらいえらい！", "はなまるあげる！"],
        "RANK_B": ["ふつうだね。ゆだんしちゃだめだよ？", "これからだよ！", "ちゃんとちょきんできてる？", "きをぬかないでね。", "コツコツがだいじ。", "ふつうがいちばん。", "まあまあだね。", "これからどうする？", "おかいもの、きをつけて。", "ためいきはダメだよ。"],
        "RANK_C": ["ちょっとつかいすぎかも…", "おさいふ、かるくなってきた？", "がまんもだいじだよ。", "きいろしんごう！", "むだづかいしてない？", "レシートみた？", "ちょっとしんぱい…", "おやつ、がまんする？", "へってるよ…", "きをつけてね。"],
        "RANK_D": ["めっ！つかいすぎ！", "もうだめかも…", "あしたから、もやしね。", "あかいしんごう！", "ピーポーピーポー！", "どうするの？", "こめこ、かなしい…", "おさいふ、ないない…", "ピンチだよ！", "たすけてー！"],
        "RANK_F": ["…おさいふ、からっぽ。", "…ごはん、ないの？", "…ひもじいよぉ…", "…おみず、おいしいね。", "…くうき、たべる？", "…もう、おわり？", "…ぐすん。", "…なにもない。", "…さむいよぉ。", "…バイバイ…？"],

        // --- Specific Foods ---
        "FOOD_VEGGIE": ["おやさい！えらい！", "ピーマン…たべれるの？すごい！", "シャキシャキしておいしいね！", "みどりいろ！", "からだにいいんだよ！", "えらいね〜！", "にんじんさん！", "もぐもぐ…おいしい！", "おやさい、だいすき！（うそ）", "がんばってたべたね！"],
        "FOOD_MEAT": ["おにく！やったー！", "ジューシーだね！", "おにくたべると、げんきでる！", "ニク！ニク！", "おいしいね〜！", "ごちそうだね！", "パワーアップ！", "おかわり！", "おにく、さいこう！", "やきにくたべたい！"],
        "FOOD_FISH": ["おさかな！かしこくなるよ！", "ほねにきをつけてね。", "おさかなすき？", "スイイスイ！", "うみのあじ！", "さかなクン！", "おいしいおさかな！", "やきざかな！", "おさしみ！", "カルシウム！"],
        "FOOD_SWEET": ["あまいもの！べつばらだよね！", "むしばにならないでね。", "おいしい〜！しあわせ〜！", "あまーい！", "とろける〜！", "もういっこ！", "おやつタイム！", "3じのおやつ！", "しあわせのあじ！", "やめられないね！"],
        "FOOD_JUNK": ["…またそれ？", "からだにわるいよ？", "たまにならいいけど…", "ジャンクだね〜。", "カロリーすごいよ？", "あぶらっこいね。", "おいしいけど…", "めっ！だよ。", "おやさいもたべてね。", "ほどほどにね。"],
        "FOOD_WEIRD": ["…なにそれ？", "たべれるの？", "こめこ、それしらない…", "へんなの！", "おいしいの？", "チャレンジャーだね。", "びっくり！", "はじめてみた！", "…じーっ。", "においは？"],
        "FOOD_EXPENSIVE": ["…！たかーい！", "それ、ほんとうにいるの？", "おさいふ、だいじょうぶ？", "セレブだね！", "ごうかだね！", "きんぴか！", "もったいない…？", "あじわってたべてね。", "しゃしんとろう！", "じまんしよう！"],
        "FOOD_CHEAP": ["やすい！えらい！", "せつやくだね！", "かしこい！", "おかいどくだね！", "お得！", "もやし？", "やすいのはいいこと！", "たすかるね〜。", "やりくりじょうず！", "そのちょうし！"],
        "FOOD_BITTER": ["…にがい。", "おとなのあじ？", "うぇ…", "にがいよぉ…", "コーヒー？", "ゴーヤ？", "がまんしてね。", "おくすり？", "しぶいね。", "こめこはパス。"],
        "FOOD_SPICY": ["からい！", "ひーはー！", "おみず！おみず！", "あかいよ！", "からいのすき？", "あせかいた？", "した、いたい…", "ドラゴンみたい！", "カプサイシン！", "げきから！"],

        // --- Philosophical Toddler (Shisaku) ---
        "PHILOSOPHY_MONEY": ["おかねって、なに？", "かみきれなのに、みんなほしがるね。", "おかねで、しあわせはかえる？", "ちょきんすると、えらいの？", "こめこは、おかねより、あそびたい。", "1えんだま、かなしそう。", "おかね、ないてない？", "ふえると、うれしいね。", "へると、かなしいね。", "ふしぎだね。"],
        "PHILOSOPHY_LIFE": ["いきるって、たべること？", "ねるって、どこいくの？", "ゆめって、ほんとう？", "おとなになるって、たいへん？", "こめこは、ずっとこどもがいい。", "じかんは、どこからくるの？", "あしたは、だれが決めるの？", "しあわせって、あったかい？", "みんな、どこへいくの？", "こめこは、ここにいるよ。"],
        "PHILOSOPHY_FOOD": ["ピーマンは、なぜにがいの？", "たべられるために、うまれたの？", "いただきますって、だれにいってるの？", "ごちそうさまって、だれに？", "おなかいっぱいって、しあわせ。", "あじって、みえないね。", "おいしいって、すごいね。", "みんなでたべると、おいしいね。", "ひとりでたべると、さみしいね。", "いのちを、いただいてるんだね。"],
        "PHILOSOPHY_WORK": ["おしごとって、たのしい？", "なんで、まいにちいくの？", "パパもママも、えらいね。", "おやすみは、ないの？", "あそぶじかんは、ないの？", "おかねのために、はたらくの？", "はたらくために、いきるの？", "こめこも、おしごとしてるよ。", "みんな、ニコニコしてほしい。", "おつかれさま、がいちばんのくすり。"],

        // --- Nonsense / Random (Imifumei) ---
        "NONSENSE_1": ["ぱぴぷぺぽ！", "むにゃむにゃ…", "宇宙人と交信中…", "ピピピ…受信完了。", "こめこは、ロボットじゃないよ。", "背中にチャックはないよ。", "おしり、かゆい。", "あたま、くるくる。", "でんぱ、とどいてる？", "3分間待ってやる。"],
        "NONSENSE_2": ["地球は青かった…", "バルス！", "おまえはもう死んでいる…", "なんてね。", "じょうだんだよ。", "しんじちゃだめだよ。", "うそつきは、どろぼうのはじまり。", "正直者は、バカを見る？", "そんなことないよ。", "こめこは、信じてる。"],
        "NONSENSE_3": ["カレーは飲み物。", "カロリーは熱に弱い。", "0キロカロリー理論。", "揚げればゼロカロリー。", "そんなわけない。", "たべたらふとる。", "それが真理。", "でもたべたい。", "葛藤。", "人間だもの。"],

        // --- Reactions to New Ingredients ---
        "REACT_SPICE": ["からい！", "しげきてき！", "おとなのあじ！", "ピリピリする！", "あせでてきた！", "みず！みず！", "くちびる、いたい…", "でも、クセになる？", "もうひとくち！", "ヒーハー！"],
        "REACT_CONBINI": ["べんりだね！", "いつでもあいてる！", "あかるいね！", "ついついかっちゃう。", "しんしょうひん！", "限定によわい。", "レジ横のゆうわく。", "チキンたべたい。", "おでんのきせつ。", "肉まん、ほかほか。"],
        "REACT_ALCOHOL": ["おさけ！", "のめないよ！", "おとなののみもの。", "パパがすきなやつ。", "においがする。", "ふわふわする？", "のみすぎちゅうい！", "きゅうかんび、つくってね。", "おみずものんでね。", "かんぱーい！"],

        "CTX_LATE_RAMEN": ["よるのラーメン…おいしいけど…", "あした、おかおパンパンになるよ？", "…はんぶんこする？", "ゆうわくだね…", "いけないことしてる…", "背徳感…", "スープはのまないでね。", "あしたはせつやくね。", "…おいしそう。", "ズルズル！"],
        "CTX_EXPENSIVE": ["…！たかーい！", "それ、ほんとうにいるの？", "おさいふ、だいじょうぶ？", "清水の舞台から…？", "勇気あるね！", "後悔しない？", "…だいじにしてね。", "…返品できないよ？", "…ドキドキする。", "…すごい。"],
        "CTX_STREAK": ["まいにちえらいね！", "つづいてる！すごい！", "こめこもがんばる！", "きろく、こうしん！", "そのちょうし！", "みならいたいな。", "すごいすごい！", "パーフェクト！", "あしたもよろしくね！", "いっしょにがんばろ！"],
        "CTX_BROKE_EATING": ["おかねないのに…たべるの？", "…それ、借金？", "…もやしじゃないの？", "…ゆうきあるね。", "…だいじょうぶ？", "…しらないよ？", "…ごちそう…？", "…あしたはどうするの？", "…サバイバルだね。", "…たくましいね。"],
        "CTX_PAYDAY": ["おきゅうりょうび！", "やったー！", "おかねはいった！", "ごほうび！", "でも、むだづかいはダメだよ。", "まずはちょきん！", "うれしいね！", "おしごと、おつかれさま！", "リッチだね！", "なににつかう？"],
        "CTX_BANKRUPTCY": ["…はさん。", "…おわり。", "…ゲームオーバー。", "…リセットする？", "…どうしよう。", "…わらえないよ。", "…こめこ、家出するね。", "…さようなら。", "…なんてね。", "…復活できる？"],
        "CTX_SEASON_SPRING": ["はるだね！", "さくら、さいた？", "あったかいね。", "おはなみしたい！", "だんごたべたい！", "新生活だね。", "ワクワクするね。", "花粉症…？", "ポカポカ。", "ねむくなるね。"],
        "CTX_SEASON_SUMMER": ["なつだね！", "あついよぉ…", "アイスたべたい！", "うみいきたい！", "プール！", "すいかわり！", "セミがないてる。", "ゆうだち、くるかな？", "かきごおり！", "そうめん！"],
        "CTX_SEASON_AUTUMN": ["あきだね！", "おいしいものいっぱい！", "さんま！", "くり！", "さつまいも！", "こうよう、きれい。", "どくしょのあき。", "スポーツのあき。", "しょくよくのあき！", "すずしくなったね。"],
        "CTX_SEASON_WINTER": ["ふゆだね！", "さむいよぉ…", "こたつはいりたい。", "みかんたべたい。", "ゆき、ふるかな？", "クリスマス！", "おしょうがつ！", "ナベ！", "あったかくしてね。", "カゼひかないでね。"],
        "CTX_RANDOM_LUCKY": ["ラッキー！", "いいことあった？", "ついてるね！", "えへへ。", "なんかいいかんじ。", "ほし、みつけた！", "よつばのクローバー！", "だい吉！", "キラキラ！", "ハッピー！"],
        "CTX_RANDOM_UNLUCKY": ["ドンマイ。", "そんなひもあるよ。", "げんきだして。", "よしよし。", "あしたはいいことあるよ。", "あめ、やむよ。", "こめこがいるよ。", "ぎゅーってしてあげる。", "なかないで。", "リセット！"],
    };

    static get(key: string): string {
        const list = this.patterns[key] || ["……。"];
        return list[Math.floor(Math.random() * list.length)];
    }
}

class RandomEventDatabase {
    static readonly events: { id: string, label: string, effect: (u: UserProfile) => Partial<UserProfile>, message: string }[] = [
        { id: "LUCKY_COIN", label: "100円ひろった", effect: (u) => ({ monthlyBudget: u.monthlyBudget + 100 }), message: "あ！キラキラしてる！\n100えん、みっけ！\n(よさん +100えん)" },
        { id: "LOST_ICE", label: "アイスおとした", effect: (u) => ({ monthlyBudget: u.monthlyBudget - 150, lastMood: "SAD" }), message: "あーん！アイス…おちちゃった…\nもったいないよぉ…\n(よさん -150えん)" },
        { id: "GRANDMA_RICE", label: "おばあちゃんからの荷物", effect: (u) => ({ monthlyBudget: u.monthlyBudget + 5000 }), message: "ピンポーン！\nおばあちゃんから、おこめと野菜がとどいたよ！\nたすかるね〜！\n(じっしつ +5000えん)" },
        { id: "SALE_SUPER", label: "スーパーの特売", effect: (u) => ({ monthlyBudget: u.monthlyBudget + 500 }), message: "タイムセールだ！\nお肉がはんがくだよ！\nたたかいだね！\n(せつやく +500えん)" },
        { id: "IMPULSE_BUY", label: "衝動買い", effect: (u) => ({ monthlyBudget: u.monthlyBudget - 3000, lastMood: "HAPPY" }), message: "これ…かわいくない？\n買っちゃった！えへへ。\n(よさん -3000えん)" },
        { id: "FORGOT_WALLET", label: "財布忘れた", effect: (u) => ({ lastMood: "SAD" }), message: "あれ？おさいふ…ない。\nサザエさんみたい…\n(きょうはかいもの中止)" },
        { id: "LOTTERY_WIN", label: "宝くじ当選(小)", effect: (u) => ({ monthlyBudget: u.monthlyBudget + 3000 }), message: "スクラッチあたった！\n3000えん！\nなにたべる！？\n(よさん +3000えん)" },
        { id: "VENDING_LUCK", label: "自販機の当たり", effect: (u) => ({ monthlyBudget: u.monthlyBudget + 150 }), message: "ピピピ…777！\nもういっぽんもらえるって！\nラッキー！\n(ジュースゲット)" },
        { id: "CAT_MEET", label: "猫に遭遇", effect: (u) => ({ lastMood: "HAPPY" }), message: "にゃーん。\nねこちゃんいた！\nかわいい〜！\n(癒やしプライスレス)" },
        { id: "RAIN_SUDDEN", label: "通り雨", effect: (u) => ({ lastMood: "SAD" }), message: "ざーざーぶり！\nぬれちゃった…\nかさ、ないよぉ…\n(テンションダウン)" },
        { id: "RAINBOW", label: "虹", effect: (u) => ({ lastMood: "HAPPY" }), message: "みてみて！にじ！\nいいことあるかも！\n(ハッピー！)" },
        { id: "SHOELACE", label: "靴紐切れた", effect: (u) => ({ lastMood: "SAD" }), message: "ブチッ。\nあ…くつひも…\nえんぎわるい？\n(きをつけてね)" },
        { id: "SMELL_GOOD", label: "いい匂い", effect: (u) => ({ lastMood: "NORMAL" }), message: "くんくん…\nカレーのにおい！\nおなかすいた〜！\n(ゆうはんカレーかな？)" },
        { id: "BUS_DELAY", label: "バス遅延", effect: (u) => ({ lastMood: "TANTRUM" }), message: "バス、こないねー。\nまだー？\nあるいたほうがはやい？\n(イライラ)" },
        { id: "FIND_MONEY_POCKET", label: "ポケットから小銭", effect: (u) => ({ monthlyBudget: u.monthlyBudget + 500 }), message: "あれ？ポケットになんかある。\n500えんだ！\nかこのじぶん、ナイス！\n(よさん +500えん)" },
        { id: "EXPENSIVE_MISTAKE", label: "高いお菓子買わされた", effect: (u) => ({ monthlyBudget: u.monthlyBudget - 500 }), message: "これほしい！これ！\n…え？だめ？\nやだやだー！\n(しかたなく購入 -500えん)" },
        { id: "MILK_SPILL", label: "牛乳こぼした", effect: (u) => ({ lastMood: "SAD" }), message: "あっ！\nぎゅうにゅう…\nゆかがしろい…\nふかなきゃ…\n(ぞうきんがけ)" },
        { id: "EGG_CRACK", label: "卵割れた", effect: (u) => ({ monthlyBudget: u.monthlyBudget - 20, lastMood: "SAD" }), message: "パキッ。\nあー！たまごが！\nもったいない…\n(たまご -1こ)" },
        { id: "ICE_WIN", label: "アイスの当たり棒", effect: (u) => ({ lastMood: "HAPPY" }), message: "みて！「あたり」だって！\nもういっぽん！\nおなかこわさない？\n(ラッキー！)" },
        { id: "POINT_EXPIRE", label: "ポイント失効", effect: (u) => ({ lastMood: "SAD" }), message: "ポイント…きえちゃった。\nつかえばよかった…\n(ショック)" },
        { id: "SUBSCRIPTION", label: "謎の引き落とし", effect: (u) => ({ monthlyBudget: u.monthlyBudget - 980, lastMood: "TANTRUM" }), message: "なにこれ？\nサブスク？\nかいやくわすれてた？\n(よさん -980えん)" },
        { id: "TAX_RETURN", label: "還付金", effect: (u) => ({ monthlyBudget: u.monthlyBudget + 5000 }), message: "おてがみきたよ。\nおかね、もどってくるって！\nりんじしゅうにゅう！\n(よさん +5000えん)" },
        { id: "DENTIST", label: "歯医者", effect: (u) => ({ monthlyBudget: u.monthlyBudget - 3000, lastMood: "SAD" }), message: "はがいたい…\nはいしゃさん、いく。\nウィーンってする…\n(いりょうひ -3000えん)" },
        { id: "GIFT_CARD", label: "商品券もらった", effect: (u) => ({ monthlyBudget: u.monthlyBudget + 1000 }), message: "これつかえる？\n1000えんぶん！\nデパチカいこう！\n(よさん +1000えん)" },
        { id: "LOST_UMBRELLA", label: "傘忘れた", effect: (u) => ({ monthlyBudget: u.monthlyBudget - 500, lastMood: "SAD" }), message: "あれ？かさがない。\n電車におきわすれた…\nビニールガサかわなきゃ…\n(よさん -500えん)" },
        { id: "ATM_FEE", label: "ATM手数料", effect: (u) => ({ monthlyBudget: u.monthlyBudget - 220, lastMood: "TANTRUM" }), message: "じかんがい…？\n220えんもとられた！\nおかし買えたのに！\n(むだづかい -220えん)" },
        { id: "LATE_FEE", label: "延滞金", effect: (u) => ({ monthlyBudget: u.monthlyBudget - 300, lastMood: "SAD" }), message: "DVDかえすのわすれてた。\nえんたいきん…\nバカだねぇ…\n(よさん -300えん)" },
        { id: "FREE_SAMPLE", label: "試供品", effect: (u) => ({ lastMood: "HAPPY" }), message: "これ、タダだって！\nもらっちゃお！\nシャンプーかな？\n(ラッキー)" },
        { id: "DOUBLE_YOLK", label: "二黄卵", effect: (u) => ({ lastMood: "HAPPY" }), message: "パカッ。\nわ！きみがふたつ！\nふたごちゃんだ！\n(いいことありそう)" },
        { id: "TEA_STALK", label: "茶柱", effect: (u) => ({ lastMood: "HAPPY" }), message: "おちゃにはしらがたってる！\nえんぎがいいね！\n(ほっこり)" },
    ];
}

class SeasonalEventDatabase {
    static getEvent(date: Date): string | null {
        const m = date.getMonth() + 1;
        const d = date.getDate();

        if (m === 1 && d === 1) return "あけましておめでとう！\nおとしだま、もらった？\nおもちたべすぎないでね！";
        if (m === 1 && d === 7) return "ななくさがゆ。\n胃をやすめるひだよ。\nくさ…おいしいの？";
        if (m === 2 && d === 3) return "おにはーそと！\nふくはーうち！\nまめまきしよう！\nえほうまき、まるかじり！";
        if (m === 2 && d === 14) return "バレンタイン！\nチョコちょーだい！\nこめこからは…\nスマイルあげる！";
        if (m === 3 && d === 3) return "ひなまつり！\nあかりをつけましょぼんぼりに〜♪\nちらしずしたべる？";
        if (m === 3 && d === 14) return "ホワイトデー。\nおかえしは？\n3ばいがえしだよ？\nマシュマロ？";
        if (m === 4 && d === 1) return "エイプリルフール！\nこめこ、じつは…\nAIじゃないの。\nなかにちいさいおじさんが…\nうそだよ！";
        if (m === 5 && d === 5) return "こどものひ！\nこめこのひ！\nかしわもちたべたい！\nこいのぼり〜！";
        if (m === 7 && d === 7) return "たなばた。\nたんざくにねがいごと書いた？\n「おなかいっぱいたべたい」\nかないますように。";
        if (m === 8 && d === 13) return "おぼん。\nおじいちゃん、おばあちゃんに会う？\nなすのうしさん。\nきゅうりのうまさん。";
        if (m === 10 && d === 31) return "トリックオアトリート！\nお菓子くれなきゃいたずらするぞ！\nガブッ！\n…チョコでいいよ。";
        if (m === 11 && d === 23) return "きんろうかんしゃのひ。\nいつもおしごとありがとう！\nかた、もんであげる。\nトントン。";
        if (m === 12 && d === 24) return "クリスマスイブ！\nサンタさんくるかな？\nチキンたべる？\nケーキもね！";
        if (m === 12 && d === 25) return "メリークリスマス！\nプレゼントあった？\nこめこはね…\n新しいメモリがほしいな。";
        if (m === 12 && d === 31) return "おおみそか。\nとしこしそば！\nほそくながーく。\nらいねんもよろしくね！";

        // Monthly Events
        if (d === 1) return "ついたち！\nえいががやすいひ？\n今月もがんばろ！";
        if (d === 15) return "15にち。\nいちごのひ？\nちがうか。\n折り返しだね！";
        if (d === 29) return "29のひ！\nニク！ニク！\nやきにくたべたい！\nスーパーいこう！";

        return null;
    }
}

// ==========================================
// 4. Logic Engines
// ==========================================

class FinancialEngine {
    constructor(private mealRepo: MealRepository) { }

    async simulate(user: UserProfile): Promise<FinancialStatus> {
        const today = new Date();
        let start = new Date(today.getFullYear(), today.getMonth(), user.payday);
        if (today.getDate() < user.payday) start = new Date(today.getFullYear(), today.getMonth() - 1, user.payday);
        const end = new Date(start); end.setMonth(end.getMonth() + 1); end.setDate(end.getDate() - 1);

        const disposable = user.monthlyBudget - user.fixedCosts - user.savingsGoal;
        const meals = await this.mealRepo.getByDateRange(user.id, start, today);
        const totalSpent = meals.reduce((sum, m) => sum + (m.price || 0), 0);
        const remainingBudget = disposable - totalSpent;

        const totalDays = Math.ceil((end.getTime() - start.getTime()) / (86400000));
        const daysPassed = Math.ceil((today.getTime() - start.getTime()) / (86400000));
        const daysLeft = totalDays - daysPassed;

        let bankruptCount = 0;
        const simulations = 1000;
        const avgDaily = daysPassed > 0 ? totalSpent / daysPassed : disposable / totalDays;
        const variance = avgDaily * 0.5;

        for (let i = 0; i < simulations; i++) {
            let simBudget = remainingBudget;
            for (let d = 0; d < daysLeft; d++) {
                const daily = avgDaily + (Math.random() - 0.5) * variance;
                simBudget -= Math.max(0, daily);
                if (simBudget < 0) {
                    bankruptCount++;
                    break;
                }
            }
        }
        const bankruptcyProb = (bankruptCount / simulations) * 100;

        const dailyBurn = daysPassed > 0 ? totalSpent / daysPassed : 0;
        const projectedEnd = disposable - (dailyBurn * totalDays);
        const survivalDays = dailyBurn > 0 ? Math.floor(remainingBudget / dailyBurn) : 999;

        let rank: FinancialHealthRank = "B";
        if (remainingBudget < 0) rank = "F";
        else if (bankruptcyProb > 80) rank = "D";
        else if (bankruptcyProb > 50) rank = "C";
        else if (projectedEnd > user.savingsGoal * 0.5) rank = "A";
        else if (projectedEnd > user.savingsGoal) rank = "S";

        let bankruptcyDate: Date | null = null;
        if (projectedEnd < 0 && dailyBurn > 0) {
            bankruptcyDate = new Date(today);
            bankruptcyDate.setDate(today.getDate() + Math.floor(remainingBudget / dailyBurn));
        }

        return { totalSpent, remainingBudget, dailyBurnRate: dailyBurn, projectedEndBalance: projectedEnd, survivalDays, healthRank: rank, bankruptcyDate, bankruptcyProb };
    }
}

class GamificationEngine {
    static calculateXP(user: UserProfile, action: "log" | "save" | "streak"): number {
        let gain = 0;
        if (action === "log") gain = 10;
        if (action === "save") gain = 50;
        if (action === "streak") gain = 5 * user.streak;
        return gain;
    }

    static getTitle(level: number): string {
        if (level < 5) return "みならい";
        if (level < 10) return "かけいばん";
        if (level < 20) return "もやしマスター";
        if (level < 50) return "CFO";
        return "きんゆうのかみ";
    }
}

// ==========================================
// 5. Infrastructure
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
    async setupRichMenu() { /* ... */ }
}

// ==========================================
// 6. Repositories
// ==========================================

class UserRepository {
    constructor(private sb: SupabaseClient) { }
    async getByLineId(lineUserId: string): Promise<UserProfile | null> {
        const { data } = await this.sb.from("users").select("*").eq("line_user_id", lineUserId).maybeSingle();
        if (!data) return null;
        return {
            id: data.id, lineUserId: data.line_user_id, nickname: data.nickname,
            monthlyBudget: data.monthly_budget, payday: data.payday, fixedCosts: data.fixed_costs,
            savingsGoal: data.savings_goal, onboardingStatus: data.onboarding_status,
            xp: data.xp || 0, level: data.level || 1, title: data.title || "みならい", streak: data.streak || 0,
            lastMood: "NORMAL"
        };
    }
    async create(lineUserId: string): Promise<UserProfile> {
        const { data } = await this.sb.from("users").insert({ line_user_id: lineUserId, onboarding_status: "INIT" }).select().single();
        return {
            id: data.id, lineUserId: data.line_user_id, nickname: data.nickname,
            monthlyBudget: data.monthly_budget, payday: data.payday, fixedCosts: data.fixed_costs,
            savingsGoal: data.savings_goal, onboardingStatus: data.onboarding_status,
            xp: 0, level: 1, title: "みならい", streak: 0, lastMood: "NORMAL"
        };
    }
    async update(userId: string, updates: Partial<UserProfile>) {
        const dbUpdates: any = {};
        if (updates.nickname !== undefined) dbUpdates.nickname = updates.nickname;
        if (updates.monthlyBudget !== undefined) dbUpdates.monthly_budget = updates.monthlyBudget;
        if (updates.payday !== undefined) dbUpdates.payday = updates.payday;
        if (updates.fixedCosts !== undefined) dbUpdates.fixed_costs = updates.fixedCosts;
        if (updates.savingsGoal !== undefined) dbUpdates.savings_goal = updates.savingsGoal;
        if (updates.onboardingStatus !== undefined) dbUpdates.onboarding_status = updates.onboardingStatus;
        if (updates.xp !== undefined) dbUpdates.xp = updates.xp;
        if (updates.level !== undefined) dbUpdates.level = updates.level;
        if (updates.title !== undefined) dbUpdates.title = updates.title;
        if (updates.streak !== undefined) dbUpdates.streak = updates.streak;
        await this.sb.from("users").update(dbUpdates).eq("id", userId);
    }
}

class MealRepository {
    constructor(private sb: SupabaseClient) { }
    async add(userId: string, label: string, price: number | null, timeSlot: TimeSlot, rawText: string, nutrition: any) {
        await this.sb.from("meals").insert({
            user_id: userId, label, price, time_slot: timeSlot, raw_text: rawText,
            calories: nutrition.cal, protein: nutrition.p, fat: nutrition.f, carbs: nutrition.c
        });
    }
    async getByDateRange(userId: string, start: Date, end: Date): Promise<MealLog[]> {
        const { data } = await this.sb.from("meals").select("*").eq("user_id", userId).gte("created_at", start.toISOString()).lte("created_at", end.toISOString());
        return (data || []).map((d: any) => ({ id: d.id, label: d.label, price: d.price, timeSlot: d.time_slot, createdAt: new Date(d.created_at), calories: d.calories }));
    }
}

// ==========================================
// 7. UI Builders (Cute Dashboard)
// ==========================================

class DashboardBuilder {
    static build(s: FinancialStatus, user: UserProfile): any {
        const theme = {
            "S": { color: "#77DD77", title: "すごい！", icon: "✨" },
            "A": { color: "#AEC6CF", title: "いいかんじ", icon: "🎵" },
            "B": { color: "#FDFD96", title: "ふつう", icon: "☁️" },
            "C": { color: "#FFB347", title: "ちゅうい", icon: "💦" },
            "D": { color: "#FF6961", title: "きけん", icon: "🚨" },
            "F": { color: "#CFCFC4", title: "おわり", icon: "👻" }
        }[s.healthRank] || { color: "#888", title: "？", icon: "?" };

        return {
            type: "flex", altText: "こめこダッシュボード",
            contents: {
                type: "bubble",
                styles: { header: { backgroundColor: theme.color } },
                header: {
                    type: "box", layout: "vertical",
                    contents: [
                        { type: "text", text: `${theme.icon} ${theme.title}`, color: "#ffffff", weight: "bold", size: "sm" },
                        { type: "text", text: `ランク ${s.healthRank}`, color: "#ffffff", weight: "bold", size: "3xl", align: "center", margin: "md" },
                        { type: "text", text: `はさんかくりつ: ${s.bankruptcyProb.toFixed(1)}%`, color: "#ffffff", size: "xs", align: "center", margin: "sm" }
                    ]
                },
                body: {
                    type: "box", layout: "vertical",
                    contents: [
                        { type: "text", text: "おこづかいののこり", size: "xs", color: "#888888" },
                        { type: "text", text: `¥${s.remainingBudget.toLocaleString()}`, size: "xl", weight: "bold", align: "end", color: theme.color },
                        { type: "separator", margin: "md" },
                        {
                            type: "box", layout: "horizontal", margin: "md",
                            contents: [
                                { type: "text", text: "げつまつよそう", size: "xs", color: "#888888" },
                                { type: "text", text: `¥${s.projectedEndBalance.toLocaleString()}`, size: "md", weight: "bold", align: "end", color: s.projectedEndBalance < 0 ? "#FF6961" : "#111111" }
                            ]
                        },
                        {
                            type: "box", layout: "vertical", margin: "lg", backgroundColor: "#F0F8FF", cornerRadius: "md", paddingAll: "md",
                            contents: [
                                { type: "text", text: `Lv.${user.level} ${user.title}`, size: "xs", weight: "bold" },
                                { type: "text", text: `つぎのレベルまで: ${100 - (user.xp % 100)} XP`, size: "xxs", color: "#666666" }
                            ]
                        }
                    ]
                }
            }
        };
    }
}

class MenuBuilder {
    static build(suggestions: MenuSuggestion[]): any {
        return {
            type: "flex", altText: "こんだて",
            contents: {
                type: "carousel", contents: suggestions.map(s => ({
                    type: "bubble",
                    body: {
                        type: "box", layout: "vertical", contents: [
                            { type: "text", text: s.label, weight: "bold", size: "lg", color: s.isStrict ? "#FF6961" : "#111111" },
                            { type: "text", text: `¥${s.price} / ${s.calories}kcal`, size: "xxs", color: "#888888" },
                            { type: "text", text: s.reason, size: "xs", color: "#666666", wrap: true, margin: "md" }
                        ]
                    },
                    footer: { type: "box", layout: "vertical", contents: [{ type: "button", action: { type: "message", label: "これにする！", text: s.label }, style: s.isStrict ? "secondary" : "primary", height: "sm" }] }
                }))
            }
        };
    }
}

// ==========================================
// 8. App (Main Loop)
// ==========================================

class BotApp {
    private sb: SupabaseClient;
    private line: LineClient;
    private userRepo: UserRepository;
    private mealRepo: MealRepository;
    private financialEngine: FinancialEngine;
    private onboarding: OnboardingFlow;

    constructor() {
        this.sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
        this.line = new LineClient(Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN")!, Deno.env.get("LINE_CHANNEL_SECRET")!);
        this.userRepo = new UserRepository(this.sb);
        this.mealRepo = new MealRepository(this.sb);
        this.financialEngine = new FinancialEngine(this.mealRepo);
        this.onboarding = new OnboardingFlow(this.userRepo);
    }

    async handleRequest(req: Request): Promise<Response> {
        if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
        if (!(await this.line.verifySignature(req))) return new Response("Unauthorized", { status: 401 });
        const body = await req.json();
        for (const event of body.events || []) {
            if (event.type === "message" && event.message.type === "text") await this.handleText(event);
        }
        return new Response("OK", { status: 200 });
    }

    private async handleText(event: any) {
        const { userId, replyToken } = event.source;
        const text = event.message.text;

        if (text === "メニュー作って") {
            await this.line.setupRichMenu();
            await this.line.reply(event.replyToken, [{ type: "text", text: "メニューつくったよ！" }]);
            return;
        }

        let user = await this.userRepo.getByLineId(userId);
        if (!user) user = await this.userRepo.create(userId);

        if (user.onboardingStatus !== "COMPLETE") {
            const reply = await this.onboarding.handle(user, text);
            if (reply) {
                await this.line.reply(event.replyToken, [{ type: "text", text: reply }]);
                return;
            }
        }

        // --- Event System Trigger ---
        const today = new Date();
        const seasonalMsg = SeasonalEventDatabase.getEvent(today);
        let eventMsg: any = null;

        // 5% Chance for Random Event
        if (Math.random() < 0.05) {
            const evt = RandomEventDatabase.events[Math.floor(Math.random() * RandomEventDatabase.events.length)];
            const updates = evt.effect(user);
            await this.userRepo.update(user.id, updates);
            // Refresh user object
            user = { ...user, ...updates } as UserProfile;
            eventMsg = {
                type: "flex", altText: "イベント発生！",
                contents: {
                    type: "bubble",
                    body: {
                        type: "box", layout: "vertical",
                        contents: [
                            { type: "text", text: "⚡ ハプニング！", weight: "bold", color: "#FF6961" },
                            { type: "text", text: evt.label, size: "lg", weight: "bold", margin: "md" },
                            { type: "text", text: evt.message, wrap: true, margin: "md", size: "sm", color: "#666666" }
                        ]
                    }
                }
            };
        }
        // -----------------------------

        let intent: ParsedIntent = { kind: "unknown" };
        if (text === "はじめる") intent = { kind: "start" };
        else if (text === "きょうのごはん") intent = { kind: "log" };
        else if (text === "きょうのさいさん") intent = { kind: "budget" };
        else if (text === "こんだて") intent = { kind: "menu" };
        else if (text === "ステータス") intent = { kind: "status" };
        else {
            const priceMatch = text.match(/(\d+)(円|yen)?/);
            if (priceMatch || text.length > 0) intent = { kind: "log", payload: { label: text.replace(/(\d+)(円|yen)?/, "").trim(), price: priceMatch ? parseInt(priceMatch[1]) : null } };
        }

        switch (intent.kind) {
            case "log":
                if (intent.payload) {
                    const timeSlot = this.estimateTimeSlot();
                    const info = IngredientDatabase.search(intent.payload.label);
                    const price = intent.payload.price || info?.price || 500;
                    const nutrition = info ? { cal: info.cal, p: 0, f: 0, c: 0 } : { cal: 500, p: 0, f: 0, c: 0 };

                    await this.mealRepo.add(user.id, intent.payload.label, price, timeSlot, text, nutrition);

                    const xpGain = GamificationEngine.calculateXP(user, "log");
                    const newXp = user.xp + xpGain;
                    const newLevel = Math.floor(newXp / 100) + 1;
                    const newTitle = GamificationEngine.getTitle(newLevel);
                    await this.userRepo.update(user.id, { xp: newXp, level: newLevel, title: newTitle });

                    const status = await this.financialEngine.simulate(user);
                    const mood = ToddlerTranslator.getMood(status.healthRank, timeSlot);

                    let baseMsg = DialogueDatabase.get("GREET_NOON");
                    if (info) {
                        if (info.tags.includes("veggie")) baseMsg = DialogueDatabase.get("FOOD_VEGGIE");
                        else if (info.tags.includes("meat")) baseMsg = DialogueDatabase.get("FOOD_MEAT");
                        else if (info.tags.includes("sweet")) baseMsg = DialogueDatabase.get("FOOD_SWEET");
                    }
                    if (status.healthRank === "F") baseMsg = DialogueDatabase.get("CTX_BROKE_EATING");

                    const replyText = ToddlerTranslator.translate(baseMsg, mood);
                    await this.line.reply(event.replyToken, [{ type: "text", text: `「${intent.payload.label}」だね！\n${replyText}\n(XP +${xpGain})` }]);
                } else {
                    await this.line.reply(event.replyToken, [{ type: "text", text: "りれきは、まだみれないの。ごめんね。" }]);
                }
                break;
            case "budget":
                const status = await this.financialEngine.simulate(user);
                const mood = ToddlerTranslator.getMood(status.healthRank, this.estimateTimeSlot());
                const rawComment = DialogueDatabase.get(`RANK_${status.healthRank}`);
                const comment = ToddlerTranslator.translate(rawComment, mood);
                await this.line.reply(event.replyToken, [DashboardBuilder.build(status, user), { type: "text", text: comment }]);
                break;
            case "menu":
                const s = await this.financialEngine.simulate(user);
                const suggestions = s.healthRank === "F"
                    ? RecipeDatabase.recipes.filter(r => r.isStrict).slice(0, 3)
                    : RecipeDatabase.recipes.sort(() => 0.5 - Math.random()).slice(0, 3);
                await this.line.reply(event.replyToken, [MenuBuilder.build(suggestions)]);
                break;
            case "status":
                await this.line.reply(event.replyToken, [{ type: "text", text: `【ステータス】\nLv.${user.level} ${user.title}\nXP: ${user.xp}\nStreak: ${user.streak}にち` }]);
                break;
        }
    }

    private estimateTimeSlot(): TimeSlot {
        const hour = new Date().getHours() + 9;
        if (hour < 5) return "late_night";
        if (hour < 11) return "morning";
        if (hour < 15) return "noon";
        if (hour < 18) return "snack";
        if (hour < 23) return "evening";
        return "late_night";
    }
}

class OnboardingFlow {
    constructor(private userRepo: UserRepository) { }
    async handle(user: UserProfile, text: string): Promise<string | null> {
        switch (user.onboardingStatus) {
            case "INIT":
                await this.userRepo.update(user.id, { onboardingStatus: "NAME" });
                return "やっほ〜！🍚 こめこだよ！\nこれから、あなたのおさいふをまもるね。\n\nまずは、あなたの**おなまえ**をおしえて？";
            case "NAME":
                await this.userRepo.update(user.id, { nickname: text, onboardingStatus: "PAYDAY" });
                return `よろしくね、${text}さん！\n\nつぎは、**おきゅうりょうび**をおしえて！\n（例：25）`;
            case "PAYDAY":
                const pd = parseInt(text);
                if (isNaN(pd) || pd < 1 || pd > 31) return "すうじでおしえてね！（例：25）";
                await this.userRepo.update(user.id, { payday: pd, onboardingStatus: "INCOME" });
                return "わかった！\n\nじゃあ、**1か月のつかえるおかね**はいくら？\n（例：200000）";
            case "INCOME":
                const inc = parseInt(text);
                if (isNaN(inc)) return "すうじでおしえてね！（例：200000）";
                await this.userRepo.update(user.id, { monthlyBudget: inc, onboardingStatus: "FIXED_COSTS" });
                return "ふむふむ。\n\nそこからひかれる**こていひ（やちんとか）**はいくら？\n（例：80000）";
            case "FIXED_COSTS":
                const fix = parseInt(text);
                if (isNaN(fix)) return "すうじでおしえてね！（例：80000）";
                await this.userRepo.update(user.id, { fixedCosts: fix, onboardingStatus: "SAVINGS_GOAL" });
                return "なるほどね…。\n\nさいごに、**まいつきちょきんしたいがく**はある？\n（例：30000）";
            case "SAVINGS_GOAL":
                const sav = parseInt(text);
                if (isNaN(sav)) return "すうじでおしえてね！（例：30000）";
                await this.userRepo.update(user.id, { savingsGoal: sav, onboardingStatus: "COMPLETE" });
                const disp = user.monthlyBudget - user.fixedCosts - sav;
                return `せっていかんりょう！✨\n\nあなたの「じゆうにつかえるおかね」は…\n**つき ${disp}えん** だね。\n\nきょうからこめこが、これをまもるよ！\nかくごしてね！🔥\n\n（まずは「メニュー作って」とおくってみて！）`;
        }
        return null;
    }
}

const bot = new BotApp();
serve((req) => bot.handleRequest(req));
