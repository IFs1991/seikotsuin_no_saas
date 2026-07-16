import { NextResponse } from 'next/server';

export function POST(request: Request): Response {
  if (request.headers.has('x-deprecated-client')) {
    return NextResponse.json({ error: 'Gone' }, { status: 410 });
  }
  return NextResponse.json({ ok: true }, { status: 204 });
}
