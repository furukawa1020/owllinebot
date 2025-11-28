// supabase/functions/_shared/src/services/ActivityService.ts
import { GroupRepository } from "../repositories/GroupRepository.ts";
import { ActivityRepository } from "../repositories/ActivityRepository.ts";
import { CommandParser } from "./CommandParser.ts";
import { BiyoriPersona } from "./BiyoriPersona.ts";
import { GroupContext, LineEvent } from "../types/index.ts";

export class ActivityService {
    constructor(
        private groupRepo: GroupRepository,
        private activityRepo: ActivityRepository,
        private parser: CommandParser,
        private persona: BiyoriPersona
    ) { }

    async handleEvent(event: LineEvent): Promise<string | null> {
        if (event.type !== "message" || event.message?.type !== "text") return null;

        const source = event.source;
        const userId = source.userId;
        const lineGroupId = source.groupId ?? source.roomId ?? source.userId;

        if (!userId || !lineGroupId) return null;

        // 1. Get Context (Group & Member)
        const ctx = await this.getOrCreateContext(lineGroupId, userId);

        // 2. Parse Command
        const command = this.parser.parse(event.message.text);

        // 3. Execute Logic
        switch (command.kind) {
            case "help":
                return this.persona.getHelpText();

            case "now": {
                const logs = await this.activityRepo.getTodayLogs(ctx.groupDbId);
                const formattedLogs = logs.map(log => {
                    const t = new Date(log.created_at);
                    const hh = String(t.getHours()).padStart(2, "0");
                    const mm = String(t.getMinutes()).padStart(2, "0");
                    return { time: `${hh}:${mm}`, text: log.raw_text };
                });
                return this.persona.getNowResponse(formattedLogs);
            }

            case "summary": {
                const logs = await this.activityRepo.getTodayLogs(ctx.groupDbId);
                const formattedLogs = logs.map(log => {
                    const t = new Date(log.created_at);
                    const hh = String(t.getHours()).padStart(2, "0");
                    const mm = String(t.getMinutes()).padStart(2, "0");
                    return { time: `${hh}:${mm}`, text: log.raw_text };
                });
                return this.persona.getSummaryResponse(formattedLogs);
            }

            case "log": {
                const expiresAt = new Date();
                expiresAt.setHours(expiresAt.getHours() + 6);

                await this.activityRepo.createLog(
                    ctx.groupDbId,
                    ctx.memberDbId,
                    command.text,
                    expiresAt
                );
                return this.persona.getLogRecordedResponse(command.text);
            }

            default:
                return this.persona.getUnknownCommandResponse();
        }
    }

    private async getOrCreateContext(lineGroupId: string, lineUserId: string): Promise<GroupContext> {
        // Group
        let group = await this.groupRepo.getGroupByLineId(lineGroupId);
        if (!group) {
            group = await this.groupRepo.createGroup(lineGroupId, lineUserId);
        }

        // Member
        let member = await this.groupRepo.getMember(group.id, lineUserId);
        if (!member) {
            member = await this.groupRepo.createMember(group.id, lineUserId);
        }

        return {
            groupId: lineGroupId,
            groupDbId: group.id,
            memberDbId: member.id,
            displayName: member.display_name,
        };
    }
}
