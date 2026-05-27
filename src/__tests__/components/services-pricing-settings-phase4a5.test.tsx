import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ServicesPricingSettings } from '@/components/admin/services-pricing-settings';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useSelectedClinic } from '@/providers/selected-clinic-context';

jest.mock('@/hooks/useUserProfile', () => ({
  useUserProfile: jest.fn(),
}));

jest.mock('@/providers/selected-clinic-context', () => ({
  useSelectedClinic: jest.fn(),
}));

const clinicId = '123e4567-e89b-12d3-a456-426614174000';
const menuId = '123e4567-e89b-12d3-a456-426614174010';
const templateId = '123e4567-e89b-12d3-a456-426614174020';

const useUserProfileMock = jest.mocked(useUserProfile);
const useSelectedClinicMock = jest.mocked(useSelectedClinic);

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

function setupProfile(role: string, isAdmin = true) {
  useUserProfileMock.mockReturnValue({
    profile: {
      id: 'user-1',
      email: 'admin@example.com',
      role,
      clinicId,
      clinicName: 'テスト院',
      isActive: true,
      isAdmin,
    },
    loading: false,
    error: null,
  });
  useSelectedClinicMock.mockReturnValue({
    selectedClinicId: clinicId,
    setSelectedClinicId: jest.fn(),
    clinics: [],
    currentClinicId: clinicId,
    clinicsLoading: false,
    clinicsError: null,
  });
}

function setupFetch() {
  return jest.spyOn(global, 'fetch').mockImplementation((input, init) => {
    const url = urlFromFetchInput(input);
    const method = init?.method ?? 'GET';

    if (url.startsWith('/api/menus?')) {
      return jsonResponse({
        success: true,
        data: [
          {
            id: menuId,
            clinicId,
            name: '保険施術',
            durationMinutes: 30,
            price: 0,
            description: '健康保険の基本施術',
            category: 'treatment',
            isInsuranceApplicable: true,
            isActive: true,
            options: [],
          },
        ],
      });
    }

    if (url.startsWith('/api/menu-templates?')) {
      return jsonResponse({
        success: true,
        data: {
          ownerClinicId: clinicId,
          ownerClinicName: 'テスト本部',
          targetClinicId: clinicId,
          isOwnerClinic: true,
          templates: [
            {
              id: templateId,
              ownerClinicId: clinicId,
              name: '標準保険施術',
              durationMinutes: 30,
              price: 0,
              description: '標準テンプレート',
              category: 'treatment',
              isInsuranceApplicable: true,
              isActive: true,
              displayOrder: 1,
              options: [],
            },
          ],
        },
      });
    }

    if (url.startsWith(`/api/menus/${menuId}/billing-profiles`)) {
      if (method === 'POST') {
        return jsonResponse({
          success: true,
          data: {
            id: 'profile-menu-2',
            clinicId,
            menuId,
            sourceTemplateProfileId: null,
            revenueContextCode: 'private',
            calculationMethod: 'fixed_amount',
            fixedAmountYen: 4500,
            defaultPatientBurdenRate: null,
            professionType: null,
            requiresReview: false,
            effectiveFrom: '2026-05-01',
            effectiveTo: null,
            isActive: true,
            isDeleted: false,
            createdAt: '2026-05-01T00:00:00.000Z',
            updatedAt: '2026-05-01T00:00:00.000Z',
          },
        });
      }

      return jsonResponse({
        success: true,
        data: [
          {
            id: 'profile-menu-1',
            clinicId,
            menuId,
            sourceTemplateProfileId: null,
            revenueContextCode: 'insurance',
            calculationMethod: 'insurance_master',
            fixedAmountYen: null,
            defaultPatientBurdenRate: 30,
            professionType: 'judo_therapist',
            requiresReview: false,
            effectiveFrom: '2026-05-01',
            effectiveTo: null,
            isActive: true,
            isDeleted: false,
            createdAt: '2026-05-01T00:00:00.000Z',
            updatedAt: '2026-05-01T00:00:00.000Z',
          },
        ],
      });
    }

    if (url.startsWith(`/api/menu-templates/${templateId}/billing-profiles`)) {
      return jsonResponse({
        success: true,
        data: [
          {
            id: 'profile-template-1',
            ownerClinicId: clinicId,
            menuTemplateId: templateId,
            revenueContextCode: 'insurance',
            calculationMethod: 'insurance_master',
            fixedAmountYen: null,
            defaultPatientBurdenRate: 30,
            professionType: 'judo_therapist',
            requiresReview: false,
            effectiveFrom: '2026-05-01',
            effectiveTo: null,
            isActive: true,
            isDeleted: false,
            createdAt: '2026-05-01T00:00:00.000Z',
            updatedAt: '2026-05-01T00:00:00.000Z',
          },
        ],
      });
    }

    return jsonResponse(
      { success: false, error: 'unexpected url' },
      { status: 500 }
    );
  });
}

describe('ServicesPricingSettings Phase 4A-5 billing profile UI', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('loads and shows clinic and template billing profiles for pricing admins', async () => {
    setupProfile('admin');
    const fetchMock = setupFetch();

    render(<ServicesPricingSettings />);

    expect(
      await screen.findByText('院別メニューの会計設定')
    ).toBeInTheDocument();
    expect(screen.getByText('標準テンプレの会計設定')).toBeInTheDocument();
    expect(screen.getAllByText('健康保険: 公式マスタで保険計算')).toHaveLength(
      2
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/menus/${menuId}/billing-profiles?clinic_id=${clinicId}`,
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/menu-templates/${templateId}/billing-profiles?owner_clinic_id=${clinicId}`,
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });
  });

  it('does not fetch or render billing profile controls for manager even when isAdmin is true', async () => {
    setupProfile('manager');
    const fetchMock = setupFetch();

    render(<ServicesPricingSettings />);

    expect(await screen.findByText('登録済みメニュー')).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const requestedUrls = fetchMock.mock.calls.map(call =>
      urlFromFetchInput(call[0])
    );
    expect(requestedUrls.some(url => url.includes('billing-profiles'))).toBe(
      false
    );
    expect(
      screen.queryByText('院別メニューの会計設定')
    ).not.toBeInTheDocument();
  });

  it('creates a clinic billing profile from the menu card', async () => {
    setupProfile('clinic_admin');
    const fetchMock = setupFetch();
    const user = userEvent.setup();

    render(<ServicesPricingSettings />);

    await screen.findByText('院別メニューの会計設定');
    await user.selectOptions(screen.getByLabelText('保険施術 課金方式'), [
      'fixed_amount',
    ]);
    await user.clear(screen.getByLabelText('保険施術 固定金額'));
    await user.type(screen.getByLabelText('保険施術 固定金額'), '4500');
    await user.click(
      screen.getByRole('button', { name: '保険施術 会計設定追加' })
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/menus/${menuId}/billing-profiles`,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clinic_id: clinicId,
            revenueContextCode: 'private',
            calculationMethod: 'fixed_amount',
            fixedAmountYen: 4500,
            defaultPatientBurdenRate: null,
            professionType: null,
            requiresReview: false,
            effectiveFrom: '2026-05-01',
            effectiveTo: null,
            isActive: true,
          }),
        })
      );
    });
  });
});
