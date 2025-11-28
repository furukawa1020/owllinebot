// supabase/functions/_shared/src/services/ImageService.ts
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { LineService } from "./LineService.ts";

export class ImageService {
    constructor(
        private supabase: SupabaseClient,
        private lineService: LineService
    ) { }

    async uploadAndGetUrl(messageId: string, userId: string): Promise<string | null> {
        try {
            // 1. Get Content from LINE
            const content = await this.lineService.getMessageContent(messageId);

            // 2. Upload to Supabase Storage
            const fileName = `${userId}/${new Date().getTime()}.jpg`; // Simple path strategy
            const { data, error } = await this.supabase.storage
                .from("photos")
                .upload(fileName, content, {
                    contentType: "image/jpeg",
                    upsert: false
                });

            if (error) {
                console.error("Storage upload error:", error);
                return null;
            }

            // 3. Get Public URL
            const { data: publicUrlData } = this.supabase.storage
                .from("photos")
                .getPublicUrl(fileName);

            return publicUrlData.publicUrl;
        } catch (e) {
            console.error("Image processing error:", e);
            return null;
        }
    }
}
