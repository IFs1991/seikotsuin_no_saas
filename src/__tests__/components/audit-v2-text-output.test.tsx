/** @jest-environment jsdom */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { PatientsTable } from '@/components/patients/patients-table';
import { sanitizeInput } from '@/lib/api-helpers';
import { escapeCsvCell } from '@/lib/csv-export';

describe('AUDIT-V2 F10 raw text output contexts', () => {
  it.each([
    'A&B',
    '<',
    '>',
    '"quotes"',
    '&amp;',
    '<img src=x onerror=alert(1)>',
  ])('patient React text and CSV retain the raw value: %s', input => {
    const raw = sanitizeInput(input);
    if (typeof raw !== 'string') throw new Error('Expected raw string');
    const { container } = render(
      <PatientsTable
        patients={[{ id: 'test-patient', name: raw, phone: '090', notes: raw }]}
        onEdit={() => undefined}
      />
    );
    expect(screen.getByRole('link').textContent).toBe(input);
    expect(container.querySelector('img,script')).toBeNull();
    expect(escapeCsvCell(raw)).toBe(`"${input.replace(/"/g, '""')}"`);
  });

  it.each(['=SUM(1,2)', ' +cmd', '-cmd', '@cmd', '\t=cmd', '\r=cmd'])(
    'CSV still neutralizes formula input: %s',
    raw => {
      expect(escapeCsvCell(raw)).toBe(`"'${raw}"`);
    }
  );
});
