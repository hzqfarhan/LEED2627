// Stall registration details and the two stall payments (RM40 deposit to UTHM, RM70 rental to
// SELADEVS DIGITAL). Like the rest of lib/, works on PostgreSQL or, without DATABASE_URL, the demo store.

import { hasDb, q } from './db';
import { demo } from './demo';
import { LECTURERS, PAYMENTS, type PaymentKind } from './event';
import {
  EMPTY_DETAILS,
  PAYER_FIELDS,
  type ElectricalItem,
  type PayerDetails,
  type Payment,
  type PaymentRow,
  type PaymentStatus,
  type RefundStatus,
  type StallColour,
  type StallDetails,
} from './shared';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

const iso = (v: unknown): string | null => (v == null ? null : v instanceof Date ? v.toISOString() : String(v));
const dateOnly = (v: unknown): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  return String(v).slice(0, 10);
};

/** Receipts and bank statements: images or PDF, up to 5 MB each. */
export const FILE_MAX_BYTES = 5 * 1024 * 1024;

export function sniffFile(b: Buffer): string | null {
  if (b.length < 8) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (b.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  return null;
}

// ---------------------------------------------------------------------------
// Registration details
// ---------------------------------------------------------------------------

function cleanElectrical(v: unknown): ElectricalItem[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => ({ item: String(x?.item ?? '').trim().slice(0, 80), watts: Math.round(Number(x?.watts)) }))
    .filter((x) => x.item && Number.isFinite(x.watts) && x.watts > 0 && x.watts <= 10000)
    .slice(0, 12);
}

const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

/** Check and tidy what the browser sent; returns an error message or the cleaned details. */
export function parseDetails(body: Row): { ok: true; details: Omit<StallDetails, 'updatedAt' | 'updatedBy'> } | { ok: false; error: string } {
  const lecturer = str(body.lecturer, 40);
  if (lecturer && !LECTURERS.some((l) => l.id === lecturer)) return { ok: false, error: 'Choose a lecturer from the list.' };
  const groupNo = body.groupNo === '' || body.groupNo == null ? null : Number(body.groupNo);
  if (groupNo !== null && (!Number.isInteger(groupNo) || groupNo < 1 || groupNo > 999)) return { ok: false, error: 'The group number must be a whole number.' };
  const phone = str(body.leaderPhone, 20);
  if (phone && !/^\+?[0-9][0-9 -]{7,18}$/.test(phone)) return { ok: false, error: 'Write the phone number with digits only, for example 012-3456789.' };
  return {
    ok: true,
    details: {
      course: str(body.course, 20),
      lecturer,
      groupNo,
      mainProduct: str(body.mainProduct, 40),
      productName: str(body.productName, 120),
      sameProduct: body.sameProduct === true || body.sameProduct === 'yes' ? true : body.sameProduct === false || body.sameProduct === 'no' ? false : null,
      electrical: cleanElectrical(body.electrical),
      leaderPhone: phone,
    },
  };
}

function toDetails(r: Row | undefined): StallDetails {
  if (!r) return { ...EMPTY_DETAILS };
  return {
    course: r.course ?? null,
    lecturer: r.lecturer ?? null,
    groupNo: r.group_no ?? null,
    mainProduct: r.main_product ?? null,
    productName: r.product_name ?? null,
    sameProduct: r.same_product ?? null,
    electrical: Array.isArray(r.electrical) ? r.electrical : [],
    leaderPhone: r.leader_phone ?? null,
    updatedAt: iso(r.updated_at),
    updatedBy: r.updated_by ?? null,
  };
}

export async function getDetails(stallNumber: number): Promise<StallDetails> {
  if (!hasDb) return demo().details[String(stallNumber)] ?? { ...EMPTY_DETAILS };
  const rows = await q<Row>(`SELECT d.* FROM stall_details d JOIN stalls s ON s.id = d.stall_id WHERE s.number = $1`, [stallNumber]);
  return toDetails(rows[0]);
}

/** Save the details. Choosing a lecturer also sets the stall's colour (each class has one). */
export async function saveDetails(stallNumber: number, d: Omit<StallDetails, 'updatedAt' | 'updatedBy'>, by: string): Promise<boolean> {
  const colour = (LECTURERS.find((l) => l.id === d.lecturer)?.colour ?? null) as StallColour | null;
  if (!hasDb) {
    const store = demo();
    const s = store.stalls.find((x) => x.number === stallNumber);
    if (!s) return false;
    store.details[String(stallNumber)] = { ...d, updatedAt: new Date().toISOString(), updatedBy: by };
    if (colour) s.colour = colour;
    return true;
  }
  const rows = await q<Row>(
    `WITH st AS (SELECT id FROM stalls WHERE number = $1)
     INSERT INTO stall_details (stall_id, course, lecturer, group_no, main_product, product_name, same_product, electrical, leader_phone, updated_by, updated_at)
     SELECT st.id, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, now() FROM st
     ON CONFLICT (stall_id) DO UPDATE SET
       course = EXCLUDED.course, lecturer = EXCLUDED.lecturer, group_no = EXCLUDED.group_no,
       main_product = EXCLUDED.main_product, product_name = EXCLUDED.product_name, same_product = EXCLUDED.same_product,
       electrical = EXCLUDED.electrical, leader_phone = EXCLUDED.leader_phone, updated_by = EXCLUDED.updated_by, updated_at = now()
     RETURNING stall_id`,
    [stallNumber, d.course, d.lecturer, d.groupNo, d.mainProduct, d.productName, d.sameProduct, JSON.stringify(d.electrical), d.leaderPhone, by],
  );
  if (!rows[0]) return false;
  if (colour) await q(`UPDATE stalls SET colour = $2, updated_at = now() WHERE number = $1`, [stallNumber, colour]);
  return true;
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

/** Keep only the known deposit-form fields, trimmed. */
export function cleanPayer(v: unknown): Partial<PayerDetails> {
  const out: Partial<PayerDetails> = {};
  if (!v || typeof v !== 'object') return out;
  for (const k of PAYER_FIELDS) {
    const val = (v as Row)[k];
    if (typeof val === 'string' && val.trim()) out[k] = val.trim().slice(0, k === 'address' ? 300 : 120);
  }
  return out;
}

/** Which deposit-form fields are still empty (all are required). */
export function missingPayerFields(p: Partial<PayerDetails>): (keyof PayerDetails)[] {
  return PAYER_FIELDS.filter((k) => !p[k]);
}

function toPayment(r: Row): Payment {
  return {
    id: r.id,
    stallNumber: r.stall_number,
    kind: r.kind,
    amount: r.amount_sen / 100,
    paidOn: dateOnly(r.paid_on),
    receiptName: r.receipt_name ?? null,
    receiptType: r.receipt_type,
    hasStatement: Boolean(r.has_statement),
    statementName: r.statement_name ?? null,
    statementType: r.statement_type ?? null,
    payer: r.payer ?? {},
    status: r.status,
    reviewNote: r.review_note ?? null,
    reviewedBy: r.reviewed_by ?? null,
    reviewedAt: iso(r.reviewed_at),
    refundStatus: r.refund_status ?? null,
    submittedBy: r.submitted_by,
    submittedAt: iso(r.submitted_at) ?? '',
  };
}

const PAYMENT_COLS = `p.id, s.number AS stall_number, p.kind, p.amount_sen, p.paid_on, p.receipt_name, p.receipt_type,
  (p.statement IS NOT NULL) AS has_statement, p.statement_name, p.statement_type, p.payer, p.status, p.review_note, p.reviewed_by, p.reviewed_at,
  p.refund_status, p.submitted_by, p.submitted_at`;

function demoToPayment(p: import('./demo').DemoPayment): Payment {
  return {
    id: p.id,
    stallNumber: p.stall,
    kind: p.kind,
    amount: p.amountSen / 100,
    paidOn: p.paidOn,
    receiptName: p.receipt.name,
    receiptType: p.receipt.type,
    hasStatement: Boolean(p.statement),
    statementName: p.statement?.name ?? null,
    statementType: p.statement?.type ?? null,
    payer: p.payer,
    status: p.status,
    reviewNote: p.reviewNote,
    reviewedBy: p.reviewedBy,
    reviewedAt: p.reviewedAt,
    refundStatus: p.refundStatus,
    submittedBy: p.submittedBy,
    submittedAt: p.submittedAt,
  };
}

export async function paymentsOf(stallNumber: number): Promise<Record<PaymentKind, Payment | null>> {
  const out: Record<PaymentKind, Payment | null> = { deposit: null, rental: null };
  if (!hasDb) {
    for (const kind of ['deposit', 'rental'] as const) {
      const p = demo().payments[`${stallNumber}:${kind}`];
      if (p) out[kind] = demoToPayment(p);
    }
    return out;
  }
  const rows = await q<Row>(`SELECT ${PAYMENT_COLS} FROM payments p JOIN stalls s ON s.id = p.stall_id WHERE s.number = $1`, [stallNumber]);
  for (const r of rows) out[r.kind as PaymentKind] = toPayment(r);
  return out;
}

export interface NewPayment {
  paidOn: string | null;
  receipt: { data: Buffer; type: string; name: string | null };
  statement: { data: Buffer; type: string; name: string | null } | null;
  payer: Partial<PayerDetails>;
}

/**
 * Save (or replace) a stall's payment. A replacement goes back to "waiting for check".
 * For the deposit, a new bank statement is optional when one is already on file.
 */
export async function submitPayment(stallNumber: number, kind: PaymentKind, p: NewPayment, by: string): Promise<boolean> {
  const amountSen = PAYMENTS[kind].amount * 100;
  if (!hasDb) {
    const store = demo();
    if (!store.stalls.some((s) => s.number === stallNumber)) return false;
    const key = `${stallNumber}:${kind}`;
    const old = store.payments[key];
    store.payments[key] = {
      id: old?.id ?? store.nextId++,
      stall: stallNumber,
      kind,
      amountSen,
      paidOn: p.paidOn,
      receipt: p.receipt,
      statement: p.statement ?? old?.statement ?? null,
      payer: p.payer,
      status: 'pending',
      reviewNote: null,
      reviewedBy: null,
      reviewedAt: null,
      refundStatus: kind === 'deposit' ? (old?.refundStatus ?? 'held') : null,
      submittedBy: by,
      submittedAt: new Date().toISOString(),
    };
    return true;
  }
  const rows = await q<Row>(
    `WITH st AS (SELECT id FROM stalls WHERE number = $1)
     INSERT INTO payments (stall_id, kind, amount_sen, paid_on, receipt, receipt_type, receipt_name, payer,
                           statement, statement_type, statement_name, status, refund_status, submitted_by, submitted_at)
     SELECT st.id, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, 'pending', $12, $13, now() FROM st
     ON CONFLICT (stall_id, kind) DO UPDATE SET
       amount_sen = EXCLUDED.amount_sen, paid_on = EXCLUDED.paid_on,
       receipt = EXCLUDED.receipt, receipt_type = EXCLUDED.receipt_type, receipt_name = EXCLUDED.receipt_name,
       payer = EXCLUDED.payer,
       statement = COALESCE(EXCLUDED.statement, payments.statement),
       statement_type = COALESCE(EXCLUDED.statement_type, payments.statement_type),
       statement_name = COALESCE(EXCLUDED.statement_name, payments.statement_name),
       status = 'pending', review_note = NULL, reviewed_by = NULL, reviewed_at = NULL,
       refund_status = COALESCE(payments.refund_status, EXCLUDED.refund_status),
       submitted_by = EXCLUDED.submitted_by, submitted_at = now()
     RETURNING id`,
    [
      stallNumber,
      kind,
      amountSen,
      p.paidOn,
      p.receipt.data,
      p.receipt.type,
      p.receipt.name,
      JSON.stringify(p.payer),
      p.statement?.data ?? null,
      p.statement?.type ?? null,
      p.statement?.name ?? null,
      kind === 'deposit' ? 'held' : null,
      by,
    ],
  );
  return rows.length > 0;
}

/** Does this stall already have a bank statement on file for the deposit? */
export async function hasStatement(stallNumber: number): Promise<boolean> {
  if (!hasDb) return Boolean(demo().payments[`${stallNumber}:deposit`]?.statement);
  const rows = await q<Row>(
    `SELECT 1 FROM payments p JOIN stalls s ON s.id = p.stall_id WHERE s.number = $1 AND p.kind = 'deposit' AND p.statement IS NOT NULL`,
    [stallNumber],
  );
  return rows.length > 0;
}

export type PaymentFileKind = 'receipt' | 'statement';

/** A receipt or bank statement. Pass stallNumber to make sure the file belongs to that stall. */
export async function paymentFile(id: number, which: PaymentFileKind, stallNumber?: number): Promise<{ data: Buffer; type: string; name: string | null } | null> {
  if (!hasDb) {
    const p = Object.values(demo().payments).find((x) => x.id === id && (stallNumber == null || x.stall === stallNumber));
    if (!p) return null;
    return which === 'receipt' ? p.receipt : p.statement;
  }
  const col = which === 'receipt' ? 'receipt' : 'statement';
  const rows = await q<Row>(
    `SELECT p.${col} AS data, p.${col}_type AS type, p.${col}_name AS name
     FROM payments p JOIN stalls s ON s.id = p.stall_id
     WHERE p.id = $1 AND ($2::int IS NULL OR s.number = $2) AND p.${col} IS NOT NULL`,
    [id, stallNumber ?? null],
  );
  return rows[0] ? { data: rows[0].data, type: rows[0].type, name: rows[0].name } : null;
}

/** Every stall with its details and both payments, for the committee. */
export async function listPaymentRows(): Promise<PaymentRow[]> {
  if (!hasDb) {
    const store = demo();
    return store.stalls
      .map((s) => {
        const leaderEmail = Object.entries(store.members).find(([, m]) => m.stall === s.number && m.isLeader)?.[0] ?? null;
        const leader = leaderEmail ? (store.users.find((u) => u.email === leaderEmail)?.name ?? leaderEmail) : null;
        const dep = store.payments[`${s.number}:deposit`];
        const ren = store.payments[`${s.number}:rental`];
        return {
          stallNumber: s.number,
          stallName: s.name,
          colour: s.colour,
          leader,
          details: store.details[String(s.number)] ?? { ...EMPTY_DETAILS },
          deposit: dep ? demoToPayment(dep) : null,
          rental: ren ? demoToPayment(ren) : null,
        };
      })
      .sort((a, b) => a.stallNumber - b.stallNumber);
  }
  const [stalls, pays] = await Promise.all([
    q<Row>(
      `SELECT s.number, s.name, s.colour, d.*,
              (SELECT COALESCE(u.name, m.email) FROM stall_members m LEFT JOIN users u ON u.email = m.email
               WHERE m.stall_id = s.id AND m.is_leader LIMIT 1) AS leader
       FROM stalls s LEFT JOIN stall_details d ON d.stall_id = s.id
       ORDER BY s.number`,
    ),
    q<Row>(`SELECT ${PAYMENT_COLS} FROM payments p JOIN stalls s ON s.id = p.stall_id`),
  ]);
  const byStall = new Map<string, Payment>();
  for (const r of pays) byStall.set(`${r.stall_number}:${r.kind}`, toPayment(r));
  return stalls.map((r) => ({
    stallNumber: r.number,
    stallName: r.name,
    colour: r.colour ?? null,
    leader: r.leader ?? null,
    details: r.stall_id ? toDetails(r) : { ...EMPTY_DETAILS },
    deposit: byStall.get(`${r.number}:deposit`) ?? null,
    rental: byStall.get(`${r.number}:rental`) ?? null,
  }));
}

/** Mark a payment verified or rejected (with a note the leader sees). Returns the payment before the change. */
export async function reviewPayment(id: number, status: PaymentStatus, note: string | null, by: string): Promise<Payment | null> {
  if (!hasDb) {
    const p = Object.values(demo().payments).find((x) => x.id === id);
    if (!p) return null;
    const before = demoToPayment(p);
    p.status = status;
    p.reviewNote = note;
    p.reviewedBy = by;
    p.reviewedAt = new Date().toISOString();
    return before;
  }
  const rows = await q<Row>(`SELECT ${PAYMENT_COLS} FROM payments p JOIN stalls s ON s.id = p.stall_id WHERE p.id = $1`, [id]);
  if (!rows[0]) return null;
  await q(`UPDATE payments SET status = $2, review_note = $3, reviewed_by = $4, reviewed_at = now() WHERE id = $1`, [id, status, note, by]);
  return toPayment(rows[0]);
}

/** Track the RM20 cleaning deposit after the carnival. */
export async function setRefund(id: number, refund: RefundStatus): Promise<Payment | null> {
  if (!hasDb) {
    const p = Object.values(demo().payments).find((x) => x.id === id && x.kind === 'deposit');
    if (!p) return null;
    const before = demoToPayment(p);
    p.refundStatus = refund;
    return before;
  }
  const rows = await q<Row>(`SELECT ${PAYMENT_COLS} FROM payments p JOIN stalls s ON s.id = p.stall_id WHERE p.id = $1 AND p.kind = 'deposit'`, [id]);
  if (!rows[0]) return null;
  await q(`UPDATE payments SET refund_status = $2 WHERE id = $1`, [id, refund]);
  return toPayment(rows[0]);
}
