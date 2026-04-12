# 公開面/認証後面 境界テスト仕様書

本書は `docs/architecture/public-app-separation.md` の設計仕様に基づき、route group `(public)` / `(app)` 分離後に壊れると致命的な境界仕様をテストケースとして定義する。

テストコードは含まない。テスト仕様の固定のみを目的とする。

---

## テスト対象外（明示的除外）

以下はテスト対象に含めない。

| 除外項目 | 理由 |
|----------|------|
| コピー文言の細部（ボタンラベル、説明文の表現） | 頻繁に変わる。境界テストの対象ではない |
| 余白・配色・フォントサイズの微差 | ビジュアルリグレッションの範疇 |
| CTA順序の軽微な調整 | レイアウトの自由度を阻害する |
| ビジュアルデザインの微差分 | デザインシステムの管轄 |
| スナップショットテスト | メンテナンスコストに見合わない。構造テストで代替する |

---

## 成果物1: テストケース一覧

### カテゴリA: 境界テスト（必須 -- middleware contract test）

壊れると即座にUXが崩れるもの。middleware関数を直接インポートし、Jestでユニットテストする。

#### A-1. 未認証ユーザーの保護ルートアクセス

未認証ユーザーが保護ルートにアクセスした場合、正しいログインページへリダイレクトされること。

| ID | テストケース | 入力パス | 期待リダイレクト先 | 検証ポイント |
|----|------------|---------|-------------------|------------|
| A-1-01 | 未認証 + /dashboard | `/dashboard` | `/login?redirectTo=/dashboard` | status 307, Location ヘッダー |
| A-1-02 | 未認証 + /reservations | `/reservations` | `/login?redirectTo=/reservations` | status 307, Location ヘッダー |
| A-1-03 | 未認証 + /patients | `/patients` | `/login?redirectTo=/patients` | status 307, Location ヘッダー |
| A-1-04 | 未認証 + /revenue | `/revenue` | `/login?redirectTo=/revenue` | status 307, Location ヘッダー |
| A-1-05 | 未認証 + /staff | `/staff` | `/login?redirectTo=/staff` | status 307, Location ヘッダー |
| A-1-06 | 未認証 + /daily-reports | `/daily-reports` | `/login?redirectTo=/daily-reports` | status 307, Location ヘッダー |
| A-1-07 | 未認証 + /chat | `/chat` | `/login?redirectTo=/chat` | status 307, Location ヘッダー |
| A-1-08 | 未認証 + /ai-insights | `/ai-insights` | `/login?redirectTo=/ai-insights` | status 307, Location ヘッダー |
| A-1-09 | 未認証 + /blocks | `/blocks` | `/login?redirectTo=/blocks` | status 307, Location ヘッダー |
| A-1-10 | 未認証 + /onboarding | `/onboarding` | `/login?redirectTo=/onboarding` | status 307, Location ヘッダー |
| A-1-11 | 未認証 + /multi-store | `/multi-store` | `/login?redirectTo=/multi-store` | status 307, Location ヘッダー |
| A-1-12 | 未認証 + /master-data | `/master-data` | `/login?redirectTo=/master-data` | status 307, Location ヘッダー |
| A-1-13 | 未認証 + /admin | `/admin` | `/admin/login?redirectTo=/admin` | **/admin/** は /admin/login へ |
| A-1-14 | 未認証 + /admin/settings | `/admin/settings` | `/admin/login?redirectTo=/admin/settings` | **/admin/** は /admin/login へ |
| A-1-15 | 未認証 + /admin/tenants | `/admin/tenants` | `/admin/login?redirectTo=/admin/tenants` | **/admin/** は /admin/login へ |
| A-1-16 | 未認証 + /admin/users | `/admin/users` | `/admin/login?redirectTo=/admin/users` | **/admin/** は /admin/login へ |
| A-1-17 | 未認証 + /admin/mfa-setup | `/admin/mfa-setup` | `/admin/login?redirectTo=/admin/mfa-setup` | **/admin/** は /admin/login へ |

**重要な分岐**: `/admin/**` パターンは `/admin/login` へ、それ以外の保護ルートは `/login` へリダイレクトされる。これが逆転すると管理者はログインできなくなる。

#### A-2. 未認証ユーザーの公開ルートアクセス

未認証ユーザーが公開ルートにアクセスした場合、リダイレクトされないこと。

| ID | テストケース | 入力パス | 期待結果 | 検証ポイント |
|----|------------|---------|---------|------------|
| A-2-01 | 未認証 + / | `/` | リダイレクトなし | status が 307 でない |
| A-2-02 | 未認証 + /login | `/login` | リダイレクトなし | status が 307 でない |
| A-2-03 | 未認証 + /admin/login | `/admin/login` | リダイレクトなし | status が 307 でない |
| A-2-04 | 未認証 + /admin/callback | `/admin/callback` | リダイレクトなし | status が 307 でない |
| A-2-05 | 未認証 + /invite | `/invite` | リダイレクトなし | status が 307 でない |
| A-2-06 | 未認証 + /terms | `/terms` | リダイレクトなし | status が 307 でない |
| A-2-07 | 未認証 + /privacy | `/privacy` | リダイレクトなし | status が 307 でない |
| A-2-08 | 未認証 + /register | `/register` | リダイレクトなし | status が 307 でない |
| A-2-09 | 未認証 + /register/verify | `/register/verify` | リダイレクトなし | status が 307 でない |
| A-2-10 | 未認証 + /unauthorized | `/unauthorized` | リダイレクトなし | status が 307 でない |

**注意**: `/`, `/terms`, `/privacy`, `/register`, `/register/verify`, `/unauthorized` は現在の middleware の `PROTECTED_ROUTE_PREFIXES` に含まれていないため、そもそも保護対象にならない。`/login`, `/invite` は `CLINIC_PUBLIC_ROUTES` として明示的に除外されている。`/admin/login`, `/admin/callback` は `ADMIN_PUBLIC_ROUTES` として除外されている。この組み合わせが正しく機能することを確認する。

#### A-3. 認証済みユーザーのロール別アクセス制御

| ID | テストケース | ユーザー状態 | 入力パス | 期待結果 | 検証ポイント |
|----|------------|-----------|---------|---------|------------|
| A-3-01 | staff + /admin | role=staff, active | `/admin` | リダイレクト → `/unauthorized` | Admin UIロール不足 |
| A-3-02 | therapist + /admin | role=therapist, active | `/admin` | リダイレクト → `/unauthorized` | Admin UIロール不足 |
| A-3-03 | admin + /admin | role=admin, active | `/admin` | リダイレクトなし（通過） | Admin UIロール保有 |
| A-3-04 | clinic_admin + /admin | role=clinic_admin, active | `/admin` | リダイレクトなし（通過） | Admin UIロール保有 |
| A-3-05 | clinic_manager + /admin | role=clinic_manager, active | `/admin` | リダイレクトなし（通過） | 互換マッピング clinic_manager → clinic_admin |
| A-3-06 | admin + /reservations | role=admin, active | `/reservations` | リダイレクト → `/admin` | adminロールは予約画面でなく管理画面へ |
| A-3-07 | staff + /reservations | role=staff, active | `/reservations` | リダイレクトなし（通過） | clinic系ロールはアクセス可 |
| A-3-08 | staff + /multi-store | role=staff, active | `/multi-store` | リダイレクト → `/unauthorized` | HQロール不足 |
| A-3-09 | admin + /multi-store | role=admin, active | `/multi-store` | リダイレクトなし（通過） | HQロール保有 |
| A-3-10 | inactive user + /admin | role=admin, inactive | `/admin` | リダイレクト → `/unauthorized` | アクティブでないユーザーは拒否 |

#### A-4. redirectTo パラメータの伝播

| ID | テストケース | 入力パス | 期待結果 | 検証ポイント |
|----|------------|---------|---------|------------|
| A-4-01 | redirectTo が保護ルートのパスを含む | `/dashboard` | redirectTo=/dashboard | パスがそのまま渡される |
| A-4-02 | redirectTo がネストされたパスを含む | `/reservations/new` | redirectTo=/reservations/new | ネストパスも保持される |
| A-4-03 | redirectTo が /admin/** のパス | `/admin/settings` | redirectTo=/admin/settings | admin系パスも保持される |

#### A-5. パイロットモード制御

| ID | テストケース | 環境変数 | ユーザー状態 | 入力パス | 期待結果 |
|----|------------|---------|-----------|---------|---------|
| A-5-01 | パイロットモードON + /chat | PILOT_MODE=true | 認証済み | `/chat` | リダイレクト → `/dashboard` |
| A-5-02 | パイロットモードON + /ai-insights | PILOT_MODE=true | 認証済み | `/ai-insights` | リダイレクト → `/dashboard` |
| A-5-03 | パイロットモードON + /blocks | PILOT_MODE=true | 認証済み | `/blocks` | リダイレクト → `/dashboard` |
| A-5-04 | パイロットモードON + /master-data | PILOT_MODE=true | 認証済み | `/master-data` | リダイレクト → `/dashboard` |
| A-5-05 | パイロットモードON + /admin/chat | PILOT_MODE=true | 認証済みadmin | `/admin/chat` | リダイレクト → `/dashboard` |
| A-5-06 | パイロットモードON + /admin/beta-monitoring | PILOT_MODE=true | 認証済みadmin | `/admin/beta-monitoring` | リダイレクト → `/dashboard` |
| A-5-07 | パイロットモードOFF + /chat | PILOT_MODE=false | 認証済み | `/chat` | リダイレクトなし（通過） |

#### A-6. セキュリティヘッダー

| ID | テストケース | 入力パス | 期待結果 | 検証ポイント |
|----|------------|---------|---------|------------|
| A-6-01 | 保護ルートに Cache-Control が設定される | `/dashboard` | Cache-Control: no-store, no-cache, must-revalidate | キャッシュ無効化 |
| A-6-02 | 公開ルートに Cache-Control が設定されない | `/login` | Cache-Control ヘッダーなし | 公開ページはキャッシュ可 |
| A-6-03 | 全ルートに CSP ヘッダーが設定される | `/` | Content-Security-Policy ヘッダーあり | CSP適用 |
| A-6-04 | 全ルートに nonce ヘッダーが設定される | `/dashboard` | x-nonce ヘッダーあり | nonce生成 |

---

### カテゴリB: レイアウト分離テスト（必須）

公開ページに app shell（Header/Sidebar/MobileBottomNav）が表示されないこと。React Testing Library でレンダリングテストする。

**前提**: route group 分離後、Root Layout は `ClientLayout` を含まず、`(app)/layout.tsx` が `ClientLayout` 相当の責務を持つ。`(public)/layout.tsx` はシンプルなラッパーのみ。

#### B-1. 公開ページに app shell が表示されないこと

| ID | テストケース | 対象レイアウト | 検証ポイント |
|----|------------|-------------|------------|
| B-1-01 | Public Layout に Header が含まれない | `(public)/layout.tsx` | `Header` コンポーネントがレンダーツリーに存在しない |
| B-1-02 | Public Layout に Sidebar が含まれない | `(public)/layout.tsx` | `Sidebar` コンポーネントがレンダーツリーに存在しない |
| B-1-03 | Public Layout に MobileBottomNav が含まれない | `(public)/layout.tsx` | `MobileBottomNav` コンポーネントがレンダーツリーに存在しない |
| B-1-04 | Public Layout に QueryProvider が含まれない | `(public)/layout.tsx` | `QueryProvider` がレンダーツリーに存在しない |
| B-1-05 | Public Layout に UserProfileProvider が含まれない | `(public)/layout.tsx` | `UserProfileProvider` がレンダーツリーに存在しない |
| B-1-06 | Public Layout に SelectedClinicProvider が含まれない | `(public)/layout.tsx` | `SelectedClinicProvider` がレンダーツリーに存在しない |

**テスト方法**: `(public)/layout.tsx` を直接レンダリングし、app shell の各コンポーネントに対応する DOM 要素（`role="banner"`, `role="navigation"` の sidebar 等）が存在しないことを確認する。あるいは、レイアウトのソースコードにこれらのコンポーネントの import が存在しないことを静的解析で確認する。

#### B-2. 認証後ページに app shell が表示されること

| ID | テストケース | 対象レイアウト | 検証ポイント |
|----|------------|-------------|------------|
| B-2-01 | App Layout に Header が含まれる | `(app)/layout.tsx` | `Header` コンポーネントがレンダーされる |
| B-2-02 | App Layout に Sidebar が含まれる | `(app)/layout.tsx` | `Sidebar` コンポーネントがレンダーされる |
| B-2-03 | App Layout に MobileBottomNav が含まれる | `(app)/layout.tsx` | `MobileBottomNav` コンポーネントがレンダーされる |
| B-2-04 | App Layout に QueryProvider が含まれる | `(app)/layout.tsx` | `QueryProvider` が Provider 階層に存在する |
| B-2-05 | App Layout に UserProfileProvider が含まれる | `(app)/layout.tsx` | `UserProfileProvider` が Provider 階層に存在する |
| B-2-06 | App Layout に SelectedClinicProvider が含まれる | `(app)/layout.tsx` | `SelectedClinicProvider` が Provider 階層に存在する |

**テスト方法**: `(app)/layout.tsx` をモック済み環境でレンダリングし、app shell を構成する DOM 要素が存在することを確認する。Supabase, profile fetch, clinic fetch は全てモックする。

#### B-3. Root Layout の責務が最小であること

| ID | テストケース | 対象ファイル | 検証ポイント |
|----|------------|-----------|------------|
| B-3-01 | Root Layout に ClientLayout の import がない | `src/app/layout.tsx` | `ClientLayout` の import/使用が存在しない |
| B-3-02 | Root Layout に Header の import がない | `src/app/layout.tsx` | `Header` の import が存在しない |
| B-3-03 | Root Layout に html/body が含まれる | `src/app/layout.tsx` | `<html lang="ja">` と `<body>` が存在する |
| B-3-04 | Root Layout に globals.css の import がある | `src/app/layout.tsx` | `globals.css` の import が存在する |

**テスト方法**: ファイルの import 文を静的に解析するか、レンダリングして構造を確認する。

---

### カテゴリC: 認証済みリダイレクトテスト（必須）

認証済みユーザーが公開ページに滞在しないこと。これらは middleware での実装が推奨されているため、middleware contract test として実装する。

**注意**: 現在の middleware にはこの機能がまだ実装されていない（`docs/architecture/public-app-separation.md` の「注意事項と制約」セクションで「追加する必要がある」と記載）。middleware への追加実装後にテスト可能になる。

#### C-1. 認証済みスタッフのリダイレクト

| ID | テストケース | ユーザー状態 | 入力パス | 期待リダイレクト先 | 検証ポイント |
|----|------------|-----------|---------|-------------------|------------|
| C-1-01 | 認証済みスタッフ + / | role=staff | `/` | `/dashboard` | 公開トップに滞在させない |
| C-1-02 | 認証済みスタッフ + /login | role=staff | `/login` | `/dashboard` | ログインページに滞在させない |
| C-1-03 | 認証済みスタッフ + /admin/login | role=staff | `/admin/login` | `/dashboard` | 管理者ログインにも滞在させない |
| C-1-04 | 認証済みスタッフ + /register | role=staff | `/register` | `/dashboard` | 既に登録済み |
| C-1-05 | 認証済みスタッフ + /register/verify | role=staff | `/register/verify` | `/dashboard` | 既に確認済み |

#### C-2. 認証済み管理者のリダイレクト

| ID | テストケース | ユーザー状態 | 入力パス | 期待リダイレクト先 | 検証ポイント |
|----|------------|-----------|---------|-------------------|------------|
| C-2-01 | 認証済み管理者 + / | role=admin | `/` | `/admin` | 管理者は管理画面へ |
| C-2-02 | 認証済み管理者 + /login | role=admin | `/login` | `/admin` | ログインページに滞在させない |
| C-2-03 | 認証済み管理者 + /admin/login | role=admin | `/admin/login` | `/admin` | 管理者ログインにも滞在させない |
| C-2-04 | 認証済み管理者 + /register | role=admin | `/register` | `/admin` | 既に登録済み |
| C-2-05 | 認証済み管理者 + /register/verify | role=admin | `/register/verify` | `/admin` | 既に確認済み |

#### C-3. 認証済みでも滞在可能な公開ページ

| ID | テストケース | ユーザー状態 | 入力パス | 期待結果 | 検証ポイント |
|----|------------|-----------|---------|---------|------------|
| C-3-01 | 認証済み + /invite | 認証済み（任意ロール） | `/invite` | リダイレクトなし | 招待受諾UIを表示 |
| C-3-02 | 認証済み + /terms | 認証済み（任意ロール） | `/terms` | リダイレクトなし | 利用規約は常に閲覧可 |
| C-3-03 | 認証済み + /privacy | 認証済み（任意ロール） | `/privacy` | リダイレクトなし | プライバシーポリシーは常に閲覧可 |
| C-3-04 | 認証済み + /unauthorized | 認証済み（任意ロール） | `/unauthorized` | リダイレクトなし | 権限エラー画面は常に表示可 |

---

### カテゴリD: スモークE2E（推奨）

Playwright で実際のブラウザ操作を行い、ユーザーフロー全体が動作することを確認する。

| ID | テストケース | 事前条件 | 操作 | 期待結果 |
|----|------------|---------|------|---------|
| D-1-01 | 公開トップからスタッフログインへ遷移 | 未認証ブラウザ | `/` にアクセス → スタッフログインCTAをクリック | `/login` に到達。ログインフォームが表示される |
| D-1-02 | 公開トップから管理者ログインへ遷移 | 未認証ブラウザ | `/` にアクセス → 管理者ログインCTAをクリック | `/admin/login` に到達。ログインフォームが表示される |
| D-1-03 | スタッフログイン成功後ダッシュボードへ | テスト用スタッフアカウント | `/login` でログイン | `/dashboard` に到達。Header と Sidebar が表示される |
| D-1-04 | 管理者ログイン成功後管理画面へ | テスト用管理者アカウント | `/admin/login` でログイン | `/admin/settings` に到達。Header と Sidebar が表示される |
| D-1-05 | スタッフログアウト後ログインページへ | ログイン済みスタッフ | `/logout` にアクセス | `/login` に到達。ログインフォームが表示される |
| D-1-06 | 管理者ログアウト後管理者ログインページへ | ログイン済み管理者 | `/admin/logout` にアクセス | `/admin/login` に到達 |
| D-1-07 | 未認証でダッシュボードにアクセス | 未認証ブラウザ | `/dashboard` にアクセス | `/login?redirectTo=/dashboard` にリダイレクト |
| D-1-08 | 未認証で管理画面にアクセス | 未認証ブラウザ | `/admin/settings` にアクセス | `/admin/login?redirectTo=/admin/settings` にリダイレクト |
| D-1-09 | ログイン後の公開トップリダイレクト | ログイン済みスタッフ | `/` にアクセス | `/dashboard` にリダイレクト（公開トップに滞在しない） |
| D-1-10 | ログイン後のログインページリダイレクト | ログイン済みスタッフ | `/login` にアクセス | `/dashboard` にリダイレクト（ログインページに滞在しない） |
| D-1-11 | 公開ページに app shell が表示されない | 未認証ブラウザ | `/login` にアクセス | Sidebar / Header が DOM に存在しない |
| D-1-12 | 認証後ページに app shell が表示される | ログイン済みスタッフ | `/dashboard` にアクセス | Sidebar / Header が DOM に存在する |

---

## 成果物2: Middleware Contract Test 設計

### テスト対象

- **ファイル**: `middleware.ts`（プロジェクトルート）
- **エクスポート関数**: `middleware(request: NextRequest): Promise<NextResponse>`
- **テストファイル配置先**: `src/__tests__/middleware.test.ts`（既存ファイルを拡張）

### モックすべき依存

| 依存 | モジュールパス | モック方針 |
|------|-------------|----------|
| Supabase SSR | `@supabase/ssr` | `createServerClient` をモック。`auth.getUser()` の戻り値でユーザー状態を制御する |
| auth-context | `@/lib/supabase/auth-context` | `fetchUserPermissionsRecord`, `fetchProfileStatus`, `resolvePermissionRecord`, `buildUserAuthAccessContext` をモック。ロールと権限を直接制御する |
| CSP設定 | `@/lib/security/csp-config` | `CSPConfig.generateNonce` → 固定nonce返却, `getGradualRolloutCSP` → 固定CSP文字列返却 |
| レート制限 | `@/lib/rate-limiting/middleware` | `applyRateLimits` → null返却（制限なし）, `getPathRateLimit` → 空配列返却 |
| 環境変数 | `process.env` | `NEXT_PUBLIC_PILOT_MODE`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `CSP_ROLLOUT_PHASE` を制御 |

### テストヘルパー設計

#### リクエスト生成ヘルパー

```
createMockRequest(pathname: string, options?: { method?: string }): NextRequest
```

既存のテストに `createMockRequest` が定義されている。そのまま活用する。

#### ユーザー状態制御ヘルパー

以下の3パターンのユーザー状態を切り替えるヘルパーを設計する。

| ヘルパー名 | 説明 | auth.getUser() の戻り値 | permissions の戻り値 |
|-----------|------|------------------------|-------------------|
| `mockUnauthenticated()` | 未認証ユーザー | `{ data: { user: null }, error: { message: 'not authenticated' } }` | N/A（呼ばれない） |
| `mockAuthenticatedStaff()` | 認証済みスタッフ | `{ data: { user: { id: 'staff-id', ... } }, error: null }` | `{ role: 'staff', clinic_id: 'clinic-1' }` |
| `mockAuthenticatedAdmin()` | 認証済み管理者 | `{ data: { user: { id: 'admin-id', ... } }, error: null }` | `{ role: 'admin', clinic_id: null }` |
| `mockAuthenticatedTherapist()` | 認証済みセラピスト | `{ data: { user: { id: 'therapist-id', ... } }, error: null }` | `{ role: 'therapist', clinic_id: 'clinic-1' }` |
| `mockAuthenticatedClinicAdmin()` | 認証済みクリニック管理者 | `{ data: { user: { id: 'cadmin-id', ... } }, error: null }` | `{ role: 'clinic_admin', clinic_id: 'clinic-1' }` |
| `mockAuthenticatedClinicManager()` | 互換マッピング対象 | `{ data: { user: { id: 'cmgr-id', ... } }, error: null }` | `{ role: 'clinic_manager', clinic_id: 'clinic-1' }` |
| `mockAuthenticatedInactiveAdmin()` | 非アクティブ管理者 | `{ data: { user: { id: 'inactive-id', ... } }, error: null }` | `{ role: 'admin', clinic_id: null }`, `is_active: false` |

### テストマトリクス

middleware の挙動は以下の3軸の組み合わせで決定される。

**軸1: ルートパス分類**

| 分類 | 代表パス | 保護? |
|------|---------|------|
| 公開（非保護、非public route） | `/`, `/terms`, `/privacy`, `/register`, `/register/verify`, `/unauthorized` | No |
| 公開（CLINIC_PUBLIC_ROUTES） | `/login`, `/invite` | PROTECTED だが明示除外 |
| 公開（ADMIN_PUBLIC_ROUTES） | `/admin/login`, `/admin/callback` | PROTECTED だが明示除外 |
| 保護（一般） | `/dashboard`, `/staff`, `/patients`, `/revenue`, `/daily-reports`, `/onboarding` | Yes |
| 保護（admin系） | `/admin`, `/admin/settings`, `/admin/tenants` | Yes + Admin UIロール必須 |
| 保護（HQ系） | `/multi-store` | Yes + HQロール必須 |
| 保護（clinic系） | `/reservations` | Yes + adminロールは /admin へリダイレクト |
| 保護（パイロットブロック） | `/chat`, `/ai-insights`, `/blocks`, `/master-data` | Yes + パイロットモード時ブロック |

**軸2: ユーザー状態**

| 状態 | 説明 |
|------|------|
| 未認証 | auth.getUser() が null/error |
| staff | role=staff, active |
| therapist | role=therapist, active |
| admin | role=admin, active |
| clinic_admin | role=clinic_admin, active |
| clinic_manager | role=clinic_manager, active（互換マッピング対象） |
| inactive | 任意ロール, is_active=false |

**軸3: 環境変数**

| 変数 | 値 |
|------|-----|
| PILOT_MODE | true / false |

### アサーション

各テストで以下を検証する。

| 検証項目 | 方法 |
|---------|------|
| リダイレクト発生の有無 | `response.status` が 307 であるか |
| リダイレクト先URL | `response.headers.get('location')` のパスとクエリパラメータ |
| redirectTo パラメータ | リダイレクト先URLの `searchParams.get('redirectTo')` |
| セキュリティヘッダー | `response.headers.get('Cache-Control')`, `response.headers.get('Content-Security-Policy')`, `response.headers.get('x-nonce')` |
| 通過（リダイレクトなし） | `response.status` が 307 でないこと（200 または NextResponse.next() 相当） |

### テスト構成

```
describe('Middleware Contract Tests')
  describe('A-1: 未認証ユーザーの保護ルートアクセス')
    it.each([保護ルートの配列])('未認証 + %s → 正しいログインへリダイレクト')
  describe('A-2: 未認証ユーザーの公開ルートアクセス')
    it.each([公開ルートの配列])('未認証 + %s → リダイレクトなし')
  describe('A-3: 認証済みユーザーのロール別アクセス制御')
    describe('Admin UIロールチェック')
      it.each([非admin系ロール])('%s + /admin → /unauthorized')
      it.each([admin系ロール])('%s + /admin → 通過')
    describe('HQロールチェック')
      it('staff + /multi-store → /unauthorized')
      it('admin + /multi-store → 通過')
    describe('Clinic系ロールチェック')
      it('admin + /reservations → /admin')
      it('staff + /reservations → 通過')
    describe('互換マッピング')
      it('clinic_manager + /admin → 通過（clinic_adminとして扱う）')
    describe('非アクティブユーザー')
      it('inactive admin + /admin → /unauthorized')
  describe('A-4: redirectTo パラメータの伝播')
    it.each([各保護ルート])('未認証 + %s → redirectTo=%s')
  describe('A-5: パイロットモード制御')
    it.each([ブロック対象ルート])('PILOT_MODE=true + %s → /dashboard')
    it.each([ブロック対象ルート])('PILOT_MODE=false + %s → 通過')
  describe('A-6: セキュリティヘッダー')
    it('保護ルートに Cache-Control ヘッダー設定')
    it('公開ルートに Cache-Control ヘッダーなし')
    it('全ルートに CSP ヘッダー設定')
    it('全ルートに nonce ヘッダー設定')
  describe('C: 認証済みリダイレクト（middleware追加実装後）')
    describe('C-1: 認証済みスタッフ')
      it.each([/, /login, /admin/login, /register, /register/verify])
        ('%s → /dashboard')
    describe('C-2: 認証済み管理者')
      it.each([/, /login, /admin/login, /register, /register/verify])
        ('%s → /admin')
    describe('C-3: 認証済みでも滞在可能')
      it.each([/invite, /terms, /privacy, /unauthorized])
        ('%s → リダイレクトなし')
```

### 実装上の注意

1. **既存テストとの整合**: `src/__tests__/middleware.test.ts` に既存の3テストケースがある。これを拡張する形で実装する。既存テストの `createMockRequest` ヘルパーとモック構成を再利用する。

2. **カテゴリCのテストは middleware 追加実装後に有効化**: 設計仕様書に「追加する必要がある」と記載されている機能（認証済みユーザーの公開ページリダイレクト）は、middleware にその実装が追加されるまで `describe.skip` または `it.todo` として記述する。

3. **auth-context モックの粒度**: 現在の middleware は `fetchUserPermissionsRecord`, `fetchProfileStatus`, `resolvePermissionRecord`, `buildUserAuthAccessContext` を呼んでいる。テストではこれらを個別にモックして、ロールと権限状態を直接制御する。`resolvePermissionRecord` と `buildUserAuthAccessContext` は純粋関数なのでモックせず実関数を使う選択肢もある。ただし、テストの独立性を保つためにはモックが推奨される。

4. **`matchesAnyPrefix` のエッジケース**: `/admin/login` は `PROTECTED_ROUTE_PREFIXES` の `/admin` にマッチするが、`ADMIN_PUBLIC_ROUTES` で除外される。この順序依存のロジックが正しく機能することを A-2-03 で検証する。

---

## 成果物3: E2E Smoke Test 設計

### テストランナー

Playwright（既存設定済み）

### テストファイル配置先

`src/__tests__/e2e-playwright/public-app-boundary.spec.ts`

### 前提条件

#### テストユーザー

既存の E2E テストインフラを再利用する。

| ユーザー種別 | 認証情報ソース | 備考 |
|------------|-------------|------|
| 管理者 | `ADMIN_EMAIL` / `ADMIN_PASSWORD`（fixtures） | `loginAsAdmin` ヘルパーで使用 |
| スタッフ | `STAFF_EMAIL` / `STAFF_PASSWORD`（fixtures） | `loginAsStaff` ヘルパーで使用 |
| 未認証 | ログインなし | 新規ブラウザコンテキスト |

#### 環境

| 項目 | 値 |
|------|-----|
| ベースURL | `PLAYWRIGHT_BASE_URL` または `http://127.0.0.1:3000` |
| Supabase | テスト用Supabaseプロジェクト |
| アプリ起動 | `npm run dev` または `npm run build && npm start` |

### テストシナリオ

#### シナリオ1: 未認証ユーザーのナビゲーション

```
前提: 新規ブラウザコンテキスト（Cookie なし）

ステップ1: / にアクセス
検証: 公開トップページが表示される
検証: Header（アプリ用）/ Sidebar が表示されない
検証: スタッフログインCTA と管理者ログインCTA が存在する

ステップ2: スタッフログインCTAをクリック
検証: /login に遷移する
検証: ログインフォームが表示される
検証: Sidebar が表示されない

ステップ3: ブラウザバックで / に戻る
検証: 公開トップに戻る

ステップ4: 管理者ログインCTAをクリック
検証: /admin/login に遷移する
検証: ログインフォームが表示される
検証: Sidebar が表示されない
```

#### シナリオ2: 未認証ユーザーの保護ルートアクセス拒否

```
前提: 新規ブラウザコンテキスト（Cookie なし）

ステップ1: /dashboard に直接アクセス
検証: /login にリダイレクトされる
検証: URL に redirectTo=/dashboard が含まれる

ステップ2: /admin/settings に直接アクセス
検証: /admin/login にリダイレクトされる
検証: URL に redirectTo=/admin/settings が含まれる

ステップ3: /reservations に直接アクセス
検証: /login にリダイレクトされる
検証: URL に redirectTo=/reservations が含まれる
```

#### シナリオ3: スタッフログイン → ダッシュボード → ログアウト

```
前提: テスト用スタッフアカウント

ステップ1: loginAsStaff(page) でログイン
検証: /dashboard に到達する

ステップ2: ダッシュボードの表示を確認
検証: Header が表示される（アプリヘッダー）
検証: Sidebar が表示される（ナビゲーション）
検証: MobileBottomNav が存在する（モバイルビューポート時）

ステップ3: /logout にアクセス
検証: /login にリダイレクトされる
検証: Sidebar が表示されない（公開ページに戻った）
```

#### シナリオ4: 管理者ログイン → 管理画面 → ログアウト

```
前提: テスト用管理者アカウント

ステップ1: loginAsAdmin(page) でログイン
検証: /admin/settings に到達する

ステップ2: 管理画面の表示を確認
検証: Header が表示される
検証: Sidebar が表示される

ステップ3: /admin/logout にアクセス
検証: /admin/login にリダイレクトされる
```

#### シナリオ5: 認証済みスタッフの公開ページリダイレクト

```
前提: loginAsStaff(page) でログイン済み

ステップ1: / にアクセス
検証: /dashboard にリダイレクトされる（公開トップに滞在しない）

ステップ2: /login にアクセス
検証: /dashboard にリダイレクトされる（ログインページに滞在しない）
```

#### シナリオ6: 認証済み管理者の公開ページリダイレクト

```
前提: loginAsAdmin(page) でログイン済み

ステップ1: / にアクセス
検証: /admin にリダイレクトされる（管理者は管理画面へ）

ステップ2: /login にアクセス
検証: /admin にリダイレクトされる
```

#### シナリオ7: レイアウト分離の視覚的確認

```
前提: 新規ブラウザコンテキスト

ステップ1: /terms にアクセス
検証: ページが表示される
検証: Sidebar セレクタ（data-testid="sidebar" 等）が DOM に存在しない

ステップ2: /privacy にアクセス
検証: ページが表示される
検証: Sidebar セレクタが DOM に存在しない

ステップ3: loginAsStaff(page) でログイン → /dashboard
検証: Sidebar セレクタが DOM に存在する
検証: Header セレクタが DOM に存在する
```

### 検証ポイントまとめ

| カテゴリ | 検証方法 | 判定基準 |
|---------|---------|---------|
| リダイレクト発生 | `page.url()` でリダイレクト後のURLを確認 | 期待するパスに一致 |
| リダイレクトなし | `page.url()` でアクセスしたURLのまま | パスが変わっていない |
| redirectTo 伝播 | `new URL(page.url()).searchParams.get('redirectTo')` | 期待するパスを含む |
| app shell 表示 | `page.locator('[data-testid="sidebar"]')` の存在確認 | `toBeVisible()` / `not.toBeVisible()` |
| Header 表示 | `page.locator('[data-testid="header"]')` または `role="banner"` | `toBeVisible()` / `not.toBeVisible()` |
| ページ表示 | `page.waitForLoadState('domcontentloaded')` | タイムアウトしない |

### data-testid の前提

E2E テストで app shell の有無を判定するため、以下の `data-testid` が付与されていることを前提とする（未付与の場合は改修タスクに含める）。

| コンポーネント | data-testid |
|-------------|------------|
| Header | `app-header` |
| Sidebar | `app-sidebar` |
| MobileBottomNav | `mobile-bottom-nav` |
| Public Layout ラッパー | `public-layout` |
| App Layout ラッパー | `app-layout` |

### E2E ヘルパー拡張

既存の `src/__tests__/e2e-playwright/helpers/auth.ts` を活用する。追加が必要なヘルパーは以下。

| ヘルパー名 | 用途 |
|-----------|------|
| `assertNoAppShell(page)` | Sidebar / Header / MobileBottomNav が DOM に存在しないことを確認 |
| `assertAppShellVisible(page)` | Sidebar / Header が DOM に存在し表示されていることを確認 |
| `assertRedirectedTo(page, expectedPath)` | 現在のURLパスが期待値と一致することを確認 |
| `assertRedirectToContains(page, paramName, paramValue)` | URLのクエリパラメータに期待値が含まれることを確認 |

---

## 優先度と実装順序

| 順序 | カテゴリ | 理由 |
|------|---------|------|
| 1 | A: Middleware Contract Test | middleware が壊れると全ルーティングが崩壊する。最優先。既存テストの拡張で実装可能 |
| 2 | B: レイアウト分離テスト | route group 分離の根幹。レイアウトが間違うと公開ページに app shell が露出する |
| 3 | C: 認証済みリダイレクト | middleware への追加実装が必要。実装後に有効化 |
| 4 | D: スモークE2E | 全体の統合確認。CIでの実行を推奨 |

---

## 参照ドキュメント

- `docs/architecture/public-app-separation.md` -- UXアーキテクト設計仕様
- `middleware.ts` -- 現行middleware実装
- `src/app/client-layout.tsx` -- 現行ClientLayout実装
- `src/lib/constants/roles.ts` -- ロール定義・互換マッピング
- `src/lib/supabase/auth-context.ts` -- 認証コンテキスト構築
- `src/__tests__/middleware.test.ts` -- 既存middleware テスト
- `src/__tests__/e2e-playwright/helpers/auth.ts` -- 既存E2Eヘルパー
