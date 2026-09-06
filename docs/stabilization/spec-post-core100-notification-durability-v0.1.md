# Post-Core100 PR-D 通知耐久性 v0.1

対象は添付指示§6/§7。DOD-02/04（migration/replay・drift）、DOD-08/09（tenant scope・server guard）、DOD-10/11/12（build・Jest・生成型）に関連する。既存public予約/キャンセルのawaitは維持する。

- 通常/mobile予約はproviderを待たず、通知のdurable handoffが決着するまでawaitする。予約commit後の通知失敗は予約成功を取り消さず、enqueue_failedをemail_logsへ残す。ログ自体の書込失敗はloggerへ残す。
- mobileも既存の認可を通過したpermissionsから通知専用のscoped service clientを作り、clinic scopeを再確認する。認可失敗時は作成せず、通知scope確認の失敗でも保存済み予約の成功は維持する。
- reservations.staff_idの参照先であるresourcesをclinic_id付きで検索する。
- reservation_notifications.detail.enqueueへ準備済みintentを渡す。private SECURITY INVOKER AFTER triggerが同一transactionでemail/LINE outboxを挿入してstatusをenqueuedへ確定する。途中失敗はclaimごとrollbackする。既存claimed/failedだけはscope+状態条件付きUPDATEで再試行可能。enqueued/skippedを再送しない。旧書込のoutbox再利用はemailでは同じdedupe key、LINEでは同じ予約revisionに限定する。revisionのない旧LINEジョブは手動確認とし自動再送しない。
- received/confirmed/cancelled/reminderのledgerは既存の予約+notification_type単位を維持する。時刻/担当変更は既存の直接email enqueueを使い、連続する異なる更新はそれぞれupdated_at由来のdedupe keyとprovider keyを持つ。
- intent内の患者名/宛先/本文は同じtransactionの末尾でdetailから除去し、既存outboxにだけ保持する。anon/authenticatedの権限、RLS、clinic複合FK、公開RPCは拡大しない。migration未適用ならhelperのstatus再確認がfail-closedで検知する。
- email_outbox.updated_atをDB発行の単調なrevision兼lease時刻とする。メール専用triggerだけを変更し、共有trigger関数は不変。claim時にattemptsを加算し、claim/recover/finalizeはid+status+updated_atのCASに限定する。旧workerは新revisionを上書きできない。
- 5分経過したprocessingをbatch 20件以内で回収し、4claim到達はfailedへ。描画/送信失敗は既存5/15/60分のretryを維持する。provider受理後に送信結果保存が失敗した場合は既存terminal failureを優先する。
- Resend idempotencyKeyをSDK第2引数のHTTPオプションへ渡す。作成から23時間以上経過した曖昧な処理中配送、またはprovider_message_id/sent_atが残る配送は自動再送せずfailedとして人が配送記録を照合する。24時間を越えたexactly-onceは主張しない。

## 検証と展開

Jestは予約応答前handoff、通知clientのclinic scope、連続する予約更新、provider failure、crash後回収、retry上限、fresh lease、旧worker拒否、23時間超/受理痕跡の再送抑止、malformed templateを検証する。SQL testはemail/LINEのatomic enqueue、tenant A/B、権限、PHI intent除去、rollback、exact revision、LINE generation、revision CASを実DBで検証する。ローカル既存DBへの適用・resetは未承認のためBLOCKED。既存CI Database Contractで固定CLI 2.109.0のreplay/pgTAP/型diffを必須とする。scaffoldのみ既存CLI 2.116.0のhelpを確認しmigration newで生成した。生成型は手編集しない。

先にmigration適用を承認・検証し、その後アプリを展開する。実環境のworker停止/再開、provider実配送、監視到達、catalog snapshot前後は未実施でBLOCKED。workerを止めたままでも成功したhandoffのoutboxが残ることを本番相当環境で確認する。予約commitからhandoff開始前までのprocess停止は、この最小実装では予約transactionと分離したままであり、残るcrash windowとして明示する。

参考: https://resend.com/docs/dashboard/emails/idempotency-keys 、 https://supabase.com/docs/guides/database/functions
