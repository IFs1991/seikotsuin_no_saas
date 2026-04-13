import type { ReservationEmailPayload } from '../types';

export function renderReservationUpdatedEmail(
  payload: ReservationEmailPayload
): {
  subject: string;
  html: string;
  text: string;
} {
  const {
    customerName,
    clinicName,
    startTime,
    endTime,
    staffName,
    menuName,
    changes,
  } = payload;

  const subject = `【${clinicName}】ご予約内容の変更のお知らせ`;

  const changeLines = (changes ?? [])
    .map(c => `  ${c.field}: ${c.before} → ${c.after}`)
    .join('\n');

  const text = [
    `${customerName} 様`,
    '',
    `${clinicName} のご予約内容が変更されました。`,
    '',
    '【変更内容】',
    changeLines || '  （詳細は下記をご確認ください）',
    '',
    '【変更後の予約】',
    `日時: ${startTime} ～ ${endTime}`,
    `メニュー: ${menuName}`,
    `担当: ${staffName}`,
    '',
    'ご不明な点がございましたら、お気軽にお問い合わせください。',
  ].join('\n');

  const changeRows = (changes ?? [])
    .map(
      c =>
        `<tr><td style="padding:8px;border:1px solid #e5e7eb">${c.field}</td>
             <td style="padding:8px;border:1px solid #e5e7eb">${c.before}</td>
             <td style="padding:8px;border:1px solid #e5e7eb">${c.after}</td></tr>`
    )
    .join('');

  const html = `
<!DOCTYPE html>
<html lang="ja">
<head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px">
  <h2 style="color:#f59e0b">ご予約内容の変更</h2>
  <p>${customerName} 様</p>
  <p>${clinicName} のご予約内容が変更されました。</p>
  ${
    changeRows
      ? `
  <h3>変更内容</h3>
  <table style="border-collapse:collapse;width:100%;margin:16px 0">
    <tr style="background:#f9fafb">
      <th style="padding:8px;border:1px solid #e5e7eb;text-align:left">項目</th>
      <th style="padding:8px;border:1px solid #e5e7eb;text-align:left">変更前</th>
      <th style="padding:8px;border:1px solid #e5e7eb;text-align:left">変更後</th>
    </tr>
    ${changeRows}
  </table>`
      : ''
  }
  <h3>変更後の予約</h3>
  <table style="border-collapse:collapse;width:100%;margin:16px 0">
    <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:bold">日時</td>
        <td style="padding:8px;border:1px solid #e5e7eb">${startTime} ～ ${endTime}</td></tr>
    <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:bold">メニュー</td>
        <td style="padding:8px;border:1px solid #e5e7eb">${menuName}</td></tr>
    <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:bold">担当</td>
        <td style="padding:8px;border:1px solid #e5e7eb">${staffName}</td></tr>
  </table>
  <p style="color:#6b7280;font-size:14px">ご不明な点がございましたら、お気軽にお問い合わせください。</p>
</body>
</html>`.trim();

  return { subject, html, text };
}
