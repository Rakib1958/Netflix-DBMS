/**
 * Email transport: Nodemailer wrapper; send transactional mail when EMAIL_* env is set.
 */
import nodemailer from "nodemailer";
import { redactEmail, safeError, sanitizeForLog } from "./rotation.js";

let transporter;

function getTransporter() {
  if (transporter) return transporter;
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  if (!user || !pass) return null;
  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
  return transporter;
}

export function isEmailConfigured() {
  return !!(process.env.EMAIL_USER && process.env.EMAIL_PASS);
}

/**
 * @param {{ to: string; subject: string; text: string; html?: string }} opts
 */
export async function sendTransactionalEmail(opts) {
  const t = getTransporter();
  if (!t) {
    const err = new Error("Email is not configured. Set EMAIL_USER and EMAIL_PASS in backend/.env");
    err.code = "EMAIL_NOT_CONFIGURED";
    throw err;
  }
  try {
    await t.sendMail({
      from: process.env.EMAIL_FROM?.trim() || process.env.EMAIL_USER,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html || opts.text.replace(/\n/g, "<br>"),
    });
  } catch (err) {
    safeError("[email] send failed:", {
      to: redactEmail(opts?.to),
      message: err?.message || String(err),
      code: err?.code,
    });
    if (err?.response) safeError("[email] SMTP:", sanitizeForLog(err.response));
    const hint =
      "Gmail: enable 2-Step Verification, then create an App Password (Google Account > Security) and use it as EMAIL_PASS.";
    throw new Error(`${err?.message || "Failed to send email"}. ${hint}`);
  }
}
