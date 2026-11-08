// Thin wrapper around Fireflies.ai's GraphQL API — no SDK, just plain fetch
// calls, same pattern as src/lib/email.ts.
//
// Requires two environment variables in production:
//   FIREFLIES_API_KEY       — from Fireflies → Settings → Developer Settings
//   FIREFLIES_WEBHOOK_SECRET — the "Signing Secret" you set on the same
//                              value in Fireflies' Webhooks configuration
//                              page (Integrations → Webhooks). Must match
//                              exactly, or verifyFirefliesSignature() will
//                              reject every real event.
//
// Reference: https://docs.fireflies.ai/graphql-api

import crypto from "crypto";

const FIREFLIES_API_URL = "https://api.fireflies.ai/graphql";

// --- Webhook signature verification --------------------------------------
//
// Fireflies signs each webhook delivery with an `x-hub-signature` header:
// "sha256=" followed by a lowercase-hex HMAC-SHA256 of the *raw* request
// body, keyed with the Signing Secret. Verified against a live test
// delivery on 2026-11-04 (webhook.site), so this is confirmed, not guessed.
export function verifyFirefliesSignature(rawBody: string, signatureHeader: string | null | undefined): boolean {
  const secret = process.env.FIREFLIES_WEBHOOK_SECRET;
  if (!secret || !signatureHeader) return false;

  const expectedHex = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const expected = `sha256=${expectedHex}`;

  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(signatureHeader);
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

// --- Inviting the bot to a real, already-created meeting link ------------
//
// This is what lets OUR code decide which meetings Fireflies joins and what
// title it uses — instead of relying on Fireflies' own Google Calendar
// sync (which we don't use at all). The title is how we later recognize
// which Lead/Meeting this recording belongs to, so always embed a
// recognizable marker in it (see buildMeetingTitle below).
//
// NOTE: addToLiveMeeting only returns { success }, never Fireflies' own
// meeting id — that id only ever arrives later, via the webhook. This is a
// Fireflies API limitation, not something we can work around here.
//
// NOTE: Fireflies rate-limits this to 3 requests per 20 minutes per
// account (not per user) on non-Business/Enterprise plans. If several
// Sales employees create meetings in a short window, later ones may be
// rejected — surface that to the person so they know to retry shortly.
export async function inviteFirefliesBot(
  meetingLink: string,
  title: string
): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.FIREFLIES_API_KEY;
  if (!apiKey) {
    console.error("inviteFirefliesBot: FIREFLIES_API_KEY is not configured");
    return { success: false, error: "Fireflies isn't configured on the server" };
  }

  try {
    const res = await fetch(FIREFLIES_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query: `
          mutation AddToLiveMeeting($meetingLink: String!, $title: String) {
            addToLiveMeeting(meeting_link: $meetingLink, title: $title) {
              success
            }
          }
        `,
        variables: { meetingLink, title },
      }),
    });

    const json = await res.json().catch(() => null);

    if (!res.ok || json?.errors?.length) {
      const message = json?.errors?.[0]?.message || `HTTP ${res.status}`;
      console.error("inviteFirefliesBot: Fireflies returned an error", message);
      return { success: false, error: message };
    }

    if (!json?.data?.addToLiveMeeting?.success) {
      return { success: false, error: "Fireflies did not confirm the bot joined" };
    }

    return { success: true };
  } catch (e) {
    console.error("inviteFirefliesBot: request to Fireflies failed", e);
    return { success: false, error: "Failed to reach Fireflies" };
  }
}

// --- Fetching the finished transcript/summary once a meeting is done -----

export interface FirefliesSummary {
  overview: string | null;
  bullet_gist: string | null;
  action_items: string | null;
  keywords: string[] | null;
}

export interface FirefliesSentence {
  speaker_name: string | null;
  text: string | null;
  raw_text: string | null;
}

export interface FirefliesTranscript {
  id: string;
  title: string | null;
  transcript_url: string | null;
  meeting_link: string | null;
  summary: FirefliesSummary | null;
  sentences: FirefliesSentence[] | null;
}

export async function getFirefliesTranscript(meetingId: string): Promise<FirefliesTranscript | null> {
  const apiKey = process.env.FIREFLIES_API_KEY;
  if (!apiKey) {
    console.error("getFirefliesTranscript: FIREFLIES_API_KEY is not configured");
    return null;
  }

  try {
    const res = await fetch(FIREFLIES_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query: `
          query Transcript($transcriptId: String!) {
            transcript(id: $transcriptId) {
              id
              title
              transcript_url
              meeting_link
              summary {
                overview
                bullet_gist
                action_items
                keywords
              }
              sentences {
                speaker_name
                text
                raw_text
              }
            }
          }
        `,
        variables: { transcriptId: meetingId },
      }),
    });

    const json = await res.json().catch(() => null);

    if (!res.ok || json?.errors?.length) {
      const message = json?.errors?.[0]?.message || `HTTP ${res.status}`;
      console.error("getFirefliesTranscript: Fireflies returned an error", message);
      return null;
    }

    return json?.data?.transcript ?? null;
  } catch (e) {
    console.error("getFirefliesTranscript: request to Fireflies failed", e);
    return null;
  }
}

// --- Freeing up Fireflies storage once we've saved our own copy ----------
//
// We only use Fireflies' free plan as a transient processing step — the
// real transcript text, summary, and AI translation/recommendations all
// get saved into OUR OWN database (see the webhook handler). There's no
// reason to also leave the recording sitting in Fireflies' 400-min/team
// free storage cap, which real day-to-day usage would blow through fast.
// So the webhook deletes each transcript from Fireflies right after it has
// safely copied everything it needs out of it.
//
// Rate-limited by Fireflies to 10 requests/minute — fine for our volume.
export async function deleteFirefliesTranscript(meetingId: string): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.FIREFLIES_API_KEY;
  if (!apiKey) {
    return { success: false, error: "Fireflies isn't configured on the server" };
  }

  try {
    const res = await fetch(FIREFLIES_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query: `
          mutation DeleteTranscript($id: String!) {
            deleteTranscript(id: $id) {
              id
            }
          }
        `,
        variables: { id: meetingId },
      }),
    });

    const json = await res.json().catch(() => null);

    if (!res.ok || json?.errors?.length) {
      const message = json?.errors?.[0]?.message || `HTTP ${res.status}`;
      console.error("deleteFirefliesTranscript: Fireflies returned an error", message);
      return { success: false, error: message };
    }

    return { success: true };
  } catch (e) {
    console.error("deleteFirefliesTranscript: request to Fireflies failed", e);
    return { success: false, error: "Failed to reach Fireflies" };
  }
}

// --- Matching the meeting back to our own Lead ----------------------------
//
// We control the title at invite time (inviteFirefliesBot above), so we
// always embed "LeadRef:<meetingId>" in it, where <meetingId> is OUR OWN
// Meeting row's id — not the Lead's id, so a lead with several meetings
// over time still resolves to the exact right one.
const LEAD_REF_PREFIX = "LeadRef:";

export function buildMeetingTitle(ourMeetingId: string, leadName: string): string {
  // Fireflies allows up to 256 characters; this stays far under that.
  return `${LEAD_REF_PREFIX}${ourMeetingId} — Sales call with ${leadName}`;
}

export function extractOurMeetingId(firefliesTitle: string | null | undefined): string | null {
  if (!firefliesTitle) return null;
  const idx = firefliesTitle.indexOf(LEAD_REF_PREFIX);
  if (idx === -1) return null;
  const rest = firefliesTitle.slice(idx + LEAD_REF_PREFIX.length);
  const match = rest.match(/^[a-zA-Z0-9]+/);
  return match ? match[0] : null;
}

export function joinTranscriptText(sentences: FirefliesSentence[] | null): string {
  if (!sentences || sentences.length === 0) return "";
  return sentences
    .map((s) => `${s.speaker_name ? `${s.speaker_name}: ` : ""}${s.text ?? s.raw_text ?? ""}`)
    .join("\n");
}
