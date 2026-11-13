'use client';

// Admin console: every stall's registration details and its two payments (RM40 deposit to UTHM,
// RM70 rental to SELADEVS DIGITAL). Verify or reject receipts, and track the RM20 cleaning deposit refund.

import { useCallback, useEffect, useRef, useState } from 'react';
import { COURSES, LECTURERS, MAIN_PRODUCTS, PAYMENTS, paymentReference, type PaymentKind } from '@/lib/event';
import { CANOPY, PAYER_FIELDS, detailsComplete, type PayerDetails, type Payment, type PaymentRow, type RefundStatus, type StallColour } from '@/lib/shared';

type ExportKind = 'rm40' | 'rm70' | 'details';

type Filter = 'all' | 'check' | 'missing' | 'rejected' | 'done';

const STATUS: Record<Payment['status'] | 'none', { text: string; cls: string }> = {
  none: { text: 'Not submitted', cls: 'pay-pill--none' },
  pending: { text: 'To check', cls: 'pay-pill--wait' },
  verified: { text: 'Verified', cls: 'pay-pill--ok' },
  rejected: { text: 'Rejected', cls: 'pay-pill--bad' },
};

const REFUND: Record<RefundStatus, string> = { held: 'Held', refunded: 'Refunded', forfeited: 'Kept (stall left dirty)' };

const PAYER_LABEL: Record<keyof PayerDetails, string> = {
  name: 'Payer',
  matric: 'Matric',
  ic: 'IC',
  phone: 'Phone',
  email: 'Email',
  address: 'Address',
  state: 'State',
  gender: 'Gender',
  bumiputera: 'Bumiputera',
  sulung: 'SULUNG',
  level: 'Level',
  year: 'Year',
  faculty: 'Faculty',
  field: 'Field',
  collegeType: 'Residence',
  college: 'College',
  refundBank: 'Refund bank',
  refundAccount: 'Refund account',
};

const fmt = (iso: string | null) =>
  iso
    ? new Date(iso.length === 10 ? `${iso}T00:00:00+08:00` : iso).toLocaleString('en-MY', {
        day: 'numeric',
        month: 'short',
        ...(iso.length > 10 ? { hour: 'numeric', minute: '2-digit' } : {}),
        timeZone: 'Asia/Kuala_Lumpur',
      })
    : '';

function Pill({ p }: { p: Payment | null }) {
  const s = STATUS[p?.status ?? 'none'];
  return <span className={`pay-pill ${s.cls}`}>{s.text}</span>;
}

export default function AdminPayments() {
  const [rows, setRows] = useState<PaymentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [openNo, setOpenNo] = useState<number | null>(null);
  const [exporting, setExporting] = useState<ExportKind | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/payments', { cache: 'no-store' });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error ?? 'Could not load payments.');
      setRows(out.rows);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load payments.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (openNo != null && !d.open) d.showModal();
    if (openNo == null && d.open) d.close();
  }, [openNo]);

  if (error) return <p className="note note--bad">{error}</p>;
  if (!rows) return <p className="muted">Loading payments…</p>;

  const pays = rows.flatMap((r) => [r.deposit, r.rental]).filter((p): p is Payment => Boolean(p));
  const collected = pays.filter((p) => p.status === 'verified').reduce((n, p) => n + p.amount, 0);
  const expected = rows.length * (PAYMENTS.deposit.amount + PAYMENTS.rental.amount);
  const toCheck = pays.filter((p) => p.status === 'pending').length;
  const count = (k: PaymentKind) => rows.filter((r) => r[k]?.status === 'verified').length;
  const detailsDone = rows.filter((r) => detailsComplete(r.details)).length;

  const match = (r: PaymentRow) => {
    const both = [r.deposit, r.rental];
    if (filter === 'check' && !both.some((p) => p?.status === 'pending')) return false;
    if (filter === 'missing' && both.every(Boolean)) return false;
    if (filter === 'rejected' && !both.some((p) => p?.status === 'rejected')) return false;
    if (filter === 'done' && !both.every((p) => p?.status === 'verified')) return false;
    const s = search.trim().toLowerCase();
    if (!s) return true;
    return [String(r.stallNumber), r.stallName, r.leader ?? '', r.deposit?.payer.name ?? '', r.deposit?.payer.matric ?? '']
      .join(' ')
      .toLowerCase()
      .includes(s);
  };
  const shown = rows.filter(match);
  const open = rows.find((r) => r.stallNumber === openNo) ?? null;

  const counts: [Filter, string, number][] = [
    ['all', 'All', rows.length],
    ['check', 'To check', rows.filter((r) => [r.deposit, r.rental].some((p) => p?.status === 'pending')).length],
    ['missing', 'Missing a payment', rows.filter((r) => !(r.deposit && r.rental)).length],
    ['rejected', 'Rejected', rows.filter((r) => [r.deposit, r.rental].some((p) => p?.status === 'rejected')).length],
    ['done', 'Fully paid', rows.filter((r) => r.deposit?.status === 'verified' && r.rental?.status === 'verified').length],
  ];

  return (
    <section className="stack">
      <div className="pay-hero">
        <div className="pay-hero-money">
          <span>Verified so far</span>
          <strong>RM{collected.toLocaleString('en-MY')}</strong>
          <small>of RM{expected.toLocaleString('en-MY')} from {rows.length} stalls</small>
          <span className="pay-meter" aria-hidden="true">
            <span style={{ width: `${expected ? Math.min(100, (collected / expected) * 100) : 0}%` }} />
          </span>
        </div>
        <ul className="pay-hero-stats">
          <li className={toCheck ? 'is-warn' : undefined}>
            <strong>{toCheck}</strong>
            <span>receipts to check</span>
          </li>
          <li>
            <strong>
              {count('deposit')}/{rows.length}
            </strong>
            <span>RM40 deposits verified</span>
          </li>
          <li>
            <strong>
              {count('rental')}/{rows.length}
            </strong>
            <span>RM70 rentals verified</span>
          </li>
          <li>
            <strong>
              {detailsDone}/{rows.length}
            </strong>
            <span>stall details complete</span>
          </li>
        </ul>
      </div>

      <div className="dir-tools">
        <input type="search" className="dir-search" placeholder="Search stall, name, leader or matric" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search payments" />
        <div className="seg" role="group" aria-label="Show">
          {counts.map(([id, label, n]) => (
            <button key={id} type="button" className="seg-btn" aria-pressed={filter === id} onClick={() => setFilter(id)}>
              {label} {n}
            </button>
          ))}
        </div>
      </div>

      <div className="pay-tools">
        <DriveCard />
        <div className="pay-downloads">
          <strong>Export for processing</strong>
          <button type="button" className="pay-dl-btn pay-dl-btn--rm40" onClick={() => setExporting('rm40')}>
            <span>RM40 deposit</span>
            <small>To UTHM. Payments, refunds, payer details</small>
          </button>
          <button type="button" className="pay-dl-btn pay-dl-btn--rm70" onClick={() => setExporting('rm70')}>
            <span>RM70 rental</span>
            <small>To SELADEVS DIGITAL. Payments</small>
          </button>
          <button type="button" className="pay-dl-btn" onClick={() => setExporting('details')}>
            <span>Stall details</span>
            <small>Course, lecturer, products, electrical</small>
          </button>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="muted">No stall matches.</p>
      ) : (
        <ul className="pay-list" aria-label="Stalls and their payments">
          <li className="pay-list-head" aria-hidden="true">
            <span>Stall</span>
            <span>Details</span>
            <span>RM40 deposit</span>
            <span>RM70 rental</span>
            <span>Refund</span>
          </li>
          {shown.map((r) => {
            const t = CANOPY[r.colour ?? 'none'];
            return (
              <li key={r.stallNumber}>
                <button type="button" className="pay-row" onClick={() => setOpenNo(r.stallNumber)}>
                  <span className="pay-row-stall">
                    <span className="stall-plate stall-plate--small" style={{ background: t.fill, color: t.ink }}>
                      {r.stallNumber}
                    </span>
                    <span>
                      <strong>{r.stallName}</strong>
                      <small>{r.leader ?? 'No leader yet'}</small>
                    </span>
                  </span>
                  <span className="pay-cell" data-label="Details">
                    {detailsComplete(r.details) ? <span className="pay-pill pay-pill--ok">Complete</span> : <span className="pay-pill pay-pill--none">Incomplete</span>}
                  </span>
                  <span className="pay-cell" data-label="RM40">
                    <Pill p={r.deposit} />
                  </span>
                  <span className="pay-cell" data-label="RM70">
                    <Pill p={r.rental} />
                  </span>
                  <span className="pay-cell" data-label="Refund">
                    {r.deposit?.refundStatus ? REFUND[r.deposit.refundStatus] : '–'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <ExportDialog kind={exporting} onClose={() => setExporting(null)} />

      <dialog ref={dialog} className="viewer dir-dialog" onClose={() => setOpenNo(null)} aria-labelledby="pay-title">
        {open && <StallPayments row={open} onClose={() => setOpenNo(null)} onChanged={load} />}
      </dialog>
    </section>
  );
}

function StallPayments({ row, onClose, onChanged }: { row: PaymentRow; onClose: () => void; onChanged: () => Promise<void> }) {
  const t = CANOPY[row.colour ?? 'none'];
  const d = row.details;
  const lect = LECTURERS.find((l) => l.id === d.lecturer);
  return (
    <div className="dir-dialog-card">
      <header className="dir-dialog-head" style={{ background: t.fill, color: t.ink }}>
        <span className="dir-dialog-no">{row.stallNumber}</span>
        <div>
          <h2 id="pay-title">{row.stallName}</h2>
          <p>Leader: {row.leader ?? 'not set'}</p>
        </div>
      </header>
      <div className="dir-dialog-body stack">
        <section>
          <h4>Stall details</h4>
          {detailsComplete(d) || d.updatedAt ? (
            <dl className="pay-dl">
              <div>
                <dt>Course</dt>
                <dd>{COURSES.find((c) => c.id === d.course)?.name ?? d.course ?? '–'}</dd>
              </div>
              <div>
                <dt>Lecturer</dt>
                <dd>{lect ? `${lect.name} (${CANOPY[lect.colour as StallColour].label})` : '–'}</dd>
              </div>
              <div>
                <dt>Group</dt>
                <dd>{d.groupNo ?? '–'}</dd>
              </div>
              <div>
                <dt>Product</dt>
                <dd>
                  {d.productName ?? '–'}
                  {d.mainProduct ? `, ${MAIN_PRODUCTS.find((m) => m.id === d.mainProduct)?.name ?? ''}` : ''}
                  {d.sameProduct === false ? ' (changed from the proposal)' : ''}
                </dd>
              </div>
              <div>
                <dt>Electrical</dt>
                <dd>{d.electrical.length ? `${d.electrical.map((x) => `${x.item} ${x.watts} W`).join(', ')} = ${d.electrical.reduce((n, x) => n + x.watts, 0)} W` : 'None'}</dd>
              </div>
              <div>
                <dt>Leader phone</dt>
                <dd>{d.leaderPhone ?? '–'}</dd>
              </div>
            </dl>
          ) : (
            <p className="muted">The team has not filled in their stall details yet.</p>
          )}
        </section>
        {(['deposit', 'rental'] as const).map((k) => (
          <PaymentReview key={k} kind={k} stallNumber={row.stallNumber} payment={row[k]} onChanged={onChanged} />
        ))}
        <div className="row-actions">
          <button type="button" className="btn btn--dark btn--small" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function PaymentReview({ kind, stallNumber, payment, onChanged }: { kind: PaymentKind; stallNumber: number; payment: Payment | null; onChanged: () => Promise<void> }) {
  const info = PAYMENTS[kind];
  const [note, setNote] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const patch = async (body: Record<string, unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/admin/payments', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(out.error ?? 'Could not save.');
        return;
      }
      setRejecting(false);
      setNote('');
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`pay-review pay-review--${kind}`}>
      <header className="pay-review-head">
        <h4>
          RM{info.amount} {info.title.toLowerCase()}
        </h4>
        <Pill p={payment} />
      </header>
      <p className="muted small">
        {info.payee}. Reference {paymentReference(kind, stallNumber)}.
      </p>
      {!payment ? (
        <p className="muted">The leader has not submitted this payment.</p>
      ) : (
        <>
          <dl className="pay-dl">
            <div>
              <dt>Paid on</dt>
              <dd>{fmt(payment.paidOn) || '–'}</dd>
            </div>
            <div>
              <dt>Submitted</dt>
              <dd>
                {fmt(payment.submittedAt)} by {payment.submittedBy}
              </dd>
            </div>
            {payment.reviewedAt && (
              <div>
                <dt>Checked</dt>
                <dd>
                  {fmt(payment.reviewedAt)} by {payment.reviewedBy}
                  {payment.reviewNote ? `: ${payment.reviewNote}` : ''}
                </dd>
              </div>
            )}
          </dl>
          <div className="row-actions">
            <a className="btn btn--line btn--small" href={payment.receiptUrl ?? `/api/admin/payments?file=receipt&id=${payment.id}`} target="_blank" rel="noreferrer">
              {payment.receiptUrl ? 'Receipt in Drive' : 'Open receipt'}
            </a>
            {payment.hasStatement && (
              <a className="btn btn--line btn--small" href={payment.statementUrl ?? `/api/admin/payments?file=statement&id=${payment.id}`} target="_blank" rel="noreferrer">
                {payment.statementUrl ? 'Bank statement in Drive' : 'Open bank statement'}
              </a>
            )}
          </div>

          {kind === 'deposit' && (
            <details className="pay-payer">
              <summary>Payer details (private)</summary>
              <dl className="pay-dl pay-dl--grid">
                {PAYER_FIELDS.map((f) => (
                  <div key={f}>
                    <dt>{PAYER_LABEL[f]}</dt>
                    <dd>{payment.payer[f] ?? '–'}</dd>
                  </div>
                ))}
              </dl>
            </details>
          )}

          {err && <p className="note note--bad">{err}</p>}
          {rejecting ? (
            <div className="stack">
              <label className="field">
                <span>What should the team fix? They will see this.</span>
                <textarea rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="The receipt does not show the amount. Upload the full screenshot." />
              </label>
              <div className="row-actions">
                <button type="button" className="btn btn--danger btn--small" disabled={busy || !note.trim()} onClick={() => void patch({ id: payment.id, status: 'rejected', note })}>
                  Reject and tell the team
                </button>
                <button type="button" className="btn btn--line btn--small" onClick={() => setRejecting(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="row-actions">
              {payment.status !== 'verified' && (
                <button type="button" className="btn btn--go btn--small" disabled={busy} onClick={() => void patch({ id: payment.id, status: 'verified' })}>
                  Verify payment
                </button>
              )}
              {payment.status !== 'rejected' && (
                <button type="button" className="btn btn--line btn--small" disabled={busy} onClick={() => setRejecting(true)}>
                  Reject
                </button>
              )}
              {payment.status !== 'pending' && (
                <button type="button" className="btn btn--quiet btn--small" disabled={busy} onClick={() => void patch({ id: payment.id, status: 'pending' })}>
                  Undo check
                </button>
              )}
            </div>
          )}

          {kind === 'deposit' && (
            <label className="field pay-refund">
              <span>RM20 cleaning deposit, after the carnival</span>
              <select value={payment.refundStatus ?? 'held'} disabled={busy} onChange={(e) => void patch({ id: payment.id, refund: e.target.value })}>
                {(Object.keys(REFUND) as RefundStatus[]).map((r) => (
                  <option key={r} value={r}>
                    {REFUND[r]}
                  </option>
                ))}
              </select>
            </label>
          )}
        </>
      )}
    </section>
  );
}

const DRIVE_MSG: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: 'Google Drive connected. New receipts go to the LEED 26 payments folder.' },
  cancelled: { ok: false, text: 'Connecting Google Drive was cancelled.' },
  expired: { ok: false, text: 'That took too long. Try connecting again.' },
  failed: { ok: false, text: 'Google Drive could not be connected. Check that the Drive API is on and the redirect address is added, then try again.' },
  denied: { ok: false, text: 'Only admins can connect Google Drive.' },
  'no-google': { ok: false, text: 'Set up UTHM SSO (Google) first: Drive uses the same Google sign-in.' },
};

/** Where receipts are kept: the committee's Google Drive, once connected. */
function DriveCard() {
  const [st, setSt] = useState<{ connected: boolean; account: string | null; folderUrl: string | null; canConnect: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/drive', { cache: 'no-store' }).catch(() => null);
    if (res?.ok) setSt(await res.json());
  }, []);

  useEffect(() => {
    void load();
    const q = new URLSearchParams(window.location.search).get('drive');
    if (q && DRIVE_MSG[q]) setMsg(DRIVE_MSG[q]);
  }, [load]);

  const disconnect = async () => {
    if (!window.confirm('Disconnect Google Drive? Files already in Drive stay there. New receipts will be kept in the LEED 26 database.')) return;
    setBusy(true);
    await fetch('/api/admin/drive', { method: 'DELETE' }).catch(() => null);
    setBusy(false);
    setMsg(null);
    void load();
  };

  return (
    <div className={`pay-drive${st?.connected ? ' is-on' : ''}`}>
      <span className="pay-drive-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M8 3h8l6 10-4 7H6l-4-7zM8 3l6 10M16 3l-6 10M2 13h20" />
        </svg>
      </span>
      <div className="pay-drive-text">
        <strong>{st?.connected ? 'Receipts go to Google Drive' : 'Keep receipts in Google Drive'}</strong>
        <small>
          {st == null
            ? 'Checking…'
            : st.connected
              ? `Connected as ${st.account}. Each upload lands in LEED 26 payments, and the Excel files link to it. Share that folder with the committee.`
              : 'Connect the Google account whose Drive should hold every receipt and bank statement. Until then they are kept in the database.'}
        </small>
        {msg && <small className={msg.ok ? 'pay-drive-ok' : 'pay-drive-bad'}>{msg.text}</small>}
      </div>
      <div className="pay-drive-actions">
        {st?.connected ? (
          <>
            {st.folderUrl && (
              <a className="btn btn--line btn--small" href={st.folderUrl} target="_blank" rel="noreferrer">
                Open folder
              </a>
            )}
            <button type="button" className="btn btn--quiet btn--small" onClick={() => void disconnect()} disabled={busy}>
              Disconnect
            </button>
          </>
        ) : (
          <a className={`btn btn--go btn--small${st && !st.canConnect ? ' is-disabled' : ''}`} href="/api/admin/drive/connect" aria-disabled={st ? !st.canConnect : undefined}>
            Connect Google Drive
          </a>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Export: preview first, regenerate, then Excel, CSV or PDF
// ---------------------------------------------------------------------------

interface PreviewCell {
  text: string;
  style?: string;
  link?: string;
}
interface Preview {
  title: string;
  generatedAt: string;
  sheets: { name: string; title: string; subtitle: string; rows: PreviewCell[][] }[];
}

const EXPORT_NAME: Record<ExportKind, string> = { rm40: 'RM40 deposit', rm70: 'RM70 rental', details: 'Stall details' };
const FORMATS = [
  { id: 'xlsx', label: 'Excel', note: 'Every sheet, with the logo, colours and links.' },
  { id: 'csv', label: 'CSV', note: 'Only the sheet you are looking at, as plain data.' },
  { id: 'pdf', label: 'PDF', note: 'Opens a print-ready page. Choose “Save as PDF” in the print window.' },
] as const;

function ExportDialog({ kind, onClose }: { kind: ExportKind | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<Preview | null>(null);
  const [sheet, setSheet] = useState(0);
  const [format, setFormat] = useState<(typeof FORMATS)[number]['id']>('xlsx');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (k: ExportKind) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/payments?export=${k}&format=preview`, { cache: 'no-store' });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error ?? 'Could not build the preview.');
      if (!Array.isArray(out.sheets)) throw new Error('Could not build the preview.');
      setData(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not build the preview.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (kind) {
      setData(null);
      setSheet(0);
      setFormat('xlsx');
      void load(kind);
      if (!d.open) d.showModal();
    } else if (d.open) d.close();
  }, [kind, load]);

  const current = data?.sheets[Math.min(sheet, (data?.sheets.length ?? 1) - 1)];
  // Spacer columns that only exist to make room for the logo in Excel.
  const emptyCols = new Set<number>();
  if (current) {
    const width = Math.max(0, ...current.rows.map((r) => r.length));
    for (let j = 0; j < width; j++) if (current.rows.every((r) => !r[j]?.text)) emptyCols.add(j);
  }
  const href = kind ? `/api/admin/payments?export=${kind}&format=${format}${format === 'csv' && current ? `&sheet=${encodeURIComponent(current.name)}` : ''}` : '#';
  const at = data ? new Date(data.generatedAt).toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit', second: '2-digit' }) : '';

  return (
    <dialog ref={ref} className="viewer xp" onClose={onClose} aria-labelledby="xp-title">
      {kind && (
        <div className="xp-card">
          <header className="xp-head">
            <div>
              <h2 id="xp-title">{EXPORT_NAME[kind]} export</h2>
              <p>{loading ? 'Building the preview with the latest data…' : data ? `Preview built at ${at}. Download uses the data at that moment.` : ' '}</p>
            </div>
            <button type="button" className="btn btn--line btn--small" onClick={() => void load(kind)} disabled={loading}>
              {loading ? 'Regenerating…' : 'Regenerate'}
            </button>
          </header>

          {error && <p className="note note--bad">{error}</p>}

          {data && (
            <>
              <div className="xp-tabs" role="tablist" aria-label="Sheets">
                {data.sheets.map((s, i) => (
                  <button key={s.name} type="button" role="tab" aria-selected={i === sheet} className="xp-tab" onClick={() => setSheet(i)}>
                    {s.name}
                  </button>
                ))}
              </div>
              {current && (
                <div className={`xp-sheet${loading ? ' is-loading' : ''}`}>
                  <div className="xp-band">
                    <strong>{current.title}</strong>
                    <small>{current.subtitle}</small>
                  </div>
                  <div className="xp-scroll">
                    <table className="xp-table">
                      <tbody>
                        {current.rows.map((r, i) => (
                          <tr key={i}>
                            {r.map((c, j) => {
                              if (emptyCols.has(j)) return null;
                              const Tag = c.style === 'head' ? 'th' : 'td';
                              return (
                                <Tag key={j} className={c.style ? `xc-${c.style}` : undefined}>
                                  {c.link ? (
                                    <a href={c.link} target="_blank" rel="noreferrer">
                                      {c.text}
                                    </a>
                                  ) : (
                                    c.text
                                  )}
                                </Tag>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          <footer className="xp-foot">
            <div className="xp-formats" role="radiogroup" aria-label="Format">
              {FORMATS.map((f) => (
                <label key={f.id} className={format === f.id ? 'is-on' : undefined}>
                  <input type="radio" name="xp-format" value={f.id} checked={format === f.id} onChange={() => setFormat(f.id)} />
                  <span>{f.label}</span>
                </label>
              ))}
            </div>
            <small className="xp-note">
              {FORMATS.find((f) => f.id === format)?.note}
              {format === 'csv' && current ? ` (${current.name})` : ''}
            </small>
            <div className="row-actions">
              <button type="button" className="btn btn--line btn--small" onClick={onClose}>
                Close
              </button>
              <a
                className={`btn btn--go btn--small${!data || loading ? ' is-disabled' : ''}`}
                href={href}
                {...(format === 'pdf' ? { target: '_blank', rel: 'noreferrer' } : { download: true })}
              >
                {format === 'pdf' ? 'Open as PDF' : `Download ${format === 'xlsx' ? 'Excel' : 'CSV'}`}
              </a>
            </div>
          </footer>
        </div>
      )}
    </dialog>
  );
}
