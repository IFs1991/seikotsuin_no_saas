'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter 
} from '@/components/ui/dialog';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Save, X } from 'lucide-react';
import { DataFormDialogProps, FormField } from '@/types/admin';

export const DataFormDialog: React.FC<DataFormDialogProps> = ({
  open,
  mode,
  formData,
  config,
  loading,
  onSubmit,
  onClose,
  onFieldChange
}) => {
  const [errors, setErrors] = useState<Record<string, string>>({});

  // フォームフィールドの生成
  const formFields: FormField[] = useMemo(() => {
    if (!config?.columns) return [];

    return Object.entries(config.columns)
      .filter(([key, columnConfig]) => {
        // 読み取り専用フィールドは編集時のみ表示
        if (columnConfig.readonly && mode === 'create') return false;
        // created_at, updated_atは除外
        if (['created_at', 'updated_at'].includes(key)) return false;
        return true;
      })
      .map(([key, columnConfig]) => ({
        name: key,
        type: columnConfig.type,
        label: columnConfig.label || key,
        required: columnConfig.required || false,
        readonly: columnConfig.readonly || false,
        value: formData[key] || getDefaultValue(columnConfig.type, columnConfig.default),
        maxLength: columnConfig.maxLength,
        min: columnConfig.min,
        max: columnConfig.max,
      }));
  }, [config, formData, mode]);

  // デフォルト値の取得
  function getDefaultValue(type: string, defaultValue?: any) {
    if (defaultValue !== undefined) return defaultValue;
    
    switch (type) {
      case 'boolean':
        return false;
      case 'integer':
      case 'decimal':
        return 0;
      case 'string':
      case 'text':
      case 'uuid':
      case 'timestamp':
      default:
        return '';
    }
  }

  // バリデーション
  const validateField = (field: FormField): string | null => {
    const { name, type, required, value, maxLength, min, max } = field;

    // 必須チェック
    if (required && (value === '' || value === null || value === undefined)) {
      return `${field.label}は必須項目です`;
    }

    // 値が空の場合は以降のチェックをスキップ
    if (value === '' || value === null || value === undefined) {
      return null;
    }

    // 型チェック
    switch (type) {
      case 'integer':
        if (!Number.isInteger(Number(value))) {
          return `${field.label}は整数で入力してください`;
        }
        break;
      case 'decimal':
        if (isNaN(Number(value))) {
          return `${field.label}は数値で入力してください`;
        }
        break;
      case 'uuid':
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (typeof value === 'string' && value && !uuidRegex.test(value)) {
          return `${field.label}は正しいUUID形式で入力してください`;
        }
        break;
    }

    // 長さチェック
    if (maxLength && typeof value === 'string' && value.length > maxLength) {
      return `${field.label}は${maxLength}文字以内で入力してください`;
    }

    // 範囲チェック
    if (min !== undefined && Number(value) < min) {
      return `${field.label}は${min}以上で入力してください`;
    }
    if (max !== undefined && Number(value) > max) {
      return `${field.label}は${max}以下で入力してください`;
    }

    return null;
  };

  // フィールド値変更処理
  const handleFieldChange = (name: string, value: any) => {
    onFieldChange(name, value);
    
    // エラーをクリア
    if (errors[name]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  // フォーム送信処理
  const handleSubmit = () => {
    // バリデーション実行
    const newErrors: Record<string, string> = {};
    formFields.forEach(field => {
      const error = validateField(field);
      if (error) {
        newErrors[field.name] = error;
      }
    });

    setErrors(newErrors);

    // エラーがある場合は送信しない
    if (Object.keys(newErrors).length > 0) {
      return;
    }

    onSubmit(formData);
  };

  // フィールドレンダリング
  const renderField = (field: FormField) => {
    const { name, type, label, required, readonly, value } = field;
    const error = errors[name];

    if (readonly && mode === 'edit') {
      return (
        <div key={name} className="space-y-2">
          <Label htmlFor={name}>{label} {required && <span className="text-red-500">*</span>}</Label>
          <Input
            id={name}
            value={String(value || '')}
            readOnly
            className="bg-muted"
          />
        </div>
      );
    }

    switch (type) {
      case 'boolean':
        return (
          <div key={name} className="flex items-center space-x-2">
            <Switch
              id={name}
              checked={Boolean(value)}
              onCheckedChange={(checked) => handleFieldChange(name, checked)}
              disabled={readonly}
            />
            <Label htmlFor={name}>{label} {required && <span className="text-red-500">*</span>}</Label>
          </div>
        );

      case 'text':
        return (
          <div key={name} className="space-y-2">
            <Label htmlFor={name}>{label} {required && <span className="text-red-500">*</span>}</Label>
            <Textarea
              id={name}
              value={String(value || '')}
              onChange={(e) => handleFieldChange(name, e.target.value)}
              maxLength={field.maxLength}
              disabled={readonly}
              className={error ? 'border-red-500' : ''}
            />
            {error && <p className="text-sm text-red-500">{error}</p>}
          </div>
        );

      case 'integer':
      case 'decimal':
        return (
          <div key={name} className="space-y-2">
            <Label htmlFor={name}>{label} {required && <span className="text-red-500">*</span>}</Label>
            <Input
              id={name}
              type="number"
              value={String(value || '')}
              onChange={(e) => {
                const val = type === 'integer' ? parseInt(e.target.value) || 0 : parseFloat(e.target.value) || 0;
                handleFieldChange(name, val);
              }}
              min={field.min}
              max={field.max}
              step={type === 'integer' ? 1 : 0.01}
              disabled={readonly}
              className={error ? 'border-red-500' : ''}
            />
            {error && <p className="text-sm text-red-500">{error}</p>}
          </div>
        );

      default:
        return (
          <div key={name} className="space-y-2">
            <Label htmlFor={name}>{label} {required && <span className="text-red-500">*</span>}</Label>
            <Input
              id={name}
              type={type === 'timestamp' ? 'datetime-local' : 'text'}
              value={String(value || '')}
              onChange={(e) => handleFieldChange(name, e.target.value)}
              maxLength={field.maxLength}
              disabled={readonly}
              className={error ? 'border-red-500' : ''}
            />
            {error && <p className="text-sm text-red-500">{error}</p>}
          </div>
        );
    }
  };

  // ダイアログが閉じられた時にエラーをクリア
  useEffect(() => {
    if (!open) {
      setErrors({});
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? '新規作成' : '編集'} - {config?.name}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create' 
              ? '新しいレコードを作成します。必須項目は必ず入力してください。'
              : '選択したレコードを編集します。変更したい項目を修正してください。'
            }
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {formFields.map(renderField)}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            <X className="h-4 w-4 mr-2" />
            キャンセル
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            <Save className="h-4 w-4 mr-2" />
            {loading ? '保存中...' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};