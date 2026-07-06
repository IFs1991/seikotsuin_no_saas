import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PatientModal } from '@/components/patients/patient-modal';

function renderPatientModal(
  onSave: jest.Mock = jest.fn().mockResolvedValue(undefined)
) {
  const onClose = jest.fn();
  render(
    <PatientModal isOpen onClose={onClose} onSave={onSave} mode='create' />
  );
  return { onSave, onClose };
}

async function submitCreateForm() {
  await userEvent.click(screen.getByRole('button', { name: '登録' }));
}

describe('PatientModal', () => {
  it('rejects blank or whitespace-only names before submit', async () => {
    const { onSave } = renderPatientModal();

    fireEvent.change(screen.getByLabelText(/氏名/), {
      target: { value: '   ' },
    });
    await userEvent.type(screen.getByLabelText(/電話番号/), '090-0000-0000');
    await submitCreateForm();

    expect(await screen.findByText('氏名は必須です')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('rejects overlong phone numbers before submit', async () => {
    const { onSave } = renderPatientModal();

    await userEvent.type(screen.getByLabelText(/氏名/), '山田 太郎');
    fireEvent.change(screen.getByLabelText(/電話番号/), {
      target: { value: '1'.repeat(33) },
    });
    await submitCreateForm();

    expect(
      await screen.findByText('電話番号は32文字以内で入力してください')
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('rejects invalid email before submit', async () => {
    const { onSave } = renderPatientModal();

    await userEvent.type(screen.getByLabelText(/氏名/), '山田 太郎');
    await userEvent.type(screen.getByLabelText(/電話番号/), '090-0000-0000');
    await userEvent.type(
      screen.getByLabelText(/メールアドレス/),
      'invalid-email'
    );
    await submitCreateForm();

    expect(
      await screen.findByText('メールアドレスの形式が正しくありません')
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('rejects overlong notes before submit', async () => {
    const { onSave } = renderPatientModal();

    await userEvent.type(screen.getByLabelText(/氏名/), '山田 太郎');
    await userEvent.type(screen.getByLabelText(/電話番号/), '090-0000-0000');
    fireEvent.change(screen.getByLabelText(/メモ/), {
      target: { value: 'a'.repeat(2001) },
    });
    await submitCreateForm();

    expect(
      await screen.findByText('メモは2000文字以内で入力してください')
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('submits trimmed values', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    renderPatientModal(onSave);

    await userEvent.type(screen.getByLabelText(/氏名/), '  山田 太郎  ');
    await userEvent.type(
      screen.getByLabelText(/電話番号/),
      '  090-0000-0000  '
    );
    await userEvent.type(
      screen.getByLabelText(/メールアドレス/),
      '  patient@example.com  '
    );
    await userEvent.type(screen.getByLabelText(/メモ/), '  follow up  ');
    await submitCreateForm();

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        name: '山田 太郎',
        phone: '090-0000-0000',
        email: 'patient@example.com',
        notes: 'follow up',
        customAttributes: undefined,
      });
    });
  });
});
