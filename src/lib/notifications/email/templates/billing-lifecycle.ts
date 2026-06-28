import type { BillingEmailPayload, BillingEmailTemplateType } from '../types';
import type { Json } from '@/types/supabase';

function asRecord(value: Json): Record<string, Json | undefined> {
  return value !== null && !Array.isArray(value) && typeof value === 'object'
    ? value
    : {};
}

function stringValue(
  record: Record<string, Json | undefined>,
  key: keyof BillingEmailPayload,
  fallback = ''
) {
  const value = record[key];
  return typeof value === 'string' ? value : fallback;
}

function nullableStringValue(
  record: Record<string, Json | undefined>,
  key: keyof BillingEmailPayload
) {
  const value = record[key];
  return typeof value === 'string' ? value : null;
}

function buildPayload(payload: Json): BillingEmailPayload {
  const record = asRecord(payload);
  return {
    clinicName: stringValue(record, 'clinicName', 'Tiramisu'),
    billingState: stringValue(record, 'billingState'),
    graceUntil: nullableStringValue(record, 'graceUntil'),
    trialEnd: nullableStringValue(record, 'trialEnd'),
    currentPeriodEnd: nullableStringValue(record, 'currentPeriodEnd'),
  };
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return '未設定';
  }

  return value;
}

export function renderBillingLifecycleEmail(
  templateType: BillingEmailTemplateType,
  rawPayload: Json
): {
  subject: string;
  html: string;
  text: string;
} {
  const payload = buildPayload(rawPayload);

  const messages = {
    billing_payment_failed: {
      title: 'お支払い確認のお願い',
      body: [
        `${payload.clinicName} の契約のお支払いを確認できませんでした。`,
        `猶予期限: ${formatDate(payload.graceUntil)}`,
        '管理画面の契約管理からお支払い方法をご確認ください。',
      ],
    },
    billing_payment_recovered: {
      title: 'お支払い状態が回復しました',
      body: [
        `${payload.clinicName} の契約のお支払い状態が回復しました。`,
        '通常どおりサービスをご利用いただけます。',
      ],
    },
    billing_trial_will_end: {
      title: 'トライアル終了が近づいています',
      body: [
        `${payload.clinicName} のトライアル終了が近づいています。`,
        `トライアル終了予定: ${formatDate(payload.trialEnd)}`,
        '継続利用のため、お支払い方法をご確認ください。',
      ],
    },
    billing_access_locked: {
      title: '契約状態により一部機能が制限されています',
      body: [
        `${payload.clinicName} の契約状態により一部機能が制限されています。`,
        `現在の状態: ${payload.billingState || '未設定'}`,
        '管理画面の契約管理から契約状態をご確認ください。',
      ],
    },
  } satisfies Record<
    BillingEmailTemplateType,
    { title: string; body: string[] }
  >;

  const message = messages[templateType];
  const text = message.body.join('\n\n');
  const paragraphs = message.body.map(line => `<p>${line}</p>`).join('\n  ');

  const html = `
<!DOCTYPE html>
<html lang="ja">
<head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px">
  <h2 style="color:#2563eb">${message.title}</h2>
  ${paragraphs}
</body>
</html>`.trim();

  return {
    subject: `【${payload.clinicName}】${message.title}`,
    html,
    text,
  };
}
