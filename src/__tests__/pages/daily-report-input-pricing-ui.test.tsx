/** @jest-environment jsdom */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DailyReportInputPage from '@/app/(app)/daily-reports/input/page';
import { UserProfileProvider } from '@/providers/user-profile-context';

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const clinicId = '123e4567-e89b-12d3-a456-426614174000';
const insuranceItemId = '123e4567-e89b-12d3-a456-426614174010';
const trafficItemId = '123e4567-e89b-12d3-a456-426614174011';

function jsonResponse(payload: unknown, init?: ResponseInit) {
  return Promise.resolve(
    new Response(JSON.stringify(payload), {
      status: init?.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    })
  );
}

function urlFromFetchInput(input: Parameters<typeof fetch>[0]) {
  return typeof input === 'string' ? input : input.url;
}

function buildItem(overrides: {
  id: string;
  patientName: string;
  treatmentName: string;
  fee: number;
  billingType: 'insurance' | 'private';
  revenueContextCode: 'insurance' | 'traffic_accident';
  pricingSnapshotStatus?: string;
}) {
  return {
    id: overrides.id,
    clinicId,
    dailyReportId: '123e4567-e89b-12d3-a456-426614174020',
    reportDate: '2026-05-07',
    reservationId: '123e4567-e89b-12d3-a456-426614174030',
    customerId: '123e4567-e89b-12d3-a456-426614174040',
    menuId: '123e4567-e89b-12d3-a456-426614174050',
    staffResourceId: '123e4567-e89b-12d3-a456-426614174060',
    patientName: overrides.patientName,
    treatmentName: overrides.treatmentName,
    durationMinutes: 30,
    fee: overrides.fee,
    billingType: overrides.billingType,
    revenueContextCode: overrides.revenueContextCode,
    revenueContextSource: 'manual',
    amountSource: 'manual',
    estimateStatus: 'not_calculated',
    careEpisodeId: null,
    visitOrdinalInEpisode: null,
    visitStageCode: null,
    paymentMethodId: null,
    nextReservationStartTime: null,
    nextReservationEndTime: null,
    nextReservationId: null,
    source: 'reservation',
    notes: null,
    menuBillingProfileId: null,
    customerInsuranceCoverageId: null,
    patientBurdenRate: null,
    coverageResolutionSource: null,
    pricingSnapshotStatus: overrides.pricingSnapshotStatus ?? 'pending',
    pricingConfirmedAt: null,
    pricingContext: {
      currentPatientBurdenRate:
        overrides.revenueContextCode === 'insurance' ? 30 : null,
      coverageResolutionSource:
        overrides.revenueContextCode === 'insurance'
          ? 'customer_default'
          : null,
      coverageReviewMessage: null,
      activeMenuBillingProfile: {
        id: '123e4567-e89b-12d3-a456-426614174070',
        revenueContextCode: overrides.revenueContextCode,
        calculationMethod:
          overrides.revenueContextCode === 'insurance'
            ? 'insurance_master'
            : 'manual_estimate',
        fixedAmountYen: null,
        defaultPatientBurdenRate:
          overrides.revenueContextCode === 'insurance' ? 30 : null,
        requiresReview: overrides.revenueContextCode !== 'insurance',
      },
    },
    createdAt: '2026-05-07T01:00:00.000Z',
    updatedAt: '2026-05-07T01:00:00.000Z',
  };
}

function setupFetch() {
  return jest.spyOn(global, 'fetch').mockImplementation((input, init) => {
    const url = urlFromFetchInput(input);
    const method = init?.method ?? 'GET';

    if (url.startsWith('/api/daily-reports/items?')) {
      return jsonResponse({
        success: true,
        data: {
          items: [
            buildItem({
              id: insuranceItemId,
              patientName: '山田 太郎',
              treatmentName: '保険施術',
              fee: 2000,
              billingType: 'insurance',
              revenueContextCode: 'insurance',
            }),
            buildItem({
              id: trafficItemId,
              patientName: '佐藤 花子',
              treatmentName: '交通事故施術',
              fee: 9000,
              billingType: 'private',
              revenueContextCode: 'traffic_accident',
              pricingSnapshotStatus: 'needs_review',
            }),
          ],
          paymentMethods: [],
        },
      });
    }

    if (
      url === `/api/daily-reports/items/${insuranceItemId}/pricing/confirm` &&
      method === 'POST'
    ) {
      return jsonResponse({
        success: true,
        data: {
          dailyReportItemId: insuranceItemId,
          revenueEstimateId: '123e4567-e89b-12d3-a456-426614174080',
          estimateStatus: 'calculated',
          estimatedTotal: 2000,
          pricingSnapshotStatus: 'confirmed',
          patientBurdenRate: 30,
        },
      });
    }

    return jsonResponse(
      { success: false, error: `unexpected ${method} ${url}` },
      { status: 500 }
    );
  });
}

function renderPage() {
  return render(
    <UserProfileProvider
      value={{
        profile: {
          id: 'user-1',
          email: 'staff@example.com',
          role: 'staff',
          clinicId,
          clinicName: 'テスト院',
          isActive: true,
          isAdmin: false,
        },
        loading: false,
        error: null,
      }}
    >
      <DailyReportInputPage />
    </UserProfileProvider>
  );
}

describe('DailyReportInputPage Phase 4A-5 pricing UI', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows patient coverage and estimated breakdown for daily report items', async () => {
    const fetchMock = setupFetch();

    renderPage();

    expect(await screen.findAllByText('会計内訳')).toHaveLength(2);
    expect(screen.getByText('患者設定: 3割')).toBeInTheDocument();
    expect(screen.getByText('窓口負担見込み: ¥600')).toBeInTheDocument();
    expect(screen.getByText('保険者請求見込み: ¥1,400')).toBeInTheDocument();
    expect(
      screen.getByText('交通事故: 手入力概算・要確認')
    ).toBeInTheDocument();
    expect(screen.queryByText(/請求確定額/)).not.toBeInTheDocument();

    await waitFor(() => {
      const itemRequestUrl = fetchMock.mock.calls
        .map(call => urlFromFetchInput(call[0]))
        .find(url => url.startsWith('/api/daily-reports/items?'));
      expect(itemRequestUrl).toContain('include_pricing_context=true');
    });
  });

  it('confirms pricing from the insurance row without forcing a manual override', async () => {
    const fetchMock = setupFetch();
    const user = userEvent.setup();

    renderPage();

    await screen.findByText('患者設定: 3割');
    await user.click(
      screen.getByRole('button', { name: '山田 太郎の金額を確定' })
    );

    await waitFor(() => {
      const confirmCall = fetchMock.mock.calls.find(
        ([input, init]) =>
          urlFromFetchInput(input) ===
            `/api/daily-reports/items/${insuranceItemId}/pricing/confirm` &&
          init?.method === 'POST'
      );
      expect(confirmCall).toBeDefined();
      const body =
        typeof confirmCall?.[1]?.body === 'string'
          ? JSON.parse(confirmCall[1].body)
          : null;
      expect(body).toMatchObject({
        clinic_id: clinicId,
        patientBurdenRateOverride: null,
        manualEstimatedAmount: null,
        updateCustomerCoverage: false,
      });
    });
  });
});
