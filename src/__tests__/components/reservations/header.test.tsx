/** @jest-environment jsdom */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { Header } from '@/app/reservations/components/Header';

describe('Reservation Header', () => {
  it('shows non-alert style when counts are zero', () => {
    render(
      <Header
        pendingCount={0}
        notificationCount={0}
        onOpenReservations={jest.fn()}
        onOpenNotifications={jest.fn()}
      />
    );

    expect(screen.getByText('確認済み')).toBeInTheDocument();
    expect(screen.getByText('お知らせなし')).toBeInTheDocument();
  });

  it('shows alert labels and counts when pending/notification exist', () => {
    render(
      <Header
        pendingCount={3}
        notificationCount={2}
        onOpenReservations={jest.fn()}
        onOpenNotifications={jest.fn()}
      />
    );

    expect(screen.getByText('未確認 3件')).toBeInTheDocument();
    expect(screen.getByText('未読 2件')).toBeInTheDocument();
  });
});
