# Test rules

- DB security boundaryをmockだけで検証しない
- tenant A/B、allow/deny、error/missingの両側を書く
- REDが正しい理由をPRへ記録する
- 壊れた実装に合わせて期待値を弱めない
- skipped testをgreenの代替にしない
- production-only behaviorは環境差を明示する
- PR-00の意図的RED suiteは通常Jest globから分離し、個別commandと失敗証跡を残す
