// supabase/functions/line-webhook/src/persona/Komeko.ts

import { FinancialStatus } from "../types/index.ts";

export class KomekoPersona {
    greet() {
        return "やっほ〜！🍚 ごはん戦略家のこめこだよ！\n「はじめる」って送って、あなたの財政状況を教えてね。";
    }

    getFinancialReport(status: FinancialStatus): string {
        const { healthRank, projectedEndBalance, bankruptcyDate, survivalDays } = status;

        let comment = "";
        switch (healthRank) {
            case "S": comment = "素晴らしい！✨ この調子なら貯金目標も余裕でクリアだね！"; break;
            case "A": comment = "順調だね！👍 油断せずにいこう。"; break;
            case "B": comment = "まあまあかな。でも、気を抜くと危ないよ？"; break;
            case "C": comment = "雲行きが怪しいよ…☁️ ちょっと引き締めないと。"; break;
            case "D": comment = "警告レベルです。🚨 このままだと赤字確定だよ。"; break;
            case "F": comment = "【緊急事態】破産寸前です。😱 直ちに生活レベルを下げてください。"; break;
        }

        const prediction = bankruptcyDate
            ? `\n💀 **予言**: このままだと **${bankruptcyDate.getDate()}日** に資金が尽きます。`
            : `\n💰 **予測**: 月末には **${Math.floor(projectedEndBalance)}円** 残る見込み。`;

        return `【📊 財務レポート】\nランク: **${healthRank}**\n生存可能日数: あと${survivalDays}日\n\n${comment}${prediction}`;
    }

    getMenuRefusal(menu: string) {
        return `却下。🙅‍♀️\n今の財政状況で「${menu}」なんて食べてる場合じゃないよ。\n大人しく「もやし」にしなさい。`;
    }

    getLogAck(label: string, price: number | null, healthRank: string) {
        if (healthRank === "F" || healthRank === "D") {
            return `「${label}」…？\nはぁ…また無駄遣いして…。😤\nちゃんと記録はしたけど、反省してね。`;
        }
        return `「${label}」だね！${price ? price + "円！" : ""}\nメモしたよ！✍️`;
    }
}
