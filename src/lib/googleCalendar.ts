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
//   3. Credentials → Create OAuth Client ID → type "Web application" →
//      Authorized redirect URI: https://developers.google.com/oauthplayground
//      (easiest way to get a refresh token without building a UI for it).
//   4. Go to https://developers.google.com/oauthplayground → gear icon →
//      "Use your own OAuth credentials" → paste Client ID/Secret → in the
//      left panel select the Calendar API v3 "https://www.googleapis.com/auth/calendar.events"
//      scope → Authorize → Exchange authorization code for tokens → copy
//      the Refresh Token shown.
//   5. Put the three values in .env: GOOGLE_OAUTH_CLIENT_ID,
//      GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN.
//
// The refresh token doesn't expire from inactivity in Testing mode in any
// way that matters here, and this code re-exchanges it for a fresh access
// token on every call (access tokens only last ~1 hour, so we never cache
// one across requests).

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

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

// Creates a Calendar event starting now (30 minutes long by default) with a
// Google Meet link attached, and returns that link + the event id (so we
// can look the event up again later if needed — e.g. to cancel it).
export async function createCalendarMeeting(params: {
  title: string;
  attendeeEmail?: string | null;
  durationMinutes?: number;
}): Promise<{ success: boolean; meeting?: CreatedMeeting; error?: string }> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return { success: false, error: "Google Calendar isn't configured on the server" };
  }

  const now = new Date();
  const end = new Date(now.getTime() + (params.durationMinutes ?? 30) * 60 * 1000);
  // Unique per request, required by the Meet-creation API so retries don't
  // create duplicate meetings.
  const requestId = `kesra-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const body: Record<string, unknown> = {
    summary: params.title,
    start: { dateTime: now.toISOString() },
    end: { dateTime: end.toISOString() },
    conferenceData: {
      createRequest: {
        requestId,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
  };
  if (params.attendeeEmail) {
    body.attendees = [{ email: params.attendeeEmail }];
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

    const meetLink: string | undefined = json?.hangoutLink || json?.conferenceData?.entryPoints?.find(
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
