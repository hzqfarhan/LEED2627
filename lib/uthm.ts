// UTHM accounts: which emails may sign in, and where profile photos come from.
// Photo rules follow docs "UTHM Community Profile Image Retrieval" (photofetch.md).

export const ALLOWED_DOMAINS = ['student.uthm.edu.my', 'uthm.edu.my'] as const;

export function emailDomain(email: string): string {
  return email.trim().toLowerCase().split('@')[1] ?? '';
}

/** Only official UTHM emails: exactly @student.uthm.edu.my or @uthm.edu.my (not look-alike domains). */
export function isUthmEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+$/.test(e)) return false;
  return (ALLOWED_DOMAINS as readonly string[]).includes(emailDomain(e));
}

export function isStudentEmail(email: string): boolean {
  return emailDomain(email) === 'student.uthm.edu.my';
}

/** Matric number from a student email such as ai220123@student.uthm.edu.my, or null. */
export function matricFromEmail(email: string): string | null {
  if (!isStudentEmail(email)) return null;
  const local = email.trim().split('@')[0].toUpperCase();
  return /^[A-Z]{1,3}\d{5,7}$/.test(local) ? local : null;
}

/** community.uthm.edu.my photo for a student matric number (session = intake year and the next). */
export function studentPhotoUrl(matric: string): string {
  const id = matric.trim().toUpperCase().replace(/\s+/g, '');
  const m = id.match(/\d{2}/);
  const session = m ? `${2000 + Number(m[0])}${2001 + Number(m[0])}` : '20252026';
  return `https://community.uthm.edu.my/images/students/${session}/${encodeURIComponent(id)}.jpg`;
}

export function staffPhotoUrl(staffId: string): string {
  return `https://community.uthm.edu.my/images/profiles/${encodeURIComponent(staffId.trim().toUpperCase().replace(/\s+/g, ''))}.jpg`;
}

/**
 * Photo candidates for a person, best first. The avatar tries each in turn and falls back to
 * initials if none loads: UTHM Community (students by matric from their email, staff by staff ID
 * if they gave one), then their Google profile photo.
 */
export function photoCandidates(email: string, opts: { staffId?: string | null; google?: string | null } = {}): string[] {
  const out: string[] = [];
  const matric = matricFromEmail(email);
  if (matric) out.push(studentPhotoUrl(matric));
  else if (opts.staffId && /^[A-Za-z0-9]{2,12}$/.test(opts.staffId.trim())) out.push(staffPhotoUrl(opts.staffId));
  if (opts.google && /^https:\/\//.test(opts.google)) out.push(opts.google);
  return out;
}
