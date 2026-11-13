import { NextResponse } from 'next/server';

/** PIN sign-in was replaced by UTHM SSO. Kept so old app versions get a clear answer. */
export async function POST() {
  return NextResponse.json({ error: 'PIN sign-in has been replaced. Sign in with UTHM SSO.' }, { status: 410 });
}
