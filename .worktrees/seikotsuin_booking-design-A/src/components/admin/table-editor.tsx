'use client';

import React from 'react';
import { ImprovedTableEditor } from './improved-table-editor';

interface TableEditorProps {
  onTableChange?: (tableName: string) => void;
}

/**
 * レガシーTableEditorコンポーネント
 * 新しい分割されたコンポーネントのラッパー
 * @deprecated Use ImprovedTableEditor directly for new development
 */
const TableEditor: React.FC<TableEditorProps> = ({ onTableChange }) => {
  return <ImprovedTableEditor onTableChange={onTableChange} />;
};

export default TableEditor;

// 新しいコンポーネントの再エクスポート
export { ImprovedTableEditor } from './improved-table-editor';
export { TableSelector } from './table-selector';
export { DataTable } from './data-table';
export { DataFormDialog } from './data-form-dialog';
export { DeleteConfirmationDialog } from './delete-confirmation-dialog';
