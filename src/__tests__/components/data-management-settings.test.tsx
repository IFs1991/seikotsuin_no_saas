import React from 'react';
import { render, screen } from '@testing-library/react';

import { DataManagementSettings } from '@/components/admin/data-management-settings';

describe('DataManagementSettings', () => {
  it('未提供の操作やダミー件数を表示しない', () => {
    render(<DataManagementSettings />);

    expect(
      screen.getByRole('heading', {
        name: 'データ管理機能は現在提供していません',
      })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText('傷病名マスター')).not.toBeInTheDocument();
    expect(screen.queryByText('クリーンアップ実行')).not.toBeInTheDocument();
  });
});
