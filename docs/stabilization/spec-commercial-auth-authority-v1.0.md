# Commercial auth authority v1.0（PR-09）

## 1. 目的と範囲

本仕様は
`docs/stabilization/spec-commercial-hardening-migration-v1.0.md` §10 と
PR-09 を実装可能な境界へ具体化する。

対象は次の4点に限定する。

1. アプリケーションの permission/profile lookup を判別可能 union にする。
2. role、primary clinic、active account、manager assignment の権威を DB に置く。
3. JWT `clinic_scope_ids` を DB scope の intersection（縮小）にだけ使う。
4. RLS helper、Custom Access Token Hook、認証後の API/UI guard を fail-closed に統一する。

Billing、mutation manifest、招待 identity の再設計、production Auth 設定変更は
PR-09 の対象外である。

## 2. 権威モデル

### 2.1 role と primary clinic

- `public.user_permissions` の `role` / `clinic_id` を権威とする。
- 同一 Auth subject に `public.profiles.is_active = true` が存在する場合だけ権威を有効にする。
- JWT、`user_metadata`、`app_metadata` から DB role / clinic_id を補完しない。
- legacy 名の `app_private.jwt_is_admin()` と
  `app_private.jwt_clinic_id()` は DB helper の alias とし、JWT を読まない。

### 2.2 clinic scope

| role                                            | DB-authorized scope                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------- |
| `manager`                                       | `manager_clinic_assignments` の `revoked_at is null` の院のみ       |
| `admin`, `clinic_admin`                         | primary clinic が root なら root + 直下、child なら同じ root + 直下 |
| `therapist`, `staff`                            | primary clinic のみ                                                 |
| unknown / permission missing / inactive profile | 空集合                                                              |

`customer` は現行 `user_permissions` の staff authority role 制約に含まれず、
患者向け identity/authority の正本は本 PR では定義しない。到達不能な
`user_permissions.role = customer` を暗黙に追加しない。

JWT `clinic_scope_ids` の扱いは次の通りとする。

- claim absent: DB scope を維持する。
- valid subset: DB scope との intersection を採用する。
- DB より広い claim: intersection へ縮小し、サーバー側 security event を記録する。
- empty / malformed claim: fail-closed で空集合にする。
- JWT-only authority: 拒否する。

### 2.3 lookup failure semantics

permission と profile は `found | missing | error` を保持する。

| lookup                                | missing                  | error                      |
| ------------------------------------- | ------------------------ | -------------------------- |
| permission                            | 403 相当で権限なし       | server-side log + 503 相当 |
| profile                               | inactive として 403 相当 | server-side log + 503 相当 |
| manager assignment / clinic hierarchy | 空集合へ誤分類しない     | server-side log + 503 相当 |

認証 subject の一致を確認する前に service-role client を使って別 user の権限を
取得してはならない。

## 3. DB / RLS 契約

追加 migration:

`supabase/migrations/20260715083609_commercial_auth_authority_fail_closed.sql`

- PR-08 migration を preflight で要求する。
- `app_private.get_current_role()`、`get_current_clinic_id()`、
  `can_access_clinic(uuid)` ほか既存 helper を append-only migration で再定義する。
- helper は `SECURITY DEFINER`、`search_path = pg_catalog`、既存 PR-04 の
  exact EXECUTE matrix を維持する。
- direct `auth.jwt()` authority policy 1件と direct `profiles.role/clinic_id`
  authority policy 13件を DB helper へ正規化する。
- postflight で helper owner/config/ACL、対象 policy identity、残存する direct
  JWT/profile authority を検査し、drift があれば transaction を失敗させる。

`app_private.can_access_clinic(uuid)` は DB allow を先に証明し、JWT claim が
存在する場合だけ intersection を適用する。DB deny を JWT で覆す経路は持たない。

## 4. Custom Access Token Hook 契約

`app_private.custom_access_token_hook(jsonb)` は次を満たす。

1. event object、claims object、`event.user_id`、`claims.sub` を検証する。
2. `event.user_id = claims.sub` でなければ例外で拒否する。
3. DB lookup より前に top-level と `app_metadata` の stale custom authority を除去する。
4. active profile + permission がある場合だけ DB role / clinic / scope を再発行する。
5. permission missing、inactive、空 scope の authority を復元しない。

Auth hook の hosted/production 設定変更は operator 承認が必要で、本 PR では行わない。

## 5. アプリケーション境界

- `src/lib/supabase/auth-context.ts`: lookup union と active profile 判定。
- `src/lib/supabase/server.ts`: subject binding、DB scope 解決、JWT intersection、
  authority error の 503 化。
- admin/clinic login: profile を login 中に bootstrap せず、missing/error/inactive を拒否し、
  sign-out する。
- protected layout、profile API、mobile UI/UX routes: inactive/missing を 403、
  authority backend failure を内部情報を含まない 503 とする。
- `src/hooks/useUserProfile.ts`: trusted metadata から role/clinic を復元しない。

## 6. テスト契約

最低限、以下を RED で追加して GREEN にする。

- permission found/missing/error、profile active/missing/error
- stale JWT role / clinic_id
- JWT scope superset/subset/absent/empty/malformed
- revoked manager assignment
- inactive valid JWT、admin missing profile
- Auth hook stale claim clearing、DB claim refresh、subject mismatch
- direct JWT/profile authority policy の catalog absence
- login/API/UI の 403/503 と session cleanup

pgTAP は transaction + rollback で実行し、production data を使わない。

## 7. Recovery と rollout

paired rollback:

`supabase/rollbacks/20260715083609_commercial_auth_authority_fail_closed_rollback.sql`

rollback は validation-only guard である。JWT-first helper や direct metadata authority を
復元すると stale authority が再発するため、旧挙動へ戻さない。障害時は対象導線を止め、
reviewed forward-fix を適用する。

local migration apply、linked/staging/production apply、Auth hook 設定変更はそれぞれ
明示承認を必要とする。PR-09 のローカル検証は production/linked project に接続しない。

## 8. 既知の BLOCK と DoD 対応

`user_permissions.staff_id` の semantic owner は未確定で、現行 FK は
`public.staff.id` である。PR-09 は既存の Auth user ID = staff ID 前提を拡張せず、
この項目を商用 release の `BLOCK` のまま保持する。

本 PR の証跡は、歴史的 `docs/stabilization/DoD-v0.1.md` のうち DOD-01、02、03、
08、10、11、12 と、現行 change/release gate を区別して記録する。ローカル PASS を
production PASS と解釈しない。
