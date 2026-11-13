// The two payment workbooks the committee downloads:
//   RM40  site rental and cleaning deposit (paid to UTHM): Summary, Payments, Refunds, Payer details
//   RM70  stall rental (paid to SELADEVS DIGITAL): Summary, Payments
// Each has the LEED logo, brand colours and links to every receipt (Google Drive, or the LEED site).

import { LOGO_PNG } from './brandLogo';
import { siteUrl } from './email';
import { COURSES, LECTURERS, MAIN_PRODUCTS, PAYMENTS, paymentReference, type PaymentKind } from './event';
import { CANOPY, type Payment, type PaymentRow } from './shared';
import { buildStyledXlsx, colName, type Style, type XCell, type XSheet } from './xlsxStyled';

const LOGO = Buffer.from(LOGO_PNG.base64, 'base64');
const STATUS: Record<Payment['status'] | 'none', { text: string; s: Style }> = {
  none: { text: 'Not submitted', s: 'none' },
  pending: { text: 'To check', s: 'wait' },
  verified: { text: 'Verified', s: 'ok' },
  rejected: { text: 'Rejected', s: 'bad' },
};
const REFUND = { held: 'To refund', refunded: 'Refunded', forfeited: 'Kept (stall left dirty)' } as const;

const fmtNow = () =>
  new Date().toLocaleString('en-MY', { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kuala_Lumpur' });

function fileLink(p: Payment, which: 'receipt' | 'statement'): { v: string; link: string } | null {
  const drive = which === 'receipt' ? p.receiptUrl : p.statementUrl;
  if (drive) return { v: 'Open in Drive', link: drive };
  if (which === 'statement' && !p.hasStatement) return null;
  return { v: 'Open in LEED 26', link: `${siteUrl()}/api/admin/payments?file=${which}&id=${p.id}` };
}

/** Column width (characters) to pixels, as Excel draws it. */
const px = (w: number) => Math.round(w * 7 + 5);

/** The dark band with the logo across the top of a sheet (rows 1 to 3). The title starts after the logo. */
function band(widths: number[], title: string, sub: string, tall = false): { rows: XSheet['rows']; merges: string[] } {
  const cols = widths.length;
  let start = 0;
  for (let acc = 0; start < cols && acc < LOGO_W + 18; start++) acc += px(widths[start]);
  start = Math.min(start, cols - 1);
  const last = colName(cols - 1);
  const fill = (st: Style) => Array.from({ length: cols }, () => ({ s: st }) as XCell);
  const r1 = fill('band');
  const r2 = fill('bandTitle');
  const r3 = fill('bandSub');
  r2[start] = { v: title, s: 'bandTitle' };
  r3[start] = { v: sub, s: 'bandSub' };
  const from = colName(start);
  return {
    rows: [
      { cells: r1, height: 12 },
      { cells: r2, height: 34 },
      { cells: r3, height: tall ? 46 : 34 },
      { cells: [], height: 10 },
    ],
    merges: start < cols - 1 ? [`${from}2:${last}2`, `${from}3:${last}3`] : [],
  };
}

const LOGO_W = 120;
const logo = { png: LOGO, width: LOGO_W, height: Math.round((LOGO_W * LOGO_PNG.height) / LOGO_PNG.width), col: 0, row: 0, offX: 10, offY: 4 };

/** A table: header row then data rows with alternating shading. */
function table(head: string[], rows: XCell[][], startRow: number): { rows: XSheet['rows']; filter: string } {
  const out: XSheet['rows'] = [{ cells: head.map((h) => ({ v: h, s: 'head' })), height: 30 }];
  rows.forEach((r, i) => {
    const alt = i % 2 === 1;
    out.push({
      cells: r.map((c) => {
        if (!alt || !c.s) return c;
        const altOf: Partial<Record<Style, Style>> = { text: 'textAlt', center: 'centerAlt', money: 'moneyAlt', date: 'dateAlt', mono: 'monoAlt', link: 'linkAlt' };
        return { ...c, s: altOf[c.s] ?? c.s };
      }),
      height: 22,
    });
  });
  return { rows: out, filter: `A${startRow}:${colName(head.length - 1)}${startRow + Math.max(rows.length, 1)}` };
}

function summarySheet(kind: PaymentKind, rows: PaymentRow[], by: string): XSheet {
  const info = PAYMENTS[kind];
  const ps = rows.map((r) => r[kind]);
  const count = (s: Payment['status']) => ps.filter((p) => p?.status === s).length;
  const verified = count('verified');
  const widths = [3, 22, 24, 22, 30];
  const b = band(widths, `RM${info.amount} ${kind === 'deposit' ? 'deposit' : 'rental'}`, `${info.title}, LEED 26. Paid to ${info.payee}. Exported ${fmtNow()} by ${by}.`, true);
  const line = (label: string, v: number, money = false): XSheet['rows'][number] => ({
    cells: [null, { v: label, s: 'label' }, { s: 'label' }, { v, s: money ? 'valueMoney' : 'value' }],
    height: 26,
  });
  const out: XSheet['rows'] = [
    ...b.rows,
    { cells: [null, { v: 'Payments', s: 'section' }], height: 26 },
    line('Stalls', rows.length),
    line('Submitted', ps.filter(Boolean).length),
    line('Verified', verified),
    line('To check', count('pending')),
    line('Rejected (team asked to fix)', count('rejected')),
    line('Not submitted yet', ps.filter((p) => !p).length),
    line('Verified amount', verified * info.amount, true),
    line('Expected from all stalls', rows.length * info.amount, true),
  ];
  if (kind === 'deposit') {
    const dep = rows.map((r) => r.deposit).filter((p): p is Payment => Boolean(p) && p!.status === 'verified');
    const toRefund = dep.filter((p) => (p.refundStatus ?? 'held') === 'held').length;
    out.push(
      { cells: [], height: 10 },
      { cells: [null, { v: 'RM20 cleaning deposit refunds', s: 'section' }], height: 26 },
      line('Still to refund', toRefund),
      line('Amount still to refund', toRefund * 20, true),
      line('Refunded', dep.filter((p) => p.refundStatus === 'refunded').length),
      line('Kept (stall left dirty)', dep.filter((p) => p.refundStatus === 'forfeited').length),
    );
  }
  out.push(
    { cells: [], height: 12 },
    {
      cells: [
        null,
        {
          v:
            kind === 'deposit'
              ? 'Payments: every stall and its RM40. Refunds: who gets the RM20 back and where (bank, account, statement). Payer details: the personal details the university asks for. Receipt and statement links open the file in the committee’s Google Drive (ask for the folder to be shared with you), or in LEED 26 when you are signed in as an admin.'
              : 'Payments: every stall and its RM70, with the receipt link. Links open the file in the committee’s Google Drive (ask for the folder to be shared with you), or in LEED 26 when you are signed in as an admin.',
          s: 'note',
        },
      ],
      height: 64,
    },
  );
  return {
    name: 'Summary',
    widths,
    rows: out,
    merges: [...b.merges, ...out.map((r, i) => (r.cells[1]?.s === 'label' ? `B${i + 1}:C${i + 1}` : '')).filter(Boolean), `B${out.length}:E${out.length}`],
    tab: kind === 'deposit' ? 'FF5A12A8' : 'FFFF1A9A',
    logo,
    landscape: false,
  };
}

const stallCell = (r: PaymentRow): XCell => ({ v: r.stallNumber, s: 'center' });
const colourOf = (r: PaymentRow) => (r.colour ? CANOPY[r.colour].label : '');

function paymentsSheet(kind: PaymentKind, rows: PaymentRow[]): XSheet {
  const info = PAYMENTS[kind];
  const head =
    kind === 'deposit'
      ? ['No.', 'Stall', 'Stall name', 'Colour', 'Payer', 'Matric', 'Phone', 'Paid on', 'Amount', 'Reference', 'Status', 'Receipt', 'Checked by', 'Checked on', 'Note to team']
      : ['No.', 'Stall', 'Stall name', 'Colour', 'Team leader', 'Leader phone', 'Paid on', 'Amount', 'Reference', 'Status', 'Receipt', 'Checked by', 'Checked on', 'Note to team'];
  const data = rows.map((r, i): XCell[] => {
    const p = r[kind];
    const st = STATUS[p?.status ?? 'none'];
    const who: XCell[] =
      kind === 'deposit'
        ? [{ v: p?.payer.name ?? r.leader ?? '', s: 'text' }, { v: p?.payer.matric ?? '', s: 'mono' }, { v: p?.payer.phone ?? r.details.leaderPhone ?? '', s: 'mono' }]
        : [{ v: r.leader ?? '', s: 'text' }, { v: r.details.leaderPhone ?? '', s: 'mono' }];
    const link = p ? fileLink(p, 'receipt') : null;
    return [
      { v: i + 1, s: 'center' },
      stallCell(r),
      { v: r.stallName, s: 'text' },
      { v: colourOf(r), s: 'text' },
      ...who,
      p?.paidOn ? { date: p.paidOn, s: 'date' } : { v: '', s: 'text' },
      { v: p ? p.amount : null, s: 'money' },
      { v: paymentReference(kind, r.stallNumber), s: 'mono' },
      { v: st.text, s: st.s },
      link ? { ...link, s: 'link' } : { v: '', s: 'text' },
      { v: p?.reviewedBy ?? '', s: 'text' },
      p?.reviewedAt ? { date: p.reviewedAt, s: 'date' } : { v: '', s: 'text' },
      { v: p?.reviewNote ?? '', s: 'text' },
    ];
  });
  const widths = kind === 'deposit' ? [6, 7, 26, 9, 28, 13, 14, 13, 12, 18, 14, 16, 26, 13, 34] : [6, 7, 26, 9, 28, 14, 13, 12, 18, 14, 16, 26, 13, 34];
  const b = band(widths, `RM${info.amount} ${info.title.toLowerCase()}: payments`, `Paid to ${info.payee}. One row per stall. Filter the Status column to see what still needs checking.`);
  const start = b.rows.length + 1;
  const t = table(head, data, start);
  const verifiedSum = rows.reduce((n, r) => n + (r[kind]?.status === 'verified' ? info.amount : 0), 0);
  const amountCol = head.indexOf('Amount');
  const total: XCell[] = head.map((_, j) => ({ s: j === amountCol ? 'totalMoney' : 'totalLabel' }));
  total[0] = { v: 'Verified total', s: 'totalLabel' };
  total[amountCol] = { v: verifiedSum, s: 'totalMoney' };
  const all = [...b.rows, ...t.rows, { cells: total, height: 24 }];
  return {
    name: 'Payments',
    widths,
    rows: all,
    merges: [...b.merges, `A${all.length}:${colName(amountCol - 1)}${all.length}`],
    freezeRow: start,
    autoFilter: t.filter,
    tab: kind === 'deposit' ? 'FF5A12A8' : 'FFFF1A9A',
    logo,
  };
}

function refundsSheet(rows: PaymentRow[]): XSheet {
  const head = ['No.', 'Stall', 'Stall name', 'Payer', 'Matric', 'IC number', 'Refund bank', 'Account number', 'Amount', 'Bank statement', 'Deposit', 'Refund', 'Done (tick)', 'Remarks'];
  const list = rows.filter((r) => r.deposit);
  const data = list.map((r, i): XCell[] => {
    const p = r.deposit!;
    const st = STATUS[p.status];
    const refund = p.refundStatus ?? 'held';
    const stmt = fileLink(p, 'statement');
    return [
      { v: i + 1, s: 'center' },
      stallCell(r),
      { v: r.stallName, s: 'text' },
      { v: p.payer.name ?? '', s: 'text' },
      { v: p.payer.matric ?? '', s: 'mono' },
      { v: p.payer.ic ?? '', s: 'mono' },
      { v: p.payer.refundBank ?? '', s: 'text' },
      { v: p.payer.refundAccount ?? '', s: 'mono' },
      { v: 20, s: 'money' },
      stmt ? { ...stmt, s: 'link' } : { v: '', s: 'text' },
      { v: st.text, s: st.s },
      p.status === 'verified'
        ? { v: REFUND[refund], s: refund === 'refunded' ? 'ok' : refund === 'forfeited' ? 'bad' : 'wait' }
        : { v: 'Not yet', s: 'none' },
      { v: refund === 'refunded' ? '✓' : '', s: 'tick' },
      { v: '', s: 'text' },
    ];
  });
  const widths = [6, 7, 24, 28, 13, 17, 18, 20, 11, 17, 13, 18, 11, 26];
  const b = band(widths, 'RM20 cleaning deposit: refunds', 'For the person processing refunds. Refund only rows where Deposit is Verified and Refund says To refund, after the stall was left clean.');
  const start = b.rows.length + 1;
  const t = table(head, data, start);
  const toRefund = list.filter((r) => r.deposit!.status === 'verified' && (r.deposit!.refundStatus ?? 'held') === 'held').length;
  const total: XCell[] = head.map((_, j) => ({ s: j === 8 ? 'totalMoney' : 'totalLabel' }));
  total[0] = { v: `Still to refund: ${toRefund} stalls`, s: 'totalLabel' };
  total[8] = { v: toRefund * 20, s: 'totalMoney' };
  const all = [...b.rows, ...t.rows, { cells: total, height: 24 }];
  return {
    name: 'Refunds',
    widths,
    rows: all,
    merges: [...b.merges, `A${all.length}:H${all.length}`],
    freezeRow: start,
    autoFilter: t.filter,
    tab: 'FF1FE0C2',
    logo,
  };
}

function payersSheet(rows: PaymentRow[]): XSheet {
  const head = ['No.', 'Stall', 'Name', 'Matric', 'IC number', 'Phone', 'Email', 'Address', 'State', 'Gender', 'Bumiputera', 'SULUNG', 'Level', 'Year', 'Faculty', 'Programme', 'Residential college', 'College'];
  const list = rows.filter((r) => r.deposit);
  const data = list.map((r, i): XCell[] => {
    const p = r.deposit!.payer;
    const t = (v: string | undefined, s: Style = 'text'): XCell => ({ v: v ?? '', s });
    return [
      { v: i + 1, s: 'center' },
      stallCell(r),
      t(p.name),
      t(p.matric, 'mono'),
      t(p.ic, 'mono'),
      t(p.phone, 'mono'),
      t(p.email),
      t(p.address),
      t(p.state),
      t(p.gender),
      t(p.bumiputera),
      t(p.sulung),
      t(p.level),
      t(p.year),
      t(p.faculty),
      t(p.field),
      t(p.collegeType),
      t(p.college),
    ];
  });
  const widths = [6, 7, 28, 13, 17, 14, 30, 44, 14, 11, 15, 9, 13, 9, 9, 26, 26, 34];
  const b = band(widths, 'Payer details', 'Personal details from the deposit form, as the university (PTU) asks for. Private: share only with the people who need them.');
  const start = b.rows.length + 1;
  const tb = table(head, data, start);
  return {
    name: 'Payer details',
    widths,
    rows: [...b.rows, ...tb.rows],
    merges: b.merges,
    freezeRow: start,
    autoFilter: tb.filter,
    tab: 'FFFFD91A',
    logo,
  };
}

export type ExportKind = 'rm40' | 'rm70' | 'details';

export interface ExportModel {
  kind: ExportKind;
  title: string;
  /** File name without extension. */
  file: string;
  sheets: XSheet[];
}

/** The sheets of one export; the same model becomes Excel, CSV, the print page (PDF) and the preview. */
export function exportModel(kind: ExportKind, rows: PaymentRow[], by: string): ExportModel {
  const day = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
  if (kind === 'rm40')
    return {
      kind,
      title: 'LEED 26: RM40 site rental and cleaning deposit',
      file: `leed26-rm40-deposit-${day}`,
      sheets: [summarySheet('deposit', rows, by), paymentsSheet('deposit', rows), refundsSheet(rows), payersSheet(rows)],
    };
  if (kind === 'rm70')
    return { kind, title: 'LEED 26: RM70 stall rental', file: `leed26-rm70-rental-${day}`, sheets: [summarySheet('rental', rows, by), paymentsSheet('rental', rows)] };
  return { kind, title: 'LEED 26: stall details', file: `leed26-stall-details-${day}`, sheets: [detailsSheet(rows, by)] };
}

export function toXlsx(m: ExportModel, by: string): Buffer {
  return buildStyledXlsx(m.sheets, { title: m.title, author: by });
}

/** The RM40 deposit workbook (to UTHM; includes refunds). */
export function depositWorkbook(rows: PaymentRow[], by: string): Buffer {
  return toXlsx(exportModel('rm40', rows, by), by);
}

/** The RM70 rental workbook (to SELADEVS DIGITAL). */
export function rentalWorkbook(rows: PaymentRow[], by: string): Buffer {
  return toXlsx(exportModel('rm70', rows, by), by);
}

/** Every stall's registration details, for the committee and the electrical plan. */
function detailsSheet(rows: PaymentRow[], by: string): XSheet {
  const head = ['Stall', 'Stall name', 'Colour', 'Course', 'Lecturer', 'Group', 'Team leader', 'Leader phone', 'Main product', 'Product name', 'Same as proposal', 'Electrical items', 'Total watts'];
  const data = rows.map((r): XCell[] => {
    const d = r.details;
    const watts = d.electrical.reduce((n, x) => n + x.watts, 0);
    return [
      stallCell(r),
      { v: r.stallName, s: 'text' },
      { v: colourOf(r), s: 'text' },
      { v: COURSES.find((c) => c.id === d.course)?.name ?? d.course ?? '', s: 'text' },
      { v: LECTURERS.find((l) => l.id === d.lecturer)?.name ?? '', s: 'text' },
      { v: d.groupNo ?? '', s: 'center' },
      { v: r.leader ?? '', s: 'text' },
      { v: d.leaderPhone ?? '', s: 'mono' },
      { v: MAIN_PRODUCTS.find((m) => m.id === d.mainProduct)?.name ?? '', s: 'text' },
      { v: d.productName ?? '', s: 'text' },
      { v: d.sameProduct == null ? '' : d.sameProduct ? 'Yes' : 'No', s: 'center' },
      { v: d.electrical.map((x) => `${x.item} (${x.watts} W)`).join('; '), s: 'text' },
      { v: watts || '', s: watts > 2000 ? 'bad' : 'center' },
    ];
  });
  const widths = [7, 26, 9, 34, 30, 8, 26, 14, 36, 30, 11, 50, 11];
  const b = band(widths, 'Stall details', `Course, lecturer, product and electrical items for every stall. Exported ${fmtNow()} by ${by}.`);
  const start = b.rows.length + 1;
  const t = table(head, data, start);
  return { name: 'Stall details', widths, rows: [...b.rows, ...t.rows], merges: b.merges, freezeRow: start, autoFilter: t.filter, tab: 'FFFFD91A', logo };
}

/** Every stall's registration details, for the committee and the electrical plan. */
export function detailsWorkbook(rows: PaymentRow[], by: string): Buffer {
  return toXlsx(exportModel('details', rows, by), by);
}
