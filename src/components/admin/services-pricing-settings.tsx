'use client';

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  CopyPlus,
  Edit,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from 'lucide-react';
import { useSelectedClinic } from '@/providers/selected-clinic-context';
import { useUserProfile } from '@/hooks/useUserProfile';
import type { Menu } from '@/types/reservation';
import { AdminMessage } from './AdminMessage';

type MenuCategory = 'treatment' | 'massage' | 'rehabilitation' | 'other';

interface MenuFormState {
  name: string;
  description: string;
  durationMinutes: string;
  price: string;
  category: MenuCategory;
  isInsuranceApplicable: boolean;
  isActive: boolean;
}

interface MenuPayload {
  clinic_id: string;
  id?: string;
  name: string;
  description: string;
  durationMinutes: number;
  price: number;
  category: MenuCategory;
  isInsuranceApplicable: boolean;
  isActive: boolean;
}

interface TemplatePayload {
  owner_clinic_id: string;
  id?: string;
  name: string;
  description: string;
  durationMinutes: number;
  price: number;
  category: MenuCategory;
  isInsuranceApplicable: boolean;
  isActive: boolean;
  displayOrder?: number;
}

interface MenuTemplate {
  id: string;
  ownerClinicId: string;
  name: string;
  description: string;
  durationMinutes: number;
  price: number;
  category?: string;
  isInsuranceApplicable: boolean;
  isActive: boolean;
  displayOrder: number;
}

interface TemplateScope {
  templates: MenuTemplate[];
  ownerClinicId: string;
  ownerClinicName: string;
  targetClinicId: string;
  isOwnerClinic: boolean;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

type CollectionUpdater<T> = (items: T[]) => T[];

const EMPTY_FORM: MenuFormState = {
  name: '',
  description: '',
  durationMinutes: '30',
  price: '0',
  category: 'treatment',
  isInsuranceApplicable: false,
  isActive: true,
};

const EMPTY_TEMPLATES: MenuTemplate[] = [];

const upsertById = <T extends { id: string }>(items: T[], item: T): T[] => {
  const index = items.findIndex(current => current.id === item.id);
  if (index === -1) return [...items, item];

  const next = [...items];
  next[index] = item;
  return next;
};

const MENU_CATEGORIES: Array<{ value: MenuCategory; label: string }> = [
  { value: 'treatment', label: '治療' },
  { value: 'massage', label: 'マッサージ' },
  { value: 'rehabilitation', label: 'リハビリ' },
  { value: 'other', label: 'その他' },
];

const getCategoryLabel = (value?: string) =>
  MENU_CATEGORIES.find(category => category.value === value)?.label ?? 'その他';

const buildMenuPayload = (
  clinicId: string,
  form: MenuFormState,
  id?: string
): MenuPayload => {
  const durationMinutes = Number(form.durationMinutes);
  const price = Number(form.price);

  if (!form.name.trim()) {
    throw new Error('メニュー名を入力してください');
  }
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    throw new Error('所要時間は1分以上で入力してください');
  }
  if (!Number.isFinite(price) || price < 0) {
    throw new Error('料金は0円以上で入力してください');
  }

  return {
    clinic_id: clinicId,
    id,
    name: form.name.trim(),
    description: form.description.trim(),
    durationMinutes,
    price,
    category: form.category,
    isInsuranceApplicable: form.isInsuranceApplicable,
    isActive: form.isActive,
  };
};

const buildTemplatePayload = (
  ownerClinicId: string,
  form: MenuFormState,
  id?: string
): TemplatePayload => {
  const menuPayload = buildMenuPayload(ownerClinicId, form, id);

  return {
    owner_clinic_id: ownerClinicId,
    id,
    name: menuPayload.name,
    description: menuPayload.description,
    durationMinutes: menuPayload.durationMinutes,
    price: menuPayload.price,
    category: menuPayload.category,
    isInsuranceApplicable: menuPayload.isInsuranceApplicable,
    isActive: menuPayload.isActive,
  };
};

const menuToForm = (menu: Menu): MenuFormState => ({
  name: menu.name,
  description: menu.description ?? '',
  durationMinutes: String(menu.durationMinutes),
  price: String(menu.price),
  category: (menu.category as MenuCategory | undefined) ?? 'other',
  isInsuranceApplicable: menu.isInsuranceApplicable ?? false,
  isActive: menu.isActive,
});

const templateToForm = (template: MenuTemplate): MenuFormState => ({
  name: template.name,
  description: template.description ?? '',
  durationMinutes: String(template.durationMinutes),
  price: String(template.price),
  category: (template.category as MenuCategory | undefined) ?? 'other',
  isInsuranceApplicable: template.isInsuranceApplicable,
  isActive: template.isActive,
});

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

async function readApiResponse<T>(
  response: Response,
  fallbackMessage: string
): Promise<T> {
  const result = (await response.json()) as ApiResponse<T>;

  if (!response.ok || !result.success || result.data === undefined) {
    throw new Error(result.error || fallbackMessage);
  }

  return result.data;
}

const fetchMenus = async (
  clinicId: string,
  signal?: AbortSignal
): Promise<Menu[]> => {
  const response = await fetch(
    `/api/menus?clinic_id=${encodeURIComponent(clinicId)}`,
    { signal }
  );
  return readApiResponse<Menu[]>(response, '施術メニューの取得に失敗しました');
};

const fetchTemplateScope = async (
  clinicId: string,
  signal?: AbortSignal
): Promise<TemplateScope> => {
  const response = await fetch(
    `/api/menu-templates?clinic_id=${encodeURIComponent(clinicId)}`,
    { signal }
  );
  return readApiResponse<TemplateScope>(
    response,
    '共通テンプレートの取得に失敗しました'
  );
};

interface MenuTemplateCardProps {
  template: MenuTemplate;
  clinicSelected: boolean;
  isOwnerClinic: boolean;
  saving: boolean;
  onApply: (template: MenuTemplate) => void;
  onEdit: (template: MenuTemplate) => void;
  onDelete: (template: MenuTemplate) => void;
}

const MenuTemplateCard = memo(function MenuTemplateCard({
  template,
  clinicSelected,
  isOwnerClinic,
  saving,
  onApply,
  onEdit,
  onDelete,
}: MenuTemplateCardProps) {
  return (
    <div className='rounded-md border border-gray-200 bg-white p-4'>
      <div className='mb-2 flex items-start justify-between gap-3'>
        <div>
          <div className='font-medium text-gray-900'>{template.name}</div>
          <div className='text-xs text-gray-500'>
            {getCategoryLabel(template.category)}
          </div>
        </div>
        <Badge
          variant={template.isInsuranceApplicable ? 'default' : 'secondary'}
        >
          {template.isInsuranceApplicable ? '保険' : '自費'}
        </Badge>
      </div>
      <div className='mb-3 text-sm text-gray-600'>{template.description}</div>
      <div className='mb-4 flex items-center justify-between text-sm'>
        <span className='inline-flex items-center text-gray-600'>
          <Clock className='mr-1 h-4 w-4' />
          {template.durationMinutes}分
        </span>
        <span className='font-medium text-gray-900'>
          {template.price.toLocaleString()}円
        </span>
      </div>
      <div className='flex flex-wrap gap-2'>
        <Button
          type='button'
          variant='outline'
          className='flex-1'
          onClick={() => onApply(template)}
          disabled={saving || !clinicSelected || !template.isActive}
        >
          <CopyPlus className='mr-2 h-4 w-4' />
          自院に追加
        </Button>
        {isOwnerClinic && (
          <>
            <Button
              type='button'
              variant='outline'
              size='icon'
              aria-label='テンプレート編集'
              onClick={() => onEdit(template)}
              disabled={saving}
            >
              <Edit className='h-4 w-4' />
            </Button>
            <Button
              type='button'
              variant='outline'
              size='icon'
              aria-label='テンプレート削除'
              className='text-red-600'
              onClick={() => onDelete(template)}
              disabled={saving}
            >
              <Trash2 className='h-4 w-4' />
            </Button>
          </>
        )}
      </div>
    </div>
  );
});

interface MenuListItemProps {
  menu: Menu;
  saving: boolean;
  onEdit: (menu: Menu) => void;
  onToggleActive: (menu: Menu) => void;
  onDelete: (menu: Menu) => void;
}

const MenuListItem = memo(function MenuListItem({
  menu,
  saving,
  onEdit,
  onToggleActive,
  onDelete,
}: MenuListItemProps) {
  return (
    <div className='flex flex-col gap-3 rounded-md border border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between'>
      <div className='min-w-0'>
        <div className='mb-2 flex flex-wrap items-center gap-2'>
          <div className='font-medium text-gray-900'>{menu.name}</div>
          <Badge variant={menu.isActive ? 'default' : 'secondary'}>
            {menu.isActive ? '有効' : '無効'}
          </Badge>
          <Badge variant={menu.isInsuranceApplicable ? 'outline' : 'secondary'}>
            {menu.isInsuranceApplicable ? '保険' : '自費'}
          </Badge>
        </div>
        <div className='flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600'>
          <span>{getCategoryLabel(menu.category)}</span>
          <span>{menu.durationMinutes}分</span>
          <span>{menu.price.toLocaleString()}円</span>
        </div>
        {menu.description && (
          <div className='mt-1 text-sm text-gray-500'>{menu.description}</div>
        )}
      </div>
      <div className='flex flex-wrap items-center gap-2'>
        <Button
          type='button'
          variant='outline'
          size='sm'
          onClick={() => onEdit(menu)}
          disabled={saving}
        >
          <Edit className='mr-2 h-4 w-4' />
          編集
        </Button>
        <Button
          type='button'
          variant='outline'
          size='sm'
          onClick={() => onToggleActive(menu)}
          disabled={saving}
        >
          <CheckCircle2 className='mr-2 h-4 w-4' />
          {menu.isActive ? '無効化' : '有効化'}
        </Button>
        <Button
          type='button'
          variant='outline'
          size='sm'
          className='text-red-600'
          onClick={() => onDelete(menu)}
          disabled={saving}
        >
          <Trash2 className='mr-2 h-4 w-4' />
          削除
        </Button>
      </div>
    </div>
  );
});

interface MenuEditorFormProps {
  form: MenuFormState;
  setForm: Dispatch<SetStateAction<MenuFormState>>;
  disabled: boolean;
  saving: boolean;
  editing: boolean;
  idPrefix: string;
  nameLabel: string;
  submitCreateLabel: string;
  submitEditLabel: string;
  insuranceAriaLabel: string;
  activeAriaLabel: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel?: () => void;
}

const MenuEditorForm = memo(function MenuEditorForm({
  form,
  setForm,
  disabled,
  saving,
  editing,
  idPrefix,
  nameLabel,
  submitCreateLabel,
  submitEditLabel,
  insuranceAriaLabel,
  activeAriaLabel,
  onSubmit,
  onCancel,
}: MenuEditorFormProps) {
  const updateField = useCallback(
    <K extends keyof MenuFormState>(key: K, value: MenuFormState[K]) => {
      setForm(prev => ({ ...prev, [key]: value }));
    },
    [setForm]
  );

  return (
    <form className='grid gap-4 md:grid-cols-2' onSubmit={onSubmit}>
      <div className='space-y-2'>
        <Label htmlFor={`${idPrefix}-name`}>{nameLabel}</Label>
        <Input
          id={`${idPrefix}-name`}
          value={form.name}
          onChange={event => updateField('name', event.target.value)}
          disabled={disabled}
        />
      </div>
      <div className='space-y-2'>
        <Label htmlFor={`${idPrefix}-category`}>カテゴリ</Label>
        <select
          id={`${idPrefix}-category`}
          className='flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm'
          value={form.category}
          onChange={event =>
            updateField('category', event.target.value as MenuCategory)
          }
          disabled={disabled}
        >
          {MENU_CATEGORIES.map(category => (
            <option key={category.value} value={category.value}>
              {category.label}
            </option>
          ))}
        </select>
      </div>
      <div className='space-y-2'>
        <Label htmlFor={`${idPrefix}-duration`}>所要時間（分）</Label>
        <Input
          id={`${idPrefix}-duration`}
          type='number'
          min={1}
          value={form.durationMinutes}
          onChange={event => updateField('durationMinutes', event.target.value)}
          disabled={disabled}
        />
      </div>
      <div className='space-y-2'>
        <Label htmlFor={`${idPrefix}-price`}>料金（円）</Label>
        <Input
          id={`${idPrefix}-price`}
          type='number'
          min={0}
          value={form.price}
          onChange={event => updateField('price', event.target.value)}
          disabled={disabled}
        />
      </div>
      <div className='space-y-2 md:col-span-2'>
        <Label htmlFor={`${idPrefix}-description`}>説明</Label>
        <Textarea
          id={`${idPrefix}-description`}
          value={form.description}
          onChange={event => updateField('description', event.target.value)}
          disabled={disabled}
        />
      </div>
      <div className='flex flex-wrap items-center gap-6 md:col-span-2'>
        <div className='flex items-center gap-2 text-sm text-gray-700'>
          <Switch
            aria-label={insuranceAriaLabel}
            checked={form.isInsuranceApplicable}
            onCheckedChange={checked =>
              updateField('isInsuranceApplicable', checked)
            }
            disabled={disabled}
          />
          <span>保険適用</span>
        </div>
        <div className='flex items-center gap-2 text-sm text-gray-700'>
          <Switch
            aria-label={activeAriaLabel}
            checked={form.isActive}
            onCheckedChange={checked => updateField('isActive', checked)}
            disabled={disabled}
          />
          <span>有効</span>
        </div>
      </div>
      <div className='flex justify-end gap-2 md:col-span-2'>
        {editing && onCancel && (
          <Button
            type='button'
            variant='outline'
            onClick={onCancel}
            disabled={saving}
          >
            キャンセル
          </Button>
        )}
        <Button type='submit' disabled={disabled}>
          {saving ? (
            <Loader2 className='mr-2 h-4 w-4 animate-spin' />
          ) : editing ? (
            <Save className='mr-2 h-4 w-4' />
          ) : (
            <Plus className='mr-2 h-4 w-4' />
          )}
          {editing ? submitEditLabel : submitCreateLabel}
        </Button>
      </div>
    </form>
  );
});

interface MenuEditDialogProps {
  menu: Menu | null;
  clinicSelected: boolean;
  saving: boolean;
  onSave: (menuId: string, form: MenuFormState) => Promise<void>;
  onClose: () => void;
}

const MenuEditDialog = memo(function MenuEditDialog({
  menu,
  clinicSelected,
  saving,
  onSave,
  onClose,
}: MenuEditDialogProps) {
  const [editForm, setEditForm] = useState<MenuFormState>(EMPTY_FORM);

  useEffect(() => {
    setEditForm(menu ? menuToForm(menu) : EMPTY_FORM);
  }, [menu]);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!menu) return;
      await onSave(menu.id, editForm);
    },
    [editForm, menu, onSave]
  );

  return (
    <Dialog
      open={Boolean(menu)}
      onOpenChange={open => {
        if (!open) onClose();
      }}
    >
      <DialogContent className='max-w-2xl max-h-[85vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>メニュー編集</DialogTitle>
          <DialogDescription>
            登録済みメニューの内容を更新します。
          </DialogDescription>
        </DialogHeader>
        <MenuEditorForm
          form={editForm}
          setForm={setEditForm}
          disabled={!clinicSelected || saving}
          saving={saving}
          editing
          idPrefix='menu-edit'
          nameLabel='メニュー名'
          submitCreateLabel='追加'
          submitEditLabel='更新'
          insuranceAriaLabel='保険適用'
          activeAriaLabel='有効'
          onSubmit={handleSubmit}
          onCancel={onClose}
        />
      </DialogContent>
    </Dialog>
  );
});

export function ServicesPricingSettings() {
  const { profile, loading: profileLoading } = useUserProfile();
  const { selectedClinicId } = useSelectedClinic();
  const clinicId = selectedClinicId ?? profile?.clinicId ?? null;

  const [menus, setMenus] = useState<Menu[]>([]);
  const [templateScope, setTemplateScope] = useState<TemplateScope | null>(
    null
  );
  const [form, setForm] = useState<MenuFormState>(EMPTY_FORM);
  const [templateForm, setTemplateForm] = useState<MenuFormState>(EMPTY_FORM);
  const [editingMenu, setEditingMenu] = useState<Menu | null>(null);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState('');
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const templates = templateScope?.templates ?? EMPTY_TEMPLATES;
  const isOwnerClinic = templateScope?.isOwnerClinic ?? false;

  const sortedMenus = useMemo(
    () =>
      [...menus].sort((a, b) =>
        a.name.localeCompare(b.name, 'ja', { numeric: true })
      ),
    [menus]
  );

  const sortedTemplates = useMemo(
    () =>
      [...templates].sort((a, b) => {
        if (a.displayOrder !== b.displayOrder) {
          return a.displayOrder - b.displayOrder;
        }
        return a.name.localeCompare(b.name, 'ja', { numeric: true });
      }),
    [templates]
  );

  const refreshAll = useCallback(
    async (signal?: AbortSignal) => {
      if (!clinicId) {
        setMenus([]);
        setTemplateScope(null);
        setError(null);
        setLoading(false);
        setTemplateLoading(false);
        return;
      }

      setLoading(true);
      setTemplateLoading(true);
      setError(null);

      const [menusResult, templateScopeResult] = await Promise.allSettled([
        fetchMenus(clinicId, signal),
        fetchTemplateScope(clinicId, signal),
      ]);

      if (signal?.aborted) return;

      const errors: string[] = [];
      if (menusResult.status === 'fulfilled') {
        setMenus(menusResult.value);
      } else {
        setMenus([]);
        errors.push(
          getErrorMessage(
            menusResult.reason,
            '施術メニューの取得に失敗しました'
          )
        );
      }

      if (templateScopeResult.status === 'fulfilled') {
        setTemplateScope(templateScopeResult.value);
      } else {
        setTemplateScope(null);
        errors.push(
          getErrorMessage(
            templateScopeResult.reason,
            '共通テンプレートの取得に失敗しました'
          )
        );
      }

      setError(errors[0] ?? null);
      setLoading(false);
      setTemplateLoading(false);
    },
    [clinicId]
  );

  const handleRefresh = useCallback(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    const controller = new AbortController();
    void refreshAll(controller.signal);

    return () => {
      controller.abort();
    };
  }, [refreshAll]);

  const resetForm = useCallback(() => {
    setForm(EMPTY_FORM);
  }, []);

  const closeEditDialog = useCallback(() => {
    setEditingMenu(null);
  }, []);

  const resetTemplateForm = useCallback(() => {
    setTemplateForm(EMPTY_FORM);
    setEditingTemplateId(null);
  }, []);

  const updateTemplateList = useCallback(
    (updater: CollectionUpdater<MenuTemplate>) => {
      setTemplateScope(prev =>
        prev
          ? {
              ...prev,
              templates: updater(prev.templates),
            }
          : prev
      );
    },
    []
  );

  const saveMenu = useCallback(
    async (payload: MenuPayload, method: 'POST' | 'PATCH') => {
      const response = await fetch('/api/menus', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      return readApiResponse<Menu>(
        response,
        '施術メニューの保存に失敗しました'
      );
    },
    []
  );

  const saveTemplate = useCallback(
    async (payload: TemplatePayload, method: 'POST' | 'PATCH') => {
      const response = await fetch('/api/menu-templates', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      return readApiResponse<MenuTemplate>(
        response,
        '共通テンプレートの保存に失敗しました'
      );
    },
    []
  );

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!clinicId) {
        setError('clinic_id が取得できません');
        return;
      }

      setSaving(true);
      setError(null);
      setSavedMessage('');
      try {
        const payload = buildMenuPayload(clinicId, form);
        const savedMenu = await saveMenu(payload, 'POST');
        setMenus(prev => upsertById(prev, savedMenu));
        resetForm();
        setSavedMessage('メニューを追加しました');
      } catch (err) {
        setError(getErrorMessage(err, '施術メニューの保存に失敗しました'));
      } finally {
        setSaving(false);
      }
    },
    [clinicId, form, resetForm, saveMenu]
  );

  const saveEditedMenu = useCallback(
    async (menuId: string, editForm: MenuFormState) => {
      if (!clinicId) {
        setError('編集対象のメニューが見つかりません');
        return;
      }

      setSaving(true);
      setError(null);
      setSavedMessage('');
      try {
        const payload = buildMenuPayload(clinicId, editForm, menuId);
        const savedMenu = await saveMenu(payload, 'PATCH');
        setMenus(prev => upsertById(prev, savedMenu));
        closeEditDialog();
        setSavedMessage('メニューを更新しました');
      } catch (err) {
        setError(getErrorMessage(err, '施術メニューの保存に失敗しました'));
      } finally {
        setSaving(false);
      }
    },
    [clinicId, closeEditDialog, saveMenu]
  );

  const handleTemplateSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const ownerClinicId = templateScope?.ownerClinicId;
      if (!ownerClinicId || !isOwnerClinic) {
        setError('共通テンプレートを編集できる対象クリニックではありません');
        return;
      }

      const wasEditing = Boolean(editingTemplateId);
      setSaving(true);
      setError(null);
      setSavedMessage('');
      try {
        const payload = buildTemplatePayload(
          ownerClinicId,
          templateForm,
          editingTemplateId ?? undefined
        );
        const savedTemplate = await saveTemplate(
          payload,
          wasEditing ? 'PATCH' : 'POST'
        );
        updateTemplateList(prev => upsertById(prev, savedTemplate));
        resetTemplateForm();
        setSavedMessage(
          wasEditing
            ? '共通テンプレートを更新しました'
            : '共通テンプレートを追加しました'
        );
      } catch (err) {
        setError(getErrorMessage(err, '共通テンプレートの保存に失敗しました'));
      } finally {
        setSaving(false);
      }
    },
    [
      editingTemplateId,
      isOwnerClinic,
      resetTemplateForm,
      saveTemplate,
      templateForm,
      templateScope?.ownerClinicId,
      updateTemplateList,
    ]
  );

  const applyTemplate = useCallback(
    async (template: MenuTemplate) => {
      if (!clinicId) {
        setError('clinic_id が取得できません');
        return;
      }

      setSaving(true);
      setError(null);
      setSavedMessage('');
      try {
        const response = await fetch('/api/menu-templates/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clinic_id: clinicId,
            template_id: template.id,
          }),
        });
        const savedMenu = await readApiResponse<Menu>(
          response,
          'テンプレートの追加に失敗しました'
        );

        setMenus(prev => upsertById(prev, savedMenu));
        setSavedMessage(`${template.name} を追加しました`);
      } catch (err) {
        setError(getErrorMessage(err, 'テンプレートの追加に失敗しました'));
      } finally {
        setSaving(false);
      }
    },
    [clinicId]
  );

  const handleEdit = useCallback((menu: Menu) => {
    setEditingMenu(menu);
    setError(null);
    setSavedMessage('');
  }, []);

  const handleTemplateEdit = useCallback((template: MenuTemplate) => {
    setTemplatesOpen(true);
    setEditingTemplateId(template.id);
    setTemplateForm(templateToForm(template));
    setError(null);
    setSavedMessage('');
  }, []);

  const handleTemplateDelete = useCallback(
    async (template: MenuTemplate) => {
      const ownerClinicId = templateScope?.ownerClinicId;
      if (!ownerClinicId || !isOwnerClinic) return;
      if (!window.confirm(`${template.name} を削除しますか？`)) return;

      setSaving(true);
      setError(null);
      setSavedMessage('');
      try {
        const response = await fetch(
          `/api/menu-templates?owner_clinic_id=${encodeURIComponent(
            ownerClinicId
          )}&id=${encodeURIComponent(template.id)}`,
          { method: 'DELETE' }
        );
        await readApiResponse<{ deleted: true }>(
          response,
          '共通テンプレートの削除に失敗しました'
        );

        if (editingTemplateId === template.id) resetTemplateForm();
        updateTemplateList(prev =>
          prev.filter(current => current.id !== template.id)
        );
        setSavedMessage('共通テンプレートを削除しました');
      } catch (err) {
        setError(getErrorMessage(err, '共通テンプレートの削除に失敗しました'));
      } finally {
        setSaving(false);
      }
    },
    [
      editingTemplateId,
      isOwnerClinic,
      resetTemplateForm,
      templateScope?.ownerClinicId,
      updateTemplateList,
    ]
  );

  const handleToggleActive = useCallback(
    async (menu: Menu) => {
      if (!clinicId) return;

      setSaving(true);
      setError(null);
      setSavedMessage('');
      try {
        const savedMenu = await saveMenu(
          {
            clinic_id: clinicId,
            id: menu.id,
            name: menu.name,
            description: menu.description ?? '',
            durationMinutes: menu.durationMinutes,
            price: menu.price,
            category: (menu.category as MenuCategory | undefined) ?? 'other',
            isInsuranceApplicable: menu.isInsuranceApplicable ?? false,
            isActive: !menu.isActive,
          },
          'PATCH'
        );
        setMenus(prev => upsertById(prev, savedMenu));
        setSavedMessage(
          menu.isActive
            ? 'メニューを無効化しました'
            : 'メニューを有効化しました'
        );
      } catch (err) {
        setError(getErrorMessage(err, 'メニュー状態の更新に失敗しました'));
      } finally {
        setSaving(false);
      }
    },
    [clinicId, saveMenu]
  );

  const handleDelete = useCallback(
    async (menu: Menu) => {
      if (!clinicId) return;
      if (!window.confirm(`${menu.name} を削除しますか？`)) return;

      setSaving(true);
      setError(null);
      setSavedMessage('');
      try {
        const response = await fetch(
          `/api/menus?clinic_id=${encodeURIComponent(
            clinicId
          )}&id=${encodeURIComponent(menu.id)}`,
          { method: 'DELETE' }
        );
        await readApiResponse<{ deleted: true }>(
          response,
          '施術メニューの削除に失敗しました'
        );

        if (editingMenu?.id === menu.id) closeEditDialog();
        setMenus(prev => prev.filter(current => current.id !== menu.id));
        setSavedMessage('メニューを削除しました');
      } catch (err) {
        setError(getErrorMessage(err, '施術メニューの削除に失敗しました'));
      } finally {
        setSaving(false);
      }
    },
    [clinicId, closeEditDialog, editingMenu?.id]
  );

  if (profileLoading) {
    return (
      <div className='flex items-center justify-center py-12'>
        <Loader2 className='h-8 w-8 animate-spin text-blue-500' />
        <span className='ml-2 text-gray-600'>設定を読み込み中...</span>
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      {error && <AdminMessage message={error} type='error' />}
      {savedMessage && !error && (
        <AdminMessage message={savedMessage} type='success' />
      )}

      {!clinicId && (
        <AdminMessage message='対象クリニックを選択してください' type='error' />
      )}

      <Card>
        <CardHeader>
          <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
            <div>
              <CardTitle className='text-xl'>施術メニュー</CardTitle>
              <CardDescription>
                予約画面で使用する院別メニューを管理します
              </CardDescription>
            </div>
            <Button
              type='button'
              variant='outline'
              onClick={handleRefresh}
              disabled={loading || templateLoading || !clinicId}
            >
              <RefreshCw className='mr-2 h-4 w-4' />
              再読み込み
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <MenuEditorForm
            form={form}
            setForm={setForm}
            disabled={!clinicId || saving}
            saving={saving}
            editing={false}
            idPrefix='menu'
            nameLabel='メニュー名'
            submitCreateLabel='追加'
            submitEditLabel='更新'
            insuranceAriaLabel='保険適用'
            activeAriaLabel='有効'
            onSubmit={handleSubmit}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className='pb-4'>
          <button
            type='button'
            className='flex w-full items-start justify-between gap-3 text-left'
            aria-expanded={templatesOpen}
            onClick={() => setTemplatesOpen(prev => !prev)}
          >
            <div>
              <CardTitle className='text-lg'>メニューテンプレート</CardTitle>
              <CardDescription>
                {templateScope
                  ? `${templateScope.ownerClinicName} のテンプレートから院別メニューへ追加できます`
                  : '親テナントが用意したメニューのコピー元です'}
              </CardDescription>
            </div>
            <div className='flex items-center gap-2 text-sm text-gray-500'>
              {templateLoading ? (
                <Loader2 className='h-4 w-4 animate-spin' />
              ) : (
                <span>{sortedTemplates.length}件</span>
              )}
              {templatesOpen ? (
                <ChevronDown className='h-4 w-4' />
              ) : (
                <ChevronRight className='h-4 w-4' />
              )}
            </div>
          </button>
        </CardHeader>
        {templatesOpen && (
          <CardContent className='space-y-5'>
            {isOwnerClinic && (
              <div className='rounded-md border border-gray-200 p-4'>
                <MenuEditorForm
                  form={templateForm}
                  setForm={setTemplateForm}
                  disabled={!clinicId || saving}
                  saving={saving}
                  editing={Boolean(editingTemplateId)}
                  idPrefix='template'
                  nameLabel='テンプレート名'
                  submitCreateLabel='テンプレート追加'
                  submitEditLabel='テンプレート更新'
                  insuranceAriaLabel='テンプレート保険適用'
                  activeAriaLabel='テンプレート有効'
                  onSubmit={handleTemplateSubmit}
                  onCancel={resetTemplateForm}
                />
              </div>
            )}

            {templateLoading && (
              <div className='flex items-center py-4 text-sm text-gray-600'>
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                メニューテンプレートを読み込み中...
              </div>
            )}

            {!templateLoading && sortedTemplates.length === 0 && (
              <div className='rounded-md border border-dashed border-gray-300 p-6 text-sm text-gray-500'>
                メニューテンプレートはありません
              </div>
            )}

            <div className='grid gap-3 md:grid-cols-3'>
              {sortedTemplates.map(template => (
                <MenuTemplateCard
                  key={template.id}
                  template={template}
                  clinicSelected={Boolean(clinicId)}
                  isOwnerClinic={isOwnerClinic}
                  saving={saving}
                  onApply={applyTemplate}
                  onEdit={handleTemplateEdit}
                  onDelete={handleTemplateDelete}
                />
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className='text-lg'>登録済みメニュー</CardTitle>
        </CardHeader>
        <CardContent className='space-y-3'>
          {loading && (
            <div className='flex items-center py-6 text-sm text-gray-600'>
              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
              メニューを読み込み中...
            </div>
          )}
          {!loading && sortedMenus.length === 0 && (
            <div className='rounded-md border border-dashed border-gray-300 p-6 text-sm text-gray-500'>
              登録済みメニューはありません
            </div>
          )}
          {sortedMenus.map(menu => (
            <MenuListItem
              key={menu.id}
              menu={menu}
              saving={saving}
              onEdit={handleEdit}
              onToggleActive={handleToggleActive}
              onDelete={handleDelete}
            />
          ))}
        </CardContent>
      </Card>

      <MenuEditDialog
        menu={editingMenu}
        clinicSelected={Boolean(clinicId)}
        saving={saving}
        onSave={saveEditedMenu}
        onClose={closeEditDialog}
      />
    </div>
  );
}
