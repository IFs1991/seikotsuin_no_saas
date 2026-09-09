/** @jest-environment jsdom */
import React from 'react';
import '@testing-library/jest-dom';
import { Blob as NodeBlob } from 'node:buffer';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SecurityDashboard } from '@/components/admin/SecurityDashboard';

describe('AUDIT-V2 F10 security report actual download', () => {
  const originalCreateUrl = Object.getOwnPropertyDescriptor(
    URL,
    'createObjectURL'
  );
  const originalBlob = Object.getOwnPropertyDescriptor(globalThis, 'Blob');
  let download: NodeBlob | null;
  beforeEach(() => {
    download = null;
    Object.defineProperty(globalThis, 'Blob', {
      configurable: true,
      value: NodeBlob,
    });
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: (blob: NodeBlob) => {
        download = blob;
        return 'blob:test';
      },
    });
    jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    jest.spyOn(global, 'fetch').mockImplementation(async input => {
      if (!String(input).includes('/events?'))
        return new Response(null, { status: 503 });
      return new Response(
        JSON.stringify({
          events: [
            {
              id: 'event-1',
              clinic_id: 'clinic-A',
              event_type: 'security_alert',
              severity_level: 'warning',
              event_description: 'memo",=1+1,"tail\n次の行',
              resolution_notes: '=SUM(1,2)',
              ip_address: '127.0.0.1',
              created_at: '2026-09-01T00:00:00Z',
              status: 'resolved',
            },
          ],
        }),
        { status: 200 }
      );
    });
  });
  afterEach(() => {
    jest.restoreAllMocks();
    if (originalCreateUrl)
      Object.defineProperty(URL, 'createObjectURL', originalCreateUrl);
    else Reflect.deleteProperty(URL, 'createObjectURL');
    if (originalBlob) Object.defineProperty(globalThis, 'Blob', originalBlob);
    else Reflect.deleteProperty(globalThis, 'Blob');
  });

  it('keeps embedded quotes/newlines in one field and neutralizes a formula cell', async () => {
    render(<SecurityDashboard clinicId='clinic-A' />);
    const button = await screen.findByRole('button', { name: /レポート/ });
    await waitFor(() =>
      expect(screen.getByText('memo",=1+1,"tail 次の行')).toBeInTheDocument()
    );
    fireEvent.click(button);
    const blob = download;
    if (!blob) throw new Error('No report was downloaded');
    const text = await blob.text();
    expect(text).toContain('"memo"",=1+1,""tail\n次の行"');
    expect(text).toContain('"\'=SUM(1,2)"');
    expect(text).toContain(
      '"イベントタイプ","重要度","説明","IPアドレス","日時","ステータス","解決メモ"\r\n'
    );
  });
});
