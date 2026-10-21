/** @jest-environment jsdom */

import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DailyReportInputPage from '@/app/(app)/daily-reports/input/page';
import { UserProfileProvider } from '@/providers/user-profile-context';
import {
  SelectedClinicProvider,
  useSelectedClinic,
} from '@/providers/selected-clinic-context';

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const clinicId = '123e4567-e89b-12d3-a456-426614174000';
const selectedClinicId = '123e4567-e89b-12d3-a456-426614174099';
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

function renderPage(activeClinicId?: string) {
  const content = <DailyReportInputPage />;
  const wrappedContent = activeClinicId ? (
    <SelectedClinicProvider
      initialClinicId={activeClinicId}
      currentClinicId={clinicId}
      clinics={[
        { id: clinicId, name: 'テスト院' },
        { id: selectedClinicId, name: '分院' },
      ]}
    >
      {content}
    </SelectedClinicProvider>
  ) : (
    content
  );

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
      {wrappedContent}
    </UserProfileProvider>
  );
}

// A save started for one (clinic, date) must not reload that target's items
// over another target the user switched to while the POST was in flight.
const dateB = '2031-01-15';
const otherItemId = '123e4567-e89b-12d3-a456-426614174012';

function itemsFor(target: 'A' | 'B') {
  return target === 'A'
    ? [
        buildItem({
          id: insuranceItemId,
          patientName: '山田 太郎',
          treatmentName: '保険施術',
          fee: 2000,
          billingType: 'insurance',
          revenueContextCode: 'insurance',
        }),
      ]
    : [
        buildItem({
          id: otherItemId,
          patientName: '田中 次郎',
          treatmentName: '保険施術',
          fee: 2000,
          billingType: 'insurance',
          revenueContextCode: 'insurance',
        }),
      ];
}

function setupDelayedSaveFetch(isTargetB: (url: URL) => boolean) {
  let resolveSave: (() => void) | null = null;
  const fetchMock = jest
    .spyOn(global, 'fetch')
    .mockImplementation((input, init) => {
      const url = new URL(urlFromFetchInput(input), 'http://localhost');
      if (url.pathname === '/api/daily-reports/items') {
        return jsonResponse({
          success: true,
          data: {
            items: itemsFor(isTargetB(url) ? 'B' : 'A'),
            paymentMethods: [],
          },
        });
      }
      if (url.pathname === '/api/daily-reports' && init?.method === 'POST') {
        // The DB totals differ from the screen, which triggers a reload of
        // the saved target's items once the response arrives.
        return new Promise<Response>(resolve => {
          resolveSave = () =>
            resolve(
              new Response(
                JSON.stringify({
                  success: true,
                  data: {
                    id: '123e4567-e89b-12d3-a456-426614174020',
                    total_patients: 3,
                    total_revenue: 15000,
                    aggregate_source: 'items',
                  },
                }),
                {
                  status: 200,
                  headers: { 'Content-Type': 'application/json' },
                }
              )
            );
        });
      }
      return jsonResponse(
        { success: false, error: `unexpected ${init?.method ?? 'GET'} ${url}` },
        { status: 500 }
      );
    });
  return {
    fetchMock,
    resolveSave: () => {
      if (!resolveSave) throw new Error('save POST was not sent');
      resolveSave();
    },
  };
}

function itemLoadsAfter(fetchMock: jest.SpyInstance, fromCall: number) {
  return fetchMock.mock.calls
    .slice(fromCall)
    .map(call => new URL(urlFromFetchInput(call[0]), 'http://localhost'))
    .filter(url => url.pathname === '/api/daily-reports/items');
}

function ClinicSwitcher() {
  const { setSelectedClinicId } = useSelectedClinic();
  return (
    <button type='button' onClick={() => setSelectedClinicId(selectedClinicId)}>
      分院に切り替え
    </button>
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

  it('uses selected active clinic for item fetch and pricing confirmation body', async () => {
    const fetchMock = setupFetch();
    const user = userEvent.setup();

    renderPage(selectedClinicId);

    await screen.findByText('患者設定: 3割');
    await waitFor(() => {
      const itemRequestUrl = fetchMock.mock.calls
        .map(call => urlFromFetchInput(call[0]))
        .find(url => url.startsWith('/api/daily-reports/items?'));
      expect(itemRequestUrl).toContain(`clinic_id=${selectedClinicId}`);
    });

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
      const body =
        typeof confirmCall?.[1]?.body === 'string'
          ? JSON.parse(confirmCall[1].body)
          : null;
      expect(body).toMatchObject({ clinic_id: selectedClinicId });
    });
  });

  it('uses selected active clinic for daily report save body', async () => {
    const fetchMock = setupFetch();
    const user = userEvent.setup();
    jest.spyOn(window, 'alert').mockImplementation(() => undefined);

    renderPage(selectedClinicId);

    await screen.findByText('患者設定: 3割');
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      const saveCall = fetchMock.mock.calls.find(
        ([input, init]) =>
          urlFromFetchInput(input) === '/api/daily-reports' &&
          init?.method === 'POST'
      );
      expect(saveCall).toBeDefined();
      const body =
        typeof saveCall?.[1]?.body === 'string'
          ? JSON.parse(saveCall[1].body)
          : null;
      expect(body).toMatchObject({ clinic_id: selectedClinicId });
    });
  });

  it('keeps the switched-to date items when a save for the previous date resolves late', async () => {
    const { fetchMock, resolveSave } = setupDelayedSaveFetch(
      url => url.searchParams.get('report_date') === dateB
    );
    const user = userEvent.setup();

    renderPage();

    await screen.findByRole('button', { name: '山田 太郎の金額を確定' });
    const dateInput = screen.getByLabelText('日付') as HTMLInputElement;
    const dateA = dateInput.value;
    await user.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) =>
            urlFromFetchInput(input) === '/api/daily-reports' &&
            init?.method === 'POST'
        )
      ).toBe(true)
    );

    fireEvent.change(dateInput, { target: { value: dateB } });
    await screen.findByRole('button', { name: '田中 次郎の金額を確定' });
    const callsAfterSwitch = fetchMock.mock.calls.length;

    await act(async () => {
      resolveSave();
    });

    // The late result of the previous date is still reported with its date.
    expect(
      await screen.findByText(`${dateA} ・ 患者数 3名 ・ 合計売上 ¥15,000`)
    ).toBeInTheDocument();
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(dateInput.value).toBe(dateB);
    // The saved-summary dialog is modal, so the list behind it is aria-hidden.
    expect(
      screen.getByRole('button', {
        name: '田中 次郎の金額を確定',
        hidden: true,
      })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: '山田 太郎の金額を確定',
        hidden: true,
      })
    ).not.toBeInTheDocument();
    expect(
      itemLoadsAfter(fetchMock, callsAfterSwitch).filter(
        url => url.searchParams.get('report_date') !== dateB
      )
    ).toHaveLength(0);
  });

  it('keeps the switched-to clinic items when a save for the previous clinic resolves late', async () => {
    const { fetchMock, resolveSave } = setupDelayedSaveFetch(
      url => url.searchParams.get('clinic_id') === selectedClinicId
    );
    const user = userEvent.setup();

    render(
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
        <SelectedClinicProvider
          initialClinicId={clinicId}
          currentClinicId={clinicId}
          clinics={[
            { id: clinicId, name: 'テスト院' },
            { id: selectedClinicId, name: '分院' },
          ]}
        >
          <ClinicSwitcher />
          <DailyReportInputPage />
        </SelectedClinicProvider>
      </UserProfileProvider>
    );

    await screen.findByRole('button', { name: '山田 太郎の金額を確定' });
    await user.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) =>
            urlFromFetchInput(input) === '/api/daily-reports' &&
            init?.method === 'POST'
        )
      ).toBe(true)
    );

    await user.click(screen.getByRole('button', { name: '分院に切り替え' }));
    await screen.findByRole('button', { name: '田中 次郎の金額を確定' });
    const callsAfterSwitch = fetchMock.mock.calls.length;

    await act(async () => {
      resolveSave();
    });
    await screen.findByText(/患者数 3名 ・ 合計売上 ¥15,000/);
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // The saved-summary dialog is modal, so the list behind it is aria-hidden.
    expect(
      screen.getByRole('button', {
        name: '田中 次郎の金額を確定',
        hidden: true,
      })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: '山田 太郎の金額を確定',
        hidden: true,
      })
    ).not.toBeInTheDocument();
    expect(
      itemLoadsAfter(fetchMock, callsAfterSwitch).filter(
        url => url.searchParams.get('clinic_id') !== selectedClinicId
      )
    ).toHaveLength(0);
  });

  it('does not append an item added for the previous date after a date switch', async () => {
    let resolveAdd: (() => void) | null = null;
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockImplementation((input, init) => {
        const url = new URL(urlFromFetchInput(input), 'http://localhost');
        const method = init?.method ?? 'GET';
        if (url.pathname === '/api/daily-reports/items' && method === 'GET') {
          return jsonResponse({
            success: true,
            data: {
              items: itemsFor(
                url.searchParams.get('report_date') === dateB ? 'B' : 'A'
              ),
              paymentMethods: [],
            },
          });
        }
        if (url.pathname === '/api/daily-reports/items' && method === 'POST') {
          return new Promise<Response>(resolve => {
            resolveAdd = () =>
              resolve(
                new Response(
                  JSON.stringify({
                    success: true,
                    data: {
                      ...buildItem({
                        id: '123e4567-e89b-12d3-a456-426614174013',
                        patientName: '幽霊 太郎',
                        treatmentName: '自費施術',
                        fee: 7777,
                        billingType: 'private',
                        revenueContextCode: 'insurance',
                      }),
                      source: 'manual',
                    },
                  }),
                  {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                  }
                )
              );
          });
        }
        if (url.pathname === '/api/daily-reports' && method === 'POST') {
          return jsonResponse({
            success: true,
            data: { total_patients: 1, total_revenue: 2000 },
          });
        }
        return jsonResponse(
          { success: false, error: `unexpected ${method} ${url}` },
          { status: 500 }
        );
      });
    const user = userEvent.setup();

    renderPage();

    await screen.findByRole('button', { name: '山田 太郎の金額を確定' });
    const dateInput = screen.getByLabelText('日付') as HTMLInputElement;
    const dateA = dateInput.value;
    await user.type(screen.getByPlaceholderText('田中花子'), '幽霊 太郎');
    await user.type(
      screen.getByPlaceholderText('整体、マッサージ'),
      '自費施術'
    );
    await user.click(screen.getByRole('button', { name: '追加' }));
    await waitFor(() => expect(resolveAdd).not.toBeNull());

    fireEvent.change(dateInput, { target: { value: dateB } });
    await screen.findByRole('button', { name: '田中 次郎の金額を確定' });

    await act(async () => {
      resolveAdd?.();
    });
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(dateInput.value).toBe(dateB);
    // Patient names render as input values in the item list.
    expect(screen.queryByDisplayValue('幽霊 太郎')).not.toBeInTheDocument();
    // The user is told where the item went (its date), instead of a ghost row.
    expect(
      screen.getByText(new RegExp(`明細は${dateA}の日報に追加しました`))
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => {
      const saveCall = fetchMock.mock.calls.find(
        ([input, init]) =>
          urlFromFetchInput(input) === '/api/daily-reports' &&
          init?.method === 'POST'
      );
      expect(saveCall).toBeDefined();
      const body =
        typeof saveCall?.[1]?.body === 'string'
          ? JSON.parse(saveCall[1].body)
          : null;
      // Only the switched-to date's own row is counted.
      expect(body).toMatchObject({
        report_date: dateB,
        total_patients: 1,
        total_revenue: 2000,
      });
    });
  });

  it.each([
    [
      'an error response',
      () => jsonResponse({ success: false }, { status: 500 }),
      '日報明細の取得に失敗しました',
    ],
    [
      'a network error',
      () => Promise.reject(new TypeError('network down')),
      'network down',
    ],
  ])(
    'does not keep the previous date items savable when the new date load fails with %s',
    async (_label, failLoad, loadErrorText) => {
      jest.spyOn(global, 'fetch').mockImplementation((input, init) => {
        const url = new URL(urlFromFetchInput(input), 'http://localhost');
        if (url.pathname === '/api/daily-reports/items') {
          if (url.searchParams.get('report_date') === dateB) {
            return failLoad() as Promise<Response>;
          }
          return jsonResponse({
            success: true,
            data: { items: itemsFor('A'), paymentMethods: [] },
          });
        }
        return jsonResponse(
          {
            success: false,
            error: `unexpected ${init?.method ?? 'GET'} ${url}`,
          },
          { status: 500 }
        );
      });
      const user = userEvent.setup();

      renderPage();

      await screen.findByRole('button', { name: '山田 太郎の金額を確定' });
      // A form error left over from the previous date must not hide the
      // new date's load failure.
      await user.click(screen.getByRole('button', { name: '追加' }));
      expect(
        screen.getByText('患者名と施術内容を入力してください')
      ).toBeInTheDocument();

      const dateInput = screen.getByLabelText('日付') as HTMLInputElement;
      fireEvent.change(dateInput, { target: { value: dateB } });

      // Assert only after the failed load has settled.
      expect(await screen.findByText(loadErrorText)).toBeInTheDocument();
      expect(
        screen.queryByText('明細を読み込み中です...')
      ).not.toBeInTheDocument();

      expect(dateInput.value).toBe(dateB);
      expect(
        screen.queryByRole('button', { name: '山田 太郎の金額を確定' })
      ).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
      expect(
        screen.queryByText('患者名と施術内容を入力してください')
      ).not.toBeInTheDocument();
      // The day is unknown, not empty: no "no items yet" claim, no manual add.
      expect(
        screen.queryByText(/本日の明細はまだありません/)
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText('まだ患者が登録されていません')
      ).not.toBeInTheDocument();
      expect(
        screen.getAllByText(/明細を読み込めませんでした/).length
      ).toBeGreaterThan(0);
      expect(screen.getByRole('button', { name: '追加' })).toBeDisabled();
    }
  );

  it('does not keep the previous clinic items savable when the new clinic load fails', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(input => {
      const url = new URL(urlFromFetchInput(input), 'http://localhost');
      if (url.pathname === '/api/daily-reports/items') {
        if (url.searchParams.get('clinic_id') === selectedClinicId) {
          return jsonResponse(
            {
              success: false,
              error: 'このクリニックへのアクセス権がありません',
            },
            { status: 403 }
          );
        }
        return jsonResponse({
          success: true,
          data: { items: itemsFor('A'), paymentMethods: [] },
        });
      }
      return jsonResponse({ success: false }, { status: 500 });
    });
    const user = userEvent.setup();

    render(
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
        <SelectedClinicProvider
          initialClinicId={clinicId}
          currentClinicId={clinicId}
          clinics={[
            { id: clinicId, name: 'テスト院' },
            { id: selectedClinicId, name: '分院' },
          ]}
        >
          <ClinicSwitcher />
          <DailyReportInputPage />
        </SelectedClinicProvider>
      </UserProfileProvider>
    );

    await screen.findByRole('button', { name: '山田 太郎の金額を確定' });
    await user.click(screen.getByRole('button', { name: '分院に切り替え' }));

    expect(
      await screen.findByText('このクリニックへのアクセス権がありません')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '山田 太郎の金額を確定' })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
  });

  it('keeps the rows on screen during a same-target reload after saving', async () => {
    let resolveReload: (() => void) | null = null;
    let itemLoads = 0;
    jest.spyOn(global, 'fetch').mockImplementation((input, init) => {
      const url = new URL(urlFromFetchInput(input), 'http://localhost');
      if (url.pathname === '/api/daily-reports/items') {
        itemLoads += 1;
        if (itemLoads === 1) {
          return jsonResponse({
            success: true,
            data: { items: itemsFor('A'), paymentMethods: [] },
          });
        }
        return new Promise<Response>(resolve => {
          resolveReload = () =>
            resolve(
              new Response(
                JSON.stringify({
                  success: true,
                  data: { items: [...itemsFor('A'), ...itemsFor('B')] },
                }),
                {
                  status: 200,
                  headers: { 'Content-Type': 'application/json' },
                }
              )
            );
        });
      }
      if (url.pathname === '/api/daily-reports' && init?.method === 'POST') {
        // Another tab added a row: the DB totals differ, so the page reloads.
        return jsonResponse({
          success: true,
          data: { total_patients: 2, total_revenue: 4000 },
        });
      }
      return jsonResponse({ success: false }, { status: 500 });
    });
    const user = userEvent.setup();

    renderPage();

    await screen.findByRole('button', { name: '山田 太郎の金額を確定' });
    await user.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(resolveReload).not.toBeNull());

    // While the same-target reload is pending the list is not blanked.
    expect(
      screen.getByRole('button', {
        name: '山田 太郎の金額を確定',
        hidden: true,
      })
    ).toBeInTheDocument();
    expect(
      screen.queryByText('明細を読み込み中です...')
    ).not.toBeInTheDocument();

    await act(async () => {
      resolveReload?.();
    });
    expect(
      await screen.findByRole('button', {
        name: '田中 次郎の金額を確定',
        hidden: true,
      })
    ).toBeInTheDocument();
  });

  it('lists an item once when its add resolves after switching away and back', async () => {
    const createdId = '123e4567-e89b-12d3-a456-426614174014';
    const created = {
      ...buildItem({
        id: createdId,
        patientName: '往復 花子',
        treatmentName: '自費施術',
        fee: 3000,
        billingType: 'private',
        revenueContextCode: 'insurance',
      }),
      source: 'manual',
    };
    let addCommitted = false;
    let resolveAdd: (() => void) | null = null;
    jest.spyOn(global, 'fetch').mockImplementation((input, init) => {
      const url = new URL(urlFromFetchInput(input), 'http://localhost');
      const method = init?.method ?? 'GET';
      if (url.pathname === '/api/daily-reports/items' && method === 'GET') {
        const onB = url.searchParams.get('report_date') === dateB;
        return jsonResponse({
          success: true,
          data: {
            items: onB
              ? itemsFor('B')
              : addCommitted
                ? [...itemsFor('A'), created]
                : itemsFor('A'),
            paymentMethods: [],
          },
        });
      }
      if (url.pathname === '/api/daily-reports/items' && method === 'POST') {
        // The row is committed at once; only the response is late.
        addCommitted = true;
        return new Promise<Response>(resolve => {
          resolveAdd = () =>
            resolve(
              new Response(JSON.stringify({ success: true, data: created }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              })
            );
        });
      }
      return jsonResponse({ success: false }, { status: 500 });
    });
    const user = userEvent.setup();

    renderPage();

    await screen.findByRole('button', { name: '山田 太郎の金額を確定' });
    const dateInput = screen.getByLabelText('日付') as HTMLInputElement;
    const dateA = dateInput.value;
    await user.type(screen.getByPlaceholderText('田中花子'), '往復 花子');
    await user.type(
      screen.getByPlaceholderText('整体、マッサージ'),
      '自費施術'
    );
    await user.click(screen.getByRole('button', { name: '追加' }));
    await waitFor(() => expect(resolveAdd).not.toBeNull());

    fireEvent.change(dateInput, { target: { value: dateB } });
    await screen.findByRole('button', { name: '田中 次郎の金額を確定' });
    fireEvent.change(dateInput, { target: { value: dateA } });
    await screen.findByDisplayValue('往復 花子');

    await act(async () => {
      resolveAdd?.();
    });
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(screen.getAllByDisplayValue('往復 花子')).toHaveLength(1);
  });

  it('shows the saved DB totals and reloads stale items after saving', async () => {
    const fetchMock = setupFetch();
    const baseImplementation = fetchMock.getMockImplementation();
    fetchMock.mockImplementation((input, init) => {
      if (
        urlFromFetchInput(input) === '/api/daily-reports' &&
        init?.method === 'POST'
      ) {
        // Another tab added a detail row: the DB-derived totals differ from
        // the two rows this page still shows.
        return jsonResponse({
          success: true,
          data: {
            id: '123e4567-e89b-12d3-a456-426614174020',
            total_patients: 3,
            total_revenue: 15000,
            aggregate_source: 'items',
          },
        });
      }
      return baseImplementation!(input, init);
    });
    const user = userEvent.setup();

    renderPage();

    await screen.findByText('患者設定: 3割');
    const itemLoadsBeforeSave = fetchMock.mock.calls.filter(([input]) =>
      urlFromFetchInput(input).startsWith('/api/daily-reports/items?')
    ).length;
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(
      await screen.findByText(/患者数 3名 ・ 合計売上 ¥15,000/)
    ).toBeInTheDocument();
    await waitFor(() => {
      const itemLoads = fetchMock.mock.calls.filter(([input]) =>
        urlFromFetchInput(input).startsWith('/api/daily-reports/items?')
      ).length;
      expect(itemLoads).toBeGreaterThan(itemLoadsBeforeSave);
    });
  });
});
