// supabase/functions/line-webhook/index.ts

import "jsr:@supabase/functions-js/edge-runtime";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// Shared Modules
import { getSupabaseClient } from "../_shared/src/utils/supabaseClient.ts";
import { LineEvent } from "../_shared/src/types/index.ts";

// Repositories
import { GroupRepository } from "../_shared/src/repositories/GroupRepository.ts";
import { ActivityRepository } from "../_shared/src/repositories/ActivityRepository.ts";
const isSignatureValid = await lineService.verifySignature(req);
if (!isSignatureValid) {
    return new Response("Invalid signature", { status: 401 });
}

// 2. Parse Body
const body = await req.json();
const events: LineEvent[] = body.events ?? [];

// 3. Event Loop
for (const event of events) {
    try {
        // We only handle message events for now
        if (event.type !== "message" || !event.replyToken) continue;

        // Delegate business logic to ActivityService
        const replyText = await activityService.handleEvent(event);

        // Send Reply
        if (replyText) {
            await lineService.replyMessage(event.replyToken, [
                { type: "text", text: replyText },
            ]);
        }
    } catch (err) {
        console.error("Error processing event:", err);
        // In a real enterprise app, we might want to log this to a dedicated error monitoring service (Sentry etc.)
        // For now, we just log to Supabase Edge Function logs.
    }
}

return new Response("OK", { status: 200 });

    } catch (err) {
    console.error("Fatal error:", err);
    return new Response("Internal Server Error", { status: 500 });
}
});
