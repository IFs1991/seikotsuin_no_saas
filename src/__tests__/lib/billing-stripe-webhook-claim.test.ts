import { classifyExistingStripeWebhookEvent } from '@/lib/billing/stripe-events';

describe('Stripe webhook event claiming', () => {
  it.each(['processed', 'ignored'] as const)(
    'treats %s as an idempotent duplicate',
    processingStatus => {
      expect(
        classifyExistingStripeWebhookEvent({
          processingStatus,
          retryable: false,
        })
      ).toBe('duplicate');
    }
  );

  it('reclaims received events and retryable failures', () => {
    expect(
      classifyExistingStripeWebhookEvent({
        processingStatus: 'received',
        retryable: false,
      })
    ).toBe('reclaim_received');
    expect(
      classifyExistingStripeWebhookEvent({
        processingStatus: 'failed',
        retryable: true,
      })
    ).toBe('reclaim_failed');
  });

  it('does not concurrently reclaim processing events', () => {
    expect(
      classifyExistingStripeWebhookEvent({
        processingStatus: 'processing',
        retryable: false,
      })
    ).toBe('busy');
  });

  it('does not retry a terminal failure', () => {
    expect(
      classifyExistingStripeWebhookEvent({
        processingStatus: 'failed',
        retryable: false,
      })
    ).toBe('terminal_failure');
  });
});
