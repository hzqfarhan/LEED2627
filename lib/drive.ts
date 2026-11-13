// Google Drive storage for payment receipts and bank statements.
//
// A committee admin connects the Google account that owns the Drive once (Admin > Payments >
// Connect Google Drive). The app keeps that account's refresh token in the settings table and from
// then on uploads every receipt into:
//   LEED 26 payments / RM40 site rental and cleaning deposit / Stall 07 - RM40 receipt - 2026-11-20.jpg
//   LEED 26 payments / RM70 stall rental / ...
// It uses the "drive.file" permission: the app can only see the files and folders it created itself.
//
// Uses the same Google OAuth client as UTHM SSO. In Google Cloud Console: enable the Google Drive API,
// and add  https://<your-site>/api/admin/drive/callback  as an authorised redirect URI.

import { createHash, randomBytes } from 'node:crypto';
import { hasDb, q } from './db';
import { demo } from './demo';
import type { PaymentKind } from './event';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

export const DRIVE_CALLBACK_PATH = '/api/admin/drive/callback';
const SCOPE = 'openid email https://www.googleapis.com/auth/drive.file';

const KEY = {
  token: 'drive_refresh_token',
  account: 'drive_account',
  root: 'drive_folder_root',
  deposit: 'drive_folder_deposit',
  rental: 'drive_folder_rental',
  connectedAt: 'drive_connected_at',
} as const;

const FOLDER_NAMES = {
  root: 'LEED 26 payments',
  deposit: 'RM40 site rental and cleaning deposit',
  rental: 'RM70 stall rental',
} as const;

// ---------------------------------------------------------------------------
// settings
// ---------------------------------------------------------------------------

async function getSettings(keys: string[]): Promise<Record<string, string>> {
  if (!hasDb) {
    const kv = demo().kv;
    return Object.fromEntries(keys.filter((k) => kv[k] != null).map((k) => [k, kv[k]]));
  }
  const rows = await q<Row>(`SELECT key, value FROM settings WHERE key = ANY($1::text[])`, [keys]);
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

async function setSettings(values: Record<string, string | null>): Promise<void> {
  if (!hasDb) {
    const kv = demo().kv;
    for (const [k, v] of Object.entries(values)) {
      if (v == null) delete kv[k];
      else kv[k] = v;
    }
    return;
  }
  for (const [k, v] of Object.entries(values)) {
    if (v == null) await q(`DELETE FROM settings WHERE key = $1`, [k]);
    else await q(`INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [k, v]);
  }
}

// ---------------------------------------------------------------------------
// connecting
// ---------------------------------------------------------------------------

export interface DriveStatus {
  connected: boolean;
  account: string | null;
  connectedAt: string | null;
  folderUrl: string | null;
}

export async function driveStatus(): Promise<DriveStatus> {
  const s = await getSettings([KEY.token, KEY.account, KEY.root, KEY.connectedAt]);
  return {
    connected: Boolean(s[KEY.token]),
    account: s[KEY.account] ?? null,
    connectedAt: s[KEY.connectedAt] ?? null,
    folderUrl: s[KEY.root] ? `https://drive.google.com/drive/folders/${s[KEY.root]}` : null,
  };
}

export interface DriveHandshake {
  state: string;
  verifier: string;
  exp: number;
}

export function newDriveHandshake(): DriveHandshake {
  const rnd = () => randomBytes(32).toString('base64url');
  return { state: rnd(), verifier: rnd(), exp: Math.floor(Date.now() / 1000) + 600 };
}

export function driveAuthUrl(h: DriveHandshake, redirectUri: string): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? '',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE,
    state: h.state,
    code_challenge: createHash('sha256').update(h.verifier).digest('base64url'),
    code_challenge_method: 'S256',
    access_type: 'offline', // a refresh token, so uploads keep working
    prompt: 'consent select_account',
    include_granted_scopes: 'true',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

/** Finish connecting: keep the refresh token and create the folders. Returns the Google account. */
export async function finishDriveConnect(code: string, h: DriveHandshake, redirectUri: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: h.verifier,
    }),
  });
  if (!res.ok) throw new Error(`Google refused the Drive connection (${res.status})`);
  const t = (await res.json()) as { refresh_token?: string; access_token?: string; id_token?: string; scope?: string };
  if (!t.refresh_token) throw new Error('Google sent no refresh token. Remove LEED 26 from the account’s third-party access and connect again.');
  if (!t.scope?.includes('drive.file')) throw new Error('Drive access was not granted. Tick the Google Drive box when connecting.');
  let account = 'Google account';
  if (t.id_token) {
    try {
      const claims = JSON.parse(Buffer.from(t.id_token.split('.')[1], 'base64url').toString());
      if (claims.email) account = String(claims.email);
    } catch {
      /* keep the placeholder */
    }
  }
  await setSettings({
    [KEY.token]: t.refresh_token,
    [KEY.account]: account,
    [KEY.connectedAt]: new Date().toISOString(),
    [KEY.root]: null,
    [KEY.deposit]: null,
    [KEY.rental]: null,
  });
  cached = t.access_token ? { token: t.access_token, exp: Date.now() + 50 * 60_000 } : null;
  await folderFor('deposit');
  await folderFor('rental');
  return account;
}

export async function disconnectDrive(): Promise<void> {
  const s = await getSettings([KEY.token]);
  if (s[KEY.token]) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(s[KEY.token])}`, { method: 'POST' }).catch(() => undefined);
  }
  cached = null;
  await setSettings({ [KEY.token]: null, [KEY.account]: null, [KEY.connectedAt]: null, [KEY.root]: null, [KEY.deposit]: null, [KEY.rental]: null });
}

// ---------------------------------------------------------------------------
// talking to Drive
// ---------------------------------------------------------------------------

let cached: { token: string; exp: number } | null = null;

async function accessToken(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const s = await getSettings([KEY.token]);
  if (!s[KEY.token]) throw new Error('Google Drive is not connected.');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      refresh_token: s[KEY.token],
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`Google Drive sign-in expired (${res.status}). Connect Google Drive again.`);
  const t = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: t.access_token, exp: Date.now() + t.expires_in * 1000 };
  return t.access_token;
}

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await accessToken();
  return fetch(`https://www.googleapis.com${path}`, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } });
}

async function createFolder(name: string, parent: string | null): Promise<string> {
  const res = await api('/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', ...(parent ? { parents: [parent] } : {}) }),
  });
  if (!res.ok) throw new Error(`Could not create the Drive folder "${name}" (${res.status})`);
  return ((await res.json()) as { id: string }).id;
}

async function folderExists(id: string): Promise<boolean> {
  const res = await api(`/drive/v3/files/${encodeURIComponent(id)}?fields=id,trashed`);
  if (!res.ok) return false;
  return !((await res.json()) as { trashed?: boolean }).trashed;
}

/** The folder for a payment kind, created (with the root folder) when missing or deleted. */
async function folderFor(kind: PaymentKind): Promise<string> {
  const s = await getSettings([KEY.root, KEY[kind]]);
  let root = s[KEY.root];
  if (!root || !(await folderExists(root))) {
    root = await createFolder(FOLDER_NAMES.root, null);
    await setSettings({ [KEY.root]: root, [KEY.deposit]: null, [KEY.rental]: null });
    s[KEY[kind]] = '';
  }
  let sub = s[KEY[kind]];
  if (!sub || !(await folderExists(sub))) {
    sub = await createFolder(FOLDER_NAMES[kind], root);
    await setSettings({ [KEY[kind]]: sub });
  }
  return sub;
}

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };

/** Upload a receipt or statement. Returns the Drive file id and its link. */
export async function uploadToDrive(
  kind: PaymentKind,
  file: { data: Buffer; type: string },
  title: string,
): Promise<{ id: string; url: string }> {
  const folder = await folderFor(kind);
  const boundary = `leed26${randomBytes(12).toString('hex')}`;
  const meta = JSON.stringify({ name: `${title}.${EXT[file.type] ?? 'bin'}`, parents: [folder] });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${file.type}\r\n\r\n`),
    file.data,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const res = await api('/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: new Uint8Array(body),
  });
  if (!res.ok) throw new Error(`Drive upload failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const out = (await res.json()) as { id: string; webViewLink?: string };
  return { id: out.id, url: out.webViewLink ?? `https://drive.google.com/file/d/${out.id}/view` };
}

/** Fetch a file back from Drive, for the in-app preview. */
export async function downloadFromDrive(id: string): Promise<Buffer | null> {
  const res = await api(`/drive/v3/files/${encodeURIComponent(id)}?alt=media`);
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}
