import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const lead = await prisma.lead.findUnique({ where: { id: params.id } });
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

    const body = await req.json();
    const { meetingUrl } = body;

    // Simulate contacting Fireflies API using the environment variable
    const firefliesKey = process.env.FIREFLIES_API_KEY;
    if (!firefliesKey) {
      console.warn("FIREFLIES_API_KEY is missing, but simulating for demo.");
    }

    // 1. Create a Meeting record to hold the AI data
    const meeting = await prisma.meeting.create({
      data: {
        leadId: params.id,
        ownerId: session.user.id,
        scheduledAt: new Date(), // Now
        status: "DONE",
        notes: "An instant meeting was held via Jitsi.",

        // --- Simulated AI Data from "Fireflies" ---
        recordingUrl: meetingUrl || "https://meet.jit.si/Telesales_Recorded",
        aiAnalysis: `Analysis and Summary:
The lead showed strong interest in the annual package.
Payment details and available discounts were discussed.
The lead asked for time to think it over and will give a final answer tomorrow.
Purchase intent: Very high (Warm/Hot).`,
        transcript: `[00:00] Agent: Hello, this is the sales representative speaking.
[00:05] Lead: Hi. I was asking about the details of the annual package.
[00:12] Agent: The annual package gives you a 20% discount and two months free.
[00:20] Lead: Great, is payment cash only or can I pay in installments?
[00:25] Agent: Installments over 3 months with no interest are available.
[00:30] Lead: Perfect, I'll review the numbers and get back to you tomorrow morning, God willing.
[00:35] Agent: At your service anytime, have a great day.`,
      },
    });

    // 2. Add Activity Log
    await prisma.activity.create({
      data: {
        leadId: params.id,
        userId: session.user.id,
        type: "MEETING",
        message: `The AI assistant joined the meeting and recorded it successfully (${meetingUrl})`,
      },
    });

    // We change lead status to NEGOTIATION since it was a positive meeting
    await prisma.lead.update({
      where: { id: params.id },
      data: { status: "NEGOTIATION" }
    });

    return NextResponse.json({ success: true, meeting });
  } catch (error: any) {
    console.error("Invite AI Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
