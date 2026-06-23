# UIコンポーネント仕様書

フロントエンド統合における不足UIコンポーネントの詳細仕様と実装案

## 📋 目次

- [概要](#概要)
- [優先度分類](#優先度分類)
- [高優先度コンポーネント](#高優先度コンポーネント)
- [中優先度コンポーネント](#中優先度コンポーネント)
- [低優先度コンポーネント](#低優先度コンポーネント)
- [実装ガイドライン](#実装ガイドライン)
- [テスト仕様](#テスト仕様)
- [パフォーマンス考慮事項](#パフォーマンス考慮事項)

## 🎯 概要

### 現状の課題

- **877個のTypeScriptエラー**の70%がUIコンポーネント不足
- shadcn/uiからRadix UIへの依存関係問題によりコンポーネントを最小化
- 医療系システムに適した清潔感のあるデザインが必要

### 設計思想

- **医療系UI/UX**: 清潔感と信頼性を重視
- **アクセシビリティ**: WCAG 2.1 AA準拠
- **レスポンシブ対応**: モバイルファーストデザイン
- **React 19対応**: 最新のReact機能活用

## 📊 優先度分類

### 🔴 高優先度（開発継続に必須）

エラー多発度: 高、使用頻度: 極高、実装難易度: 中

- [Tabs系](#tabs系コンポーネント) - 39ファイルで使用
- [Select系](#select系コンポーネント) - 34ファイルで使用
- [Dialog系](#dialog系コンポーネント) - 28ファイルで使用

### 🟡 中優先度（UX向上）

エラー多発度: 中、使用頻度: 高、実装難易度: 低-中

- [Alert/Badge系](#alertbadge系コンポーネント) - 22ファイルで使用
- [Avatar系](#avatar系コンポーネント) - 18ファイルで使用
- [DropdownMenu系](#dropdownmenu系コンポーネント) - 15ファイルで使用

### 🟢 低優先度（将来拡張）

エラー多発度: 低、使用頻度: 中、実装難易度: 高

- [Chart系](#chart系コンポーネント) - カスタムデータ可視化
- [複雑なフォーム系](#複雑なフォーム系コンポーネント) - 高度な入力UI

## 🔴 高優先度コンポーネント

### Tabs系コンポーネント

#### 使用箇所

- `src/app/ai-insights/page.tsx` - AIインサイト切り替え
- `src/app/revenue/page.tsx` - 収益分析カテゴリ
- `src/app/patients/page.tsx` - 患者分析タブ
- `src/components/dashboard/revenue-chart.tsx` - チャート期間切り替え

#### 仕様

```typescript
interface TabsProps {
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  orientation?: 'horizontal' | 'vertical';
  className?: string;
  children: React.ReactNode;
}

interface TabsListProps {
  className?: string;
  children: React.ReactNode;
}

interface TabsTriggerProps {
  value: string;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}

interface TabsContentProps {
  value: string;
  className?: string;
  children: React.ReactNode;
}
```

#### デザイン要件

- **医療系カラー**: プライマリーブルー (#1e3a8a) 使用
- **アクティブ状態**: 下線 + 背景色変更
- **ホバー効果**: 0.2s transition
- **フォーカス**: キーボードナビゲーション対応

#### 実装例

```tsx
// src/components/ui/tabs.tsx
export const Tabs = ({
  defaultValue,
  value,
  onValueChange,
  children,
  ...props
}) => {
  const [selectedValue, setSelectedValue] = useState(defaultValue || '');

  const handleValueChange = (newValue: string) => {
    setSelectedValue(newValue);
    onValueChange?.(newValue);
  };

  return (
    <div className='tabs-root' {...props}>
      <TabsContext.Provider
        value={{ selectedValue, onValueChange: handleValueChange }}
      >
        {children}
      </TabsContext.Provider>
    </div>
  );
};
```

---

### Select系コンポーネント

#### 使用箇所

- `src/app/multi-store/page.tsx` - 店舗フィルタリング
- `src/components/master/admin-master-form.tsx` - マスタデータ選択
- `src/components/reports/daily-report-form.tsx` - 施術者選択

#### 仕様

```typescript
interface SelectProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  children: React.ReactNode;
}

interface SelectItemProps {
  value: string;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}
```

#### デザイン要件

- **ドロップダウン**: 影付きで浮遊感
- **選択項目**: ホバー時にアクセントカラー
- **キーボード操作**: 矢印キー + Enter対応
- **バリデーション**: エラー時の赤枠表示

#### アクセシビリティ

- `aria-expanded` 属性
- `role="combobox"` 設定
- キーボードトラップ対応

---

### Dialog系コンポーネント

#### 使用箇所

- `src/app/staff/page.tsx` - スタッフ詳細表示
- `src/components/patients/risk-score-list.tsx` - 患者詳細モーダル
- `src/components/master/admin-master-form.tsx` - 確認ダイアログ

#### 仕様

```typescript
interface DialogProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  modal?: boolean;
  children: React.ReactNode;
}

interface DialogContentProps {
  className?: string;
  onPointerDownOutside?: (event: PointerEvent) => void;
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
  children: React.ReactNode;
}
```

#### デザイン要件

- **オーバーレイ**: 半透明黒背景 (rgba(0,0,0,0.5))
- **コンテンツ**: 中央配置、角丸、影付き
- **アニメーション**: フェードイン + スケール
- **最大幅**: 90vw、最大高さ: 90vh

#### 機能要件

- **ESCキー**: ダイアログ閉じる
- **外側クリック**: ダイアログ閉じる
- **フォーカストラップ**: ダイアログ内でのフォーカス循環

---

## 🟡 中優先度コンポーネント

### Alert/Badge系コンポーネント

#### Alert仕様

```typescript
interface AlertProps {
  variant?: 'default' | 'destructive' | 'warning' | 'success';
  className?: string;
  children: React.ReactNode;
}
```

#### Badge仕様

```typescript
interface BadgeProps {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success';
  size?: 'sm' | 'default' | 'lg';
  className?: string;
  children: React.ReactNode;
}
```

#### 医療系バリアント

- **success**: 正常状態 (#10b981)
- **warning**: 注意状態 (#f59e0b)
- **destructive**: 警告状態 (#ef4444)
- **info**: 情報表示 (#3b82f6)

---

### Avatar系コンポーネント

#### 使用箇所

- `src/app/staff/page.tsx` - スタッフプロフィール
- `src/components/dashboard/admin-dashboard.tsx` - 管理者表示
- `src/components/chat/admin-chat-interface.tsx` - チャット履歴

#### 仕様

```typescript
interface AvatarProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  fallback?: string;
  src?: string;
  alt?: string;
  className?: string;
}
```

#### デザイン要件

- **円形**: 完全な正円
- **フォールバック**: イニシャル表示
- **サイズバリエーション**: 24px, 32px, 48px, 64px
- **読み込み状態**: スケルトン表示

---

### DropdownMenu系コンポーネント

#### 使用箇所

- `src/app/dashboard/page.tsx` - アクションメニュー
- `src/components/navigation/sidebar.tsx` - ユーザーメニュー
- `src/app/admin/page.tsx` - 管理者操作

#### 仕様

```typescript
interface DropdownMenuProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  modal?: boolean;
  children: React.ReactNode;
}

interface DropdownMenuItemProps {
  disabled?: boolean;
  onSelect?: (event: Event) => void;
  className?: string;
  children: React.ReactNode;
}
```

#### インタラクション

- **矢印キー**: アイテム間移動
- **Enter/Space**: アイテム選択
- **ESC**: メニュー閉じる

---

## 🟢 低優先度コンポーネント

### Chart系コンポーネント

#### カスタムチャートラッパー

```typescript
interface MedicalChartProps {
  data: any[];
  type: 'bar' | 'line' | 'pie' | 'area';
  theme?: 'light' | 'dark';
  responsive?: boolean;
  height?: number;
  medicalColors?: boolean; // 医療系カラーパレット使用
}
```

#### 医療系カラーパレット

```css
:root {
  --chart-primary: #1e3a8a;
  --chart-secondary: #10b981;
  --chart-accent: #f59e0b;
  --chart-danger: #ef4444;
  --chart-muted: #6b7280;
}
```

---

### 複雑なフォーム系コンポーネント

#### DateRangePicker

```typescript
interface DateRangePickerProps {
  value?: { from: Date; to: Date };
  onValueChange?: (range: { from: Date; to: Date }) => void;
  placeholder?: string;
  className?: string;
}
```

#### MultiSelect

```typescript
interface MultiSelectProps {
  value?: string[];
  onValueChange?: (values: string[]) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  searchable?: boolean;
  maxItems?: number;
}
```

---

## 📋 実装ガイドライン

### ファイル構成

```
src/components/ui/
├── tabs.tsx              # Tabs系
├── select.tsx            # Select系
├── dialog.tsx            # Dialog系
├── alert.tsx             # Alert
├── badge.tsx             # Badge
├── avatar.tsx            # Avatar系
├── dropdown-menu.tsx     # DropdownMenu系
├── date-range-picker.tsx # DateRangePicker
├── multi-select.tsx      # MultiSelect
└── index.ts              # 全コンポーネントのエクスポート
```

### 命名規則

- **コンポーネント**: PascalCase (`Dialog`, `DialogContent`)
- **Props**: キャメルCase (`onValueChange`, `defaultValue`)
- **CSS Classes**: kebab-case (`dialog-content`, `tabs-trigger`)

### TypeScript仕様

```typescript
// 厳密な型定義
interface ComponentProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
}

// forwardRef使用
export const Component = React.forwardRef<HTMLDivElement, ComponentProps>(
  ({ variant = 'default', ...props }, ref) => {
    return <div ref={ref} {...props} />;
  }
);
Component.displayName = "Component";
```

### Tailwind CSS使用

```tsx
// cn()ユーティリティ使用
import { cn } from '@/lib/utils';

const Component = ({ className, variant, ...props }) => (
  <div
    className={cn('base-classes', variantClasses[variant], className)}
    {...props}
  />
);
```

---

## 🧪 テスト仕様

### 単体テスト

```typescript
// Jest + Testing Library
describe('Tabs Component', () => {
  it('should render with default value', () => {
    render(
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          <TabsTrigger value="tab2">Tab 2</TabsTrigger>
        </TabsList>
      </Tabs>
    );

    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('Tab 1');
  });
});
```

### アクセシビリティテスト

```typescript
// jest-axe使用
it('should not have accessibility violations', async () => {
  const { container } = render(<Component />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

### Visual Regression Testing

```typescript
// Storybook + Chromatic
export default {
  title: 'Components/Tabs',
  component: Tabs,
  parameters: {
    docs: { description: { component: 'Medical UI Tabs component' } },
  },
};
```

---

## ⚡ パフォーマンス考慮事項

### Bundle Size最適化

- **Tree Shaking**: 未使用コンポーネントの除外
- **Code Splitting**: ページ単位でのコンポーネント分割
- **Lazy Loading**: 重いコンポーネントの遅延読み込み

### レンダリング最適化

```typescript
// React.memo使用
export const ExpensiveComponent = React.memo(({ data }) => {
  return <ComplexVisualization data={data} />;
});

// useMemo/useCallback活用
const MemoizedChart = useMemo(() =>
  <Chart data={processedData} />, [processedData]
);
```

### CSS-in-JS回避

- **Tailwind CSS**: ランタイムCSSコスト削減
- **CSS Modules**: スコープ化CSS
- **PostCSS**: ビルド時最適化

---

## 📊 実装スケジュール

### Week 1: 高優先度コンポーネント

- **Day 1-2**: Tabs系コンポーネント
- **Day 3-4**: Select系コンポーネント
- **Day 5-7**: Dialog系コンポーネント

### Week 2: 中優先度コンポーネント

- **Day 1-2**: Alert/Badge系コンポーネント
- **Day 3-4**: Avatar系コンポーネント
- **Day 5-7**: DropdownMenu系コンポーネント

### Week 3: 低優先度 + テスト

- **Day 1-3**: Chart系コンポーネント
- **Day 4-5**: 複雑なフォーム系コンポーネント
- **Day 6-7**: テスト + ドキュメント整備

---

## 🎨 デザインシステム

### カラーパレット

```css
:root {
  /* Primary Colors (医療系ブルー) */
  --primary-50: #eff6ff;
  --primary-100: #dbeafe;
  --primary-500: #3b82f6;
  --primary-600: #1e3a8a;
  --primary-700: #1d4ed8;

  /* Accent Colors (医療系グリーン) */
  --accent-50: #f0fdf4;
  --accent-100: #dcfce7;
  --accent-500: #10b981;
  --accent-600: #059669;

  /* Status Colors */
  --success: #10b981;
  --warning: #f59e0b;
  --error: #ef4444;
  --info: #3b82f6;
}
```

### Typography

```css
/* 日本語フォント対応 */
.font-medical {
  font-family: 'Inter', 'Noto Sans JP', 'Hiragino Sans', sans-serif;
}

/* サイズスケール */
.text-medical-xs {
  font-size: 0.75rem;
}
.text-medical-sm {
  font-size: 0.875rem;
}
.text-medical-base {
  font-size: 1rem;
}
.text-medical-lg {
  font-size: 1.125rem;
}
.text-medical-xl {
  font-size: 1.25rem;
}
```

### Spacing

```css
/* 医療系UI用のスペーシング */
.space-medical-xs {
  margin: 0.25rem;
}
.space-medical-sm {
  margin: 0.5rem;
}
.space-medical-md {
  margin: 1rem;
}
.space-medical-lg {
  margin: 1.5rem;
}
.space-medical-xl {
  margin: 2rem;
}
```

---

## 🔄 移行戦略

### Phase 1: 基本コンポーネント (Week 1)

1. 高優先度コンポーネント実装
2. 既存エラーファイルでの動作確認
3. TypeScriptエラー50%削減目標

### Phase 2: UX向上コンポーネント (Week 2)

1. 中優先度コンポーネント実装
2. デザインシステム統一
3. TypeScriptエラー80%削減目標

### Phase 3: 高度なコンポーネント (Week 3)

1. 低優先度コンポーネント実装
2. パフォーマンス最適化
3. TypeScriptエラー95%削減目標

### ロールバック戦略

- 各週末にGitタグ作成
- 問題発生時は前週版に戻す
- 段階的なコンポーネント無効化機能

---

**整骨院グループ経営管理システム UIコンポーネント仕様書** - 医療現場に適した高品質なユーザーインターフェース設計
