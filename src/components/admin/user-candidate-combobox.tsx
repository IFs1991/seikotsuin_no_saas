'use client';

import { Input } from '@/components/ui/input';
import {
  USER_CANDIDATE_MIN_SEARCH_LENGTH,
  type UserPermissionCandidate,
} from '@/lib/admin/users';
import { getRoleLabel } from '@/lib/constants/roles';

type UserCandidateComboboxProps = {
  candidates: UserPermissionCandidate[];
  disabled: boolean;
  error: string | null;
  hasSelectedUser: boolean;
  inputId: string;
  isOpen: boolean;
  listboxId: string;
  loading: boolean;
  selectedUserId: string;
  value: string;
  onOpenChange: (isOpen: boolean) => void;
  onSearchChange: (value: string) => void;
  onSelect: (candidate: UserPermissionCandidate) => void;
};

export function UserCandidateCombobox({
  candidates,
  disabled,
  error,
  hasSelectedUser,
  inputId,
  isOpen,
  listboxId,
  loading,
  selectedUserId,
  value,
  onOpenChange,
  onSearchChange,
  onSelect,
}: UserCandidateComboboxProps) {
  const trimmedValue = value.trim();
  const canSearch =
    trimmedValue.length >= USER_CANDIDATE_MIN_SEARCH_LENGTH && !hasSelectedUser;
  const showEmptyState =
    canSearch && !loading && !error && candidates.length === 0;

  return (
    <div className='space-y-2'>
      <label htmlFor={inputId} className='text-sm font-medium'>
        ユーザーを検索
      </label>
      <div className='relative'>
        <Input
          id={inputId}
          value={value}
          onChange={event => onSearchChange(event.target.value)}
          onFocus={() => onOpenChange(true)}
          onBlur={() => {
            setTimeout(() => onOpenChange(false), 120);
          }}
          placeholder='氏名・メールアドレスで検索'
          disabled={disabled}
          role='combobox'
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-haspopup='listbox'
          autoComplete='off'
        />
        {isOpen && !disabled && (
          <div
            id={listboxId}
            role='listbox'
            className='absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-md border bg-white shadow-lg'
          >
            {loading && (
              <div className='px-3 py-2 text-sm text-gray-500'>
                候補を読み込み中...
              </div>
            )}
            {error && (
              <div className='px-3 py-2 text-sm text-red-500'>{error}</div>
            )}
            {!loading && !error && hasSelectedUser && (
              <div className='px-3 py-2 text-sm text-gray-500'>
                選択済みです。変更する場合は入力し直してください。
              </div>
            )}
            {!loading && !error && !hasSelectedUser && !canSearch && (
              <div className='px-3 py-2 text-sm text-gray-500'>
                氏名またはメールアドレスを入力してください
              </div>
            )}
            {showEmptyState && (
              <div className='px-3 py-2 text-sm text-gray-500'>
                該当するユーザーがありません
              </div>
            )}
            {candidates.map(candidate => (
              <button
                key={candidate.user_id}
                type='button'
                role='option'
                aria-selected={selectedUserId === candidate.user_id}
                className='block w-full px-3 py-2 text-left hover:bg-blue-50 focus:bg-blue-50 focus:outline-none'
                onMouseDown={event => event.preventDefault()}
                onClick={() => onSelect(candidate)}
              >
                <span className='block text-sm font-medium text-gray-900'>
                  {candidate.full_name}
                </span>
                <span className='block text-xs text-gray-500'>
                  {candidate.email}
                  {candidate.clinic_name ? ` / ${candidate.clinic_name}` : ''}
                </span>
                {candidate.current_role && (
                  <span className='mt-1 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600'>
                    現在: {getRoleLabel(candidate.current_role)}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
      <p className='text-xs text-gray-500'>
        氏名で探して、メールアドレスで本人確認します。内部IDは自動で紐づきます。
      </p>
    </div>
  );
}
