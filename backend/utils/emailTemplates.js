export function signupVerificationEmail({ otp, appName = "Netflix" }) {
  const text = `Your ${appName} verification code is: ${otp}\n\nThis code expires in 24 hours. If you did not create an account, ignore this email.`;
  const html = `
<!DOCTYPE html>
<html><body style="font-family:system-ui,sans-serif;background:#141414;color:#fff;padding:24px;">
  <h1 style="color:#e50914;">${appName}</h1>
  <p>Your verification code is:</p>
  <p style="font-size:28px;font-weight:bold;letter-spacing:4px;">${otp}</p>
  <p style="color:#aaa;font-size:14px;">This code expires in 24 hours.</p>
</body></html>`;
  return { subject: `${appName} — verify your email`, text, html };
}

export function passwordResetEmail({ otp, appName = "Netflix" }) {
  const text = `Your ${appName} password reset code is: ${otp}\n\nThis code expires in 10 minutes. If you did not request a reset, ignore this email.`;
  const html = `
<!DOCTYPE html>
<html><body style="font-family:system-ui,sans-serif;background:#141414;color:#fff;padding:24px;">
  <h1 style="color:#e50914;">${appName}</h1>
  <p>Your password reset code is:</p>
  <p style="font-size:28px;font-weight:bold;letter-spacing:4px;">${otp}</p>
  <p style="color:#aaa;font-size:14px;">Expires in 10 minutes.</p>
</body></html>`;
  return { subject: `${appName} — reset your password`, text, html };
}
