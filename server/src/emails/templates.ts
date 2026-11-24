function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function verifyEmail(input: { name: string; link: string }) {
  const name = escapeHtml(input.name);
  const link = escapeHtml(input.link);

  return {
    subject: "Verify your email for Play Basketball",
    text: `Hi ${input.name},

Welcome to Play Basketball! Confirm your email address to start joining games:

${input.link}

The link works for 24 hours. If you did not sign up, you can ignore this email.`,
    html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1c1917;">
  <h2 style="color: #d9480f;">Welcome to Play Basketball, ${name}!</h2>
  <p>Confirm your email address to start joining games.</p>
  <p><a href="${link}" style="display: inline-block; background: #d9480f; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none;">Verify my email</a></p>
  <p style="color: #78716c; font-size: 14px;">The link works for 24 hours. If you did not sign up, you can ignore this email.</p>
</div>`,
  };
}
