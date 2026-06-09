'use client';

import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { Pencil, RefreshCw, Save, X } from 'lucide-react';
import { AdminFormCard } from '@/components/admin/admin-form-card';
import { AdminListCard } from '@/components/admin/admin-list-card';
import { AdminPageShell } from '@/components/admin/admin-page-shell';
import { AdminState } from '@/components/admin/admin-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useAdminTenants } from '@/hooks/useAdminTenants';
import { useManagerAssignments } from '@/hooks/useManagerAssignments';
import {
  MANAGER_ASSIGNMENT_EMPTY_DESCRIPTION,
  MANAGER_ASSIGNMENT_EMPTY_TITLE,
  buildReplaceManagerAssignmentsPayload,
  clinicOptionMatchesSearch,
  createManagerAssignmentFormState,
  filterAssignableClinicOptions,
  getAssignedClinicLabel,
  getManagerDisplayName,
  getManagerEmail,
  getPrimaryClinicLabel,
  hasManagerAssignmentChanges,
  managerMatchesSearch,
  setManagerAssignmentClinicSelected,
  type ManagerAssignedClinic,
  type ManagerAssignmentFormState,
  type ManagerListItem,
} from '@/lib/admin/manager-assignments';
import { normalizeRole } from '@/lib/constants/roles';
import { useUserProfileContext } from '@/providers/user-profile-context';

const NO_PRIMARY_CLINIC_VALUE = 'none';

type AssignmentChipListProps = {
  assignments: readonly ManagerAssignedClinic[];
  emptyLabel?: string;
};

const AssignmentChipList = memo(function AssignmentChipList({
  assignments,
  emptyLabel = '未割当',
}: AssignmentChipListProps) {
  if (assignments.length === 0) {
    return <span className='text-xs text-slate-500'>{emptyLabel}</span>;
  }

  return (
    <div className='flex max-w-md flex-wrap gap-1.5'>
      {assignments.map(assignment => (
        <Badge
          key={assignment.assignment_id}
          variant='outline'
          className='bg-white text-slate-700'
        >
          {getAssignedClinicLabel(assignment)}
        </Badge>
      ))}
    </div>
  );
});

type ManagerTableRowProps = {
  manager: ManagerListItem;
  selected: boolean;
  onEdit: (manager: ManagerListItem) => void;
};

const ManagerTableRow = memo(function ManagerTableRow({
  manager,
  selected,
  onEdit,
}: ManagerTableRowProps) {
  const displayName = getManagerDisplayName(manager);

  return (
    <TableRow className={selected ? 'bg-blue-50/70' : undefined}>
      <TableCell className='font-medium'>
        <div>{displayName}</div>
        <div className='mt-1 text-[11px] text-slate-400'>
          ID: {manager.user_id}
        </div>
      </TableCell>
      <TableCell>{getManagerEmail(manager)}</TableCell>
      <TableCell>{getPrimaryClinicLabel(manager)}</TableCell>
      <TableCell>{manager.assigned_clinic_count}</TableCell>
      <TableCell>
        <AssignmentChipList assignments={manager.assigned_clinics} />
      </TableCell>
      <TableCell>
        <Button
          type='button'
          size='sm'
          variant={selected ? 'secondary' : 'outline'}
          aria-label={`${displayName}を編集`}
          onClick={() => onEdit(manager)}
        >
          <Pencil className='mr-1 h-4 w-4' aria-hidden='true' />
          編集
        </Button>
      </TableCell>
    </TableRow>
  );
});

function filterManagers(
  managers: readonly ManagerListItem[],
  search: string
): ManagerListItem[] {
  return managers.filter(manager => managerMatchesSearch(manager, search));
}

function createClinicSelectionSet(
  clinicIds: readonly string[]
): ReadonlySet<string> {
  return new Set(clinicIds);
}

type PrimaryClinicOption = {
  id: string;
  name: string;
};

function createPrimaryClinicOptions({
  assignableClinicOptions,
  selectedClinicIds,
  selectedManager,
}: {
  assignableClinicOptions: readonly { id: string; name: string }[];
  selectedClinicIds: ReadonlySet<string>;
  selectedManager: ManagerListItem | null;
}): PrimaryClinicOption[] {
  const optionMap = new Map<string, string>();

  for (const clinic of assignableClinicOptions) {
    if (selectedClinicIds.has(clinic.id)) {
      optionMap.set(clinic.id, clinic.name);
    }
  }

  for (const assignment of selectedManager?.assigned_clinics ?? []) {
    if (selectedClinicIds.has(assignment.clinic_id)) {
      optionMap.set(assignment.clinic_id, getAssignedClinicLabel(assignment));
    }
  }

  return Array.from(optionMap, ([id, name]) => ({ id, name })).sort(
    (left, right) => left.name.localeCompare(right.name, 'ja')
  );
}

export default function AdminManagersPage() {
  const { profile, loading: profileLoading } = useUserProfileContext();
  const actorRole = normalizeRole(profile?.role);
  const canAccessPage = actorRole === 'admin';
  const {
    managers,
    loading,
    savingManagerUserId,
    error,
    fetchManagers,
    replaceManagerAssignments,
  } = useManagerAssignments();
  const {
    clinics,
    loading: clinicsLoading,
    error: clinicsError,
    fetchClinics,
  } = useAdminTenants();

  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [clinicSearch, setClinicSearch] = useState('');
  const deferredClinicSearch = useDeferredValue(clinicSearch);
  const [selectedManagerId, setSelectedManagerId] = useState<string | null>(
    null
  );
  const [formState, setFormState] = useState<ManagerAssignmentFormState>(() =>
    createManagerAssignmentFormState(null)
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [clinicOptionsRequested, setClinicOptionsRequested] = useState(false);

  useEffect(() => {
    if (profileLoading || !canAccessPage) {
      return;
    }

    const controller = new AbortController();
    void fetchManagers({ signal: controller.signal });

    return () => {
      controller.abort();
    };
  }, [canAccessPage, fetchManagers, profileLoading]);

  const selectedManager = useMemo(
    () =>
      managers.find(manager => manager.user_id === selectedManagerId) ?? null,
    [managers, selectedManagerId]
  );

  useEffect(() => {
    if (
      selectedManagerId &&
      !managers.some(manager => manager.user_id === selectedManagerId)
    ) {
      setSelectedManagerId(null);
      setFormState(createManagerAssignmentFormState(null));
      setNotice(null);
    }
  }, [managers, selectedManagerId]);

  const filteredManagers = useMemo(
    () => filterManagers(managers, deferredSearch),
    [deferredSearch, managers]
  );

  const assignableClinicOptions = useMemo(
    () => filterAssignableClinicOptions(clinics),
    [clinics]
  );

  const filteredClinicOptions = useMemo(
    () =>
      assignableClinicOptions.filter(clinic =>
        clinicOptionMatchesSearch(clinic, deferredClinicSearch)
      ),
    [assignableClinicOptions, deferredClinicSearch]
  );

  const selectedClinicIds = useMemo(
    () => createClinicSelectionSet(formState.clinicIds),
    [formState.clinicIds]
  );
  const primaryClinicOptions = useMemo(
    () =>
      createPrimaryClinicOptions({
        assignableClinicOptions,
        selectedClinicIds,
        selectedManager,
      }),
    [assignableClinicOptions, selectedClinicIds, selectedManager]
  );

  const hasChanges = useMemo(
    () =>
      selectedManager
        ? hasManagerAssignmentChanges(selectedManager, formState)
        : false,
    [formState, selectedManager]
  );
  const isSaving =
    selectedManager !== null && savingManagerUserId === selectedManager.user_id;

  const loadClinicOptions = useCallback(() => {
    setClinicOptionsRequested(true);
    fetchClinics({ isActive: true });
  }, [fetchClinics]);

  const handleRefresh = useCallback(() => {
    void fetchManagers();
    if (clinicOptionsRequested || selectedManagerId) {
      loadClinicOptions();
    }
  }, [
    clinicOptionsRequested,
    fetchManagers,
    loadClinicOptions,
    selectedManagerId,
  ]);

  const handleEdit = useCallback(
    (manager: ManagerListItem) => {
      setSelectedManagerId(manager.user_id);
      setFormState(createManagerAssignmentFormState(manager));
      setClinicSearch('');
      setNotice(null);

      if (!clinicOptionsRequested) {
        loadClinicOptions();
      }
    },
    [clinicOptionsRequested, loadClinicOptions]
  );

  const handleCancelEdit = useCallback(() => {
    setSelectedManagerId(null);
    setFormState(createManagerAssignmentFormState(null));
    setClinicSearch('');
    setNotice(null);
  }, []);

  const handleClinicSelectionChange = useCallback(
    (clinicId: string, selected: boolean) => {
      setFormState(current =>
        setManagerAssignmentClinicSelected(current, clinicId, selected)
      );
      setNotice(null);
    },
    []
  );

  const handleRevokeReasonChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      setFormState(current => ({
        ...current,
        revokeReason: event.target.value,
      }));
      setNotice(null);
    },
    []
  );

  const handlePrimaryClinicChange = useCallback((value: string) => {
    setFormState(current => ({
      ...current,
      primaryClinicId: value === NO_PRIMARY_CLINIC_VALUE ? '' : value,
    }));
    setNotice(null);
  }, []);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!selectedManager || !hasChanges) {
        return;
      }

      const result = await replaceManagerAssignments(
        selectedManager.user_id,
        buildReplaceManagerAssignmentsPayload(formState)
      );

      if (!result) {
        return;
      }

      setFormState({
        clinicIds: result.assignments.map(assignment => assignment.clinic_id),
        primaryClinicId: result.primary_clinic_id ?? '',
        revokeReason: '',
      });
      setNotice('担当店舗を更新しました');
    },
    [
      formState,
      hasChanges,
      replaceManagerAssignments,
      selectedManager,
      setFormState,
    ]
  );

  if (profileLoading) {
    return (
      <AdminPageShell title='マネージャー管理'>
        <AdminState variant='loading' title='権限を確認しています' />
      </AdminPageShell>
    );
  }

  if (!canAccessPage) {
    return (
      <AdminPageShell title='マネージャー管理'>
        <AdminState variant='error' title='管理者権限が必要です' />
      </AdminPageShell>
    );
  }

  return (
    <AdminPageShell
      title='マネージャー管理'
      description='エリアマネージャーの担当店舗を管理します。'
      contentClassName='max-w-7xl'
    >
      <div className='grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]'>
        <AdminListCard
          title='マネージャー一覧'
          searchId='admin-manager-search'
          searchValue={search}
          searchPlaceholder='氏名・メール・店舗名で検索'
          onSearchChange={setSearch}
          actions={
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={handleRefresh}
              disabled={loading}
            >
              <RefreshCw
                className={`mr-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`}
                aria-hidden='true'
              />
              更新
            </Button>
          }
        >
          {loading ? (
            <AdminState variant='loading' title='読み込み中です' />
          ) : error ? (
            <AdminState
              variant='error'
              title='マネージャー一覧の取得に失敗しました'
              description={error}
              actionLabel='再読み込み'
              onAction={handleRefresh}
            />
          ) : managers.length === 0 ? (
            <AdminState
              variant='empty'
              title={MANAGER_ASSIGNMENT_EMPTY_TITLE}
              description={MANAGER_ASSIGNMENT_EMPTY_DESCRIPTION}
            />
          ) : filteredManagers.length === 0 ? (
            <AdminState
              variant='empty'
              title='条件に一致するマネージャーがありません。'
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>氏名</TableHead>
                  <TableHead>メール</TableHead>
                  <TableHead>所属拠点</TableHead>
                  <TableHead>担当店舗数</TableHead>
                  <TableHead>担当店舗</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredManagers.map(manager => (
                  <ManagerTableRow
                    key={manager.user_id}
                    manager={manager}
                    selected={manager.user_id === selectedManagerId}
                    onEdit={handleEdit}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </AdminListCard>

        <AdminFormCard
          title='担当店舗編集'
          description='選択したマネージャーの担当店舗を保存します。'
        >
          {!selectedManager ? (
            <AdminState
              variant='empty'
              title='編集するマネージャーを選択してください'
            />
          ) : (
            <form onSubmit={handleSubmit} className='space-y-5'>
              <div className='space-y-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-3'>
                <div className='text-sm font-semibold text-slate-950'>
                  {getManagerDisplayName(selectedManager)}
                </div>
                <div className='text-xs text-slate-600'>
                  {getManagerEmail(selectedManager)}
                </div>
                <div className='text-xs text-slate-600'>
                  所属拠点: {getPrimaryClinicLabel(selectedManager)}
                </div>
              </div>

              <div className='space-y-2'>
                <div className='text-sm font-medium'>現在の担当店舗</div>
                <AssignmentChipList
                  assignments={selectedManager.assigned_clinics}
                />
              </div>

              <div className='space-y-2'>
                <label
                  htmlFor='admin-manager-primary-clinic'
                  className='text-sm font-medium'
                >
                  所属拠点（任意）
                </label>
                <Select
                  value={formState.primaryClinicId || NO_PRIMARY_CLINIC_VALUE}
                  onValueChange={handlePrimaryClinicChange}
                >
                  <SelectTrigger id='admin-manager-primary-clinic'>
                    <SelectValue placeholder='所属拠点を選択' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_PRIMARY_CLINIC_VALUE}>
                      未指定
                    </SelectItem>
                    {primaryClinicOptions.map(clinic => (
                      <SelectItem key={clinic.id} value={clinic.id}>
                        {clinic.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className='space-y-2'>
                <label
                  htmlFor='admin-manager-clinic-search'
                  className='text-sm font-medium'
                >
                  担当店舗を検索
                </label>
                <Input
                  id='admin-manager-clinic-search'
                  value={clinicSearch}
                  onChange={event => setClinicSearch(event.target.value)}
                  placeholder='店舗名で検索'
                />
              </div>

              <div className='space-y-2'>
                <div className='flex items-center justify-between gap-3'>
                  <span className='text-sm font-medium'>担当店舗</span>
                  <span className='text-xs text-slate-500'>
                    選択中 {selectedClinicIds.size}件
                  </span>
                </div>
                <div className='max-h-72 overflow-y-auto rounded-md border border-slate-200'>
                  {clinicsLoading ? (
                    <AdminState
                      variant='loading'
                      title='店舗候補を読み込み中です'
                      className='border-0'
                    />
                  ) : clinicsError ? (
                    <AdminState
                      variant='error'
                      title='店舗候補の取得に失敗しました'
                      description={clinicsError}
                      className='border-0'
                    />
                  ) : assignableClinicOptions.length === 0 ? (
                    <AdminState
                      variant='empty'
                      title='担当できる子店舗がありません。'
                      className='border-0'
                    />
                  ) : filteredClinicOptions.length === 0 ? (
                    <AdminState
                      variant='empty'
                      title='条件に一致する店舗がありません。'
                      className='border-0'
                    />
                  ) : (
                    <div className='divide-y divide-slate-100'>
                      {filteredClinicOptions.map(clinic => (
                        <label
                          key={clinic.id}
                          className='flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50'
                        >
                          <input
                            type='checkbox'
                            checked={selectedClinicIds.has(clinic.id)}
                            onChange={event =>
                              handleClinicSelectionChange(
                                clinic.id,
                                event.target.checked
                              )
                            }
                            className='h-4 w-4 rounded border-slate-300'
                          />
                          <span>{clinic.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className='space-y-2'>
                <label
                  htmlFor='admin-manager-revoke-reason'
                  className='text-sm font-medium'
                >
                  解除理由
                </label>
                <Textarea
                  id='admin-manager-revoke-reason'
                  value={formState.revokeReason}
                  maxLength={500}
                  onChange={handleRevokeReasonChange}
                  placeholder='例: 担当エリア変更'
                />
              </div>

              <div className='flex flex-wrap items-center gap-2'>
                <Button
                  type='submit'
                  disabled={
                    !hasChanges ||
                    isSaving ||
                    clinicsLoading ||
                    assignableClinicOptions.length === 0
                  }
                >
                  <Save className='mr-1 h-4 w-4' aria-hidden='true' />
                  保存
                </Button>
                <Button
                  type='button'
                  variant='outline'
                  onClick={handleCancelEdit}
                >
                  <X className='mr-1 h-4 w-4' aria-hidden='true' />
                  キャンセル
                </Button>
                {notice && (
                  <span className='text-sm text-emerald-600'>{notice}</span>
                )}
                {error && <span className='text-sm text-red-500'>{error}</span>}
              </div>
            </form>
          )}
        </AdminFormCard>
      </div>
    </AdminPageShell>
  );
}
