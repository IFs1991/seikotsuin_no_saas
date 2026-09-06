# main branch protection 推奨設定（未適用）

2026-09-06 JST、GitHub APIのbranches/mainはprotected=false、repository rulesetsは空配列。設定変更はユーザーの明示承認が必要なため、本書は提案のみ。

mainに対するPR必須、承認1名以上、更新時の旧承認失効、未解決conversationの解消、最新baseとのチェック成功を推奨する。force push・branch削除は許可しない。bypass主体を追加する場合はownerが範囲を明示する。

required status checksの候補（CI33996399702で実際に成功したcheck名）:

- Quality Checks
- Build
- Database Contract
- Security Tests
- Supabase Types Contract
- Fixture Preflight (Static)
- Full Jest Regression
- App E2E (Local Supabase + Chromium)

GitHub Actionsをcheckの提供元に指定する。schema/type driftの正本はDatabase Contract。Supabase Types Contractは既存check名の移行互換用として当面保持し、削除は別途承認・移行後に判断する。

Post-Core100のPR #117 / #118 / #119 / #120 / #121でも上記8 checkが成功し、独立read-only監査はそれぞれ2名PASS。ただし監査記録はGitHubでrequired reviewが設定済みであることを意味しない。PR #120の[CI 34003531144](https://github.com/IFs1991/seikotsuin_no_saas/actions/runs/34003531144)では、既存Build jobへ追加したproduction CSPブラウザ1件もPASSした。新しいcheck名へ置換しておらず、追加のrequired check名は不要。ユーザーのPreview確認後、A〜Eはmain統合済み。全コードを含むE更新headのCIも8 jobs成功した。branch protection設定時には、最新mainのcheck名・状態を再確認する。各commit / CI証跡は [修正結果](post-core100-remediation-result.md) を参照する。

Claude Code Reviewは別workflowであり、API認証情報未設定による失敗が残る。この状態でrequired checkへ加えると全PRのmergeが停止する。認証情報を有料設定も含めownerが用意し成功を確認した後に別途判断する。失敗を消すためのworkflow無効化や秘密鍵追加は行っていない。

適用前に最新main/PRの8checkを再確認し、owner承認後にGitHub設定画面で上記条件を設定する。適用後は新規PRで未成功check時のmerge拒否を確認する。現状は未適用なので、文書の存在を保護が有効な証拠として扱わない。
