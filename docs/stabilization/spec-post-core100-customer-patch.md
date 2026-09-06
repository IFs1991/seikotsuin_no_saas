# PR-A 患者PATCHのデータ保持

基準main: c028573d089cb6085ab3e29121fa9fe4d2f923c0。対象: `PATCH /api/customers`。

`src/app/api/customers/schema.ts` の `mapCustomerUpdateToRow()` が未指定email/notesをnullへ変換し、name/phoneだけの変更で既存データを消していた。

## API契約

| 入力 | email / notes | name / phone |
| --- | --- | --- |
| 未指定・undefined | 既存値を保持。DB更新payloadにキーを含めない | 既存値を保持 |
| 非空文字 | trimした指定値へ変更 | trimした指定値へ変更 |
| null | 明示的に削除（DB NULL） | 検証エラー |
| 空文字・空白のみ | 編集フォーム互換の明示削除（DB NULL） | 検証エラー |

POSTの契約・clinic scope・manager拒否は維持。customAttributesの契約は変更しない。スキーマ変更・migration・依存追加はない。

## 検証

`src/__tests__/api/customers-route.test.ts` は実PATCH handlerとschemaを使い、更新payloadを保存状態へ反映するテスト。名前だけ・電話だけの変更、email/notes変更、null/空文字削除、undefinedの保持を確認する。初回REDは追加9件失敗・既存13件成功で、保存値の消去とnullの400を確認後に修正した。DB/RLS境界の新規変更はなく、既存manager拒否・他院拒否を同時に回帰確認する。

DoD: DOD-09（API scope維持）、DOD-10（build）、DOD-11（Jest）。本修正だけで容量・通知・運用PASSとは判断しない。
