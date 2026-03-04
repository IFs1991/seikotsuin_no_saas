/**
 * /api/admin/master-data/export - 廃止済み
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
