'use client';

// Admin console: every stall's registration details and its two payments (RM40 deposit to UTHM,
// RM70 rental to SELADEVS DIGITAL). Verify or reject receipts, and track the RM20 cleaning deposit refund.

import { useCallback, useEffect, useRef, useState } from 'react';
import { COURSES, LECTURERS, MAIN_PRODUCTS, PAYMENTS, paymentReference, type PaymentKind } from '@/lib/event';
import { CANOPY, PAYER_FIELDS, detailsComplete, type PayerDetails, type Payment, type PaymentRow, type RefundStatus, type StallColour } from '@/lib/shared';

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
        <a className="btn btn--dark btn--small" href="/api/admin/payments?export=xlsx" download>
          Download Excel
        </a>
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
            <a className="btn btn--line btn--small" href={`/api/admin/payments?file=receipt&id=${payment.id}`} target="_blank" rel="noreferrer">
              Open receipt
            </a>
            {payment.hasStatement && (
              <a className="btn btn--line btn--small" href={`/api/admin/payments?file=statement&id=${payment.id}`} target="_blank" rel="noreferrer">
                Open bank statement
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
