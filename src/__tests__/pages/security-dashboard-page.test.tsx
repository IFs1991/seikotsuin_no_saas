/** @jest-environment jsdom */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import SecurityDashboardPage from '@/app/(app)/admin/(protected)/security-dashboard/page';
import { UserProfileProvider } from '@/providers/user-profile-context';
import { SelectedClinicProvider } from '@/providers/selected-clinic-context';

const selectedClinicId = '123e4567-e89b-12d3-a456-426614174099';

jest.mock('@/components/admin/SecurityDashboard', () => ({
  SecurityDashboard: ({ clinicId }: { clinicId: string }) => (
    <div data-testid='security-dashboard'>clinic:{clinicId}</div>
  ),
}));

describe('SecurityDashboardPage', () => {
  it('uses selected active clinic for scoped admin with null profile clinic', () => {
    render(
      <UserProfileProvider
        value={{
          profile: {
            id: 'admin-1',
            email: 'admin@example.com',
            role: 'admin',
            clinicId: null,
            clinicName: null,
            isActive: true,
            isAdmin: true,
          },
          loading: false,
          error: null,
        }}
      >
        <SelectedClinicProvider
          initialClinicId={selectedClinicId}
          currentClinicId={null}
          clinics={[{ id: selectedClinicId, name: '分院' }]}
        >
          <SecurityDashboardPage />
        </SelectedClinicProvider>
      </UserProfileProvider>
    );

    expect(screen.getByTestId('security-dashboard')).toHaveTextContent(
      `clinic:${selectedClinicId}`
    );
  });
});
