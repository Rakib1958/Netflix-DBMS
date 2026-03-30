/**
 * Lightweight profanity filter — blocks common offensive terms (word-boundary aware).
 * Not exhaustive; admins can still remove edge cases.
 */
const RAW = `
asshole bastard bitch bullshit crap damn fuck fucking motherfucker
shit slut whore dick cock pussy cunt nigger faggot
`.trim().split(/\s+/);

function normalizeForScan(text) {
  return String(text)
    .toLowerCase()
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/3/g, "e")
    .replace(/5/g, "s")
    .replace(/@/g, "a")
    .replace(/[^a-z\s]/g, " ");
}

export function containsProfanity(text) {
  if (!text || typeof text !== "string") return false;
  const normalized = normalizeForScan(text);
  for (const word of RAW) {
    const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(normalized)) return true;
  }
  return false;
}
