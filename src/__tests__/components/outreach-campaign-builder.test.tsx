/** @jest-environment jsdom */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { OutreachCampaignBuilder } from '@/components/outreach/outreach-campaign-builder';

const CLINIC_ID = '11111111-1111-4111-8111-111111111111';
const CUSTOMER_A = '22222222-2222-4222-8222-222222222222';
const CUSTOMER_B = '33333333-3333-4333-8333-333333333333';
const CAMPAIGN_ID = '44444444-4444-4444-8444-444444444444';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function readJsonBody(init: RequestInit | undefined): unknown {
  if (!init || typeof init.body !== 'string') {
    throw new Error('expected JSON string body');
  }

  return JSON.parse(init.body);
}

describe('OutreachCampaignBuilder', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('extracts dormant candidates, supports exclusion, and creates a draft', async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: {
            clinic_id: CLINIC_ID,
            days_from: 60,
            days_to: 120,
            date_from: '2026-03-08',
            date_to: '2026-05-07',
            max_recipients: 300,
            candidates: [
              {
                customer_id: CUSTOMER_A,
                name: '休眠 太郎',
                last_visit_date: '2026-04-01',
                days_since_last_visit: 96,
                total_visits: 5,
                lifetime_value: 40000,
                line_display_name: 'LINE太郎',
              },
              {
                customer_id: CUSTOMER_B,
                name: '休眠 花子',
                last_visit_date: '2026-04-15',
                days_since_last_visit: 82,
                total_visits: 3,
                lifetime_value: 24000,
                line_display_name: 'LINE花子',
              },
            ],
          },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            success: true,
            data: {
              campaign_id: CAMPAIGN_ID,
              status: 'draft',
              selected_count: 1,
              created_at: '2026-07-06T00:00:00.000Z',
            },
          },
          201
        )
      );

    render(
      <OutreachCampaignBuilder
        initialClinicId={CLINIC_ID}
        clinics={[{ id: CLINIC_ID, name: '池袋院' }]}
      />
    );

    await user.click(screen.getByRole('button', { name: '候補を抽出' }));

    expect(await screen.findByText('対象患者確認')).toBeInTheDocument();
    expect(screen.getByText('休眠 太郎')).toBeInTheDocument();
    expect(screen.getByText('休眠 花子')).toBeInTheDocument();

    const checkboxes = screen.getAllByRole('checkbox');
    const secondCheckbox = checkboxes[1];
    if (!secondCheckbox) {
      throw new Error('expected second candidate checkbox');
    }
    await user.click(secondCheckbox);
    await user.click(screen.getByRole('button', { name: '文面入力へ' }));
    await user.click(screen.getByRole('button', { name: '確認へ' }));
    await user.click(screen.getByRole('button', { name: '下書きを作成' }));

    await waitFor(() => {
      expect(screen.getByText('下書き作成完了')).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `/api/outreach/dormant-candidates?clinic_id=${CLINIC_ID}&days_from=60&days_to=120`,
      { cache: 'no-store' }
    );

    const draftPayload = readJsonBody(fetchMock.mock.calls[1]?.[1]);
    expect(draftPayload).toMatchObject({
      clinic_id: CLINIC_ID,
      days_from: 60,
      days_to: 120,
      customer_ids: [CUSTOMER_A],
    });
    expect(screen.getByText(CAMPAIGN_ID)).toBeInTheDocument();
  });
});
