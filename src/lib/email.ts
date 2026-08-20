/**
 * Transactional email.
 *
 * Uses Resend when RESEND_API_KEY is set. Without it, the message is logged to
 * the server console and the link is returned to the caller in development, so
 * password reset stays testable before you've wired up a mail provider.
 */
const FROM = process.env.EMAIL_FROM || "Zapply <onboarding@resend.dev>";

export function emailEnabled() {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendEmail({ to, subject, html, text }: {
  to: string; subject: string; html: string; text: string;
}) {
  if (!emailEnabled()) {
    console.log(`\n[email] would send to ${to}\n  subject: ${subject}\n  ${text}\n`);
    return { sent: false, reason: "no-provider" as const };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({ from: FROM, to, subject, html, text }),
  });

  if (!res.ok) {
    console.error("[email] send failed:", await res.text());
    return { sent: false, reason: "provider-error" as const };
  }
  return { sent: true as const };
}

export function resetEmail(name: string, link: string) {
  return {
    subject: "Reset your Zapply password",
    text: `Hi ${name || "there"},\n\nUse this link to set a new password. It works once and expires in an hour.\n\n${link}\n\nIf you didn't ask for this, you can ignore this email — your password won't change.`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:480px;line-height:1.6;color:#101828">
      <p>Hi ${name || "there"},</p>
      <p>Use this link to set a new password. It works once and expires in an hour.</p>
      <p><a href="${link}" style="display:inline-block;background:#5B2AD6;color:#fff;padding:11px 18px;border-radius:10px;text-decoration:none;font-weight:600">Set a new password</a></p>
      <p style="color:#475467;font-size:14px">If you didn't ask for this, you can ignore this email — your password won't change.</p>
    </div>`,
  };
}

export function verifyEmail(name: string, link: string) {
  return {
    subject: "Confirm your Zapply email",
    text: `Hi ${name || "there"},\n\nConfirm your email address:\n\n${link}`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:480px;line-height:1.6;color:#101828">
      <p>Hi ${name || "there"},</p>
      <p>Confirm your email address so we can reach you about your account.</p>
      <p><a href="${link}" style="display:inline-block;background:#5B2AD6;color:#fff;padding:11px 18px;border-radius:10px;text-decoration:none;font-weight:600">Confirm email</a></p>
    </div>`,
  };
}
