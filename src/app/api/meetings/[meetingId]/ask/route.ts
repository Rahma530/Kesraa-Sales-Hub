import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { isManagementRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { askAboutMeeting } from "@/lib/gemini";

const askSchema = z.object({
  question: z.string().min(1),
  history: z
    .array(z.object({ question: z.string(), answer: z.string() }))
    .optional(),
});

// POST /api/meetings/[meetingId]/ask — ask a free-form question about one
// specific meeting ("what did the client say about X?"), answered by Gemini
// grounded in that meeting's saved transcript. Same access rule as the rest
// of a lead's data: the lead's current owner, or a management role.
export async function POST(req: NextRequest, { params }: { params: { meetingId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "You are not authorized to perform this action" }, { status: 403 });
  }

  const meeting = await prisma.meeting.findUnique({
    where: { id: params.meetingId },
    include: { lead: { select: { assignedToId: true } } },
  });
  if (!meeting) return NextResponse.json({ error: "Meeting not found" }, { status: 404 });

  if (!isManagementRole(session.user.role) && meeting.lead.assignedToId !== session.user.id) {
    return NextResponse.json({ error: "This meeting is not accessible to you" }, { status: 403 });
  }

  if (!meeting.transcript) {
    return NextResponse.json(
      { error: "No transcript is saved for this meeting yet" },
      { status: 409 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = askSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const result = await askAboutMeeting({
    question: parsed.data.question,
    transcriptText: meeting.correctedTranscript ?? meeting.transcript,
    priorQA: parsed.data.history,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error || "Gemini couldn't answer that" }, { status: 502 });
  }

  return NextResponse.json({ success: true, answer: result.answer });
}
