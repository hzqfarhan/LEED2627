// Short names for tight spaces (the profile pill in the top bar).
// Uses the full name when it fits, otherwise the Google first name ("given name"),
// otherwise a nickname worked out from the full name.

const MAX = 14;

const TITLES = /\b(prof(esor)?|madya|assoc|dr|ts|ir|sr|en|encik|puan|pn|cik|tuan|hj|haji|hajah|dato'?|datuk|datin|tan sri|ar)\b\.?/gi;
const PATRONYM = /\s+(bin|binti|bt|bte|b\.|a\/l|a\/p|s\/o|d\/o)\s+.*$/i;
// Common first words that are rarely what people go by.
const SKIP = new Set(['muhammad', 'muhamad', 'mohammad', 'mohamad', 'mohammed', 'mohd', 'muhd', 'md', 'nur', 'nurul', 'noor', 'siti', 'abdul', 'ab', 'abd', 'wan', 'nik', 'che', 'syed', 'sharifah', 'tengku', 'tunku', 'raja', 'megat', 'puteri', 'ahmad']);

const titleCase = (s: string) => (s === s.toUpperCase() && !/\d/.test(s) ? s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase()) : s);
const tidy = (s: string) => titleCase(s.replace(TITLES, ' ').replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim());

export function shortName(full: string, given?: string | null): string {
  const clean = tidy(full).replace(PATRONYM, '').trim() || full.trim();
  if (clean.length <= MAX) return clean;
  const g = given ? tidy(given).replace(PATRONYM, '').trim() : '';
  if (g && g.length <= MAX) return g;
  const words = (g || clean).split(' ').filter(Boolean);
  const pick = words.find((w) => !SKIP.has(w.toLowerCase()) && w.length > 1) ?? words[0] ?? clean;
  const one = pick;
  return one.length <= MAX ? one : `${one.slice(0, MAX - 1)}…`;
}
