#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

/**
 * -------------------------
 * ① 自前 .env ローダー
 * -------------------------
 * dotenv を使わず、npm install も不要。
 * OS プラットフォーム衝突（EBADPLATFORM）も回避できます。
 */
function loadEnv(envFileName = '.env') {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const envPath = path.resolve(__dirname, '..', envFileName);

  if (!fs.existsSync(envPath)) {
    console.warn(
      `⚠️ ${envFileName} が見つかりませんでした（${envPath}）。process.env の既存値を使用します。`,
    );
    return;
  }

  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;

    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

// .env の読み込み
loadEnv();

/**
 * -------------------------
 * ② Supabase クライアント設定
 * -------------------------
 */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing Supabase environment variables.');
  console.error(
    '   Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.',
  );
  console.error(
    `   現在の値: NEXT_PUBLIC_SUPABASE_URL=${SUPABASE_URL}, SUPABASE_SERVICE_ROLE_KEY=${
      SUPABASE_SERVICE_ROLE_KEY ? '[set]' : 'undefined'
    }`,
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

/**
 * -------------------------
 * ③ 接続ヘルスチェック（ミニマム版）
 * -------------------------
 */
async function checkConnection() {
  const results = [];

  try {
    // 1. clinics テーブルへの接続確認
    const { data: clinics, error: clinicsError } = await supabase
      .from('clinics')
      .select('id, name')
      .limit(1);

    if (clinicsError) {
      throw new Error(`clinics table query failed: ${clinicsError.message}`);
    }
    results.push('✅ clinics table reachable');

    // 2. 任意: patients テーブル
    let patients = null;
    try {
      const { data, error } = await supabase.from('patients').select('id').limit(1);
      if (error) {
        console.warn(`⚠️ patients table query warning: ${error.message}`);
      } else {
        patients = data;
        results.push('✅ patients table reachable');
      }
    } catch (e) {
      console.warn('⚠️ patients table check skipped due to unexpected error:', e);
    }

    // 3. 任意: revenues テーブル
    let revenues = null;
    try {
      const { data, error } = await supabase.from('revenues').select('id').limit(1);
      if (error) {
        console.warn(`⚠️ revenues table query warning: ${error.message}`);
      } else {
        revenues = data;
        results.push('✅ revenues table reachable');
      }
    } catch (e) {
      console.warn('⚠️ revenues table check skipped due to unexpected error:', e);
    }

    // サマリ表示
    console.log('--- Supabase verification summary ---');
    results.forEach((line) => console.log(line));

    if (!clinics || clinics.length === 0) {
      console.warn('⚠️ clinics table returned no rows. Seed data may be missing.');
    }
    if (patients && patients.length === 0) {
      console.warn('⚠️ patients table returned no rows.');
    }
    if (revenues && revenues.length === 0) {
      console.warn('⚠️ revenues table returned no rows.');
    }

    console.log('✅ Supabase basic connectivity checks completed.');
  } catch (error) {
    console.error('❌ Supabase verification failed.');
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

checkConnection();
