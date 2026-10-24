import { NextRequest, NextResponse } from "next/server";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// POST /api/whatsapp/send?slotId=slot1
//
// FIX: every other WhatsApp route (status, chats, events, logout) looks up
// the connected session under `${userId}_${slotId}` — this route used to
// look it up under the bare userId, which was never the key anything was
// actually stored under (WhatsApp lines are always initialized with a
// slotId). So this endpoint always reported "WhatsApp is not connected"
// even when the line was connected — it just couldn't find it under the
// right name. Now it builds the key the same way as the rest of the app.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  try {
    const { phone, message } = await req.json();
    if (!phone || !message) {
      return NextResponse.json({ error: "Phone and message are required" }, { status: 400 });
    }

    const slotId = req.nextUrl.searchParams.get("slotId") || "slot1";
    const sessionKey = `${session.user.id}_${slotId}`;

    await sendWhatsAppMessage(sessionKey, phone, message);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to send message" }, { status: 500 });
  }
}
