import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

// This webhook receives data from an AI Notetaker (e.g. Fireflies.ai, Fathom)
// once a meeting ends, and attaches the recording/transcript/summary to the
// matching Lead's latest Meeting.
//
// SECURITY: this endpoint is public (the AI tool has no login of its own),
// so it's protected by a shared secret instead — set AI_WEBHOOK_SECRET in
// .env and configure the exact same value in the AI tool's webhook settings
// (as a custom header, e.g. "x-webhook-secret: <value>", or as a
// "?secret=<value>" query parameter if the tool only supports that).
// Without a matching secret, any request is rejected before touching the
// database — this stops anyone who merely discovers the URL from writing
// fake meeting data onto a real customer's record.
function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.AI_WEBHOOK_SECRET;

  // Fail closed: if the secret isn't configured, refuse every request
  // rather than silently accepting unauthenticated ones.
  if (!expected) return false;

  const provided =
    req.headers.get("x-webhook-secret") ?? req.nextUrl.searchParams.get("secret") ?? "";

  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);

  // Constant-time comparison so response timing can't leak the secret.
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await req.json();

    // Example payload structure from AI tools:
    // {
    //   "meeting_id": "12345",
    //   "attendees": ["customer@example.com", "sales@ourcompany.com"],
    //   "recording_url": "https://...",
    //   "transcript": "Customer: Hello\nSales: Hi...",
    //   "summary": "The customer is interested in the premium plan.",
    //   "lead_id": "cmus64kh60000w961psgnxyo9" // Ideally passed in custom data
    // }

    const leadId = payload.lead_id;

    if (!leadId || typeof leadId !== "string") {
      return NextResponse.json({ error: "Missing lead_id in payload" }, { status: 400 });
    }

    // Find the latest meeting for this lead
    const latestMeeting = await prisma.meeting.findFirst({
      where: { leadId },
      orderBy: { createdAt: "desc" },
    });

    if (!latestMeeting) {
      return NextResponse.json({ error: "No meeting found for this lead" }, { status: 404 });
    }

    // Update the meeting with AI data
    await prisma.meeting.update({
      where: { id: latestMeeting.id },
      data: {
        recordingUrl: typeof payload.recording_url === "string" ? payload.recording_url : undefined,
        transcript: typeof payload.transcript === "string" ? payload.transcript : undefined,
        aiAnalysis: typeof payload.summary === "string" ? payload.summary : undefined,
        status: "DONE", // Automatically mark as done when AI sends the report
      },
    });

    // Add a system activity for the manager to see
    await prisma.activity.create({
      data: {
        leadId,
        userId: latestMeeting.ownerId,
        type: "AI_MEETING_ANALYSIS",
        message: "تم حفظ تسجيل وتحليل الميتنج بواسطة الذكاء الاصطناعي",
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Webhook error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
