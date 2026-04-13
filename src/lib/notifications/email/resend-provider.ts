import { Resend } from 'resend';
import type { EmailProvider, SendEmailInput, SendEmailResult } from './types';

const DEFAULT_FROM =
  process.env.RESEND_FROM_DEFAULT ??
  'Tiramisu <no-reply@mail.tiramisu-app.com>';

export class ResendEmailProvider implements EmailProvider {
  private client: Resend;

  constructor(apiKey?: string) {
    this.client = new Resend(apiKey ?? process.env.RESEND_API_KEY);
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const headers: Record<string, string> = {};
    if (input.idempotencyKey) {
      headers['Idempotency-Key'] = input.idempotencyKey;
    }

    const { data, error } = await this.client.emails.send({
      from: input.from ?? DEFAULT_FROM,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo: input.replyTo,
      tags: input.tags,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    });

    if (error || !data) {
      throw new Error(error?.message ?? 'Resend send failed');
    }

    return {
      provider: 'resend',
      messageId: data.id,
    };
  }
}
