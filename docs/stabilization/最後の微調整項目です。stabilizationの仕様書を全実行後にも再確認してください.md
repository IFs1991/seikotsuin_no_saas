# 最後の微調整項目です。stabilizationの仕様書を全実行後にも再確認してください

## 目的
- stabilization完了後の最終確認を行う。

## チェック項目
- adminのclinic_idがNULLでも権限が落ちない
- clinic_scope_idsが取得できる
- clinics.parent_idのロールバックがある
- publicメニュー方針が一致している
- 親子スコープE2Eを再実行

## 実行タイミング
- stabilization仕様書を全て実行後に確認
