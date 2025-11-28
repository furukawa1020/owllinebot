```typescript
// supabase/functions/_shared/src/services/ActivityService.ts
import { GroupRepository } from "../repositories/GroupRepository.ts";
import { ActivityRepository } from "../repositories/ActivityRepository.ts";
import { CommandParser } from "./CommandParser.ts";
import { BiyoriPersona } from "./BiyoriPersona.ts";
import { GamificationService } from "./GamificationService.ts";
import { ImageService } from "./ImageService.ts";
import { FlexMessageBuilder } from "../ui/FlexMessageBuilder.ts";
import { GroupContext, LineEvent } from "../types/index.ts";

export class ActivityService {
  constructor(
    private groupRepo: GroupRepository,
    private activityRepo: ActivityRepository,
    private parser: CommandParser,
    private persona: BiyoriPersona,
    private gamification: GamificationService,
    private imageService: ImageService
  ) {}

  async handleEvent(event: LineEvent): Promise<any[] | null> {
    if (event.type !== "message") return null;
    
    const source = event.source;
    const userId = source.userId;
    const lineGroupId = source.groupId ?? source.roomId ?? source.userId;

    if (!userId || !lineGroupId) return null;

    // 1. Get Context
    const ctx = await this.getOrCreateContext(lineGroupId, userId);

    // 2. Handle Image Message
    if (event.message?.type === "image") {
       const imageUrl = await this.imageService.uploadAndGetUrl(event.message.id, userId);
       if (imageUrl) {
         // Log as "Photo Log"
         await this.activityRepo.createLog(
            ctx.groupDbId,
            ctx.memberDbId,
            "📷 しゃしん",
            new Date(Date.now() + 6 * 60 * 60 * 1000) // 6h expiry
         );
         // TODO: Store imageUrl in meta column (need to update repo for that)
         return [{ type: "text", text: "しゃしん メモしたよ！📸" }];
       }
       return [{ type: "text", text: "ごめんね、しゃしん うまくとれなかった…💦" }];
    }

    // 3. Handle Text Message
    if (event.message?.type === "text") {
        const command = this.parser.parse(event.message.text);

        switch (command.kind) {
            case "help":
                return [{ type: "text", text: this.persona.getHelpText() }];
            
            case "now": {
                const logs = await this.activityRepo.getTodayLogs(ctx.groupDbId);
                const formattedLogs = logs.map(log => {
                    const t = new Date(log.created_at);
                    const hh = String(t.getHours()).padStart(2, "0");
                    const mm = String(t.getMinutes()).padStart(2, "0");
                    return { time: `${ hh }:${ mm } `, text: log.raw_text };
                });
                // Use Flex Message for "Now" if logs exist
                if (formattedLogs.length > 0) {
                     // Reuse summary builder for now, or create a specific one
                     return [FlexMessageBuilder.createDailySummary(formattedLogs)];
                }
                return [{ type: "text", text: this.persona.getNowResponse(formattedLogs) }];
            }

            case "summary": {
                const logs = await this.activityRepo.getTodayLogs(ctx.groupDbId);
                const formattedLogs = logs.map(log => {
                    const t = new Date(log.created_at);
                    const hh = String(t.getHours()).padStart(2, "0");
                    const mm = String(t.getMinutes()).padStart(2, "0");
                    return { time: `${ hh }:${ mm } `, text: log.raw_text };
                });
                if (formattedLogs.length > 0) {
                    return [FlexMessageBuilder.createDailySummary(formattedLogs)];
                }
                return [{ type: "text", text: this.persona.getSummaryResponse(formattedLogs) }];
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

                // Check Gamification
                const { current, isNewRecord } = await this.gamification.updateStreak(ctx.memberDbId!);
                const logs = await this.activityRepo.getTodayLogs(ctx.groupDbId);
                const newBadges = await this.gamification.checkAndAwardBadges(ctx.memberDbId!, {
                    logCount: logs.length,
                    currentStreak: current
                });

                const replies: any[] = [
                    { type: "text", text: this.persona.getLogRecordedResponse(command.text) }
                ];

                // Add Badge Notifications
                for (const badge of newBadges) {
                    replies.push(FlexMessageBuilder.createBadgeNotification(badge));
                }

                // Add Streak Notification (if new record and > 1)
                if (isNewRecord && current > 1) {
                    replies.push({ type: "text", text: `すごい！ ${ current }にち れんぞくだよ！🔥` });
                }

                return replies;
            }
            
            default:
                return [{ type: "text", text: this.persona.getUnknownCommandResponse() }];
        }
    }

    return null;
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
```
