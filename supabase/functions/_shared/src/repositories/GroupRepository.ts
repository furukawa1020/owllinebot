// supabase/functions/_shared/src/repositories/GroupRepository.ts
import { BaseRepository } from "./BaseRepository.ts";
import { GroupRow, MemberRow } from "../types/index.ts";

export class GroupRepository extends BaseRepository {
    async getGroupByLineId(lineGroupId: string): Promise<GroupRow | null> {
        const { data, error } = await this.supabase
            .from("groups")
            .select("*")
            .eq("line_group_id", lineGroupId)
            .maybeSingle();

        if (error) throw error;
        return data as GroupRow | null;
    }

    async createGroup(lineGroupId: string, createdBy: string): Promise<GroupRow> {
        const { data, error } = await this.supabase
            .from("groups")
            .insert({
                line_group_id: lineGroupId,
                name: "未設定グループ",
                created_by: createdBy // Note: Schema might need update to support this if not present
            })
            .select()
            .single();

        if (error) throw error;
        return data as GroupRow;
    }

    async getMember(groupId: string, lineUserId: string): Promise<MemberRow | null> {
        const { data, error } = await this.supabase
            .from("members")
            .select("*")
            .eq("group_id", groupId)
            .eq("line_user_id", lineUserId)
            .maybeSingle();

        if (error) throw error;
        return data as MemberRow | null;
    }

    async createMember(groupId: string, lineUserId: string): Promise<MemberRow> {
        const { data, error } = await this.supabase
            .from("members")
            .insert({
                group_id: groupId,
                line_user_id: lineUserId,
            })
            .select()
            .single();

        if (error) throw error;
        return data as MemberRow;
    }
}
