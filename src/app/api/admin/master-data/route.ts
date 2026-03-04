/**
 * /api/admin/master-data - 廃止済み
 *
 * このAPIは廃止されました。代替: /api/admin/settings
 */

import { NextResponse } from 'next/server';

const GONE_RESPONSE = {
  success: false,
  error: 'このAPIは廃止されました。/api/admin/settings をご利用ください。',
  migration_to: '/api/admin/settings',
};

export function GET() {
  return NextResponse.json(GONE_RESPONSE, { status: 410 });
}

export function POST() {
  return NextResponse.json(GONE_RESPONSE, { status: 410 });
}

export function PUT() {
  return NextResponse.json(GONE_RESPONSE, { status: 410 });
}

export function DELETE() {
  return NextResponse.json(GONE_RESPONSE, { status: 410 });
}
