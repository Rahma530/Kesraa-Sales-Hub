// Thin wrapper around Resend's HTTPS API — no SDK dependency, just a plain
// fetch call, so there's nothing extra to install.
//
// Requires two environment variables in production:
//   RESEND_API_KEY — from https://resend.com/api-keys
//   EMAIL_FROM     — a sender address on a domain verified in Resend
//                     (e.g. "Kesra CRM <no-reply@kesraa.com>"). Resend will
//                     refuse to send, or only deliver to your own Resend
//                     account email, until the domain is verified.

const RESEND_API_URL = "https://api.resend.com/emails";

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    console.error("sendEmail: RESEND_API_KEY or EMAIL_FROM is not configured");
    return { success: false, error: "Email sending isn't configured on the server" };
  }

  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("sendEmail: Resend returned an error", res.status, body);
      return { success: false, error: "Failed to send the email" };
    }

    return { success: true };
  } catch (e) {
    console.error("sendEmail: request to Resend failed", e);
    return { success: false, error: "Failed to send the email" };
  }
}
