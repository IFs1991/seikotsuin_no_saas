export type ReservationStatusBucket = 'confirmed' | 'unconfirmed' | 'cancelled';

export type ReservationStatusRow = {
  status: string | null;
};

export type ReservationStatusSummary = {
  total: number;
  unconfirmed: number;
  cancelled: number;
};

function normalizeReservationStatus(value: string | null | undefined): string {
  return typeof value === 'string' ? value : '';
}

export function classifyReservationStatus(
  value: string | null | undefined
): ReservationStatusBucket {
  const status = normalizeReservationStatus(value);

  if (status === 'cancelled' || status === 'no_show' || status === 'noshow') {
    return 'cancelled';
  }

  if (
    status === 'unconfirmed' ||
    status === 'tentative' ||
    status === 'trial'
  ) {
    return 'unconfirmed';
  }

  return 'confirmed';
}

export function summarizeReservationStatuses(
  rows: readonly ReservationStatusRow[]
): ReservationStatusSummary {
  const summary: ReservationStatusSummary = {
    total: 0,
    unconfirmed: 0,
    cancelled: 0,
  };

  for (const row of rows) {
    const bucket = classifyReservationStatus(row.status);

    if (bucket === 'cancelled') {
      summary.cancelled += 1;
      continue;
    }

    summary.total += 1;
    if (bucket === 'unconfirmed') {
      summary.unconfirmed += 1;
    }
  }

  return summary;
}
