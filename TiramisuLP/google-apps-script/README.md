# Google Apps Script setup

このフォルダには、LP の先行登録フォームを Google スプレッドシートへ保存し、LP 上の集計値を返すための Apps Script 一式を置いています。

## 1. スプレッドシートを作成

- Google スプレッドシートを 1 つ作成します
- シート名は何でも構いません。Apps Script が `registrations` シートを自動作成します
- スプレッドシート ID を控えます

## 2. Apps Script プロジェクトを作成

- [script.new](https://script.new/) を開きます
- 生成された `Code.gs` を、このフォルダの [Code.gs](C:\Users\seekf\Desktop\TiramisuLP\google-apps-script\Code.gs) の内容で置き換えます

## 3. Script Properties を設定

Apps Script の `プロジェクトの設定` → `スクリプト プロパティ` に以下を追加します。

- `SPREADSHEET_ID`: 保存先スプレッドシートの ID
- `LAUNCH_MONTH`: LP に表示したい正式ローンチ予定

例:

```text
SPREADSHEET_ID=1AbCdEfGhIjKlMnOpQrStUvWxYz
LAUNCH_MONTH=2026年10月
```

## 4. Web アプリとしてデプロイ

- `デプロイ` → `新しいデプロイ`
- 種類は `ウェブアプリ`
- `次のユーザーとして実行`: 自分
- `アクセスできるユーザー`: 全員

デプロイ後に発行される URL を控えます。形式は次のようになります。

```text
https://script.google.com/macros/s/XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX/exec
```

## 5. LP に Web App URL を設定

[.env.local](C:\Users\seekf\Desktop\TiramisuLP\.env.local) または Vercel の Environment Variables に `VITE_SHEETS_ENDPOINT` を設定します。

```env
VITE_SHEETS_ENDPOINT=https://script.google.com/macros/s/XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX/exec
```

フロントはこの URL に対して:

- `GET`: 登録院数、都道府県数、院規模内訳、更新日を取得
- `POST`: フォーム送信内容を登録し、更新後の summary を受け取る

## 6. 保存される列

Apps Script は `registrations` シートに次の列を自動で作成します。

```text
createdAt
source
clinicName
prefecture
addressLine
contactName
email
phone
clinicScale
desiredTiming
aiQuestion
```

## 7. LP が受け取る集計 JSON

`GET` すると、LP は次のような JSON を期待します。

```json
{
  "registeredCount": 83,
  "monthlyIncrease": 12,
  "prefectureCount": 14,
  "launchMonth": "2026年10月",
  "lastUpdated": "2026年4月20日",
  "clinicSize": {
    "single": 35,
    "small": 32,
    "medium": 12,
    "enterprise": 4
  },
  "remainingSlots": 117
}
```

## 8. 補足

- `monthlyIncrease` は「先月登録された件数」です
- `remainingSlots` は `200 - registeredCount` です
- `clinicScale` は LP の 4 択と一致する必要があります
- 既存のシートに別ヘッダーがある場合はエラーになります
