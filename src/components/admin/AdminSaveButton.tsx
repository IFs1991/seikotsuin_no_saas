import React from 'react';
import { Button } from '@/components/ui/button';
import { Save } from 'lucide-react';

interface AdminSaveButtonProps {
  onSave: () => void;
  isLoading: boolean;
  disabled?: boolean;
  loadingText?: string;
  saveText?: string;
  showCancel?: boolean;
  onCancel?: () => void;
}

export function AdminSaveButton({
  onSave,
  isLoading,
  disabled = false,
  loadingText = '保存中...',
  saveText = '設定を保存',
  showCancel = true,
  onCancel,
}: AdminSaveButtonProps) {
  return (
    <div className='flex justify-end space-x-4 pt-6 border-t border-gray-200'>
      {showCancel && (
        <Button variant='outline' onClick={onCancel}>
          キャンセル
        </Button>
      )}
      <Button
        onClick={onSave}
        disabled={isLoading || disabled}
        className='flex items-center space-x-2'
      >
        <Save className='w-4 h-4' />
        <span>{isLoading ? loadingText : saveText}</span>
      </Button>
    </div>
  );
}
