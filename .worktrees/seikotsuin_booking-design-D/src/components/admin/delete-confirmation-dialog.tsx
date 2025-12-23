'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { AlertTriangle, Trash2, X } from 'lucide-react';

interface DeleteConfirmationDialogProps {
  open: boolean;
  title: string;
  itemName: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const DeleteConfirmationDialog: React.FC<
  DeleteConfirmationDialogProps
> = ({ open, title, itemName, loading = false, onConfirm, onCancel }) => {
  return (
    <Dialog open={open} onOpenChange={onCancel}>
      <DialogContent className='max-w-md'>
        <DialogHeader>
          <div className='flex items-center gap-3'>
            <div className='flex h-10 w-10 items-center justify-center rounded-full bg-red-100'>
              <AlertTriangle className='h-5 w-5 text-red-600' />
            </div>
            <div>
              <DialogTitle className='text-left'>削除の確認</DialogTitle>
              <DialogDescription className='text-left'>
                この操作は取り消すことができません
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className='py-4'>
          <p className='text-sm text-gray-600'>以下の{title}を削除しますか？</p>
          <div className='mt-3 p-3 bg-gray-50 rounded-md'>
            <p className='font-medium text-sm text-gray-900'>{itemName}</p>
          </div>
        </div>

        <DialogFooter className='gap-2'>
          <Button variant='outline' onClick={onCancel} disabled={loading}>
            <X className='h-4 w-4 mr-2' />
            キャンセル
          </Button>
          <Button variant='destructive' onClick={onConfirm} disabled={loading}>
            <Trash2 className='h-4 w-4 mr-2' />
            {loading ? '削除中...' : '削除する'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
