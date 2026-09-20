import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cnApp } from '@/components/ui/app-theme';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

describe('Design foundation accessibility', () => {
  it('applies Select content overrides only to the popup container', () => {
    render(
      <Select defaultOpen defaultValue='first'>
        <SelectTrigger aria-label='表示対象'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className='w-80 p-6' position='popper'>
          <SelectItem value='first'>確認項目</SelectItem>
        </SelectContent>
      </Select>
    );
    const content = screen.getByRole('listbox');
    expect(content).toHaveClass('w-80', 'p-6');
    const viewport = content.querySelector('[data-radix-select-viewport]');
    expect(viewport).toHaveClass('p-1');
    expect(viewport).not.toHaveClass('w-80', 'p-6');
  });
  it('preserves page-specific status colors and sizes over app defaults', () => {
    render(<Badge className='bg-green-100 text-green-800'>保存済み</Badge>);
    const badge = screen.getByText('保存済み');
    expect(badge).toHaveClass('bg-green-100', 'text-green-800');
    expect(badge).not.toHaveClass(
      'app:bg-primary',
      'app:text-primary-foreground'
    );
    expect(
      cnApp(
        'text-lg hover:bg-red-700',
        'app:text-base app:hover:bg-primary-hover app:focus-visible:ring-ring'
      )
    ).toBe('app:focus-visible:ring-ring text-lg hover:bg-red-700');
  });
  it('keeps disabled actions inert and exposes loading without changing the label', async () => {
    const onClick = jest.fn();
    render(
      <Button disabled aria-busy onClick={onClick}>
        保存中
      </Button>
    );
    const button = screen.getByRole('button', { name: '保存中' });
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('distinguishes read-only, disabled and invalid fields without changing their values', () => {
    render(
      <>
        <Input aria-label='閲覧専用' readOnly value='確認値' />
        <Input aria-label='無効' disabled value='確認値' />
        <Input
          aria-label='入力エラー'
          state='error'
          defaultValue='確認値'
          aria-describedby='error-description'
        />
        <p id='error-description'>入力内容を確認してください</p>
      </>
    );
    expect(screen.getByLabelText('閲覧専用')).not.toBeDisabled();
    expect(screen.getByLabelText('閲覧専用')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('無効')).toBeDisabled();
    expect(screen.getByLabelText('入力エラー')).toHaveAttribute(
      'aria-invalid',
      'true'
    );
    expect(screen.getByLabelText('入力エラー')).toHaveAccessibleDescription(
      '入力内容を確認してください'
    );
  });

  it('activates an interactive card from the keyboard without duplicating nested actions', () => {
    const onClick = jest.fn();
    render(
      <Card interactive onClick={onClick} aria-label='詳細'>
        <button>内部操作</button>
      </Card>
    );
    const card = screen.getByRole('button', { name: '詳細' });
    fireEvent.keyDown(card, { key: 'Enter' });
    fireEvent.keyDown(card, { key: ' ' });
    expect(onClick).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(screen.getByRole('button', { name: '内部操作' }), {
      key: 'Enter',
    });
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('keeps uncontrolled tab selection, supports arrow/Home/End and skips disabled tabs', async () => {
    render(
      <Tabs defaultValue='first'>
        <TabsList aria-label='表示切替'>
          <TabsTrigger value='first'>概要</TabsTrigger>
          <TabsTrigger value='disabled' disabled>
            準備中
          </TabsTrigger>
          <TabsTrigger value='last'>詳細</TabsTrigger>
        </TabsList>
        <TabsContent value='first'>概要本文</TabsContent>
        <TabsContent value='last'>詳細本文</TabsContent>
      </Tabs>
    );
    const first = screen.getByRole('tab', { name: '概要' });
    const last = screen.getByRole('tab', { name: '詳細' });
    first.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(last).toHaveFocus();
    expect(last).toHaveAttribute('aria-selected', 'true');
    const panel = screen.getByRole('tabpanel', { name: '詳細' });
    expect(last).toHaveAttribute('aria-controls', panel.id);
    expect(panel).toHaveTextContent('詳細本文');
    await userEvent.keyboard('{Home}');
    expect(first).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(last).toHaveFocus();
  });

  it('preserves controlled tab state and reports the requested value', async () => {
    const onValueChange = jest.fn();
    render(
      <Tabs value='first' onValueChange={onValueChange}>
        <TabsList>
          <TabsTrigger value='first'>概要</TabsTrigger>
          <TabsTrigger value='last'>詳細</TabsTrigger>
        </TabsList>
      </Tabs>
    );
    await userEvent.click(screen.getByRole('tab', { name: '詳細' }));
    expect(onValueChange).toHaveBeenCalledWith('last');
    expect(screen.getByRole('tab', { name: '概要' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });
});
