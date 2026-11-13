'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import FileField from './FileField';
import { COURSES, LECTURERS, MAIN_PRODUCTS, PAYER_OPTIONS, PAYMENTS, paymentReference, type PaymentKind } from '@/lib/event';
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

      <div className="reg-pay-grid">
        {(['deposit', 'rental'] as const).map((k) => (
          <PaymentCard key={k} kind={k} stallNumber={stallNumber} payment={payments[k]} isLeader={isLeader} leaderName={leaderName} me={me} phone={details.leaderPhone} />
        ))}
      </div>
    </section>
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
  return (
    <article className="reg-card" id="reg-details">
      <header className="reg-card-head">
        <div>
          <h3>Stall details</h3>
          <p className="muted">For the committee and the electrical plan. Anyone on the team can fill this in.</p>
        </div>
        {!open && (
          <button type="button" className="btn btn--line btn--small" onClick={() => setOpen(true)}>
            Edit
          </button>
        )}
      </header>

      {msg && (
        <p className={`note note--${msg.ok ? 'ok' : 'bad'}`} role={msg.ok ? 'status' : 'alert'}>
          {msg.text}
        </p>
      )}

      {!open ? (
        <dl className="reg-summary">
          <div>
            <dt>Course</dt>
            <dd>{COURSES.find((c) => c.id === details.course)?.name ?? details.course ?? 'Not set'}</dd>
          </div>
          <div>
            <dt>Lecturer</dt>
            <dd>
              {lect ? (
                <>
                  <i className="reg-swatch" style={{ background: CANOPY[lect.colour as StallColour].fill }} aria-hidden="true" />
                  {lect.name} ({CANOPY[lect.colour as StallColour].label})
                </>
              ) : (
                'Not set'
              )}
            </dd>
          </div>
          <div>
            <dt>Group</dt>
            <dd>{details.groupNo ?? 'Not set'}</dd>
          </div>
          <div>
            <dt>Main product</dt>
            <dd>
              {details.productName ?? 'Not set'}
              {details.mainProduct ? <small>{MAIN_PRODUCTS.find((m) => m.id === details.mainProduct)?.name}</small> : null}
            </dd>
          </div>
          <div>
            <dt>Electrical</dt>
            <dd>
              {details.electrical.length === 0
                ? 'None'
                : `${details.electrical.map((x) => `${x.item} ${x.watts} W`).join(', ')} (${details.electrical.reduce((n, x) => n + x.watts, 0)} W in total)`}
            </dd>
          </div>
          <div>
            <dt>Leader&rsquo;s phone</dt>
            <dd>{details.leaderPhone ?? 'Not set'}</dd>
          </div>
        </dl>
      ) : (
        <form className="stack" onSubmit={save}>
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
              {colour && (
                <small className="reg-colour">
                  <i className="reg-swatch" style={{ background: CANOPY[colour].fill }} aria-hidden="true" />
                  Your stall colour is {CANOPY[colour].label.toLowerCase()}. Print your stall number on {CANOPY[colour].label.toLowerCase()} A4 paper.
                </small>
              )}
            </label>
          </div>
          <div className="field-row">
            <label className="field">
              <span>Group number (from your class list)</span>
              <input name="groupNo" type="number" inputMode="numeric" min={1} max={999} defaultValue={details.groupNo ?? ''} required />
            </label>
            <label className="field">
              <span>Team leader&rsquo;s phone</span>
              <input name="leaderPhone" type="tel" inputMode="tel" autoComplete="tel" defaultValue={details.leaderPhone ?? ''} placeholder="012-3456789" required />
            </label>
          </div>
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
          <fieldset className="field-set">
            <legend>Is it the same product as in your proposal?</legend>
            <div className="reg-choice">
              <label>
                <input type="radio" name="sameProduct" value="yes" defaultChecked={details.sameProduct === true} required /> Yes
              </label>
              <label>
                <input type="radio" name="sameProduct" value="no" defaultChecked={details.sameProduct === false} /> No, we changed it
              </label>
            </div>
          </fieldset>

          <fieldset className="field-set">
            <legend>Electrical items you will plug in</legend>
            <p className="muted small">Write the wattage from each item&rsquo;s label. Avoid high-power items: every stall shares one supply.</p>
            {items.length === 0 && <p className="muted small">No electrical items. Add one if you will plug anything in.</p>}
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
                  <button type="button" className="btn btn--quiet btn--small" onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label={`Remove item ${i + 1}`}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <div className="reg-elec-foot">
              <button type="button" className="btn btn--line btn--small" onClick={() => setItems([...items, { item: '', watts: 0 }])} disabled={items.length >= 12}>
                Add an item
              </button>
              {items.length > 0 && (
                <span className={watts > 2000 ? 'reg-watts-total is-high' : 'reg-watts-total'}>
                  {watts} W in total{watts > 2000 ? '. That is a lot for one stall; check with the committee.' : ''}
                </span>
              )}
            </div>
          </fieldset>

          <div className="row-actions">
            <button type="submit" className="btn btn--go" disabled={busy}>
              {busy ? 'Saving…' : 'Save stall details'}
            </button>
            {detailsComplete(details) && (
              <button type="button" className="btn btn--line" onClick={() => setOpen(false)}>
                Cancel
              </button>
            )}
          </div>
        </form>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

function CopyLine({ label, value, copy }: { label: string; value: string; copy?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="reg-pay-line">
      <dt>{label}</dt>
      <dd>
        <span>{value}</span>
        {copy && (
          <button
            type="button"
            className="reg-copy"
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

  return (
    <article className={`reg-card reg-pay reg-pay--${kind}`} id={`reg-${kind}`}>
      <header className="reg-pay-head">
        <div>
          <h3>{info.title}</h3>
          <p className="muted small">{info.breakdown}</p>
        </div>
        <p className="reg-amount">
          <small>RM</small>
          {info.amount}
        </p>
      </header>

      {payment && st && (
        <div className={`reg-status reg-status--${st.state}`} role="status">
          <strong>{st.text}</strong>
          <span>
            Submitted {fmtDate(payment.submittedAt)}
            {payment.paidOn ? `, paid on ${fmtDate(payment.paidOn)}` : ''}.
          </span>
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
          {payment.status === 'rejected' && payment.reviewNote && <p className="reg-status-note">Committee: {payment.reviewNote}</p>}
        </div>
      )}

      <div className="reg-howto">
        <h4>How to pay</h4>
        <dl className="reg-pay-lines">
          <CopyLine label="Method" value={info.method} />
          {info.details.map((d) => (
            <CopyLine key={d.label} {...d} />
          ))}
          <CopyLine label="Reference" value={ref} copy />
          <CopyLine label="Amount" value={`RM${info.amount}.00`} />
          {info.deadline && <CopyLine label="Pay by" value={fmtDate(info.deadline)} />}
        </dl>
        {info.qr && (
          <figure className="reg-qr">
            <a href={info.qr} target="_blank" rel="noreferrer" download="seladevs-duitnow-qr.jpg">
              <img src={info.qr} alt={`DuitNow QR for ${info.payee}`} width={200} height={250} loading="lazy" />
            </a>
            <figcaption>Scan with Touch &rsquo;n Go, DuitNow or your banking app. Tap to save the QR.</figcaption>
          </figure>
        )}
      </div>

      {!isLeader ? (
        <p className="reg-leader-only">
          Only your team leader{leaderName ? `, ${leaderName},` : ''} can submit this payment. You can see its progress here.
        </p>
      ) : payment?.status === 'verified' ? null : formOpen ? (
        <PaymentForm kind={kind} payment={payment} me={me} phone={phone} onCancel={payment ? () => setFormOpen(false) : undefined} />
      ) : (
        <button type="button" className="btn btn--line btn--small" onClick={() => setFormOpen(true)}>
          Replace the receipt
        </button>
      )}
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
  sulung: 'SULUNG student?',
  level: 'Level of study',
  year: 'Year of study',
  faculty: 'Faculty',
  field: 'Field of study',
  collegeType: 'Residential college',
  college: 'College name',
  refundBank: 'Bank for the RM20 refund',
  refundAccount: 'Account number for the refund',
};

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
  const p = payment?.payer ?? {};
  const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);

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

  const section = (title: string, children: ReactNode) => (
    <fieldset className="field-set">
      <legend>{title}</legend>
      {children}
    </fieldset>
  );

  return (
    <form className="stack reg-form" onSubmit={submit}>
      <h4>{payment ? 'Replace your payment' : 'After you pay, submit the receipt'}</h4>
      <div className="field-row">
        <label className="field">
          <span>Date you paid</span>
          <input name="paidOn" type="date" max={today} defaultValue={payment?.paidOn ?? ''} required />
        </label>
      </div>
      <FileField
        name="receipt"
        label="Proof of payment"
        hint="A screenshot or photo of the transfer, or the PDF receipt. Up to 5 MB."
        required
        current={payment ? { url: fileUrl(payment, 'receipt'), type: payment.receiptType, name: payment.receiptName } : null}
      />

      {kind === 'deposit' && (
        <>
          {section(
            'About the payer',
            <>
              <div className="reg-locked" aria-label="From your UTHM account">
                <Locked label="Full name" value={me.name} />
                {matricFromEmail(me.email) ? <Locked label="Matric number" value={matricFromEmail(me.email)} /> : null}
                <Locked label="Email" value={me.email} />
                <small>From your UTHM account, so you don&rsquo;t need to type them.</small>
              </div>
              {!matricFromEmail(me.email) && <Text name="matric" value={p.matric} placeholder="AI230007" />}
              <div className="field-row">
                <Text name="ic" value={p.ic} placeholder="030101-01-1234" inputMode="numeric" />
                <Text name="phone" value={p.phone ?? phone ?? ''} placeholder="012-3456789" inputMode="tel" autoComplete="tel" />
              </div>
              <Text name="address" value={p.address} placeholder="No. 1, Jalan Example, 86400 Parit Raja, Johor" autoComplete="street-address" />
              <div className="field-row">
                <Select name="state" options={PAYER_OPTIONS.states} value={p.state} />
                <Select name="gender" options={PAYER_OPTIONS.genders} value={p.gender} />
              </div>
              <div className="field-row">
                <Select name="bumiputera" options={PAYER_OPTIONS.bumiputera} value={p.bumiputera} />
                <label className="field">
                  <span>SULUNG student? (first in a B40 family to go to university)</span>
                  <select name="sulung" defaultValue={p.sulung ?? ''} required>
                    <option value="" disabled>
                      Choose
                    </option>
                    <option value="Ya">Ya</option>
                    <option value="Tidak">Tidak</option>
                  </select>
                </label>
              </div>
            </>,
          )}
          {section(
            'Studies',
            <>
              <div className="field-row">
                <Select name="level" options={PAYER_OPTIONS.levels} value={p.level} />
                <Select name="year" options={PAYER_OPTIONS.years} value={p.year} />
              </div>
              <div className="field-row">
                <Select name="faculty" options={PAYER_OPTIONS.faculties} value={p.faculty ?? 'FSKTM'} />
                <Select name="field" options={PAYER_OPTIONS.fields} value={p.field ?? 'Sains komputer'} />
              </div>
              <div className="field-row">
                <Select name="collegeType" options={PAYER_OPTIONS.collegeTypes} value={p.collegeType} />
                <Select name="college" options={PAYER_OPTIONS.colleges} value={p.college} />
              </div>
            </>,
          )}
          {section(
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
              <p className="muted small">Use an account in the payer&rsquo;s own name that is registered in SMAP, so the refund can go through.</p>
            </>,
          )}
          <p className="muted small reg-privacy">Only your team leader and the LEED committee can see these details. They are used for the refund and the university&rsquo;s programme report.</p>
        </>
      )}

      {msg && (
        <p className={`note note--${msg.ok ? 'ok' : 'bad'}`} role={msg.ok ? 'status' : 'alert'}>
          {msg.text}
        </p>
      )}
      <div className="row-actions">
        <button type="submit" className="btn btn--go" disabled={busy}>
          {busy ? 'Submitting…' : `Submit RM${PAYMENTS[kind].amount} payment`}
        </button>
        {onCancel && (
          <button type="button" className="btn btn--line" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
