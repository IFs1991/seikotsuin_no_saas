import { renderReservationCreatedEmail } from '@/lib/notifications/email/templates/reservation-created';
import { renderReservationConfirmedEmail } from '@/lib/notifications/email/templates/reservation-confirmed';
import { renderReservationUpdatedEmail } from '@/lib/notifications/email/templates/reservation-updated';
import { renderReservationCancelledEmail } from '@/lib/notifications/email/templates/reservation-cancelled';
import { renderReminderDayBeforeEmail } from '@/lib/notifications/email/templates/reminder-day-before';
import { renderReminderSameDayEmail } from '@/lib/notifications/email/templates/reminder-same-day';
import { renderPublicReservationReceivedEmail } from '@/lib/notifications/email/templates/public-reservation-received';
import { renderPublicReservationCancelledEmail } from '@/lib/notifications/email/templates/public-reservation-cancelled';
import { renderBillingLifecycleEmail } from '@/lib/notifications/email/templates/billing-lifecycle';
import { parse } from 'node-html-parser';

const raw = 'A&B <img src=x onerror=alert(1)> "quote" \'quote\' &amp;';
const payload = {
  customerName: raw,
  clinicName: raw,
  startTime: raw,
  endTime: raw,
  staffName: raw,
  menuName: raw,
  channel: raw,
  intakeSummary: [raw],
  changes: [{ field: raw, before: raw, after: raw }],
};
const renderers = [
  renderReservationCreatedEmail,
  renderReservationConfirmedEmail,
  renderReservationUpdatedEmail,
  renderReservationCancelledEmail,
  renderReminderDayBeforeEmail,
  renderReminderSameDayEmail,
  renderPublicReservationReceivedEmail,
  renderPublicReservationCancelledEmail,
];

describe('AUDIT-V2 F10 encode at email HTML output only', () => {
  it.each(renderers.map(render => [render.name, render] as const))(
    '%s renders raw names as text, never markup',
    (_name, render) => {
      const result = render(payload);
      const document = parse(result.html);
      expect(document.querySelectorAll('img,script,iframe')).toHaveLength(0);
      expect(document.textContent).toContain(raw);
      expect(result.html).toContain('A&amp;B &lt;img');
      expect(result.html).toContain('&amp;amp;');
      expect(result.text).toContain(raw);
      expect(result.subject).toContain(raw);
    }
  );

  it.each([
    'billing_payment_failed',
    'billing_payment_recovered',
    'billing_trial_will_end',
    'billing_access_locked',
  ] as const)(
    '%s escapes billing text without rewriting plain-text content',
    template => {
      const result = renderBillingLifecycleEmail(template, {
        clinicName: raw,
        billingState: raw,
        graceUntil: raw,
        trialEnd: raw,
      });
      expect(parse(result.html).querySelectorAll('img,script')).toHaveLength(0);
      expect(parse(result.html).textContent).toContain(raw);
      expect(result.text).toContain(raw);
    }
  );

  it.each([renderReminderDayBeforeEmail, renderReminderSameDayEmail])(
    'preserves a valid reminder URL and quotes the attribute',
    render => {
      const url = 'https://clinic.example.invalid/mypage?a=1&b="quoted"';
      const result = render({ ...payload, myPageUrl: url });
      const links = parse(result.html).querySelectorAll('a');
      expect(links).toHaveLength(1);
      expect(links[0]?.getAttribute('href')).toBe(url);
      expect(Object.keys(links[0]?.attributes ?? {})).toEqual(['href']);
      expect(result.text).toContain(url);
    }
  );

  it.each(['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>'])(
    'does not create an executable reminder link: %s',
    myPageUrl => {
      for (const render of [
        renderReminderDayBeforeEmail,
        renderReminderSameDayEmail,
      ]) {
        expect(
          parse(render({ ...payload, myPageUrl }).html).querySelectorAll('a')
        ).toHaveLength(0);
      }
    }
  );
});
