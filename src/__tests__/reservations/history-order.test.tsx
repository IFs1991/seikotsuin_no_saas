import React from 'react';
import { render, screen } from '@testing-library/react';
import { AppointmentHistoryPanel } from '@/app/(app)/reservations/components/AppointmentHistoryPanel';

it('preserves API history order when PostgreSQL timestamps differ within one millisecond', () => {
  const base = {
    customerId: 'patient',
    menuId: 'menu',
    staffId: 'staff',
    endTime: '2026-09-05T00:30:00Z',
  };
  render(
    <AppointmentHistoryPanel
      items={[
        {
          ...base,
          id: 'a',
          menuName: 'microsecond-newer',
          startTime: '2026-09-05T00:00:00.123999Z',
        },
        {
          ...base,
          id: 'z',
          menuName: 'microsecond-older',
          startTime: '2026-09-05T00:00:00.123001Z',
        },
      ]}
      currentAppointmentId='current'
      loading={false}
      error={null}
      hasMore={false}
      onLoadMore={() => {}}
      onRetry={() => {}}
    />
  );
  expect(
    screen.getAllByText(/microsecond-/).map(element => element.textContent)
  ).toEqual(['microsecond-newer', 'microsecond-older']);
});
