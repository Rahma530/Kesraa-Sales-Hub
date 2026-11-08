// Thin wrapper around Google Calendar's REST API — plain fetch, no
// `googleapis` package (keeps npm install light, matching the rest of this
// codebase's lib files). Creates a real Calendar event with a real Google
// Meet link attached, using a one-time OAuth refresh token.
//
// This works with ANY free Gmail account — no Google Workspace purchase
// needed. Workspace only matters for a custom domain email, admin console
// policies, or >100-participant meetings, none of which apply here.
//
// One-time setup Rahma needs to do herself (see README/env docs):
//   1. console.cloud.google.com → create a project → enable "Google
//      Calendar API".
//   2. OAuth consent screen → External → add her Gmail as a test user
//      (fine to stay in "Testing" mode indefinitely for internal use).
//   3. Also enable the "Google Meet API" in the same Cloud project (needed
//      so we can create the Meet link ourselves with OPEN access — see
//      createOpenMeetSpace below — instead of letting Calendar auto-create
//      one that defaults to TRUSTED access and makes every Sales rep "knock"
//      and wait for the organizer to let them in).
//   4. Credentials → Create OAuth Client ID → type "Web application" →
//      Authorized redirect URI: https://developers.google.com/oauthplayground
//      (easiest way to get a refresh token without building a UI for it).
//   5. Go to https://developers.google.com/oauthplayground → gear icon →
//      "Use your own OAuth credentials" → paste Client ID/Secret → in the
//      left panel select BOTH scopes:
//        - https://www.googleapis.com/auth/calendar.events
//        - https://www.googleapis.com/auth/meetings.space.created
//      → Authorize → Exchange authorization code for tokens → copy the
//      Refresh Token shown.
//   6. Put the three values in .env: GOOGLE_OAUTH_CLIENT_ID,
//      GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN.
//
// IMPORTANT: a refresh token obtained before the meetings.space.created
// scope was added only carries the old Calendar-only scope. It must be
// regenerated (repeat step 5 above) or createOpenMeetSpace() below will
// fail every time and we silently fall back to a TRUSTED-access meeting.
//
// The refresh token doesn't expire from inactivity in Testing mode in any
// way that matters here, and this code re-exchanges it for a fresh access
// token on every call (access tokens only last ~1 hour, so we never cache
// one across requests).

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const MEET_SPACES_URL = "https://meet.googleapis.com/v2/spaces";

async function getAccessToken(): Promise<string | null> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    console.error("googleCalendar: Google OAuth env vars are not fully configured");
    return null;
  }

  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.access_token) {
      console.error("googleCalendar: failed to refresh access token", json);
      return null;
    }
    return json.access_token as string;
  } catch (e) {
    console.error("googleCalendar: error refreshing access token", e);
    return null;
  }
}

export interface CreatedMeeting {
  meetingLink: string;
  calendarEventId: string;
}

// Creates a Google Meet space WE own, with accessType "OPEN" — meaning
// anyone with the link (any Sales rep, the Fireflies bot) joins straight
// in, with no "ask to join" / host-approval screen.
//
// Why this has to be a separate step: when Calendar auto-creates a Meet
// link for you (conferenceData.createRequest), the resulting space is
// owned by Calendar, not by our app, and Google explicitly does not allow
// a third-party app to patch the access settings of a space it didn't
// create (confirmed via Google's own issue tracker — there is no scope for
// it). So we create the space ourselves first via the Meet API, then just
// point the Calendar event at that existing link instead of asking
// Calendar to make its own.
//
// Requires the meetings.space.created OAuth scope on top of the Calendar
// scope — see the setup comment above. If that scope is missing (e.g. an
// old refresh token), this simply returns null and createCalendarMeeting
// below falls back to the old Calendar-only behavior (a TRUSTED-access
// meeting, which still works, just with the "knocking" screen back).
async function createOpenMeetSpace(accessToken: string): Promise<{ meetingUri: string } | null> {
  try {
    const res = await fetch(MEET_SPACES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        config: { accessType: "OPEN", entryPointAccess: "ALL" },
      }),
    });

    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.meetingUri) {
      console.error(
        "createOpenMeetSpace: Google Meet API returned an error (likely missing meetings.space.created scope on the refresh token)",
        json
      );
      return null;
    }
    // TEMP DEBUG (remove once confirmed working): Google silently ignores
    // accessType on some account types instead of erroring, so log what it
    // actually came back as.
    console.log("createOpenMeetSpace: space created, config =", json.config);
    return { meetingUri: json.meetingUri as string };
  } catch (e) {
    console.error("createOpenMeetSpace: request to Google Meet API failed", e);
    return null;
  }
}

// Creates a Calendar event starting now (30 minutes long by default) with a
// Google Meet link attached, and returns that link + the event id (so we
// can look the event up again later if needed — e.g. to cancel it).
export async function createCalendarMeeting(params: {
  title: string;
  attendeeEmail?: string | null;
  // The Sales rep's own email, added as a calendar attendee so Meet
  // recognizes them as an invited guest and (under the default TRUSTED
  // access type) lets them join without the "ask to join" screen — this
  // matters whenever the OPEN space above couldn't be created. Only takes
  // effect if they're signed into Google Meet with this exact address.
  salesRepEmail?: string | null;
  durationMinutes?: number;
}): Promise<{ success: boolean; meeting?: CreatedMeeting; error?: string }> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return { success: false, error: "Google Calendar isn't configured on the server" };
  }

  const now = new Date();
  const end = new Date(now.getTime() + (params.durationMinutes ?? 30) * 60 * 1000);

  // Try to get an OPEN-access Meet link we own first (see
  // createOpenMeetSpace above). Only fall back to Calendar's own
  // auto-created (TRUSTED-access) link if that fails.
  const openSpace = await createOpenMeetSpace(accessToken);

  const body: Record<string, unknown> = {
    summary: params.title,
    start: { dateTime: now.toISOString() },
    end: { dateTime: end.toISOString() },
  };

  if (openSpace) {
    // We already have the real Meet link — just attach it as the event's
    // location so it shows up in Calendar, no conferenceData needed.
    body.location = openSpace.meetingUri;
  } else {
    // Legacy fallback: let Calendar generate its own (TRUSTED-access) Meet
    // link. Unique requestId per call, required so retries don't create
    // duplicate meetings.
    const requestId = `kesra-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    body.conferenceData = {
      createRequest: {
        requestId,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }

  const attendees = [params.attendeeEmail, params.salesRepEmail]
    .filter((e): e is string => !!e)
    .map((email) => ({ email }));
  if (attendees.length > 0) {
    body.attendees = attendees;
  }

  try {
    const res = await fetch(`${EVENTS_URL}?conferenceDataVersion=1`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      const message = json?.error?.message || `HTTP ${res.status}`;
      console.error("createCalendarMeeting: Google Calendar returned an error", message);
      return { success: false, error: message };
    }

    const meetLink: string | undefined =
      openSpace?.meetingUri ||
      json?.hangoutLink ||
      json?.conferenceData?.entryPoints?.find(
        (ep: { entryPointType?: string; uri?: string }) => ep.entryPointType === "video"
      )?.uri;

    if (!meetLink || !json?.id) {
      return { success: false, error: "Google Calendar did not return a Meet link" };
    }

    return {
      success: true,
      meeting: { meetingLink: meetLink, calendarEventId: json.id as string },
    };
  } catch (e) {
    console.error("createCalendarMeeting: request to Google Calendar failed", e);
    return { success: false, error: "Failed to reach Google Calendar" };
  }
}
