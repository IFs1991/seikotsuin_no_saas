import type { PublicReservationReceivedPayload } from '../types';

export function renderPublicReservationReceivedEmail(
  payload: PublicReservationReceivedPayload
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
    intakeSummary,
  } = payload;

  const subject = `【${clinicName}】公開予約を受け付けました`;
  const answerLines =
    intakeSummary.length > 0
      ? intakeSummary.map(line => `- ${line}`)
      : ['- 回答なし'];

  const text = [
    '公開予約フォームから新しい予約を受け付けました。',
    '',
    `患者名: ${customerName}`,
    `日時: ${startTime} ～ ${endTime}`,
    `メニュー: ${menuName}`,
    `担当: ${staffName || '未設定'}`,
    `チャネル: ${channel}`,
    '',
    '質問回答:',
    ...answerLines,
  ].join('\n');

  const answerRows = answerLines
    .map(
      line => `<li style="margin-bottom:4px">${line.replace(/^- /, '')}</li>`
    )
    .join('');

  const html = `
<!DOCTYPE html>
<html lang="ja">
<head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px">
  <h2 style="color:#2563eb">公開予約受付</h2>
  <p>公開予約フォームから新しい予約を受け付けました。</p>
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
  <h3>質問回答</h3>
  <ul>${answerRows}</ul>
</body>
</html>`.trim();

  return { subject, html, text };
}
