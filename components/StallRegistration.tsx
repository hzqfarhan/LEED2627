'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import FileField from './FileField';
import { COLLEGE_TYPE, COURSES, LECTURERS, MAIN_PRODUCTS, PAYER_OPTIONS, PAYMENTS, paymentReference, type PaymentKind } from '@/lib/event';
import { CANOPY, detailsComplete, matricFromEmail, type ElectricalItem, type PayerDetails, type Payment, type StallColour, type StallDetails } from '@/lib/shared';

interface Props {
  stallNumber: number;
  details: StallDetails;
  payments: Record<PaymentKind, Payment | null>;
  hasPitch: boolean;
  isLeader: boolean;
  leaderName: string | null;
  /** The signed-in member, to fill in the deposit form. */
  me: { name: string; email: string };
}

type Step = { id: string; label: string; state: 'done' | 'wait' | 'todo' | 'fix'; note: string };

const PAY_STATE: Record<Payment['status'], { state: Step['state']; text: string }> = {
  pending: { state: 'wait', text: 'Waiting for the committee to check' },
  verified: { state: 'done', text: 'Verified by the committee' },
  rejected: { state: 'fix', text: 'Needs fixing' },
};

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso.length === 10 ? `${iso}T00:00:00+08:00` : iso).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

const fileUrl = (p: Payment, which: 'receipt' | 'statement') => `/api/stall/payment?id=${p.id}&file=${which}&v=${encodeURIComponent(p.submittedAt)}`;

export default function StallRegistration({ stallNumber, details, payments, hasPitch, isLeader, leaderName, me }: Props) {
  const complete = detailsComplete(details);
  const steps: Step[] = [
    { id: 'reg-details', label: 'Stall details', state: complete ? 'done' : 'todo', note: complete ? 'Saved' : 'Course, lecturer, product, electrical items' },
    { id: 'reg-pitch', label: 'Pitch video', state: hasPitch ? 'done' : 'todo', note: hasPitch ? 'Link added' : 'YouTube link on your stall details' },
    ...(['deposit', 'rental'] as const).map((k) => {
      const p = payments[k];
      return {
        id: `reg-${k}`,
        label: `RM${PAYMENTS[k].amount} ${k === 'deposit' ? 'deposit' : 'rental'}`,
        state: p ? PAY_STATE[p.status].state : ('todo' as const),
        note: p ? PAY_STATE[p.status].text : isLeader ? 'Pay, then upload the receipt' : 'Your leader pays and uploads',
      };
    }),
  ];
  const done = steps.filter((s) => s.state === 'done').length;

  return (
    <section className="reg" aria-labelledby="reg-title">
      <header className="reg-head">
        <div>
          <h2 id="reg-title">Registration and payments</h2>
          <p className="muted">Everything the committee needs from your team before the carnival, in one place.</p>
        </div>
        <p className="reg-count">
          <strong>{done}</strong> of {steps.length} done
        </p>
      </header>

      <ol className="reg-steps">
        {steps.map((s) => (
          <li key={s.id} className={`reg-step reg-step--${s.state}`}>
            <a href={`#${s.id === 'reg-pitch' ? 'reg-details' : s.id}`}>
              <span className="reg-dot" aria-hidden="true" />
              <span className="reg-step-text">
                <strong>{s.label}</strong>
                <small>{s.note}</small>
              </span>
            </a>
          </li>
        ))}
      </ol>

      <DetailsCard details={details} />

      {(['deposit', 'rental'] as const).map((k) => (
        <PaymentCard key={k} kind={k} stallNumber={stallNumber} payment={payments[k]} isLeader={isLeader} leaderName={leaderName} me={me} phone={details.leaderPhone} />
      ))}
    </section>
  );
}

// ---------------------------------------------------------------------------
// What is still needed in a form (counted live from the browser's own "required" checks)
// ---------------------------------------------------------------------------

type Missing = { label: string; el: HTMLElement };

function labelOf(el: HTMLInputElement): string {
  return (
    el.dataset.label ||
    el.closest('fieldset.reg-toggle')?.querySelector('legend')?.textContent ||
    el.closest('.field')?.querySelector(':scope > span')?.textContent ||
    el.closest('.ff')?.querySelector('.ff-label')?.textContent ||
    el.getAttribute('aria-label') ||
    el.name
  ).trim();
}

function useNeeds(deps: unknown[] = []) {
  const ref = useRef<HTMLFormElement>(null);
  const [state, setState] = useState<{ done: number; total: number; missing: Missing[] }>({ done: 0, total: 0, missing: [] });
  const scan = useCallback(() => {
    const f = ref.current;
    if (!f) return;
    const seen = new Set<string>();
    const missing: Missing[] = [];
    let total = 0;
    for (const node of Array.from(f.elements)) {
      const el = node as HTMLInputElement;
      if (!el.required || el.disabled) continue;
      const key = el.type === 'radio' ? `radio:${el.name}` : `el:${el.name || total}`;
      if (seen.has(key)) continue;
      seen.add(key);
      total++;
      if (el.validity.valueMissing) missing.push({ label: labelOf(el), el });
    }
    setState({ total, done: total - missing.length, missing });
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => scan(), [scan, ...deps]);
  return { ref, scan, ...state };
}

function jumpTo(el: HTMLElement) {
  const box = (el.closest('.field, .ff, fieldset, .reg-elec li') as HTMLElement | null) ?? el;
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const input = el as HTMLInputElement;
  if (input.type !== 'file' && input.type !== 'radio') input.focus({ preventScroll: true });
  box.classList.remove('reg-flash');
  void box.offsetWidth;
  box.classList.add('reg-flash');
}

/** Progress bar and the list of what is still empty; each item jumps to its field. */
function Needs({ done, total, missing, readyText }: { done: number; total: number; missing: Missing[]; readyText: string }) {
  const [all, setAll] = useState(false);
  if (total === 0) return null;
  const SHOW = 6;
  const shown = all ? missing : missing.slice(0, SHOW);
  const pct = Math.round((done / total) * 100);
  return (
    <div className={`reg-needs${missing.length ? '' : ' is-ready'}`} aria-live="polite">
      <div className="reg-needs-top">
        <strong>{missing.length ? `${done} of ${total} filled in` : readyText}</strong>
        <span className="reg-needs-bar" aria-hidden="true">
          <span style={{ width: `${pct}%` }} />
        </span>
      </div>
      {missing.length > 0 && (
        <div className="reg-needs-list">
          <span>Still needed:</span>
          {shown.map((m, i) => (
            <button key={`${m.label}-${i}`} type="button" className="reg-need" onClick={() => jumpTo(m.el)}>
              {m.label.replace(/\s*\(.*\)\s*$/, '').replace(/\?$/, '')}
            </button>
          ))}
          {missing.length > SHOW && (
            <button type="button" className="reg-need reg-need--more" onClick={() => setAll(!all)} aria-expanded={all}>
              {all ? 'Show less' : `+${missing.length - SHOW} more`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Pick one of a few options with a tap. */
function Toggle({ name, label, options, value, required = true }: { name: string; label: string; options: { value: string; label: string; sub?: string }[]; value?: string | null; required?: boolean }) {
  return (
    <fieldset className="reg-toggle">
      <legend>{label}</legend>
      <div className="reg-toggle-opts" style={{ ['--n' as string]: options.length }}>
        {options.map((o) => (
          <label key={o.value}>
            <input type="radio" name={name} value={o.value} defaultChecked={value === o.value} required={required} />
            <span>
              {o.label}
              {o.sub && <small>{o.sub}</small>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// Stall details
// ---------------------------------------------------------------------------

function DetailsCard({ details }: { details: StallDetails }) {
  const router = useRouter();
  const [open, setOpen] = useState(!detailsComplete(details));
  const [items, setItems] = useState<ElectricalItem[]>(details.electrical.length ? details.electrical : []);
  const [lecturer, setLecturer] = useState(details.lecturer ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const needs = useNeeds([items.length, open]);
  const colour = LECTURERS.find((l) => l.id === lecturer)?.colour as StallColour | undefined;
  const watts = items.reduce((n, x) => n + (Number(x.watts) || 0), 0);

  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/stall/details', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          course: d.get('course'),
          lecturer: d.get('lecturer'),
          groupNo: d.get('groupNo'),
          mainProduct: d.get('mainProduct'),
          productName: d.get('productName'),
          sameProduct: d.get('sameProduct'),
          leaderPhone: d.get('leaderPhone'),
          electrical: items.filter((x) => x.item.trim()),
        }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ ok: false, text: out.error ?? 'Could not save. Try again.' });
        return;
      }
      setMsg({ ok: true, text: 'Stall details saved.' });
      setOpen(false);
      router.refresh();
    } catch {
      setMsg({ ok: false, text: 'No connection. Your details were not saved.' });
    } finally {
      setBusy(false);
    }
  };

  const lect = LECTURERS.find((l) => l.id === details.lecturer);
  const summary: { label: string; value: ReactNode; missing: boolean }[] = [
    { label: 'Course', value: COURSES.find((c) => c.id === details.course)?.name ?? details.course, missing: !details.course },
    {
      label: 'Lecturer',
      value: lect ? (
        <>
          <i className="reg-swatch" style={{ background: CANOPY[lect.colour as StallColour].fill }} aria-hidden="true" />
          {lect.name} ({CANOPY[lect.colour as StallColour].label})
        </>
      ) : null,
      missing: !lect,
    },
    { label: 'Group', value: details.groupNo, missing: !details.groupNo },
    { label: 'Leader’s phone', value: details.leaderPhone, missing: !details.leaderPhone },
    {
      label: 'Main product',
      value: details.productName ? (
        <>
          {details.productName}
          <small>{MAIN_PRODUCTS.find((m) => m.id === details.mainProduct)?.name}</small>
        </>
      ) : null,
      missing: !details.productName || !details.mainProduct,
    },
    { label: 'Same as proposal', value: details.sameProduct == null ? null : details.sameProduct ? 'Yes' : 'No, changed', missing: details.sameProduct == null },
    {
      label: 'Electrical',
      value:
        details.electrical.length === 0
          ? 'None'
          : `${details.electrical.map((x) => `${x.item} ${x.watts} W`).join(', ')} (${details.electrical.reduce((n, x) => n + x.watts, 0)} W)`,
      missing: false,
    },
  ];
  const missingCount = summary.filter((s) => s.missing).length;

  return (
    <article className={`reg-card reg-details${detailsComplete(details) ? ' is-done' : ''}`} id="reg-details">
      <header className="reg-card-head">
        <span className="reg-card-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M4 9h16l-1.5-4h-13zM5 9v10h14V9M9 19v-5h6v5" />
          </svg>
        </span>
        <div>
          <h3>Stall details</h3>
          <p className="muted">For the committee and the electrical plan. Anyone on the team can fill this in.</p>
        </div>
        {!open ? (
          <button type="button" className="btn btn--line btn--small" onClick={() => setOpen(true)}>
            {missingCount ? 'Finish' : 'Edit'}
          </button>
        ) : null}
      </header>

      {msg && (
        <p className={`note note--${msg.ok ? 'ok' : 'bad'}`} role={msg.ok ? 'status' : 'alert'}>
          {msg.text}
        </p>
      )}

      {!open ? (
        <dl className="reg-summary">
          {summary.map((s) => (
            <div key={s.label} className={s.missing ? 'is-missing' : undefined}>
              <dt>{s.label}</dt>
              <dd>{s.missing ? <span className="reg-missing-tag">Still needed</span> : s.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <form className="stack" onSubmit={save} ref={needs.ref} onInput={needs.scan} onChange={needs.scan}>
          <Needs done={needs.done} total={needs.total} missing={needs.missing} readyText="All filled in. Press Save." />
          <div className="reg-group">
            <h4 className="reg-group-title">Class</h4>
            <div className="field-row">
              <label className="field">
                <span>Course</span>
                <select name="course" defaultValue={details.course ?? ''} required>
                  <option value="" disabled>
                    Choose your course
                  </option>
                  {COURSES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Lecturer</span>
                <select name="lecturer" value={lecturer} onChange={(e) => setLecturer(e.target.value)} required>
                  <option value="" disabled>
                    Choose your lecturer
                  </option>
                  {LECTURERS.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} ({CANOPY[l.colour as StallColour].label})
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {colour && (
              <p className="reg-colour" style={{ ['--c' as string]: CANOPY[colour].fill }}>
                <i className="reg-swatch" style={{ background: CANOPY[colour].fill }} aria-hidden="true" />
                Your stall colour is <strong>{CANOPY[colour].label.toLowerCase()}</strong>. Print your stall number on {CANOPY[colour].label.toLowerCase()} A4 paper.
              </p>
            )}
            <div className="field-row">
              <label className="field">
                <span>Group number (from your class list)</span>
                <input name="groupNo" type="number" inputMode="numeric" min={1} max={999} defaultValue={details.groupNo ?? ''} required />
              </label>
              <label className="field">
                <span>Team leader’s phone</span>
                <input name="leaderPhone" type="tel" inputMode="tel" autoComplete="tel" defaultValue={details.leaderPhone ?? ''} placeholder="012-3456789" required />
              </label>
            </div>
          </div>

          <div className="reg-group">
            <h4 className="reg-group-title">What you sell</h4>
            <div className="field-row">
              <label className="field">
                <span>Main product (pick one)</span>
                <select name="mainProduct" defaultValue={details.mainProduct ?? ''} required>
                  <option value="" disabled>
                    Choose one
                  </option>
                  {MAIN_PRODUCTS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Product name</span>
                <input name="productName" maxLength={120} defaultValue={details.productName ?? ''} placeholder="Bubble waffle with pandan kaya" required />
              </label>
            </div>
            <Toggle
              name="sameProduct"
              label="Same product as in your proposal?"
              value={details.sameProduct == null ? null : details.sameProduct ? 'yes' : 'no'}
              options={[
                { value: 'yes', label: 'Yes' },
                { value: 'no', label: 'No, we changed it' },
              ]}
            />
          </div>

          <div className="reg-group">
            <h4 className="reg-group-title">Electrical items you will plug in</h4>
            <p className="muted small">Write the wattage from each item’s label. Avoid high-power items: every stall shares one supply. Leave this empty if you plug nothing in.</p>
            {items.length > 0 && (
              <ul className="reg-elec">
                {items.map((x, i) => (
                  <li key={i}>
                    <input
                      aria-label={`Item ${i + 1}`}
                      placeholder="Waffle maker"
                      value={x.item}
                      maxLength={80}
                      onChange={(e) => setItems(items.map((y, j) => (j === i ? { ...y, item: e.target.value } : y)))}
                      required
                    />
                    <span className="reg-watts">
                      <input
                        aria-label={`Watts for item ${i + 1}`}
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={10000}
                        placeholder="1000"
                        value={x.watts || ''}
                        onChange={(e) => setItems(items.map((y, j) => (j === i ? { ...y, watts: Number(e.target.value) } : y)))}
                        required
                      />
                      W
                    </span>
                    <button type="button" className="reg-elec-x" onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label={`Remove item ${i + 1}`}>
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="reg-elec-foot">
              <button type="button" className="btn btn--line btn--small" onClick={() => setItems([...items, { item: '', watts: 0 }])} disabled={items.length >= 12}>
                + Add an item
              </button>
              {items.length > 0 && (
                <span className={watts > 2000 ? 'reg-watts-total is-high' : 'reg-watts-total'}>
                  {watts} W in total{watts > 2000 ? '. That is a lot for one stall; check with the committee.' : ''}
                </span>
              )}
            </div>
          </div>

          <div className="reg-submitbar">
            <span className="reg-submitbar-text">{needs.missing.length ? `${needs.missing.length} still needed` : 'Ready to save'}</span>
            <div className="row-actions">
              {detailsComplete(details) && (
                <button type="button" className="btn btn--line" onClick={() => setOpen(false)}>
                  Cancel
                </button>
              )}
              <button type="submit" className="btn btn--go" disabled={busy}>
                {busy ? 'Saving…' : 'Save stall details'}
              </button>
            </div>
          </div>
        </form>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

function CopyLine({ label, value, copy, big }: { label: string; value: string; copy?: boolean; big?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={`reg-pay-line${big ? ' is-big' : ''}`}>
      <dt>{label}</dt>
      <dd>
        <span>{value}</span>
        {copy && (
          <button
            type="button"
            className="reg-copy"
            aria-label={`Copy ${label.toLowerCase()}`}
            onClick={() => {
              void navigator.clipboard?.writeText(label === 'Reference' ? value : value.replace(/[\s-]/g, '')).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              });
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </dd>
    </div>
  );
}

function PaymentCard({
  kind,
  stallNumber,
  payment,
  isLeader,
  leaderName,
  me,
  phone,
}: {
  kind: PaymentKind;
  stallNumber: number;
  payment: Payment | null;
  isLeader: boolean;
  leaderName: string | null;
  me: { name: string; email: string };
  phone: string | null;
}) {
  const info = PAYMENTS[kind];
  const ref = paymentReference(kind, stallNumber);
  const [formOpen, setFormOpen] = useState(!payment || payment.status === 'rejected');
  const st = payment ? PAY_STATE[payment.status] : null;
  const needs =
    kind === 'deposit'
      ? ['Pay RM40 by bank transfer', 'Date you paid and the receipt', 'Payer details for the university', 'Refund bank account and a bank statement']
      : ['Pay RM70 by Touch ’n Go or DuitNow QR', 'Date you paid and the receipt'];

  return (
    <article className={`reg-card reg-pay reg-pay--${kind}${st ? ` is-${st.state}` : ''}`} id={`reg-${kind}`}>
      <header className="reg-pay-head">
        <span className="reg-card-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d={kind === 'deposit' ? 'M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18' : 'M3 7h18v12H3zM3 11h18M7 15h4'} />
          </svg>
        </span>
        <div className="reg-pay-title">
          <h3>{info.title}</h3>
          <p className="muted small">{info.breakdown}</p>
        </div>
        <p className="reg-amount">
          <small>RM</small>
          {info.amount}
        </p>
      </header>

      {payment && st ? (
        <div className={`reg-status reg-status--${st.state}`} role="status">
          <strong>{st.text}</strong>
          <span>
            Submitted {fmtDate(payment.submittedAt)}
            {payment.paidOn ? `, paid on ${fmtDate(payment.paidOn)}` : ''}.
          </span>
          {payment.status === 'rejected' && payment.reviewNote && <p className="reg-status-note">Committee: {payment.reviewNote}</p>}
          {isLeader && !formOpen && (
            <a className="reg-receipt" href={fileUrl(payment, 'receipt')} target="_blank" rel="noreferrer">
              {payment.receiptType.startsWith('image/') ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fileUrl(payment, 'receipt')} alt="" />
              ) : (
                <span className="ff-pdf" aria-hidden="true">
                  PDF
                </span>
              )}
              <span>
                <strong>{payment.receiptName ?? 'Your receipt'}</strong>
                <small>Tap to open</small>
              </span>
            </a>
          )}
        </div>
      ) : (
        <div className="reg-what">
          <strong>What you need</strong>
          <ul>
            {needs.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="reg-pay-body">
        <section className="reg-pay-step reg-howto" aria-label="Step 1: pay">
          <h4>
            <span className="reg-num">1</span> Pay RM{info.amount}
          </h4>
          <dl className="reg-pay-lines">
            <CopyLine label="Method" value={info.method} />
            {info.details.map((d) => (
              <CopyLine key={d.label} {...d} big={d.copy} />
            ))}
            <CopyLine label="Reference" value={ref} copy big />
            <CopyLine label="Amount" value={`RM${info.amount}.00`} big />
            {info.deadline && <CopyLine label="Pay by" value={fmtDate(info.deadline)} />}
          </dl>
          <p className="reg-ref-tip">Write the reference exactly, so the committee can match your payment to your stall.</p>
          {info.qr && (
            <figure className="reg-qr">
              <a href={info.qr} target="_blank" rel="noreferrer" download="seladevs-duitnow-qr.jpg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={info.qr} alt={`DuitNow QR for ${info.payee}`} width={220} height={275} loading="lazy" />
              </a>
              <figcaption>Scan with Touch ’n Go, DuitNow or your banking app. Tap the QR to save it.</figcaption>
            </figure>
          )}
        </section>

        <section className="reg-pay-step reg-pay-proof" aria-label="Step 2: send the proof">
          <h4>
            <span className="reg-num">2</span> Send the proof
          </h4>
          {!isLeader ? (
            <p className="reg-leader-only">
              Only your team leader{leaderName ? `, ${leaderName},` : ''} can submit this payment. You can follow its progress here.
            </p>
          ) : payment?.status === 'verified' ? (
            <p className="reg-done-note">Done. The committee verified this payment.</p>
          ) : formOpen ? (
            <PaymentForm kind={kind} payment={payment} me={me} phone={phone} onCancel={payment && payment.status !== 'rejected' ? () => setFormOpen(false) : undefined} />
          ) : (
            <div className="stack">
              <p className="muted">Your receipt is with the committee. Replace it only if you sent the wrong file.</p>
              <div>
                <button type="button" className="btn btn--line btn--small" onClick={() => setFormOpen(true)}>
                  Replace the receipt
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </article>
  );
}

const PAYER_LABELS: Record<keyof PayerDetails, string> = {
  name: 'Full name (payer)',
  matric: 'Matric number',
  ic: 'IC number',
  phone: 'Phone number',
  email: 'Email',
  address: 'Home address',
  state: 'State',
  gender: 'Gender',
  bumiputera: 'Bumiputera status',
  sulung: 'SULUNG student? (first in a B40 family to go to university)',
  level: 'Level of study',
  year: 'Year of study',
  faculty: 'Faculty',
  field: 'Programme',
  collegeType: 'Residential college',
  college: 'College name',
  refundBank: 'Bank for the RM20 refund',
  refundAccount: 'Account number for the refund',
};

function Select({ name, options, value }: { name: keyof PayerDetails; options: readonly string[]; value?: string }) {
  return (
    <label className="field">
      <span>{PAYER_LABELS[name]}</span>
      <select name={name} defaultValue={value ?? ''} required>
        <option value="" disabled>
          Choose
        </option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function Text({ name, value, ...rest }: { name: keyof PayerDetails; value?: string; placeholder?: string; inputMode?: 'numeric' | 'tel' | 'email' | 'text'; autoComplete?: string; type?: string }) {
  return (
    <label className="field">
      <span>{PAYER_LABELS[name]}</span>
      <input name={name} defaultValue={value ?? ''} required maxLength={name === 'address' ? 300 : 120} {...rest} />
    </label>
  );
}

function Locked({ label, value }: { label: string; value: string }) {
  return (
    <div className="reg-locked-row">
      <span>{label}</span>
      <strong>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z" />
        </svg>
        {value}
      </strong>
    </div>
  );
}

/** The college decides the residence type (in or outside campus), so only the college is picked. */
function CollegePicker({ value }: { value?: string }) {
  const [college, setCollege] = useState(value ?? '');
  const type = COLLEGE_TYPE[college] ?? '';
  return (
    <>
      <label className="field">
        <span>{PAYER_LABELS.college}</span>
        <select name="college" value={college} onChange={(e) => setCollege(e.target.value)} required>
          <option value="" disabled>
            Choose
          </option>
          {PAYER_OPTIONS.colleges.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
      <input type="hidden" name="collegeType" value={type} />
      <div className="reg-auto">
        <span>{PAYER_LABELS.collegeType}</span>
        <div className="reg-toggle-opts reg-toggle-opts--auto" style={{ ['--n' as string]: 3 }} aria-live="polite">
          {PAYER_OPTIONS.collegeTypes.map((t) => (
            <span key={t} className={t === type ? 'is-on' : undefined}>
              {t.replace('Kolej Kediaman ', '')}
            </span>
          ))}
        </div>
        <small>{type ? 'Set from your college.' : 'Set automatically when you choose your college.'}</small>
      </div>
    </>
  );
}

const opts = (list: readonly string[], label?: (s: string) => string) => list.map((v) => ({ value: v, label: label ? label(v) : v }));

function PaymentForm({
  kind,
  payment,
  me,
  phone,
  onCancel,
}: {
  kind: PaymentKind;
  payment: Payment | null;
  me: { name: string; email: string };
  phone: string | null;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const needs = useNeeds();
  const p = payment?.payer ?? {};
  const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
  const matric = matricFromEmail(me.email);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = new FormData();
    body.set('kind', kind);
    body.set('paidOn', String(f.get('paidOn') ?? ''));
    const receipt = f.get('receipt');
    if (receipt instanceof File && receipt.size) body.set('receipt', receipt);
    if (kind === 'deposit') {
      const payer: Record<string, string> = {};
      for (const k of Object.keys(PAYER_LABELS)) payer[k] = String(f.get(k) ?? '');
      body.set('payer', JSON.stringify(payer));
      const statement = f.get('statement');
      if (statement instanceof File && statement.size) body.set('statement', statement);
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/stall/payment', { method: 'POST', body });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ ok: false, text: out.error ?? 'Could not submit. Try again.' });
        return;
      }
      setMsg({ ok: true, text: 'Submitted. The committee will check it and you will see the result here.' });
      router.refresh();
    } catch {
      setMsg({ ok: false, text: 'No connection. Your payment was not submitted.' });
    } finally {
      setBusy(false);
    }
  };

  const group = (title: string, children: ReactNode) => (
    <div className="reg-group">
      <h5 className="reg-group-title">{title}</h5>
      {children}
    </div>
  );

  return (
    <form className="stack reg-form" onSubmit={submit} ref={needs.ref} onInput={needs.scan} onChange={needs.scan}>
      <Needs done={needs.done} total={needs.total} missing={needs.missing} readyText={`All filled in. Submit your RM${PAYMENTS[kind].amount} payment.`} />

      {group(
        'Your payment',
        <>
          <label className="field">
            <span>Date you paid</span>
            <input name="paidOn" type="date" max={today} defaultValue={payment?.paidOn ?? ''} required />
          </label>
          <FileField
            name="receipt"
            label="Proof of payment"
            hint="A screenshot of the transfer, or the PDF receipt. Up to 5 MB."
            required
            current={payment ? { url: fileUrl(payment, 'receipt'), type: payment.receiptType, name: payment.receiptName } : null}
          />
        </>,
      )}

      {kind === 'deposit' && (
        <>
          {group(
            'About the payer',
            <>
              <div className="reg-locked" aria-label="From your UTHM account">
                <Locked label="Full name" value={me.name} />
                {matric ? <Locked label="Matric number" value={matric} /> : null}
                <Locked label="Email" value={me.email} />
                <small>From your UTHM account, so you don’t need to type them.</small>
              </div>
              {!matric && <Text name="matric" value={p.matric} placeholder="AI230007" />}
              <div className="field-row">
                <Text name="ic" value={p.ic} placeholder="030101-01-1234" inputMode="numeric" />
                <Text name="phone" value={p.phone ?? phone ?? ''} placeholder="012-3456789" inputMode="tel" autoComplete="tel" />
              </div>
              <Text name="address" value={p.address} placeholder="No. 1, Jalan Example, 86400 Parit Raja, Johor" autoComplete="street-address" />
              <Select name="state" options={PAYER_OPTIONS.states} value={p.state} />
              <div className="field-row">
                <Toggle name="gender" label={PAYER_LABELS.gender} options={opts(PAYER_OPTIONS.genders)} value={p.gender} />
                <Toggle name="bumiputera" label={PAYER_LABELS.bumiputera} options={opts(PAYER_OPTIONS.bumiputera)} value={p.bumiputera} />
              </div>
              <Toggle name="sulung" label={PAYER_LABELS.sulung} options={opts(['Ya', 'Tidak'])} value={p.sulung} />
            </>,
          )}
          {group(
            'Studies',
            <>
              <Toggle name="level" label={PAYER_LABELS.level} options={opts(PAYER_OPTIONS.levels, (v) => (v === 'Doktor falsafah' ? 'PhD' : v))} value={p.level} />
              <Toggle name="year" label={PAYER_LABELS.year} options={opts(PAYER_OPTIONS.years, (v) => v.replace('Tahun ', ''))} value={p.year} />
              <Toggle
                name="field"
                label="Programme"
                value={p.field}
                options={PAYER_OPTIONS.fields.map((f) => ({ value: f, label: f.slice(0, 3), sub: f.slice(5, -1) }))}
              />
              <CollegePicker value={p.college} />
            </>,
          )}
          {group(
            'Where to refund the RM20 cleaning deposit',
            <>
              <div className="field-row">
                <Text name="refundBank" value={p.refundBank} placeholder="Maybank" />
                <Text name="refundAccount" value={p.refundAccount} placeholder="1234 5678 9012" inputMode="numeric" />
              </div>
              <FileField
                name="statement"
                label="Bank statement showing the account name and number"
                hint="The top of a statement or a screenshot from your banking app. Up to 5 MB."
                required
                current={payment?.hasStatement ? { url: fileUrl(payment, 'statement'), type: payment.statementType ?? 'application/pdf', name: payment.statementName } : null}
              />
              <p className="muted small">Use an account in the payer’s own name that is registered in SMAP, so the refund can go through.</p>
            </>,
          )}
          <p className="muted small reg-privacy">Only your team leader and the LEED committee can see these details. They are used for the refund and the university’s programme report.</p>
        </>
      )}

      {msg && (
        <p className={`note note--${msg.ok ? 'ok' : 'bad'}`} role={msg.ok ? 'status' : 'alert'}>
          {msg.text}
        </p>
      )}
      <div className="reg-submitbar">
        <span className="reg-submitbar-text">{needs.missing.length ? `${needs.missing.length} still needed` : 'Ready to submit'}</span>
        <div className="row-actions">
          {onCancel && (
            <button type="button" className="btn btn--line" onClick={onCancel}>
              Cancel
            </button>
          )}
          <button type="submit" className="btn btn--go" disabled={busy}>
            {busy ? 'Submitting…' : `Submit RM${PAYMENTS[kind].amount} payment`}
          </button>
        </div>
      </div>
    </form>
  );
}
