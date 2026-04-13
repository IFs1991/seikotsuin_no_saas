import type { ReservationEmailPayload } from '../types';

export function renderReminderDayBeforeEmail(
  payload: ReservationEmailPayload
): {
  subject: string;
  html: string;
  text: string;
} {
  const { customerName, clinicName, startTime, endTime, staffName, menuName } =
    payload;

  const subject = `【${clinicName}】明日のご予約リマインド`;

  const text = [
    `${customerName} 様`,
    '',
    `明日、${clinicName} のご予約がございます。`,
    '',
    `日時: ${startTime} ～ ${endTime}`,
    `メニュー: ${menuName}`,
    `担当: ${staffName}`,
    '',
    'お気をつけてお越しください。',
  ].join('\n');

  const html = `
<!DOCTYPE html>
<html lang="ja">
<head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px">
  <h2 style="color:#10b981">明日のご予約リマインド</h2>
  <p>${customerName} 様</p>
  <p>明日、${clinicName} のご予約がございます。</p>
  <table style="border-collapse:collapse;width:100%;margin:16px 0">
    <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:bold">日時</td>
        <td style="padding:8px;border:1px solid #e5e7eb">${startTime} ～ ${endTime}</td></tr>
    <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:bold">メニュー</td>
        <td style="padding:8px;border:1px solid #e5e7eb">${menuName}</td></tr>
    <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:bold">担当</td>
        <td style="padding:8px;border:1px solid #e5e7eb">${staffName}</td></tr>
  </table>
  <p style="color:#6b7280;font-size:14px">お気をつけてお越しください。</p>
</body>
</html>`.trim();

  return { subject, html, text };
}
