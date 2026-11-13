// Email through Resend (https://resend.com), using its HTTP API (no package needed).
// Switched off until RESEND_API_KEY and EMAIL_FROM are set: the app then only shows in-app
// notifications and logs that the email was skipped.

import { EVENT } from './event';

export interface Mail {
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
  text: string;
}

export const emailReady = Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

const API = 'https://api.resend.com';

/** Send one or more emails. Never throws: a failed email must not undo what the committee did. */
export async function sendMail(mails: Mail[]): Promise<void> {
  const list = mails.filter((m) => m.to.length > 0);
  if (list.length === 0) return;
  if (!emailReady) {
    console.info(`[email] skipped ${list.length} email(s): RESEND_API_KEY or EMAIL_FROM is not set. First subject: ${list[0].subject}`);
    return;
  }
  const from = process.env.EMAIL_FROM as string;
  const replyTo = process.env.EMAIL_REPLY_TO || undefined;
  const body = list.map((m) => ({
    from,
    to: m.to,
    ...(m.cc?.length ? { cc: m.cc } : {}),
    ...(replyTo ? { reply_to: replyTo } : {}),
    subject: m.subject,
    html: m.html,
    text: m.text,
  }));
  try {
    // Resend takes up to 100 emails per batch call.
    for (let i = 0; i < body.length; i += 100) {
      const chunk = body.slice(i, i + 100);
      const res = await fetch(chunk.length === 1 ? `${API}/emails` : `${API}/emails/batch`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(chunk.length === 1 ? chunk[0] : chunk),
      });
      if (!res.ok) console.error(`[email] Resend refused ${chunk.length} email(s): ${res.status} ${(await res.text()).slice(0, 300)}`);
    }
  } catch (err) {
    console.error('[email] could not reach Resend', err);
  }
}

// ---------------------------------------------------------------------------
// Template
// ---------------------------------------------------------------------------

export type Tone = 'good' | 'wait' | 'bad' | 'info';

export interface EmailContent {
  /** Shown by mail apps next to the subject. */
  preheader: string;
  /** Small coloured label above the heading, e.g. "Verified". */
  status?: { label: string; tone: Tone };
  heading: string;
  /** Paragraphs. */
  intro: string[];
  /** Label and value pairs, shown as a small table. */
  rows?: [string, string][];
  /** A highlighted box, e.g. the committee's reason for rejecting. */
  note?: { title: string; text: string };
  cta?: { label: string; path: string };
  /** Why the person gets this email. */
  reason: string;
}

const TONE: Record<Tone, { bg: string; ink: string }> = {
  good: { bg: '#1FE0C2', ink: '#1D0B3A' },
  wait: { bg: '#FFD91A', ink: '#1D0B3A' },
  bad: { bg: '#FF1A9A', ink: '#FFFFFF' },
  info: { bg: '#E8DEFF', ink: '#1D0B3A' },
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function siteUrl(): string {
  return (process.env.APP_URL || 'https://leed26.example.com').replace(/\/+$/, '');
}

/** Branded HTML (table layout, inline styles, so it holds up in Gmail and Outlook) plus a plain-text copy. */
export function renderEmail(c: EmailContent): { html: string; text: string } {
  const base = siteUrl();
  const font = "'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  const status = c.status
    ? `<span style="display:inline-block;padding:5px 14px;border:2px solid #1D0B3A;border-radius:999px;background:${TONE[c.status.tone].bg};color:${TONE[c.status.tone].ink};font:800 13px ${font};">${esc(c.status.label)}</span>`
    : '';
  const rows = c.rows?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 4px;border-collapse:separate;border-spacing:0;background:#FBF6E6;border-radius:14px;">
        ${c.rows
          .map(
            ([k, v], i) => `<tr>
          <td style="padding:${i === 0 ? '14px' : '8px'} 16px ${i === c.rows!.length - 1 ? '14px' : '8px'};font:700 13px ${font};color:#6B5F86;width:38%;vertical-align:top;">${esc(k)}</td>
          <td style="padding:${i === 0 ? '14px' : '8px'} 16px ${i === c.rows!.length - 1 ? '14px' : '8px'};font:700 15px ${font};color:#1D0B3A;vertical-align:top;">${esc(v)}</td>
        </tr>`,
          )
          .join('')}
      </table>`
    : '';
  const note = c.note
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 4px;">
        <tr><td style="padding:14px 16px;border:2px solid #1D0B3A;border-left:8px solid #FF1A9A;border-radius:12px;background:#FFE3F1;">
          <div style="font:800 13px ${font};color:#1D0B3A;margin-bottom:4px;">${esc(c.note.title)}</div>
          <div style="font:600 15px/1.5 ${font};color:#1D0B3A;">${esc(c.note.text)}</div>
        </td></tr>
      </table>`
    : '';
  const cta = c.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 6px;">
        <tr><td style="border:2.5px solid #1D0B3A;border-radius:999px;background:#FFD91A;box-shadow:0 4px 0 #1D0B3A;">
          <a href="${esc(base + c.cta.path)}" style="display:inline-block;padding:13px 26px;font:800 16px ${font};color:#1D0B3A;text-decoration:none;">${esc(c.cta.label)}</a>
        </td></tr>
      </table>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${esc(c.heading)}</title>
</head>
<body style="margin:0;padding:0;background:#13042E;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(c.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#13042E;background-image:radial-gradient(ellipse at 15% 0%,#5A12A8 0,transparent 55%),radial-gradient(ellipse at 90% 100%,#8A1060 0,transparent 50%);">
  <tr><td align="center" style="padding:28px 14px 36px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
      <tr><td align="center" style="padding:0 0 18px;">
        <a href="${esc(base)}"><img src="${esc(base)}/brand/leed-logo-email.png" width="190" alt="LEED 26, Learn and Earn Entrepreneurship Day" style="display:block;width:190px;max-width:60%;height:auto;border:0;"></a>
      </td></tr>
      <tr><td style="background:#FFFFFF;border:3px solid #1D0B3A;border-radius:24px;box-shadow:6px 6px 0 #FFD91A;padding:28px 28px 26px;">
        ${status}
        <h1 style="margin:14px 0 10px;font:italic 900 26px/1.15 ${font};color:#1D0B3A;">${esc(c.heading)}</h1>
        ${c.intro.map((p) => `<p style="margin:0 0 12px;font:500 16px/1.55 ${font};color:#2E2347;">${esc(p)}</p>`).join('')}
        ${rows}
        ${note}
        ${cta}
      </td></tr>
      <tr><td style="padding:22px 10px 0;text-align:center;font:500 12px/1.6 ${font};color:#C9B6F2;">
        ${esc(c.reason)}<br>
        ${esc(EVENT.fullName)}, ${esc(EVENT.dates)}, ${esc(EVENT.venue)}<br>
        <a href="${esc(base)}/stall" style="color:#FFD91A;">Open LEED 26</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  const text = [
    c.status ? `[${c.status.label}]` : null,
    c.heading,
    '',
    ...c.intro,
    ...(c.rows?.length ? ['', ...c.rows.map(([k, v]) => `${k}: ${v}`)] : []),
    ...(c.note ? ['', `${c.note.title}: ${c.note.text}`] : []),
    ...(c.cta ? ['', `${c.cta.label}: ${base}${c.cta.path}`] : []),
    '',
    '--',
    c.reason,
    `${EVENT.fullName}, ${EVENT.dates}, ${EVENT.venue}`,
  ]
    .filter((l) => l !== null)
    .join('\n');

  return { html, text };
}

/** "2026-11-20" -> "20 November 2026" */
export function longDay(iso: string | null | undefined): string {
  if (!iso) return '-';
  return new Date(`${iso.slice(0, 10)}T00:00:00+08:00`).toLocaleDateString('en-MY', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kuala_Lumpur' });
}
