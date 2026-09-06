# PR-E production buildのCSP

基準main: c028573d089cb6085ab3e29121fa9fe4d2f923c0。Next15.5.21、CSP_ROLLOUT_PHASE=full-enforce。

## 再現と修正

1. 修正前の `npm run build` / `npm run start -- --port 3110` は成功するが、生成middleware manifestが空で `/login` にCSPが付かない。Next.jsはsrc/appと同階層のmiddlewareを読むため、既存root middlewareはproduction buildから未検出だった。`src/middleware.ts` を薄い入口として追加し、ロジックはroot一か所に維持。
2. 既存root middlewareはresponseにだけnonce/CSPを設定していた。SSR向けrequest headersにも生成値を設定し、クライアント指定値を上書きする。RootLayoutは `connection()` で静的HTMLの再利用を避ける。単体RED1件/既存39件成功→40件成功。
3. 次のproductionブラウザ検証ではSSR scriptsにnonceが付く一方、Next Imageが出す `style="color:transparent"` がCSP違反になった。login/admin login/headerのブランド画像だけで既定inline styleを出さない指定へ変更。サイズ・画像・class・themeは維持。
4. Reactのパスワード表示切替は動いたが、管理者loginへのclient navigationで `nextjs#bundler` のTrusted Types policy生成が拒否され、ページ全体の再読込へ退避することを再現。Next15の実生成webpackと公式ソースのpolicy名に一致する名前だけを許可。`require-trusted-types-for 'script'` は保持し、unsafe-inline / unsafe-eval / unsafe-hashesを追加していない。

## 検証方法

既存のnpmを使用し、依存追加なし。`playwright.production.config.ts` はloopback限定で、build後の `npm run start` を使用する。dev serverへ置換しない。fixtureを使わないlogin検証なのでDB・providerへ書き込まない。

```powershell
$env:NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54331'
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY = 'placeholder-anon-key'
$env:SUPABASE_SERVICE_ROLE_KEY = 'placeholder-service-role-key'
$env:NEXT_PUBLIC_APP_URL = 'http://localhost:3112'
$env:PLAYWRIGHT_BASE_URL = 'http://localhost:3112'
$env:CSP_ROLLOUT_PHASE = 'full-enforce'
npm run build
npm run test:e2e:pw -- --config playwright.production.config.ts
```

`production-csp.spec.ts` はCSP存在と厳格さ、SSRの全scripts nonce、React入力/表示切替、client navigationがfull reloadへ退避しないこと、console CSP違反とpageerrorなしを検証する。Windowsのworktree専用Jest globでCSP/middleware/layout関連9 suites / 116 tests成功。通常の全体Jest・型・lint・buildとCIの結果はPRに記録する。

最終production buildとブラウザ1件は成功（exit 0）。Windowsでは検証後のserver終了処理が停滞したため、起動したport 3112のPIDとcommandの一致を確認してその子プロセスだけを終了した。lint:ciは0 error / 129既存warnings、type-check成功。CIのBuild jobにも同じproductionブラウザ試験を追加し、build時と起動時のSupabase設定をloopback / dummyに固定する。

通常の `playwright.config.ts` はdev用なのでこのproduction専用specを対象外とし、専用configのtestMatchとCI Build jobで実行を保証する。試験をskipしてPASSにする設定ではない。

## 未検証と運用影響

- production buildでの認証後dashboard、reservations、予約create/update、daily report、manager/dashboardは **BLOCKED**。実Redis RESTと信頼proxy情報がないため既存のproduction認証guardが503で拒否する。認証制限を迂回してPASSにしない。専用環境と検証account、外部配送遮断を用意してCore100の実ログインを含む試験を行う必要がある。
- middleware登録後は既存のAPI rate limitも実行される。Redis未設定時のproduction API503は既存fail-closedの仕様。provider・本番・有料設定は変更していない。
- nonceによる全request動的SSRはNext.js仕様上必要。容量・応答時間の実測は別のBLOCKED事項であり、この試験を100院性能の証明にしない。
- `CSP_ROLLOUT_PHASE`、DSN等の実配備設定と監視受信は未検証。既存mobile専用CSPと認可・billing/RLSは変更しない。

## Design Rationale

Mode: EXTEND。利用者が画面を表示・操作できないCSP阻害を修正する。新しい行動誘導パターンは追加せず、Ethics Gateでは事実性・利用者利益・選択維持を満たす。既存login/admin login/headerの画像・寸法・classを再利用し、グローバルCSS、theme、共有UIのデフォルトは変更しない。DoD-06/07/09/10/11。

## 参照

- [最新Next.js CSPガイド](https://nextjs.org/docs/app/guides/content-security-policy)
- [Next15 CSPガイド](https://nextjs.org/docs/15/app/guides/content-security-policy)
- [Next15 middleware配置規則](https://nextjs.org/docs/15/app/api-reference/file-conventions/middleware)
- [Next15.5.21 webpack設定](https://github.com/vercel/next.js/blob/v15.5.21/packages/next/src/build/webpack-config.ts)

最新ガイドとinstalled Next15の実コードを照合しており、最新Nextのproxy.tsへのframework更新は行っていない。
