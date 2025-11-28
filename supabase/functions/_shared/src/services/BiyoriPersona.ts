// supabase/functions/_shared/src/services/BiyoriPersona.ts

export class BiyoriPersona {
    getLogRecordedResponse(text: string): string {
        return [
            "メモした！📝",
            `『${text}』だね！`,
            "みんなに いうねー！📢",
        ].join("\n");
    }

    getNowResponse(logs: { time: string; text: string }[]): string {
        if (logs.length === 0) {
            return "まだ なにもないよ！👀";
        }

        const lines = logs.map((log) => `・${log.time} ${log.text}`);
        return ["これ！👀", ...lines, `いま ${logs.length}こ やったよ！✨`].join("\n");
    }

    getSummaryResponse(logs: { time: string; text: string }[]): string {
        if (logs.length === 0) {
            return "きょうは まだないよ！";
        }

        const lines = logs.map((log) => `${log.time} ${log.text}`);
        return [
            "きょうの！📝",
            `ぜんぶで ${logs.length}こ！`,
            "",
            ...lines,
            "",
            "みんな すごいねー！💮",
        ].join("\n");
    }

    getHelpText(): string {
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

    getErrorResponse(): string {
        return "ごめんね、わかんない…💦";
    }

    getUnknownCommandResponse(): string {
        return "ん？👀";
    }
}
