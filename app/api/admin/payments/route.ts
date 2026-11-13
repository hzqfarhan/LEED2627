import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { asActor, logEvent } from '@/lib/log';
import { PAYMENTS } from '@/lib/event';
import { longDay } from '@/lib/email';
import { notifyStall } from '@/lib/notify';
import { listPaymentRows, paymentFile, reviewPayment, setRefund } from '@/lib/payments';
import { exportModel, toXlsx, type ExportKind } from '@/lib/paymentExport';
import { toCsv, toPreview, toPrintHtml } from '@/lib/exportFormats';

/**
 * Committee only.
 * GET                              every stall with its registration details and both payments
 * GET ?file=receipt|statement&id=  open a receipt or bank statement
 * GET ?export=rm40|rm70|details&format=preview|xlsx|csv|pdf[&sheet=Refunds]
 *        rm40     RM40 deposit: summary, payments, refunds, payer details
 *        rm70     RM70 rental: summary, payments
 *        details  every stall's registration details (electrical plan)
 *        preview is JSON for the admin console; csv is one sheet; pdf is a print-ready page
 * PATCH { id, status, note }       verify or reject a payment
 * PATCH { id, refund }             deposit refund: held | refunded | forfeited
 */

async function admin() {
  const s = await getSession();
  if (!s) return { error: NextResponse.json({ error: 'Sign in as an admin.' }, { status: 401 }) };
  if (s.role !== 'admin') return { error: NextResponse.json({ error: 'Only admins can do that.' }, { status: 403 }) };
  return { session: s };
}


export async function GET(req: Request) {
  const a = await admin();
  if (a.error) return a.error;
  const url = new URL(req.url);
  const file = url.searchParams.get('file');
  if (file) {
    const id = Number(url.searchParams.get('id'));
    if (!Number.isInteger(id)) return NextResponse.json({ error: 'Unknown file.' }, { status: 400 });
    const f = await paymentFile(id, file === 'statement' ? 'statement' : 'receipt');
    if (!f) return NextResponse.json({ error: 'File not found.' }, { status: 404 });
    return new NextResponse(new Uint8Array(f.data), {
      headers: {
        'Content-Type': f.type,
        'Content-Disposition': `inline; filename="${(f.name ?? file).replace(/[^\w.\- ]/g, '_')}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }
  const rows = await listPaymentRows();
  const exp = url.searchParams.get('export');
  if (exp === 'xlsx') url.searchParams.set('export', 'rm40'); // older links
  const kind = url.searchParams.get('export') as ExportKind | null;
  if (kind === 'rm40' || kind === 'rm70' || kind === 'details') {
    const by = a.session.name;
    const model = exportModel(kind, rows, by);
    const format = url.searchParams.get('format') ?? 'xlsx';
    const what = { rm40: 'RM40 deposit', rm70: 'RM70 rental', details: 'stall details' }[kind];
    const noStore = { 'Cache-Control': 'private, no-store' };
    if (format === 'preview') return NextResponse.json(toPreview(model), { headers: noStore });
    if (format === 'csv') {
      const out = toCsv(model, url.searchParams.get('sheet'));
      await logEvent(asActor(a.session), 'admin', 'payments.export', `Downloaded the ${what} export as CSV (${out.name})`, null);
      return new NextResponse(out.csv, {
        headers: {
          ...noStore,
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${model.file}-${out.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv"`,
        },
      });
    }
    if (format === 'pdf') {
      await logEvent(asActor(a.session), 'admin', 'payments.export', `Opened the ${what} export to save as PDF`, null);
      return new NextResponse(toPrintHtml(model), { headers: { ...noStore, 'Content-Type': 'text/html; charset=utf-8' } });
    }
    await logEvent(
      asActor(a.session),
      'admin',
      'payments.export',
      `Downloaded the ${what} export as Excel${kind === 'rm40' ? ' (includes payer details and refund accounts)' : ''}`,
      null,
    );
    return new NextResponse(new Uint8Array(toXlsx(model, by)), {
      headers: {
        ...noStore,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${model.file}.xlsx"`,
      },
    });
  }
  return NextResponse.json({ rows, payments: PAYMENTS }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function PATCH(req: Request) {
  const a = await admin();
  if (a.error) return a.error;
  const body = await req.json().catch(() => null);
  const id = Number(body?.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Unknown payment.' }, { status: 400 });

  if (body.refund !== undefined) {
    if (!['held', 'refunded', 'forfeited'].includes(body.refund)) return NextResponse.json({ error: 'Unknown refund state.' }, { status: 400 });
    const before = await setRefund(id, body.refund);
    if (!before) return NextResponse.json({ error: 'Deposit not found.' }, { status: 404 });
    const words = { held: 'held', refunded: 'refunded', forfeited: 'kept (stall left dirty)' } as const;
    if (body.refund === 'refunded' || body.refund === 'forfeited') {
      const refunded = body.refund === 'refunded';
      await notifyStall(
        before.stallNumber,
        {
          kind: 'refund',
          title: refunded ? 'RM20 cleaning deposit refunded' : 'RM20 cleaning deposit kept',
          body: refunded ? `Sent to ${before.payer.refundBank ?? 'your bank'} ${before.payer.refundAccount ?? ''}`.trim() : 'The committee kept the deposit because the stall was not left clean.',
          link: '/stall#reg-deposit',
        },
        {
          subject: refunded ? `LEED 26: your RM20 cleaning deposit has been refunded (stall ${before.stallNumber})` : `LEED 26: about your RM20 cleaning deposit (stall ${before.stallNumber})`,
          content: refunded
            ? {
                preheader: 'Thank you for leaving your stall clean.',
                status: { label: 'Refunded', tone: 'good' },
                heading: 'Your RM20 cleaning deposit is on its way back',
                intro: ['Thank you for leaving your stall clean. The committee has sent the refund to the account you gave. Banks can take a few working days to show it.'],
                rows: [
                  ['Stall', String(before.stallNumber)],
                  ['Amount', 'RM20.00'],
                  ['Bank', before.payer.refundBank ?? '-'],
                  ['Account', before.payer.refundAccount ?? '-'],
                ],
              }
            : {
                preheader: 'The committee kept the deposit.',
                status: { label: 'Deposit kept', tone: 'bad' },
                heading: 'Your RM20 cleaning deposit was not refunded',
                intro: ['The committee kept the RM20 cleaning deposit because the stall was not left clean after the carnival. If you think this is a mistake, reply to this email.'],
                rows: [['Stall', String(before.stallNumber)]],
              },
        },
      );
    }
    await logEvent(asActor(a.session), 'admin', 'payment.refund', `Marked the RM20 cleaning deposit of stall ${before.stallNumber} as ${words[body.refund as keyof typeof words]}`, `stall ${before.stallNumber}`);
    return NextResponse.json({ ok: true });
  }

  if (!['verified', 'rejected', 'pending'].includes(body.status)) return NextResponse.json({ error: 'Unknown status.' }, { status: 400 });
  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 300) : null;
  if (body.status === 'rejected' && !note) return NextResponse.json({ error: 'Tell the team why, so they can fix it.' }, { status: 400 });
  const before = await reviewPayment(id, body.status, note, a.session.email);
  if (!before) return NextResponse.json({ error: 'Payment not found.' }, { status: 404 });
  const info = PAYMENTS[before.kind];
  const short = before.kind === 'deposit' ? 'deposit' : 'rental';
  if (body.status === 'verified') {
    await notifyStall(
      before.stallNumber,
      { kind: 'payment', title: `RM${info.amount} ${short} verified`, body: `The committee confirmed your ${info.title.toLowerCase()}.`, link: `/stall#reg-${before.kind}` },
      {
        subject: `LEED 26: your RM${info.amount} ${short} is verified (stall ${before.stallNumber})`,
        content: {
          preheader: `Nothing else to do for this payment.`,
          status: { label: 'Verified', tone: 'good' },
          heading: `Your RM${info.amount} ${short} is verified`,
          intro: [`The committee checked your receipt and confirmed the payment. Nothing else to do for this one.`],
          rows: [
            ['Stall', String(before.stallNumber)],
            ['Payment', `RM${info.amount}.00, ${info.title}`],
            ['Paid on', longDay(before.paidOn)],
          ],
          cta: { label: 'Open My stall', path: '/stall' },
        },
      },
    );
  } else if (body.status === 'rejected') {
    await notifyStall(
      before.stallNumber,
      { kind: 'payment', title: `RM${info.amount} ${short} needs fixing`, body: note, link: `/stall#reg-${before.kind}` },
      {
        subject: `LEED 26: please fix your RM${info.amount} ${short} receipt (stall ${before.stallNumber})`,
        content: {
          preheader: note ?? 'The committee could not confirm your payment.',
          status: { label: 'Needs fixing', tone: 'bad' },
          heading: `Your RM${info.amount} ${short} needs fixing`,
          intro: [`The committee could not confirm this payment yet. Your team leader can upload a new receipt on My stall.`],
          note: { title: 'From the committee', text: note ?? '' },
          rows: [
            ['Stall', String(before.stallNumber)],
            ['Payment', `RM${info.amount}.00, ${info.title}`],
          ],
          cta: { label: 'Upload a new receipt', path: `/stall#reg-${before.kind}` },
        },
      },
    );
  }
  await logEvent(
    asActor(a.session),
    'admin',
    `payment.${body.status}`,
    `${body.status === 'verified' ? 'Verified' : body.status === 'rejected' ? 'Rejected' : 'Reopened'} the RM${info.amount} ${info.title.toLowerCase()} of stall ${before.stallNumber}${note ? `: ${note}` : ''}`,
    `stall ${before.stallNumber}`,
  );
  return NextResponse.json({ ok: true });
}
