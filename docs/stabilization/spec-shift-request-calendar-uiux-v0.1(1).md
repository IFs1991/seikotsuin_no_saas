# Shift Request Calendar UI/UX v0.1

作成日: 2026-06-25  
更新日: 2026-06-25  
対象リポジトリ: `IFs1991/seikotsuin_no_saas`  
対象フェーズ: `0.1.0-pilot` 以降  
対象領域: スタッフ本人の希望シフト提出 UI/UX 改善  
Status: Draft for implementation  
Design basis: 行動心理学・認知科学を前提にした業務摩擦削減UI

---

## 1. 結論

本仕様では、既存の `shift_request_periods` / `shift_requests` / `staff_shifts` / `convert_shift_requests` の設計を壊さず、スタッフ本人がスマホで直感的に希望シフトを提出できるカレンダー型UIを追加する。

v0.1では **他院ヘルプの正式配置、院別日別ロスター確定、ICS/Google Calendar出力は扱わない**。これらは別仕様 `spec-clinic-daily-roster-help-assignment-ics-v0.1.md` に分離する。

重要方針:

```txt
既存DBを大きく変更しない
↓
request_type と start_time/end_time で表現できる範囲を先に磨く
↓
スタッフの提出体験をフォーム型からカレンダー型へ変更する
↓
疲れている現場スタッフでも、迷わず・ミスせず・短時間で提出できるUIにする
```

この仕様のUI判断では、ユーザーを「合理的に判断して正しく操作する人」として扱わない。実際のユーザーは、忙しい、疲れている、焦っている、スマホで片手操作している、面倒くさがる、入力ミスをする。その前提で、見た目の洗練よりも業務摩擦の削減を優先する。

---

## 2. 現状整理

### 2.1 既存ルート

README上、業務画面には以下が存在する。

```txt
/staff/shift-requests
/staff/shift-requests/admin
/manager/shift-requests
/admin/shift-requests
```

API側にも以下が存在する。

```txt
/api/staff/shift-requests
/api/staff/shift-requests/[id]
/api/staff/shift-requests/convert
/api/staff/shift-request-periods
/api/staff/shift-request-periods/[id]
/api/staff/shifts
```

### 2.2 現在の本人提出画面

`src/app/(app)/staff/shift-requests/page.tsx` は以下のように共通コンポーネントを呼び出している。

```tsx
import { ShiftRequestsWorkflow } from '@/components/staff/shift-requests-workflow';

export default function StaffShiftRequestsPage() {
  return <ShiftRequestsWorkflow mode='self' title='希望シフト提出' />;
}
```

既存の `ShiftRequestsWorkflow` は、本人提出・管理者代理入力・manager変換を1コンポーネントで扱っている。現状の本人提出UIは主に以下で構成される。

```txt
- 提出期間 select
- request_type select
- start_time datetime-local
- end_time datetime-local
- priority range
- note input
- 提出ボタン
```

これはCRUDとしては機能するが、月次シフト希望をスマホで出す体験としては直感性が弱い。

### 2.3 既存データ型

`src/lib/staff/shift-requests/types.ts` では、希望種別は以下4つに固定されている。

```ts
export const SHIFT_REQUEST_TYPES = [
  'available',
  'preferred',
  'unavailable',
  'day_off',
] as const;
```

ステータスは以下。

```ts
export const SHIFT_REQUEST_STATUSES = [
  'draft',
  'submitted',
  'approved',
  'rejected',
  'withdrawn',
  'converted',
] as const;
```

v0.1ではこの enum を変更しない。

### 2.4 既存API schema

`shiftRequestCreateSchema` は以下を受け取る。

```txt
clinic_id
period_id
staff_id optional
request_type
start_time
end_time
priority
status: draft | submitted
note optional
```

`end_time > start_time` の検証も既にある。

---

## 3. 課題

### 3.1 現在の弱点

現状UIは以下の点で現場向けではない。

```txt
1. 月全体を俯瞰できない
2. 休み希望・午後出勤・出勤不可の入力が毎回フォーム入力になる
3. 未入力日が分かりにくい
4. 前月コピー・曜日一括など、現場で欲しい操作がない
5. datetime-local が主導線で、スマホ操作が重い
6. 操作後に何日分保存/提出されたかが分かりにくい
7. 失敗時に、どの日を直せばよいか分かりにくい
8. 下書き・提出済み・未入力・差戻しの状態差が視覚的に弱い
```

### 3.2 本仕様の狙い

本仕様の狙いは、シフト希望提出を以下に変えること。

```txt
フォームで1件ずつ登録する
↓
月カレンダーで日別にタップ入力する
↓
提出前に未入力・矛盾・メモあり日を確認する
↓
提出後に何が完了したか明確に分かる
```

### 3.3 行動心理学上の問題

現在のフォーム型UIは、以下の認知負荷をユーザーに押し付けている。

```txt
- どの日を入力したか覚えておく必要がある
- request_type の意味を理解する必要がある
- datetime-local で毎回時刻を指定する必要がある
- 未入力日を自分で探す必要がある
- 提出後に反映状態を自分で確認する必要がある
```

業務SaaSでは、これは負け筋。UI側で「覚える」「考える」「探す」「確認する」を極力減らす。

---

## 4. Non-goals

本仕様では以下を扱わない。

```txt
- 他院ヘルプの正式配置
- 複数院所属のデータモデル
- staff_profiles / staff_clinic_memberships の追加
- 院別日別ロスター確定
- Google Calendar OAuth
- ICS出力
- 勤怠確定
- 給与計算
- 自動シフト最適化
```

ヘルプはv0.1では `note` またはUI上の暫定タグとして表示してよいが、正本データとして扱わない。

---

## 5. 用語

| 用語 | 意味 |
| --- | --- |
| 希望シフト | `shift_requests`。スタッフが提出する希望・不可・休み |
| 提出期間 | `shift_request_periods`。例: 2026年7月分シフト希望 |
| 確定シフト | `staff_shifts`。manager/adminにより最終的に確定された勤務予定 |
| request_type | `available`, `preferred`, `unavailable`, `day_off` |
| time_preset | UI上の時間プリセット。DBカラムではなくv0.1ではUI/ロジック上の概念 |
| local draft | API保存前の画面内編集状態 |
| server state | APIから取得した保存済み状態 |
| dirty day | local draft と server state に差分がある日 |

---

## 6. 行動心理学・認知科学に基づくUI設計原則

本セクションは実装判断の基準である。単なる思想ではなく、コンポーネント設計・文言・状態表示・受け入れ基準に反映する。

### 6.1 認知負荷理論

作業記憶には限界がある。`/staff/shift-requests` の主目的は「今月の希望を出す」だけに絞る。

設計要件:

```txt
- 1画面1目的: 今月の希望提出
- 初期表示では、月カレンダー・期限・未入力数・提出ボタンだけを優先表示
- 詳細な時刻入力、メモ、カスタム設定は日付タップ後のsheet内に隠す
- request_type などDB用語を画面に出さない
- 初回表示で説明文を長く出さない。必要時に「？」ヘルプで開く
```

禁止:

```txt
- 提出期間、clinic選択、全フィルタ、テーブル、詳細フォームを同時に主画面へ並べる
- datetime-local を常時表示する
- 未入力日をユーザーに記憶させる
```

### 6.2 ヒックの法則

選択肢が多いほど判断が遅くなる。日付セルタップ後の選択肢は、主選択と詳細選択に分ける。

主選択は最大5つ:

```txt
- 出勤可能
- 優先希望
- 休み希望
- 出勤不可
- 未入力に戻す
```

時間プリセットは、出勤可能/優先希望を選んだ場合だけ表示する。

```txt
- 終日
- 午前のみ
- 午後から
- 遅番
- カスタム
```

### 6.3 フィッツの法則

重要操作は大きく近く、危険操作は押しにくくする。

設計要件:

```txt
- 「提出する」は画面下部のsticky CTAにする
- sticky CTAは44px以上の高さを確保する
- 日付セルも44px以上のタップ領域を持つbuttonにする
- 「未入力に戻す」「下書きを破棄」は主CTAから離す
- 提出前にはsummary確認を挟む
```

### 6.4 アフォーダンス

クリックできるものはクリックできる見た目にする。アイコンだけに依存しない。

設計要件:

```txt
- 日付セルはbuttonとして実装し、hover/focus/pressed状態を持つ
- 「◯」「◎」「休」「PM」だけでなく、aria-labelと詳細sheet内の日本語ラベルを持つ
- アイコンだけのボタンは禁止。必ず「前月コピー」「曜日一括」「未入力だけ表示」など具体ラベルを付ける
- 色だけで状態を表現しない。文字・badge・aria-labelを併用する
```

### 6.5 メンタルモデル

画面はDB構造ではなく、スタッフの業務手順に合わせる。

スタッフの実際の頭の中:

```txt
1. 今月の希望を出さなきゃ
2. 休みたい日を入れる
3. 午後からなら出られる日を入れる
4. 出られない日を入れる
5. 未入力がないか確認する
6. 提出する
```

したがって、UIは以下の順にする。

```txt
提出期間確認
↓
月カレンダー入力
↓
未入力/差分/メモあり確認
↓
提出
↓
完了サマリー
```

禁止:

```txt
- 「shift_requestsを作成」など開発者都合の表現
- request_type / period_id / staff_id など内部用語の表示
```

### 6.6 ゲシュタルト原則

関連情報はまとまりとして見せる。

設計要件:

```txt
- 月カレンダー、操作ボタン、提出サマリーを明確に分ける
- 同じ状態のセルは同じ見た目にする
- 未入力、下書き差分、提出済み、差戻しは視覚グループを分ける
- 警告は提出サマリー内にまとめる
```

### 6.7 デフォルト効果

入力をゼロから始めさせない。ただし危険操作や提出は勝手に実行しない。

設計要件:

```txt
- open状態の提出期間を自動選択する
- clinicは現在選択中/所属clinicを初期選択する
- 出勤可能の初期time_presetは full_day
- 直前に使ったtime_presetを同一セッション内で候補上位に出してよい
- カスタム時刻は既存プリセットを起点にする
```

禁止:

```txt
- 初期状態で勝手に全日「出勤可能」にする
- 未確認の前月コピー結果を自動提出する
- 有料/外部連携/通知を勝手にONにする
```

### 6.8 損失回避

未保存・未提出で失われるものを明示する。

設計要件:

```txt
- local draftがある状態で離脱しようとしたら「未保存の変更が失われます」を表示
- 提出期限が近い場合「期限を過ぎると本人編集できません」を表示
- 未入力がある場合「未入力のままだと希望なしとして扱われる可能性があります」を表示
```

### 6.9 フィードバックループ

操作結果を必ず返す。

設計要件:

```txt
- 日付保存: 「7/12 を午後から可にしました」
- 一括反映: 「毎週火曜の4日分を休み希望にしました」
- 提出開始: 「12日分を提出中です」
- 提出成功: 「12日分を提出しました。未入力: 0日」
- 部分失敗: 「10日分は提出済み、2日分は失敗。失敗日: 7/12, 7/19」
- 失敗時: 理由と次の操作を表示する
```

重要操作では、誰が・いつ・何をしたかのログを既存audit方針に合わせる。

### 6.10 ピークエンドの法則

完了時の印象を強くする。単なる「提出しました」で終わらせない。

提出完了時に表示する:

```txt
7月シフト希望を提出しました
休み希望: 8日
午後から可: 4日
出勤不可: 2日
メモあり: 3件
未入力: 0日
次の状態: マネージャー確認待ち
```

これにより、入力作業が「意味のある提出」に変わる。

### 6.11 進捗効果

ゴールまでの距離を見せる。

設計要件:

```txt
- 入力済み 24/31日
- 未入力 あと7日
- 提出準備 80%
- 期限まで あと2日
```

ただし過剰なゲーミフィケーションは禁止。業務SaaSでは軽量に出す。

### 6.12 ツァイガルニク効果

未完了タスクを見える化する。

設計要件:

```txt
- 未入力日
- 差戻し日
- 保存前の変更あり日
- 提出失敗日
```

初期表示では未完了のうち最重要だけ出す。

優先順位:

```txt
1. 提出期限切れ/期限間近
2. 差戻し
3. 未入力
4. 保存前変更
5. メモあり
```

### 6.13 認識優位性

思い出させるより、見て選べるようにする。

設計要件:

```txt
- 自由入力はメモとカスタム時刻だけに限定
- 希望種別・時間帯はボタン選択
- よく使うプリセットを上に出す
- 前月コピー、曜日一括、未入力フィルタを候補として表示
```

### 6.14 習慣ループ

提出行動を継続させるため、トリガー・行動・報酬を画面内に作る。

設計要件:

```txt
Trigger: 提出期限・未入力数・差戻し表示
Action: 日付タップ入力・曜日一括・前月コピー
Reward: 提出完了サマリー・未入力0表示・マネージャー確認待ち表示
```

通知機能は本仕様では必須ではないが、将来拡張として「提出期限前通知」を想定する。

### 6.15 エラー予防

ミスが起きた後に怒るのではなく、ミスできない構造にする。

設計要件:

```txt
- period範囲外の日付は表示しない/disabled
- deadline超過後は編集ボタンを非表示またはdisabledにし理由を表示
- custom時刻で end_time <= start_time を入力できない
- 1日1主希望に制限し、複数枠はv0.2へ送る
- 送信前に未入力・重複・期限切れを検証する
```

エラー文言例:

```txt
悪い: エラーが発生しました
良い: 7/12 の終了時刻が開始時刻より前です。終了時刻を15:00以降にしてください。
```

### 6.16 権限設計

権限設計もUXである。押してはいけない操作は見せないか、disabled理由を出す。

設計要件:

```txt
- self roleでは本人分以外のstaff_id操作を見せない
- manager/admin向け操作はこの画面に出さない
- converted/finalized/cancelled状態は編集不可として理由を表示
- 権限がない提出期間は選択肢に出さない
```

---

## 7. UX要件

### 7.1 スタッフ側トップ

`/staff/shift-requests` は、本人提出時にカレンダー型UIを主画面にする。

```txt
7月シフト希望
提出期限: 2026/06/25 18:00
入力済み: 24/31日 / 未入力: 7日

[前月コピー] [曜日一括] [未入力だけ表示]

月 火 水 木 金 土 日
1  2  3  4  5  6  7
◯ 休 PM ◯ ✕ ◎ 未

提出前サマリー:
休み希望 8日 / 午後から可 4日 / 出勤不可 2日 / 未入力 3日

[提出する]
```

主画面に置く情報は以下に限定する。

```txt
- 提出対象月
- 提出期限
- 入力進捗
- 月カレンダー
- 一括操作3つまで
- 提出サマリー
- 提出CTA
```

### 7.2 日付セル表示

| 表示 | 意味 | request_type | 時間 | UI状態 |
| --- | --- | --- | --- | --- |
| `◯` | 出勤可能 | `available` | full_day | 通常badge |
| `◎` | 優先希望 | `preferred` | full_day | 強調badge |
| `休` | 休み希望 | `day_off` | 対象日の終日範囲 | 休みbadge |
| `✕` | 出勤不可 | `unavailable` | 対象日の終日範囲 | 不可badge |
| `AM` | 午前のみ可 | `available` | morning | 時間badge |
| `PM` | 午後から可 | `available` | afternoon | 時間badge |
| `遅` | 遅番可 | `available` | late | 時間badge |
| `未` | 未入力 | なし | なし | 未入力badge |
| `差` | 差戻し | server state rejected | 既存値 | 要対応badge |
| `変` | 変更あり | local draft dirty | draft値 | 未保存badge |

日付セルの `aria-label` 例:

```txt
7月12日 金曜日、午後から可、未保存の変更あり。タップして編集
```

### 7.3 日付タップ時の編集シート

日付をタップすると、下部sheetまたはdialogで編集する。

```txt
7/12(金) の希望

希望:
[出勤可能]
[優先的に入りたい]
[休み希望]
[出勤不可]
[未入力に戻す]

時間: ※出勤可能/優先希望の時だけ表示
[終日]
[午前のみ]
[午後から]
[遅番]
[カスタム]

メモ:
[15時以降なら可]

[この日の希望を保存]
```

設計要件:

```txt
- 主選択と時間選択を同時に大量表示しない
- 「この日の希望を保存」と具体ラベルにする
- 保存後はsheetを閉じ、toastまたはinlineで結果を返す
- メモは折りたたみでも可。ただしメモあり日はカレンダー上で分かるようにする
```

### 7.4 曜日一括

曜日一括では、対象期間内の該当曜日へ同じ希望をまとめて反映する。

例:

```txt
毎週火曜日 = 休み希望
毎週水曜日 = 午後から可
毎週土曜日 = 出勤不可
```

この段階ではローカルdraftに反映する。API保存は「提出する」押下時に行う。

行動心理学要件:

```txt
- 反映対象日数を実行前に表示する
- 例: 「毎週火曜 5日分を休み希望にします」
- 実行後に「5日分を休み希望にしました」と返す
- 既存入力を上書きする場合は確認を挟む
```

### 7.5 前月コピー

前月コピーは、前回提出済みの `shift_requests` を取得し、曜日対応で今月へ変換する。

v0.1では厳密な祝日・第n週判定は不要。以下の優先順位でよい。

```txt
1. 同一曜日へコピー
2. コピー結果を提出前に全日確認させる
3. 未入力または既存入力との衝突はUIで警告
```

行動心理学要件:

```txt
- コピー結果は自動提出しない
- 「前月の希望をコピーしました。提出前に確認してください」と返す
- コピーで上書きされる日数を事前表示する
- コピー後はdirty dayとして表示する
```

### 7.6 提出前サマリー

提出前に必ず表示する。

```txt
休み希望: n日
出勤可能: n日
優先希望: n日
午前のみ: n日
午後から: n日
出勤不可: n日
未入力: n日
メモあり: n件
未保存の変更: n日
```

未入力がある場合は警告する。ただし提出を禁止するかはclinic設定にする。v0.1では警告のみでよい。

文言例:

```txt
未入力が3日あります。未入力日は希望なしとして扱われる可能性があります。
この内容で提出しますか？
```

### 7.7 提出完了サマリー

提出成功後は、完了サマリーを表示する。

```txt
7月シフト希望を提出しました

提出済み: 28日
休み希望: 8日
午後から可: 4日
出勤不可: 2日
メモあり: 3件
未入力: 0日

次の状態: マネージャー確認待ち
```

目的:

```txt
- 操作結果を明確にする
- 提出した意味を返す
- 次に何が起きるかを示す
```

---

## 8. データ表現

### 8.1 v0.1ではDB enumを増やさない

午前・午後・遅番は `request_type` ではなく、`start_time` / `end_time` の組み合わせで表現する。

| UI | request_type | start_time/end_time |
| --- | --- | --- |
| 出勤可能・終日 | `available` | clinic default full_day |
| 優先希望・終日 | `preferred` | clinic default full_day |
| 午前のみ | `available` | clinic default morning |
| 午後から | `available` | clinic default afternoon |
| 遅番 | `available` | clinic default late |
| 休み希望 | `day_off` | 対象日の業務時間帯または 00:00-23:59 |
| 出勤不可 | `unavailable` | 対象日の業務時間帯または 00:00-23:59 |

### 8.2 time_presetはUIローカル概念

v0.1ではDBに `time_preset` カラムを追加しない。

ただし、UI内部では以下の型を使う。

```ts
export type ShiftRequestTimePreset =
  | 'full_day'
  | 'morning'
  | 'afternoon'
  | 'late'
  | 'custom';
```

将来DBに追加する可能性はあるが、本仕様では見送る。

### 8.3 clinic default hours

v0.1では以下の順で時間を決定する。

```txt
1. 将来のclinic設定値が存在すればそれを使う
2. なければフロント定数で fallback
3. custom選択時のみユーザー入力
```

fallback例:

```ts
const DEFAULT_SHIFT_PRESETS = {
  full_day: { start: '10:45', end: '22:30' },
  morning: { start: '10:45', end: '15:00' },
  afternoon: { start: '15:00', end: '22:30' },
  late: { start: '17:00', end: '22:30' },
};
```

実装時はハードコードを1ファイルに隔離する。

推奨配置:

```txt
src/lib/staff/shift-requests/time-presets.ts
```

### 8.4 local draft と server state

カレンダーUIでは、API保存前の編集状態を `local draft` として保持する。

```txt
server state: APIから取得した保存済み shift_requests
local draft: 画面上で編集した未提出/未保存状態
```

UI要件:

```txt
- local draftに差分がある日は「変更あり」と表示
- 提出前に差分件数を表示
- 離脱時に未保存変更の警告を出す
- API成功後にserver stateを再取得する
```

---

## 9. API方針

### 9.1 v0.1 minimal

既存APIを利用する。

```txt
GET  /api/staff/shift-request-periods?clinic_id=...
GET  /api/staff/shift-requests?clinic_id=...&period_id=...
POST /api/staff/shift-requests
PATCH /api/staff/shift-requests/[id]
```

### 9.2 bulk APIはv0.1.1候補

カレンダーUIでは複数日をまとめて提出するため、本来はbulk APIが望ましい。

候補:

```txt
POST /api/staff/shift-requests/bulk
```

payload:

```json
{
  "clinic_id": "uuid",
  "period_id": "uuid",
  "requests": [
    {
      "request_type": "available",
      "start_time": "2026-07-01T10:45:00.000+09:00",
      "end_time": "2026-07-01T22:30:00.000+09:00",
      "priority": 3,
      "status": "submitted",
      "note": ""
    }
  ]
}
```

v0.1では、既存POSTを複数回呼ぶ実装でも可。ただし以下を守る。

```txt
- 同時実行数は最大3程度に制限
- 失敗時にどの日が失敗したか表示
- 部分成功が起き得ることをUIで扱う
- 送信中は二重送信を防ぐ
- 成功/失敗/部分成功を明示する
```

実装工数と整合性を考えると、PR2でbulk APIを追加する方が望ましい。

---

## 10. 推奨ファイル構成

### 10.1 新規コンポーネント

```txt
src/components/staff/shift-request-calendar-workflow.tsx
src/components/staff/shift-request-month-calendar.tsx
src/components/staff/shift-request-day-sheet.tsx
src/components/staff/shift-request-submit-summary.tsx
src/components/staff/shift-request-bulk-actions.tsx
src/components/staff/shift-request-completion-summary.tsx
src/components/staff/shift-request-task-alerts.tsx
```

### 10.2 新規lib

```txt
src/lib/staff/shift-requests/calendar-model.ts
src/lib/staff/shift-requests/time-presets.ts
src/lib/staff/shift-requests/calendar-transform.ts
src/lib/staff/shift-requests/behavioral-ux.ts
```

`behavioral-ux.ts` は文言・状態優先順位・CTA disabled理由など、UI判断を集約する。過剰抽象化しすぎない。

### 10.3 既存コンポーネントとの関係

`ShiftRequestsWorkflow` はいきなり巨大改修しない。

推奨:

```txt
/staff/shift-requests self mode
  → ShiftRequestCalendarWorkflow を使う

manager / review / admin mode
  → 既存 ShiftRequestsWorkflow または ManagerShiftRequests を維持
```

つまり本人提出だけ先に差し替える。

---

## 11. 実装ステップ

### PR1: Read-only calendar shell

目的: 既存提出期間・既存希望をカレンダー表示する。

実装:

```txt
- ShiftRequestCalendarWorkflow 作成
- GET periods
- GET requests
- requests を日付単位に変換
- 月カレンダー表示
- 既存希望のbadge表示
- 未入力数/入力済み数を表示
```

DoD:

```txt
- /staff/shift-requests がカレンダー表示になる
- 既存の希望シフトが日付セルに表示される
- 未入力日が分かる
- 既存のmanager画面は壊れない
```

### PR2: day sheet editing + local draft

目的: 日付タップで希望を編集し、ローカルdraftに保持する。

実装:

```txt
- DaySheet
- request_type選択
- time_preset選択
- custom時間入力
- note入力
- local draft state
- 保存後feedback
- dirty day表示
```

DoD:

```txt
- 日付ごとに希望を保存できる
- submit前にAPI保存はされない
- local draftとserver persistedの差分が分かる
- 保存/変更/未入力戻しのfeedbackが出る
```

### PR3: submit flow

目的: 複数日をまとめて提出する。

実装候補:

```txt
A. 既存POSTを複数回呼ぶ
B. /api/staff/shift-requests/bulk を追加する
```

推奨はB。

DoD:

```txt
- 複数日の希望を提出できる
- 提出前summaryが出る
- 失敗した日付が分かる
- 部分成功を表現できる
- 提出後に完了summaryが出る
- 提出後に再取得してserver stateと一致する
```

### PR4: bulk actions

目的: 前月コピー・曜日一括・未入力フィルタを追加する。

DoD:

```txt
- 曜日一括ができる
- 前月コピーができる
- 実行前に反映対象日数が分かる
- 上書き時に確認が出る
- 未入力日が分かる
- 提出前サマリーが出る
```

### PR5: behavioral UX polish / tests

```txt
- component test
- hook/model unit test
- API bulk test if added
- mobile width snapshot or RTL behavior check
- feedback文言test
- disabled理由test
- a11y label test
```

---

## 12. バリデーション

### 12.1 期間

```txt
- self submit は period.status = open のみ
- deadline 超過後は編集不可
- finalized/cancelled period は表示のみ
```

既存PATCHにも本人編集制限があるため、UI側でも同じ制約を表示する。

### 12.2 日付範囲

```txt
- period_start <= request date <= period_end
- end_time > start_time
- custom時刻はJST基準
```

### 12.3 request重複

v0.1では同一スタッフ・同一日付に複数requestを許可するかは慎重に扱う。

推奨:

```txt
- UI上は1日1主希望に制限
- customで複数枠が必要な場合はv0.2
```

既存DBは時間帯ごとに複数行を許可しているが、UI/UXを単純化するためMVPでは1日1主希望に寄せる。

### 12.4 エラー予防

エラーはsubmit後ではなく、入力中/提出前に防ぐ。

```txt
- invalid custom time は保存ボタンをdisabled
- disabled時は理由を表示
- 未入力がある場合はsummaryで警告
- deadline切れは編集導線を隠す/disabled理由を表示
- API部分失敗時は失敗日だけ再試行できる
```

---

## 13. アクセシビリティ / モバイル

必須:

```txt
- 日付セルはbutton
- aria-labelに日付・状態・未保存有無を含める
- keyboard操作で日付移動可能
- 44px以上のタップ領域
- 下部固定submit summaryは小画面でも崩さない
- 色だけで状態を表現しない
- focus-visibleを消さない
- toastだけで重要情報を終わらせない。重要情報は画面内にも残す
```

---

## 14. テスト方針

### 14.1 unit

```txt
src/__tests__/lib/shift-request-calendar-model.test.ts
```

検証:

```txt
- request_type と time_preset の変換
- JST日付生成
- period range生成
- 前月コピー
- 曜日一括
- 未入力数集計
- dirty day判定
- submit summary生成
- disabled理由生成
```

### 14.2 component

```txt
src/__tests__/components/staff/shift-request-calendar-workflow.test.tsx
```

検証:

```txt
- 既存requestが表示される
- 日付タップでsheetが開く
- PM選択で午後時間になる
- submit summaryが更新される
- 未入力数が表示される
- dirty dayが表示される
- 提出成功summaryが表示される
- API失敗時に失敗日と次の行動が表示される
```

### 14.3 API

bulk APIを追加した場合:

```txt
src/__tests__/api/shift-request-bulk.test.ts
```

---

## 15. 行動心理学適用チェックリスト

実装レビューでは以下を確認する。

### 15.1 画面設計

```txt
- この画面の目的は「今月の希望提出」だけになっているか
- ユーザーは次に何をすればいいか分かるか
- 一番重要なCTAは明確か
- 不要な情報を出しすぎていないか
- DB用語が画面に出ていないか
- 業務フローと画面順が一致しているか
```

### 15.2 入力設計

```txt
- 自由入力はメモ/カスタム時刻だけか
- デフォルト値が入っているか
- 候補・前月コピー・曜日一括があるか
- 必須項目が明確か
- 入力ミスが起きにくい構造か
- エラー時に次の行動を提示しているか
```

### 15.3 操作設計

```txt
- 保存・提出・失敗・部分成功の状態が分かるか
- 操作後にfeedbackが返るか
- 危険操作/上書き操作は確認画面を挟むか
- 未保存の変更を失う操作に警告が出るか
- 二重送信を防げるか
```

### 15.4 未完了タスク

```txt
- 未入力日が分かるか
- 差戻し日が分かるか
- 未保存変更が分かるか
- 提出期限が分かるか
- 次に取るべき行動が分かるか
```

### 15.5 完了体験

```txt
- 提出後に完了summaryが出るか
- 何日分提出したか分かるか
- 次の状態が分かるか
- ユーザーが再確認のために別画面へ行かなくて済むか
```

---

## 16. 受け入れ基準

```txt
1. スタッフ本人が月カレンダーから希望を入力できる
2. 休み希望・出勤可能・優先希望・出勤不可・午前のみ・午後から・カスタムを表現できる
3. 既存 shift_requests schema と互換性がある
4. manager/admin の既存承認・変換フローを壊さない
5. 未入力日・差戻し日・未保存変更・提出サマリーが分かる
6. 主要操作に即時feedbackがある
7. API部分失敗時に失敗日と再試行導線が分かる
8. 提出後に完了summaryが表示される
9. スマホ幅で操作できる
10. 色だけで状態を表現していない
11. 権限がない操作は非表示またはdisabled理由つき
12. npm run lint / npm run type-check / 関連testが通る
```

---

## 17. 実装上の禁止事項

```txt
- request_type enumに afternoon/help などを追加しない
- ヘルプ正式配置をこの仕様に混ぜない
- staff_profiles / memberships をこの仕様で追加しない
- Google Calendar / ICS をこの仕様に混ぜない
- 既存 ShiftRequestsWorkflow を無理に全面改修しない
- JST処理で素の new Date().toISOString() を雑に使わない
- アイコンだけのボタンを作らない
- 色だけで状態を表現しない
- 未確認の前月コピー結果を自動提出しない
- API送信中に二重送信できる状態にしない
- エラー文言を「エラーが発生しました」だけで終わらせない
```

---

## 18. Codex向け実装メモ

最初に投げるなら以下の粒度がよい。

```txt
既存の /staff/shift-requests 本人提出画面だけを対象に、既存APIを使ってカレンダー型UIを追加してください。
manager/admin画面、DB schema、convert_shift_requests は変更しないでください。
まずは既存 shift_requests を月カレンダーに表示し、日付タップで編集sheetを開けるところまで実装してください。

重要:
- 1画面1目的で、本人の今月シフト希望提出に絞る
- request_typeなどDB用語を画面に出さない
- 日付セルはbuttonにし、aria-labelを持たせる
- 色だけで状態を表現しない
- 未入力数/入力済み数/提出期限を表示する
- 主要操作には必ずfeedbackを返す
```

次のPRで提出処理を追加する。

### PR3以降のCodex指示例

```txt
ShiftRequestCalendarWorkflow に提出前summaryとsubmit flowを追加してください。
提出前に、休み希望/出勤可能/優先希望/午前のみ/午後から/出勤不可/未入力/メモあり/未保存変更の件数を表示してください。
提出成功後は完了summaryを表示し、何日分提出したか、未入力が何日残っているか、次の状態がマネージャー確認待ちであることを明示してください。
API失敗時は失敗した日付と再試行導線を表示してください。
```

---

## 19. 将来拡張

v0.2以降:

```txt
- time_preset DBカラム追加
- shift_requests bulk endpoint
- 1日複数枠入力
- clinic別営業時間プリセット
- 祝日/曜日ルール
- ヘルプ希望タグの正式化
- 提出期限前通知
- 差戻し通知
- 前回入力履歴によるプリセット最適化
```

ただし、他院ヘルプとロスター確定は別仕様で進める。
