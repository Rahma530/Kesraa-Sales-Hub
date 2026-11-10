import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  verifyFirefliesSignature,
  getFirefliesTranscript,
  extractOurMeetingId,
  joinTranscriptText,
  deleteFirefliesTranscript,
} from "@/lib/fireflies";
import { translateAndRecommend, correctTranscript } from "@/lib/gemini";

// This webhook receives real events from Fireflies.ai (Webhooks V2) once a
// meeting we created via /api/leads/[id]/meeting/create-link has been
// recorded and summarized, and attaches the real transcript/summary/AI
// translation+recommendations to the matching Lead's Meeting.
//
// Confirmed empirically against a live test delivery (webhook.site,
// 2026-11-04) and against Fireflies' own docs for Webhooks V2:
//   { "event": "meeting.summarized", "timestamp": <ms>, "meeting_id": "<id>" }
// signed with header "x-hub-signature: sha256=<hex HMAC-SHA256 of raw body>"
//
// SECURITY: verifyFirefliesSignature() checks that signature against
// FIREFLIES_WEBHOOK_SECRET (the same "Signing Secret" configured on
// Fireflies' Webhooks page) using a constant-time comparison — this is what
// stops anyone who merely discovers this URL from writing fake meeting data
// onto a real customer's record.
export async function POST(req: NextRequest) {
  // IMPORTANT: read the raw text body (not req.json()) — the HMAC signature
  // is computed over the exact raw bytes Fireflies sent. Parsing to JSON
  // and re-stringifying would not reliably reproduce the same bytes.
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature");

  if (!verifyFirefliesSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: { event?: string; meeting_id?: string };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Fireflies sends a "test" event when the webhook URL is first saved in
  // its dashboard — acknowledge it so the test shows green, but there's
  // nothing to do with it.
  if (payload.event === "test") {
    return NextResponse.json({ success: true, note: "Test event acknowledged" });
  }

  // We only care once the AI summary is ready — that's what gives us the
  // meeting `title` we need to match this recording back to our own
  // Meeting row (see extractOurMeetingId). "meeting.transcribed" fires
  // earlier with the raw transcript only; we don't act on it to avoid
  // doing this work twice.
  if (payload.event !== "meeting.summarized") {
    return NextResponse.json({ success: true, note: `Ignored event: ${payload.event}` });
  }

  const firefliesMeetingId = payload.meeting_id;
  if (!firefliesMeetingId) {
    return NextResponse.json({ error: "Missing meeting_id in payload" }, { status: 400 });
  }

  try {
    // 1) Fetch the real transcript + summary from Fireflies' API.
    const transcript = await getFirefliesTranscript(firefliesMeetingId);
    if (!transcript) {
      console.error(`Webhook: could not fetch Fireflies transcript ${firefliesMeetingId}`);
      return NextResponse.json({ error: "Could not fetch transcript from Fireflies" }, { status: 502 });
    }

    // 2) Recover which of OUR Meeting rows this belongs to, from the title
    // we set ourselves when inviting the bot (buildMeetingTitle).
    const ourMeetingId = extractOurMeetingId(transcript.title);
    if (!ourMeetingId) {
      console.error(
        `Webhook: Fireflies meeting ${firefliesMeetingId} has no recognizable LeadRef in its title: "${transcript.title}"`
      );
      return NextResponse.json(
        { error: "Could not match this recording to a lead (no LeadRef in title)" },
        { status: 404 }
      );
    }

    const meeting = await prisma.meeting.findUnique({
      where: { id: ourMeetingId },
      include: { lead: true },
    });
    if (!meeting) {
      console.error(`Webhook: no Meeting row found for id ${ourMeetingId} (from Fireflies title)`);
      return NextResponse.json({ error: "Matched meeting id does not exist" }, { status: 404 });
    }

    // 3) Translate the summary to Arabic and generate follow-up
    // recommendations via Gemini. If this fails, we still save the real
    // transcript/summary — translation is a bonus, not a blocker.
    const transcriptText = joinTranscriptText(transcript.sentences);
    const aiResult = await translateAndRecommend({
      leadName: meeting.lead.name,
      summaryOverview: transcript.summary?.overview ?? "",
      summaryBulletGist: transcript.summary?.bullet_gist ?? "",
      actionItems: transcript.summary?.action_items ?? "",
      transcriptText,
    });

    // 3b) Also produce a corrected copy of the FULL transcript (not a
    // summary) — same wording-correction rule, applied to the whole thing —
    // so the "full transcript" view shows a corrected, readable copy
    // instead of the raw speech-to-text output. Best-effort, same as above.
    const correctionResult = transcriptText
      ? await correctTranscript({ transcriptText })
      : { success: false as const, correctedText: undefined };

    // 4) Save everything to the matched Meeting record.
    await prisma.meeting.update({
      where: { id: meeting.id },
      data: {
        firefliesMeetingId,
        recordingUrl: transcript.transcript_url ?? undefined,
        transcript: transcriptText || undefined,
        correctedTranscript: correctionResult.success ? correctionResult.correctedText : undefined,
        aiAnalysis: transcript.summary?.overview ?? undefined,
        aiTranslation: aiResult.success ? aiResult.result?.translationArabic : undefined,
        aiRecommendations: aiResult.success ? aiResult.result?.recommendations : undefined,
        status: "DONE",
      },
    });

    await prisma.activity.create({
      data: {
        leadId: meeting.leadId,
        userId: meeting.ownerId,
        type: "AI_MEETING_ANALYSIS",
        message: aiResult.success
          ? "The meeting recording, transcript, and AI translation/recommendations have been saved."
          : `The meeting recording and transcript have been saved (AI translation failed: ${aiResult.error ?? "unknown error"}).`,
      },
    });

    // 5) We've safely copied everything we need (transcript text, summary,
    // translation, recommendations) into our own database above, so free
    // up the Fireflies free-plan storage quota immediately instead of
    // letting every recording sit there. Best-effort: if this fails, the
    // data we actually care about is already saved either way.
    const deleteResult = await deleteFirefliesTranscript(firefliesMeetingId);
    if (!deleteResult.success) {
      console.error(
        `Webhook: saved meeting ${meeting.id} successfully, but could not delete it from Fireflies (${deleteResult.error}) — it'll still count against Fireflies storage until removed manually.`
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
