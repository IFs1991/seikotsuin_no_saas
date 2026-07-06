import type { PublicReservationCancelledPayload } from '../types';

export function renderPublicReservationCancelledEmail(
  payload: PublicReservationCancelledPayload
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
    channel,
  } = payload;

  const subject = `【${clinicName}】公開予約がキャンセルされました`;
  const text = [
    'LIFFマイページから公開予約がキャンセルされました。',
    '',
    `患者名: ${customerName}`,
    `日時: ${startTime} ～ ${endTime}`,
    `メニュー: ${menuName}`,
    `担当: ${staffName || '未設定'}`,
    `チャネル: ${channel}`,
  ].join('\n');

  const html = `
<!DOCTYPE html>
<html lang="ja">
<head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px">
  <h2 style="color:#ef4444">公開予約キャンセル</h2>
  <p>LIFFマイページから公開予約がキャンセルされました。</p>
  <table style="border-collapse:collapse;width:100%;margin:16px 0">
    <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:bold">患者名</td>
        <td style="padding:8px;border:1px solid #e5e7eb">${customerName}</td></tr>
    <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:bold">日時</td>
        <td style="padding:8px;border:1px solid #e5e7eb">${startTime} ～ ${endTime}</td></tr>
    <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:bold">メニュー</td>
        <td style="padding:8px;border:1px solid #e5e7eb">${menuName}</td></tr>
    <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:bold">担当</td>
        <td style="padding:8px;border:1px solid #e5e7eb">${staffName || '未設定'}</td></tr>
    <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:bold">チャネル</td>
        <td style="padding:8px;border:1px solid #e5e7eb">${channel}</td></tr>
  </table>
</body>
</html>`.trim();

  return { subject, html, text };
}
