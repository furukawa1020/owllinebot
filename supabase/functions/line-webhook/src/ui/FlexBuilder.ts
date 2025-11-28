// supabase/functions/line-webhook/src/ui/FlexBuilder.ts

import { FinancialStatus, MenuSuggestion } from "../types/index.ts";

export class FlexBuilder {
    static createBudgetReport(status: FinancialStatus): any {
        const { healthRank, remainingBudget, projectedEndBalance, survivalDays } = status;

        // Color coding
        const colors: Record<string, string> = {
            "S": "#1DB446", "A": "#9ACD32", "B": "#FFD700",
            "C": "#FFA500", "D": "#FF4500", "F": "#FF0000"
        };
        const color = colors[healthRank] || "#888888";

        return {
            type: "flex", altText: "財務レポート",
            contents: {
                type: "bubble",
                header: {
                    type: "box", layout: "vertical", backgroundColor: color,
                    contents: [
                        { type: "text", text: "📊 財務健全度", color: "#ffffff", weight: "bold", size: "sm" },
                        { type: "text", text: `RANK ${healthRank}`, color: "#ffffff", weight: "bold", size: "3xl", align: "center", margin: "md" }
                    ]
                },
                body: {
                    type: "box", layout: "vertical",
                    contents: [
                        {
                            type: "box", layout: "horizontal",
                            contents: [
                                { type: "text", text: "残り予算", size: "sm", color: "#888888" },
                                { type: "text", text: `¥${remainingBudget.toLocaleString()}`, size: "lg", weight: "bold", align: "end" }
                            ]
                        },
                        {
                            type: "box", layout: "horizontal", margin: "md",
                            contents: [
                                { type: "text", text: "月末予測", size: "sm", color: "#888888" },
                                { type: "text", text: `¥${projectedEndBalance.toLocaleString()}`, size: "md", weight: "bold", align: "end", color: projectedEndBalance < 0 ? "#FF0000" : "#111111" }
                            ]
                        },
                        { type: "separator", margin: "lg" },
                        {
                            type: "text", text: `生存可能日数: あと ${survivalDays}日`,
                            margin: "lg", align: "center", weight: "bold", color: survivalDays < 5 ? "#FF0000" : "#111111"
                        }
                    ]
                }
            }
        };
    }

    static createMenuSuggestions(suggestions: MenuSuggestion[]): any {
        const bubbles = suggestions.map(s => ({
            type: "bubble",
            body: {
                type: "box", layout: "vertical",
                contents: [
                    { type: "text", text: s.label, weight: "bold", size: "xl", color: s.isStrict ? "#FF0000" : "#111111" },
                    { type: "text", text: s.reason, size: "sm", color: "#666666", margin: "sm", wrap: true }
                ]
            },
            footer: {
                type: "box", layout: "vertical",
                contents: [
                    {
                        type: "button", action: { type: "message", label: "これにする", text: s.label },
                        style: s.isStrict ? "secondary" : "primary"
                    }
                ]
            }
        }));

        return {
            type: "flex", altText: "献立提案",
            contents: { type: "carousel", contents: bubbles }
        };
    }
}
