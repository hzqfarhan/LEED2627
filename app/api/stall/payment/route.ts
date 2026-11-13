import { NextResponse } from 'next/server';
import { asActor, logEvent } from '@/lib/log';
import { getSession } from '@/lib/auth';
import { matricFromEmail } from '@/lib/shared';
import { PAYMENTS, paymentReference, type PaymentKind } from '@/lib/event';
import { longDay } from '@/lib/email';
import { notifyStall } from '@/lib/notify';
import { FILE_MAX_BYTES, cleanPayer, hasStatement, missingPayerFields, paymentFile, sniffFile, submitPayment } from '@/lib/payments';

/**
 * POST (multipart form)  submit or replace a payment. Team leader only.
 *   kind       deposit | rental
 *   paidOn     YYYY-MM-DD
 *   receipt    proof of payment (image or PDF, up to 5 MB)
 *   payer      JSON with the deposit form's personal details (deposit only)
 *   statement  bank statement showing the refund account (deposit only; optional when one is on file)
 * GET ?id=..&file=receipt|statement  the leader downloads their own stall's files.
 */

async function readFile(v: FormDataEntryValue | null): Promise<{ data: Buffer; type: string; name: string | null } | { error: string } | null> {
  if (!v || typeof v === 'string' || v.size === 0) return null;
  if (v.size > FILE_MAX_BYTES) return { error: `${v.name || 'The file'} is too big. Keep each file under 5 MB.` };
  const data = Buffer.from(await v.arrayBuffer());
  const type = sniffFile(data);
  if (!type) return { error: `${v.name || 'The file'} must be a photo (JPEG, PNG, WebP) or a PDF.` };
  return { data, type, name: v.name ? v.name.slice(0, 120) : null };
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.stall == null) return NextResponse.json({ error: 'Only stall teams can submit payments.' }, { status: 401 });
  if (!session.isLeader) return NextResponse.json({ error: 'Only your team leader can submit payments.' }, { status: 403 });
  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > FILE_MAX_BYTES * 2 + 200_000) return NextResponse.json({ error: 'The files are too big. Keep each file under 5 MB.' }, { status: 413 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Send the payment as a form.' }, { status: 400 });
  const kind = String(form.get('kind') ?? '') as PaymentKind;
  if (!(kind in PAYMENTS)) return NextResponse.json({ error: 'Unknown payment.' }, { status: 400 });

  const paidOn = String(form.get('paidOn') ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn) || Number.isNaN(Date.parse(paidOn))) return NextResponse.json({ error: 'Enter the date you paid.' }, { status: 400 });
  if (Date.parse(paidOn) > Date.now() + 36 * 3600_000) return NextResponse.json({ error: 'The payment date cannot be in the future.' }, { status: 400 });

  const receipt = await readFile(form.get('receipt'));
  if (!receipt) return NextResponse.json({ error: 'Attach your proof of payment.' }, { status: 400 });
  if ('error' in receipt) return NextResponse.json({ error: receipt.error }, { status: 415 });

  let payer = {};
  let statement: Awaited<ReturnType<typeof readFile>> = null;
  if (kind === 'deposit') {
    let raw: unknown = null;
    try {
      raw = JSON.parse(String(form.get('payer') ?? '{}'));
    } catch {
      raw = null;
    }
    // Name, matric and email come from the leader's UTHM account, not from the form.
    payer = { ...cleanPayer(raw), name: session.name, email: session.email, ...(matricFromEmail(session.email) ? { matric: matricFromEmail(session.email) } : {}) };
    const missing = missingPayerFields(payer);
    if (missing.length) return NextResponse.json({ error: 'Fill in every field of the payer details.', missing }, { status: 400 });
    statement = await readFile(form.get('statement'));
    if (statement && 'error' in statement) return NextResponse.json({ error: statement.error }, { status: 415 });
    if (!statement && !(await hasStatement(session.stall))) {
      return NextResponse.json({ error: 'Attach a bank statement that shows the account name and number for the refund.' }, { status: 400 });
    }
  }

  const ok = await submitPayment(
    session.stall,
    kind,
    { paidOn, receipt, statement: statement && !('error' in statement) ? statement : null, payer },
    session.email,
  );
  if (!ok) return NextResponse.json({ error: 'Your stall could not be found.' }, { status: 404 });
  const info = PAYMENTS[kind];
  await notifyStall(
    session.stall,
    { kind: 'payment', title: `RM${info.amount} receipt received`, body: `${session.name} submitted the ${info.title.toLowerCase()}. The committee will check it.`, link: `/stall#reg-${kind}` },
    {
      subject: `LEED 26: we received your RM${info.amount} ${kind === 'deposit' ? 'deposit' : 'rental'} receipt (stall ${session.stall})`,
      content: {
        preheader: `The committee will check it and email you the result.`,
        status: { label: 'Waiting for check', tone: 'wait' },
        heading: `We received your RM${info.amount} receipt`,
        intro: [`${session.name} submitted the ${info.title.toLowerCase()} for your stall. The committee will check it and let you know here and on the LEED 26 site.`],
        rows: [
          ['Stall', String(session.stall)],
          ['Payment', `RM${info.amount}.00, ${info.title}`],
          ['Paid to', info.payee],
          ['Paid on', longDay(paidOn)],
          ['Reference', paymentReference(kind, session.stall)],
        ],
        cta: { label: 'See it on My stall', path: `/stall#reg-${kind}` },
      },
    },
  );
  await logEvent(
    asActor(session),
    'user',
    'payment.submit',
    `Submitted the RM${info.amount} ${info.title.toLowerCase()} for stall ${session.stall} (paid ${paidOn})`,
    `stall ${session.stall}`,
  );
  return NextResponse.json({ ok: true });
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session || session.stall == null || !session.isLeader) return NextResponse.json({ error: 'Only your team leader can open payment files.' }, { status: 403 });
  const url = new URL(req.url);
  const id = Number(url.searchParams.get('id'));
  const which = url.searchParams.get('file') === 'statement' ? 'statement' : 'receipt';
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Unknown file.' }, { status: 400 });
  const f = await paymentFile(id, which, session.stall);
  if (!f) return NextResponse.json({ error: 'File not found.' }, { status: 404 });
  return new NextResponse(new Uint8Array(f.data), {
    headers: {
      'Content-Type': f.type,
      'Content-Disposition': `inline; filename="${(f.name ?? which).replace(/[^\w.\- ]/g, '_')}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
