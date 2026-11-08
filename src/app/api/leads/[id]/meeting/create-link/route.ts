import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can, isManagementRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { createCalendarMeeting } from "@/lib/googleCalendar";
import { inviteFirefliesBot, buildMeetingTitle } from "@/lib/fireflies";
import { z } from "zod";

const bodySchema = z.object({
  // Optional: attach to an existing SCHEDULED Meeting row (created earlier
  // by Tele-Sales via POST /api/leads/[id]/meeting). If omitted, a new
  // Meeting row is created on the spot, scheduled for right now.
  meetingId: z.string().optional(),
});

// POST — Sales clicks "Create Meeting": creates a real Google Meet link via
// Calendar API, invites the Fireflies recording bot to it, and saves the
// link on the Meeting record. This replaces the old fake "invite-ai"
// endpoint, which wrote fabricated transcripts with no real meeting at all.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || !can(session.user.role, "HOLD_MEETING")) {
    return NextResponse.json({ error: "You are not authorized to perform this action" }, { status: 403 });
  }

  const lead = await prisma.lead.findUnique({ where: { id: params.id } });
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  if (!isManagementRole(session.user.role) && lead.assignedToId !== session.user.id) {
    return NextResponse.json({ error: "This lead is not assigned to you" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  // 1) Find or create the Meeting row we'll attach everything to.
  let meeting = parsed.data.meetingId
    ? await prisma.meeting.findUnique({ where: { id: parsed.data.meetingId } })
    : null;

  if (parsed.data.meetingId && (!meeting || meeting.leadId !== params.id)) {
    return NextResponse.json({ error: "Meeting not found for this lead" }, { status: 404 });
  }

  if (!meeting) {
    meeting = await prisma.meeting.create({
      data: {
        leadId: params.id,
        ownerId: lead.assignedToId ?? session.user.id,
        scheduledAt: new Date(),
        status: "SCHEDULED",
      },
    });
  }

  // 2) Create the real Google Meet link.
  const calendarResult = await createCalendarMeeting({
    title: buildMeetingTitle(meeting.id, lead.name),
    attendeeEmail: lead.email,
    salesRepEmail: session.user.email,
  });

  if (!calendarResult.success || !calendarResult.meeting) {
    return NextResponse.json(
      { error: calendarResult.error || "Failed to create the Google Meet link" },
      { status: 502 }
    );
  }

  const { meetingLink, calendarEventId } = calendarResult.meeting;

  await prisma.meeting.update({
    where: { id: meeting.id },
    data: { meetingLink, calendarEventId },
  });

  // 3) Invite the Fireflies bot to join and record. The title embeds our
  // own Meeting id (see buildMeetingTitle), which is how the webhook later
  // recognizes which Lead/Meeting this recording belongs to — Fireflies'
  // own meeting id only becomes known once the webhook fires, never here.
  const firefliesResult = await inviteFirefliesBot(meetingLink, buildMeetingTitle(meeting.id, lead.name));

  if (!firefliesResult.success) {
    // The Meet link itself still works fine for the call — recording just
    // won't happen. Tell the Sales employee plainly instead of silently
    // losing the recording (common cause: Fireflies' 3-requests/20-min
    // rate limit).
    await prisma.activity.create({
      data: {
        leadId: params.id,
        userId: session.user.id,
        type: "MEETING_LINK_CREATED",
        message: `A Google Meet link was created, but the Fireflies recording bot could not be invited: ${
          firefliesResult.error ?? "unknown error"
        }`,
      },
    });

    return NextResponse.json({
      success: true,
      meetingLink,
      meeting: { ...meeting, meetingLink, calendarEventId },
      recordingWarning: firefliesResult.error || "The recording bot could not be invited",
    });
  }

  await prisma.activity.create({
    data: {
      leadId: params.id,
      userId: session.user.id,
      type: "MEETING_LINK_CREATED",
      message: "A Google Meet link was created and the recording bot was invited.",
    },
  });

  return NextResponse.json({
    success: true,
    meetingLink,
    meeting: { ...meeting, meetingLink, calendarEventId },
  });
}
