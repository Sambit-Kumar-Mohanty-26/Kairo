import { config } from "./config.js";

/**
 * Failures are swallowed on purpose: /forgot-password must return the same
 * response whether or not the address exists, and whether or not Resend is up.
 */
export async function sendPasswordReset(to: string, resetUrl: string): Promise<void> {
  if (!config.resendApiKey) {
    console.warn(`RESEND_API_KEY unset - password reset link for ${to}: ${resetUrl}`);
    return;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.emailFrom,
        to,
        subject: "Reset your Kairo password",
        text: `Reset your password: ${resetUrl}\n\nThis link expires in one hour and can only be used once. If you didn't ask for it, ignore this email.`,
      }),
    });
    if (!res.ok) console.error("Resend rejected the email:", res.status, await res.text());
  } catch (err) {
    console.error("Could not reach Resend:", err);
  }
}
