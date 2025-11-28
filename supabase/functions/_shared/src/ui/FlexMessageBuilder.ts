// supabase/functions/_shared/src/ui/FlexMessageBuilder.ts

export class FlexMessageBuilder {
    static createDailySummary(logs: { time: string; text: string }[]): any {
        const logContents = logs.map((log) => ({
            type: "box",
            layout: "horizontal",
            contents: [
                {
                    type: "text",
                    text: log.time,
                    size: "sm",
                    color: "#888888",
                    flex: 2,
                },
                {
                    type: "text",
                    text: log.text,
                    size: "sm",
                    color: "#111111",
                    flex: 5,
                    wrap: true,
                },
            ],
            margin: "md",
        }));

        return {
            type: "flex",
            altText: "きょうのまとめだよ！",
            contents: {
                type: "bubble",
                header: {
                    type: "box",
                    layout: "vertical",
                    contents: [
                        {
                            type: "text",
                            text: "📝 きょうのきろく",
                            weight: "bold",
                            color: "#1DB446",
                            size: "lg",
                        },
                    ],
                },
                body: {
                    type: "box",
                    layout: "vertical",
                    contents: [
                        {
                            type: "text",
                            text: `ぜんぶで ${logs.length}こ！`,
                            weight: "bold",
                            size: "xl",
                            margin: "md",
                        },
                        {
                            type: "separator",
                            margin: "lg",
                        },
                        ...logContents,
                    ],
                },
                footer: {
                    type: "box",
                    layout: "vertical",
                    contents: [
                        {
                            type: "text",
                            text: "みんな すごいねー！💮",
                            color: "#aaaaaa",
                            size: "xs",
                            align: "center",
                        },
                    ],
                },
            },
        };
    }

    static createBadgeNotification(badgeName: string): any {
        return {
            type: "flex",
            altText: "バッジをもらったよ！",
            contents: {
                type: "bubble",
                body: {
                    type: "box",
                    layout: "vertical",
                    contents: [
                        {
                            type: "text",
                            text: "🎉 おめでとう！",
                            weight: "bold",
                            size: "xl",
                            color: "#ff9900",
                            align: "center",
                        },
                        {
                            type: "text",
                            text: `『${badgeName}』`,
                            weight: "bold",
                            size: "lg",
                            align: "center",
                            margin: "md",
                        },
                        {
                            type: "text",
                            text: "バッジをゲットしたよ！✨",
                            size: "md",
                            align: "center",
                            margin: "sm",
                        },
                    ],
                },
            },
        };
    }
}
