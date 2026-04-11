# Next.js LP実装プラン

> **目的**: 整骨院院長向けに問い合わせ・デモ申込を獲得するランディングページを構築する
> **技術スタック**: Next.js 15, React 19, TypeScript, Tailwind CSS
> **実装タイミング**: Notion ヘルプセンター公開後、集客を本格化するフェーズ

---

## 1. LPの目的とKPI

### ゴール

| ゴール | 指標 | 目標値 |
|--------|------|-------|
| 問い合わせ獲得 | フォーム送信数 / 月 | 10件以上 |
| デモ申込獲得 | デモ申込数 / 月 | 5件以上 |
| 認知獲得 | ページ閲覧数 / 月 | 500 PV以上 |
| CVR | 訪問者→問い合わせ率 | 2%以上 |

### ターゲット

- 整骨院・接骨院の院長（1〜3院規模）
- 現在の課題：紙・Excel・LINEで予約管理している、経営数値を把握できていない
- ITリテラシー：スマホは使える、専門ツールは不慣れ

---

## 2. ページ構成（セクション設計）

### セクション一覧

| # | セクション名 | 役割 | コピーの方向性 |
|---|------------|------|-------------|
| 1 | **Hero** | 瞬時に価値を伝える | キャッチコピー + CTA |
| 2 | **課題提起** | 「これ、あるある」と共感させる | 現場の悩みを言語化 |
| 3 | **機能紹介** | 何ができるか示す | 機能ごとにベネフィットを伝える |
| 4 | **ビフォー・アフター** | 導入効果を具体的に示す | 数字・時間・手間の変化 |
| 5 | **スクリーンショット** | 実際の画面を見せる | 「使えそう」と感じさせる |
| 6 | **料金プラン** | 価格の不安を払拭する | シンプルな表形式 |
| 7 | **FAQ（簡易版）** | 最後の疑問を解消する | 5問程度 + ヘルプセンターURL |
| 8 | **CTA（問い合わせフォーム）** | コンバージョン | フォーム送信 |
| 9 | **フッター** | 信頼性・連絡先 | 会社情報・リンク |

---

## 3. ルーティング設計

### 配置案

```
src/app/
├── (marketing)/          # marketing レイアウトグループ（ヘッダー・フッター独立）
│   ├── layout.tsx        # LPとヘルプ系の共通レイアウト
│   ├── page.tsx          # LP本体（ルート /）
│   ├── pricing/
│   │   └── page.tsx      # 料金詳細ページ（LP から分離する場合）
│   └── contact/
│       └── page.tsx      # お問い合わせ完了ページ（/contact/thanks）
└── (app)/                # 既存の認証済みアプリ部分
    └── dashboard/ ...
```

**方針：**
- `/` をLPにする（現在のトップが何かを要確認）
- 既存の `/login`, `/admin/login` 等とレイアウトを分離するため Route Group を使用
- LPのみ `noindex` なし（SEO対象）、アプリ側は `noindex` 設定

---

## 4. 実装方針

### Server Component / Client Component の使い分け

| セクション | Component種別 | 理由 |
|-----------|-------------|------|
| Hero, 機能紹介, FAQ | Server Component | 静的コンテンツ、SEO対象 |
| お問い合わせフォーム | Client Component | インタラクション・バリデーション |
| スクリーンショット スライダー | Client Component | アニメーション |
| CTAボタン（スクロール追従） | Client Component | scroll イベント |

### フォーム実装方針（Server Actions）

```typescript
// src/app/(marketing)/actions.ts
'use server'

import { z } from 'zod'

const contactSchema = z.object({
  clinicName: z.string().min(1, '院名は必須です'),
  name: z.string().min(1, 'お名前は必須です'),
  email: z.string().email('正しいメールアドレスを入力してください'),
  phone: z.string().optional(),
  message: z.string().optional(),
})

export async function submitContact(formData: FormData) {
  const parsed = contactSchema.safeParse({
    clinicName: formData.get('clinicName'),
    name: formData.get('name'),
    email: formData.get('email'),
    phone: formData.get('phone'),
    message: formData.get('message'),
  })

  if (!parsed.success) {
    return { error: parsed.error.flatten() }
  }

  // TODO: メール送信（Resend等）またはSupabaseへ保存
  // await sendEmail(parsed.data)

  return { success: true }
}
```

### ファイル構成

```
src/app/(marketing)/
├── layout.tsx                    # マーケティング用レイアウト
├── page.tsx                      # LP本体（セクションを組み合わせる）
├── actions.ts                    # Server Actions（フォーム送信）
└── _components/                  # LP専用コンポーネント
    ├── HeroSection.tsx
    ├── PainPointSection.tsx
    ├── FeaturesSection.tsx
    ├── BeforeAfterSection.tsx
    ├── ScreenshotSection.tsx
    ├── PricingSection.tsx
    ├── FaqSection.tsx
    ├── ContactForm.tsx            # 'use client'
    ├── CtaBar.tsx                 # 'use client'（スクロール追従）
    └── MarketingHeader.tsx
```

### Notionヘルプセンターへのリンク配置

- FaqSection の末尾: 「さらに詳しくは → ヘルプセンター（Notion URL）」
- フッター: 「ヘルプ・よくある質問」リンク

---

## 5. コピーライティング案（Heroセクション）

### 案A — 課題直撃型

```
キャッチ：予約帳・Excel・LINE卒業。
          整骨院の経営、まるごとひとつに。

サブ：予約管理から患者分析・収益レポートまで、
     整骨院に特化したクラウド管理システム。
     初日から使える、30日で定着する。

CTA：無料でデモを見る →
```

### 案B — ベネフィット訴求型

```
キャッチ：「今月の売上、すぐわかる」
          整骨院の院長を、数字に強くする。

サブ：日報を入力するだけで、収益・患者数・スタッフ稼働率を
     AIが自動で分析。経営の勘を、データに変える。

CTA：14日間無料で試す →
```

### 案C — 共感型

```
キャッチ：施術に集中したいのに、
          事務作業が多すぎる。

サブ：予約調整・売上集計・シフト管理。
     整骨院の院長が抱えるその悩み、
     ひとつのシステムでまとめて解決します。

CTA：まず資料を見る →
```

**推奨**: 案Aまたは案Cをファーストビューに使用。A/Bテストで最終決定。

---

## 6. 実装優先順位とマイルストーン

### Phase 1：最小LP（1〜2日）

**ゴール**: 問い合わせフォームが動く状態にする

- [ ] `src/app/(marketing)/` のルート構成を作成
- [ ] `page.tsx` にHeroセクション + お問い合わせフォームだけ実装
- [ ] Server Actions でフォーム送信 → Supabase `contact_requests` テーブルに保存
- [ ] `/` でアクセス可能な状態にしてVercelにデプロイ

```sql
-- Supabase マイグレーション（Phase 1用）
create table contact_requests (
  id uuid primary key default gen_random_uuid(),
  clinic_name text not null,
  name text not null,
  email text not null,
  phone text,
  message text,
  created_at timestamptz default now()
);
```

### Phase 2：セクション充実（3〜5日）

**ゴール**: CVRを高める全セクションを実装

- [ ] 課題提起セクション
- [ ] 機能紹介セクション（アイコン + 説明）
- [ ] ビフォー・アフターセクション
- [ ] スクリーンショットセクション（実画面を使う）
- [ ] 料金プランセクション
- [ ] FaqセクションにNotionヘルプセンターURL追加

### Phase 3：SEO・計測強化（1〜2日）

- [ ] `metadata` 設定（title, description, OGP）
- [ ] `sitemap.xml` 生成
- [ ] Google Analytics / Vercel Analytics 導入
- [ ] フォームからの問い合わせに自動返信メール（Resend）

---

## 7. SEO設定

### metadata の設定

```typescript
// src/app/(marketing)/page.tsx
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '整骨院管理システム | 予約・患者・収益をひとつに',
  description:
    '整骨院・接骨院向けクラウド管理システム。予約管理・患者分析・収益レポート・AIチャット経営相談を一元化。初日から使えて30日で定着。',
  openGraph: {
    title: '整骨院管理システム',
    description: '整骨院の経営をデータで変える。',
    type: 'website',
    locale: 'ja_JP',
  },
  twitter: {
    card: 'summary_large_image',
  },
  robots: {
    index: true,
    follow: true,
  },
}
```

### sitemap.xml

```typescript
// src/app/sitemap.ts
import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://your-domain.com',
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 1,
    },
    {
      url: 'https://your-domain.com/contact',
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.5,
    },
  ]
}
```

---

## 8. デザインリファレンス

### 使用するUIコンポーネント

- **既存**: `shadcn/ui`（Button, Card, Input, Label）— すでにプロジェクトに導入済み
- **アイコン**: `lucide-react`（すでに導入済み）
- **アニメーション**: Tailwind の `transition` / `animate-` クラスで十分

### カラーパレット方針

既存の管理画面（青 `blue-600` ベース）を踏襲し、LPでも同系統の色を使う。

```
Primary:   blue-600 (#2563EB)
Secondary: gray-900 (#111827)
Accent:    indigo-500 (#6366F1)
Background: gray-50 (#F9FAFB)
```

### 参考にする構成パターン

- Hero: 左テキスト + 右スクリーンショット（デスクトップ）/ 上下積み（モバイル）
- 機能紹介: 3カラムカードグリッド（lg:grid-cols-3）
- ビフォー・アフター: 2カラム比較表
- 料金: 1〜2カラムのカード（シンプルに）

---

## チェックリスト

```
Phase 1（今すぐ）
  [ ] (marketing) Route Group を作成する
  [ ] HeroSection と ContactForm を実装する
  [ ] contact_requests テーブルをSupabaseに追加する
  [ ] Server Actions でフォーム送信を実装する
  [ ] Vercelにデプロイして動作確認する

Phase 2（次のスプリント）
  [ ] 全セクションを実装する
  [ ] スクリーンショットを用意して配置する
  [ ] FAQ にNotionヘルプセンターURLを追加する

Phase 3（計測・改善）
  [ ] metadata と sitemap.xml を設定する
  [ ] Vercel Analytics を有効化する
  [ ] 問い合わせ自動返信メールを実装する（Resend）
```

---

*整骨院管理SaaS — Next.js LP実装プラン*
*作成：2026年4月*
