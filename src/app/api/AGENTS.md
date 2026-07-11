# API mutation boundary rules

- POST/PUT/PATCH/DELETEを追加・変更したらmutating route inventoryとmanifestを更新する
- routeはPUBLIC_VALIDATED / AUTH_SCOPED_BILLED / AUTH_SCOPED_UNBILLED / ADMIN_SCOPED / INTERNAL_SECRET / SIGNED_WEBHOOK / HEALTH_OR_NO_MUTATIONのいずれかに分類する
- clinic_idをbodyだけから信用しない
- business mutationはbilling gateを明示する
- exceptionはownerと理由を必須とする
- service roleを使う前にauthenticated scopeを確定する
- client-side authorizationだけで完了させない
- GETで副作用を起こす既存internal routeは例外台帳へ記録し、新規追加しない
