# 予約管理システム要件定義（YAML版）
# Version: 2.0
# Last Updated: 2025-10-25
# Purpose: LLM駆動開発・自動化ツール連携用の構造化要件定義

metadata:
  project_name: "予約管理システム（リピッテ準拠）"
  version: "2.0"
  status: "draft"
  created_date: "2025-10-25"
  target_release: "2026-Q1"
  document_type: "requirements_specification"

executive_summary:
  business_problem: "施術系業態におけるスタッフ・設備の予約可視化不足、手作業による転記ミス、No-show発生"
  solution_overview: "5〜10分単位の細密予約管理、ガント形式UI、LINE連携による顧客接点最適化"
  key_benefits:
    - "No-show率50%削減（前日自動リマインド）"
    - "受付業務時間60%削減"
    - "リソース稼働率15%向上"
  constraints:
    - "会計・決済機能は非スコープ"
    - "カルテ機能はオプション（連携IFのみ）"
    - "医療・準医療系の個人情報保護規制準拠が必須"

stakeholders:
  - role: "管理者"
    persona: "経営層、店舗責任者"
    key_concerns:
      - "リソース稼働率向上"
      - "No-show削減"
      - "業務効率化"
    success_criteria:
      metric: "稼働率15%向上、No-show率50%削減"
      
  - role: "スタッフ"
    persona: "施術担当者"
    key_concerns:
      - "自担当予約の迅速な把握"
      - "操作の簡便性"
    success_criteria:
      metric: "予約確認時間70%削減、操作習熟期間1週間以内"
      
  - role: "受付"
    persona: "受付・オペレータ"
    key_concerns:
      - "電話予約の迅速登録"
      - "紙運用との併用"
    success_criteria:
      metric: "予約登録時間60%削減、印刷機能の実用性確保"
      
  - role: "顧客"
    persona: "サービス利用者"
    key_concerns:
      - "24時間予約可能"
      - "変更の容易性"
      - "リマインド受信"
    success_criteria:
      metric: "LINE予約完了率90%以上、予約変更3ステップ以内"

scope:
  must_have:  # Phase 1で必須
    - feature_id: "F001"
      name: "日表示タイムライン"
      description: "スタッフ/設備を行、時間軸を列とした予約可視化"
      priority: "critical"
      implementation_status: "completed"
      implementation_details:
        file: "/src/app/reservations/page.tsx"
        features:
          - "ガント形式UI実装済み"
          - "5-60分間隔対応"
          - "色分け表示（ステータス別）"
          - "リソース行表示"
        completion_date: "2025-10-25"
      
    - feature_id: "F002"
      name: "ドラッグ&ドロップ編集"
      description: "予約カードのD&Dによる時刻・担当変更"
      priority: "critical"
      implementation_status: "completed"
      implementation_details:
        file: "/src/app/reservations/page.tsx"
        service_file: "/src/lib/services/reservation-service.ts"
        test_file: "/src/__tests__/components/reservations/reservation-timeline.test.tsx"
        completed_features:
          - "完全なD&D構造実装"
          - "楽観的更新による300ms以内のUI反映"
          - "ReservationService統合による衝突検出"
          - "ドラッグオーバー時のビジュアルフィードバック（青色ハイライト）"
          - "エラー時の自動ロールバック機能"
          - "性能計測と警告ログ（300ms超過時）"
          - "包括的なテストケース（衝突検出・性能・ロールバック）"
        completion_date: "2025-11-03"
      acceptance_criteria:
        - "✅ 300ms以内でUI反映（楽観的更新）"
        - "✅ 変更時の衝突検出（ダブルブッキング防止）"
        - "✅ サーバーエラー時のロールバック"
        
    - feature_id: "F003"
      name: "LINE連携予約受付"
      description: "LINE公式アカウントからのセルフ予約"
      priority: "critical"
      implementation_status: "not_started"
      dependencies: ["LINE Messaging API"]
      
    - feature_id: "F004"
      name: "自動リマインド"
      description: "前日指定時刻に予約リマインド配信"
      priority: "critical"
      implementation_status: "not_started"
      config_params:
        - "delivery_time: 前日19:00（デフォルト）"
        - "template: カスタマイズ可能"
        
    - feature_id: "F005"
      name: "電話予約手入力"
      description: "受付による手動予約登録"
      priority: "high"
      implementation_status: "completed"
      implementation_details:
        file: "/src/app/reservations/register/page.tsx"
        features:
          - "4ステップウィザード実装済み"
          - "顧客検索・新規登録機能"
          - "メニュー・スタッフ選択"
          - "日時選択・確認画面"
        completion_date: "2025-10-25"
      
    - feature_id: "F006"
      name: "予約表印刷"
      description: "日次予約表のPDF出力"
      priority: "high"
      implementation_status: "completed"
      implementation_details:
        file: "/src/app/reservations/page.tsx"
        features:
          - "印刷ボタン実装済み"
          - "PDF出力機能対応"
        completion_date: "2025-10-25"
      
    - feature_id: "F007"
      name: "予約枠設定"
      description: "受付可能月数（1〜7ヶ月）、分解能（5/10/15/30/60分）"
      priority: "high"
      implementation_status: "completed"
      implementation_details:
        file: "/src/app/reservations/page.tsx"
        features:
          - "時間間隔設定 (5/10/15/30/60分) 実装済み"
          - "営業時間設定機能"
          - "リソース稼働時間管理"
        completion_date: "2025-10-25"
      
    - feature_id: "F008"
      name: "販売停止設定"
      description: "単発・繰り返しパターンでの予約ブロック"
      priority: "high"
      implementation_status: "completed"
      implementation_details:
        type_file: "/src/types/reservation.ts"
        service_file: "/src/lib/services/block-service.ts"
        ui_file: "/src/app/blocks/page.tsx"
        integration_file: "/src/lib/services/reservation-service.ts"
        completed_features:
          - "Block型定義（RFC 5545 RRULE形式対応）"
          - "BlockService完全実装（CRUD操作）"
          - "衝突チェック機能"
          - "繰り返しBlock展開（簡易RRULE処理）"
          - "Block管理UI（作成・一覧・削除）"
          - "単発・繰り返しパターン対応"
          - "ReservationServiceとの統合（予約時のBlock衝突検出）"
          - "ブロック理由の表示機能"
        completion_date: "2025-11-03"
      acceptance_criteria:
        - "✅ 単発・繰り返しパターンの設定"
        - "✅ 予約時のBlock衝突検出"
        - "✅ RFC 5545準拠のRRULE対応（簡易実装）"

  should_have:  # Phase 1で強く推奨、Phase 2へ延期可能
    - feature_id: "F101"
      name: "複数日予約一括登録"
      description: "対面での継続予約を一括取得"
      priority: "medium"
      implementation_status: "completed"
      implementation_details:
        service_file: "/src/lib/services/reservation-service.ts"
        ui_file: "/src/app/reservations/register/page.tsx"
        completed_features:
          - "ReservationService.createMultipleReservations完全実装"
          - "最大5週間分の予約一括登録"
          - "単一予約/複数予約の自動切り替え"
          - "選択済み日付のバッジ表示"
          - "合計料金表示（確認画面）"
          - "成功/エラーハンドリングと通知"
          - "予約完了後の自動リダイレクト"
          - "継続予約チェックボックスとUIフロー"
        completion_date: "2025-11-03"
      acceptance_criteria:
        - "✅ カレンダーから複数日選択→一括確定が2分以内"
        - "✅ 週次単位での選択機能"
        - "✅ 合計料金の表示"
      
    - feature_id: "F102"
      name: "事前ヒアリング属性取得"
      description: "友だち追加時の可変フォーム"
      priority: "medium"
      implementation_status: "not_started"
      
    - feature_id: "F103"
      name: "検索/フィルタ"
      description: "スタッフ・設備・メニュー・ステータス別絞り込み"
      priority: "medium"
      implementation_status: "completed"
      implementation_details:
        file: "/src/app/reservations/list/page.tsx"
        features:
          - "顧客名・電話・ID検索機能"
          - "ステータス・スタッフ・チャネル・日付フィルタ"
          - "一括操作機能"
          - "統計サマリー表示"
        completion_date: "2025-10-25"
      
    - feature_id: "F104"
      name: "横/縦表示切替"
      description: "タイムライン表示の軸変更"
      priority: "medium"
      implementation_status: "completed"
      implementation_details:
        file: "/src/app/reservations/page.tsx"
        features:
          - "横表示・縦表示ボタン実装済み"
          - "viewOrientation状態管理"
        completion_date: "2025-10-25"
      
    - feature_id: "F105"
      name: "基礎セグメント配信"
      description: "年齢・性別による配信先絞り込み"
      priority: "medium"
      implementation_status: "not_started"

  could_have:  # Phase 2以降で検討
    - feature_id: "F201"
      name: "Web予約フォーム"
      description: "LINEアカウント未保有者向けチャネル"
      priority: "low"
      
    - feature_id: "F202"
      name: "カルテ連携IF"
      description: "施術記録との相互参照"
      priority: "low"
      dependencies: ["外部カルテシステムAPI"]
      
    - feature_id: "F203"
      name: "高度セグメント配信"
      description: "来店頻度・LTV・メニュー履歴による絞り込み"
      priority: "low"
      
    - feature_id: "F204"
      name: "週/月カレンダービュー"
      description: "日表示以外の期間ビュー"
      priority: "low"

  wont_have:  # 明示的に非スコープ
    - "会計/決済処理"
    - "レセプト/保険請求"
    - "在庫管理"
    - "勤怠給与管理"
    - "マーケティングAI予測"

user_stories:
  - id: "US001"
    role: "顧客"
    goal: "初回予約時に基本属性を入力し、パーソナライズされた体験を得る"
    acceptance_criteria:
      - "属性入力が3分以内に完了"
      - "入力内容が予約時に自動反映"
    priority: "high"
    
  - id: "US002"
    role: "顧客"
    goal: "急な予定変更時にLINEから3ステップ以内で予約変更"
    acceptance_criteria:
      - "予約一覧→詳細→変更→確定の4画面遷移"
      - "操作時間2分以内"
    priority: "high"
    
  - id: "US003"
    role: "受付"
    goal: "電話中にリアルタイムで空枠を確認し、その場で予約登録"
    acceptance_criteria:
      - "顧客検索→空枠表示→予約登録が30秒以内"
    priority: "high"
    
  - id: "US004"
    role: "受付"
    goal: "対面で顧客と相談しながら5回分の継続予約を一括登録"
    acceptance_criteria:
      - "カレンダーから複数日選択→一括確定が2分以内"
    priority: "medium"
    dependencies: ["F101"]
    
  - id: "US005"
    role: "スタッフ"
    goal: "出勤時に自分の1日スケジュールと顧客情報を一目で把握"
    acceptance_criteria:
      - "タイムライン表示で自担当が色分け"
      - "顧客名・メニュー・事前ヒアリングが即座に確認可能"
    priority: "high"
    
  - id: "US006"
    role: "管理者"
    goal: "週次でスタッフ・設備の稼働率を確認し、空き時間帯にプロモーション"
    acceptance_criteria:
      - "週次レポートで時間帯別稼働率表示"
      - "CSVエクスポート可能"
    priority: "medium"

data_model:
  entities:
    - name: "Customer"
      description: "顧客マスタ"
      attributes:
        - name: "customer_id"
          type: "uuid"
          primary_key: true
        - name: "name"
          type: "string"
          max_length: 100
          required: true
          pii: true
        - name: "phone"
          type: "string"
          format: "E.164"
          required: true
          pii: true
          unique: true
        - name: "email"
          type: "string"
          format: "email"
          pii: true
        - name: "line_user_id"
          type: "string"
          unique: true
        - name: "gender"
          type: "enum"
          values: ["male", "female", "other", "prefer_not_to_say"]
        - name: "birth_date"
          type: "date"
          pii: true
        - name: "custom_attributes"
          type: "jsonb"
          description: "可変属性（症状・希望部位等）"
        - name: "consent_marketing"
          type: "boolean"
          default: false
        - name: "consent_reminder"
          type: "boolean"
          default: true
        - name: "created_at"
          type: "timestamp"
        - name: "updated_at"
          type: "timestamp"
      relationships:
        - target: "Reservation"
          type: "one_to_many"
          
    - name: "Reservation"
      description: "予約"
      attributes:
        - name: "reservation_id"
          type: "uuid"
          primary_key: true
        - name: "customer_id"
          type: "uuid"
          foreign_key: "Customer.customer_id"
          required: true
        - name: "menu_id"
          type: "uuid"
          foreign_key: "Menu.menu_id"
          required: true
        - name: "staff_id"
          type: "uuid"
          foreign_key: "Resource.resource_id"
          required: true
        - name: "start_time"
          type: "timestamp"
          required: true
          indexed: true
        - name: "end_time"
          type: "timestamp"
          required: true
          indexed: true
        - name: "status"
          type: "enum"
          values: ["tentative", "confirmed", "arrived", "completed", "cancelled", "no_show", "unconfirmed", "trial"]
          default: "tentative"
          required: true
        - name: "channel"
          type: "enum"
          values: ["line", "web", "phone", "walk_in"]
          required: true
        - name: "notes"
          type: "text"
        - name: "created_at"
          type: "timestamp"
        - name: "updated_at"
          type: "timestamp"
        - name: "created_by"
          type: "uuid"
          foreign_key: "User.user_id"
      constraints:
        - type: "unique"
          columns: ["staff_id", "start_time"]
          description: "同一スタッフの同時刻ダブルブッキング防止"
      relationships:
        - target: "Customer"
          type: "many_to_one"
        - target: "Menu"
          type: "many_to_one"
        - target: "Resource"
          type: "many_to_many"
          through: "ReservationResource"
          
    - name: "Resource"
      description: "リソース（スタッフ・設備）"
      attributes:
        - name: "resource_id"
          type: "uuid"
          primary_key: true
        - name: "name"
          type: "string"
          max_length: 100
          required: true
        - name: "type"
          type: "enum"
          values: ["staff", "room", "bed", "device"]
          required: true
        - name: "working_hours"
          type: "jsonb"
          description: "営業時間（曜日別）"
        - name: "max_concurrent"
          type: "integer"
          default: 1
          description: "同時利用可能数"
        - name: "supported_menus"
          type: "uuid[]"
          description: "対応可能メニューID配列"
        - name: "is_active"
          type: "boolean"
          default: true
      relationships:
        - target: "Reservation"
          type: "many_to_many"
          through: "ReservationResource"
        - target: "Block"
          type: "one_to_many"
          
    - name: "Menu"
      description: "メニュー"
      attributes:
        - name: "menu_id"
          type: "uuid"
          primary_key: true
        - name: "name"
          type: "string"
          max_length: 100
          required: true
        - name: "duration_minutes"
          type: "integer"
          required: true
          min: 5
        - name: "price"
          type: "decimal"
          precision: 10
          scale: 2
        - name: "description"
          type: "text"
        - name: "is_active"
          type: "boolean"
          default: true
      relationships:
        - target: "Reservation"
          type: "one_to_many"
          
    - name: "Block"
      description: "販売停止期間"
      attributes:
        - name: "block_id"
          type: "uuid"
          primary_key: true
        - name: "resource_id"
          type: "uuid"
          foreign_key: "Resource.resource_id"
          required: true
        - name: "start_time"
          type: "timestamp"
          required: true
        - name: "end_time"
          type: "timestamp"
          required: true
        - name: "recurrence_rule"
          type: "string"
          format: "RRULE"
          description: "RFC 5545準拠の繰り返しルール"
        - name: "reason"
          type: "text"
        - name: "created_by"
          type: "uuid"
          foreign_key: "User.user_id"
      relationships:
        - target: "Resource"
          type: "many_to_one"
          
    - name: "Message"
      description: "メッセージ配信ログ"
      attributes:
        - name: "message_id"
          type: "uuid"
          primary_key: true
        - name: "customer_id"
          type: "uuid"
          foreign_key: "Customer.customer_id"
          required: true
        - name: "type"
          type: "enum"
          values: ["reminder", "segment", "manual"]
          required: true
        - name: "content"
          type: "text"
          required: true
        - name: "sent_at"
          type: "timestamp"
        - name: "delivery_status"
          type: "enum"
          values: ["pending", "sent", "delivered", "failed"]
          default: "pending"
        - name: "error_message"
          type: "text"
      relationships:
        - target: "Customer"
          type: "many_to_one"

ui_ux_requirements:
  layout:
    primary_view:
      type: "timeline_gantt"
      orientation: "horizontal"  # 時間軸が横、リソースが縦
      alternate_orientation: "vertical"  # 切替可能
      time_axis:
        granularity: 
          options: [5, 10, 15, 30, 60]  # 分単位
          default: 10
        range: "営業開始〜終了"
      resource_axis:
        types: ["staff", "room", "bed", "device"]
        max_display: 50
        
    toolbar:
      components:
        - type: "date_navigation"
          controls: ["previous_day", "today", "next_day", "date_picker"]
        - type: "refresh_button"
          auto_refresh_interval: 30  # 秒
        - type: "filters"
          filter_by: ["staff", "room", "menu", "status"]
        - type: "search"
          search_by: ["customer_name", "phone", "reservation_id"]
        - type: "print_button"
          format: "pdf"
          
    notification_banner:
      alerts:
        - type: "unconfirmed_reservations"
          priority: "high"
        - type: "reminder_delivery_failure"
          priority: "medium"
          
  reservation_card:
    display_elements:
      - "time_range"  # 開始〜終了時刻
      - "customer_name"  # 匿名表示切替可能
      - "menu_name"
      - "staff_name"
      - "status_icon"
    
    status_colors:
      tentative: "#E0E0E0"  # 薄いグレー
      confirmed: "#B3E5FC"  # 水色
      arrived: "#81C784"    # 緑
      completed: "#4CAF50"  # 濃い緑
      cancelled: "#EF5350"  # 赤
      no_show: "#C62828"    # 濃い赤
      unconfirmed: "#FFF176"  # 黄色
      trial: "#BA68C8"      # 紫
      
    accessibility:
      color_blind_mode: true
      patterns:  # 色覚多様性対応
        tentative: "none"
        confirmed: "diagonal_stripes"
        arrived: "dots"
        cancelled: "cross_hatch"
        
    interactions:
      - action: "click"
        result: "詳細パネル表示（編集・キャンセル・複製・メモ）"
      - action: "drag_drop"
        result: "時間変更（横）、担当変更（縦）"
        performance: "300ms以内で反映"
      - action: "resize"
        result: "所要時間変更"
      - action: "right_click"
        result: "コンテキストメニュー（ステータス変更・顧客情報）"

non_functional_requirements:
  performance:
    - metric: "日表示初期描画"
      target: "2秒以内"
      condition: "500予約、50リソース時"
      rationale: "Googleページ速度調査：2秒超で離脱率上昇"
      
    - metric: "D&D操作反映"
      target: "300ms以内"
      rationale: "ヒューマンインターフェース研究：リアルタイム感の閾値"
      
    - metric: "検索結果表示"
      target: "1秒以内"
      rationale: "インタラクティブ検索の体験維持"
      
    - metric: "LINE予約受付〜反映"
      target: "5秒以内"
      rationale: "顧客離脱防止のレスポンスタイム"
      
    - metric: "PDF生成"
      target: "10秒以内"
      rationale: "受付業務の待ち時間許容範囲"
      
    load_assumptions:
      concurrent_users: 50
      daily_reservations: 500
      uncertainty: "特大店舗では再検証が必要"
      
  availability:
    uptime_target: "99.5%"  # 営業時間帯
    rto: "30分"  # 復旧目標時間
    rpo: "15分"  # 復旧目標時点（バックアップ間隔）
    rationale: "営業時間中の停止は予約機会損失に直結"
    
  scalability:
    stores: 100
    resources_per_store: 50
    data_retention: "3年（それ以前はアーカイブ）"
    
  security:
    authentication:
      - role: "管理者"
        mfa_required: true
      - role: "スタッフ"
        mfa_required: false
      - role: "受付"
        mfa_required: false
        
    encryption:
      at_rest: "AES-256"
      in_transit: "TLS 1.3+"
      pii_fields:
        - "Customer.name"
        - "Customer.phone"
        - "Customer.email"
        - "Customer.birth_date"
        - "Customer.custom_attributes"
        
    backup:
      incremental: "15分間隔"
      full: "日次"
      test_recovery: "月次"
      
    audit_log:
      operations: ["create", "update", "delete"]
      entities: ["Reservation", "Customer", "Block"]
      retention: "90日"
      fields: ["user_id", "timestamp", "ip_address", "device_info", "changes"]
      
  accessibility:
    wcag_level: "AA"
    contrast_ratio: "4.5:1以上"
    keyboard_navigation: true
    screen_reader_compatible: true
    zoom_support: "200%まで"
    
  monitoring:
    metrics:
      - "API error rate"
      - "API response time (p50, p95, p99)"
      - "Reminder delivery success rate"
      - "Database connection pool utilization"
      - "Queue depth (message queue)"
    alerts:
      - condition: "Error rate > 1%"
        severity: "critical"
      - condition: "Response time p95 > 2s"
        severity: "warning"
      - condition: "Reminder success rate < 95%"
        severity: "warning"

integration:
  line_official_account:
    api: "LINE Messaging API v2"
    features:
      - "友だち追加時アンケート"
      - "リッチメニュー予約導線"
      - "Webhook予約受信"
      - "Push通知（リマインド・セグメント）"
    rate_limits:
      push_messages: "500通/秒"
      
  electronic_medical_record:  # オプション
    protocol: "REST API"
    data_format: "JSON"
    authentication: "OAuth 2.0"
    endpoints:
      - path: "/api/v1/records/{record_id}"
        method: "GET"
        description: "カルテ情報取得"
      - path: "/api/v1/reservations/{reservation_id}/link"
        method: "POST"
        description: "予約とカルテの紐付け"
        
  future:
    - name: "Web予約フォーム"
      phase: 2
    - name: "WhatsApp Messaging"
      phase: 3
      scope: "海外展開時"

kpis:
  - name: "No-show率"
    target: "50%削減"
    baseline: "導入前3ヶ月平均"
    measurement: "来店実績データから算出"
    frequency: "月次"
    
  - name: "LINE予約比率"
    target: "全予約の60%以上"
    measurement: "予約チャネル別件数集計"
    frequency: "月次"
    
  - name: "再来率"
    target: "15%向上"
    measurement: "顧客ごとの来店頻度分析"
    frequency: "四半期"
    
  - name: "リソース稼働率"
    target: "15%向上"
    calculation: "予約時間 ÷ 稼働可能時間"
    frequency: "週次"
    
  - name: "受付業務時間"
    target: "60%削減"
    measurement: "電話予約登録の平均所要時間"
    frequency: "月次"
    
  - name: "LTV（顧客生涯価値）"
    target: "20%向上"
    scope: "セグメント配信活用顧客"
    measurement: "売上追跡"
    frequency: "四半期"
    
  review_schedule:
    - timing: "導入1ヶ月後"
    - timing: "導入3ヶ月後"
    - timing: "導入6ヶ月後"

risks:
  technical:
    - id: "RISK-T001"
      description: "LINE API障害"
      impact: "high"
      probability: "low"
      mitigation: "Web予約フォームをバックアップ手段として用意"
      
    - id: "RISK-T002"
      description: "性能劣化（予約数増加）"
      impact: "medium"
      probability: "medium"
      mitigation: "負荷テストで閾値特定、インデックス最適化・キャッシュ導入"
      
    - id: "RISK-T003"
      description: "データ損失"
      impact: "high"
      probability: "low"
      mitigation: "15分間隔差分バックアップ、日次フルバックアップ、復旧訓練"
      
  operational:
    - id: "RISK-O001"
      description: "ユーザー習熟遅延"
      impact: "medium"
      probability: "high"
      mitigation: "段階的リリース、操作マニュアル・動画、導入初週サポート強化"
      
    - id: "RISK-O002"
      description: "既存システムとの整合性"
      impact: "high"
      probability: "medium"
      mitigation: "事前API仕様確認、テスト環境連携検証、並行運用期間設定"
      
  compliance:
    - id: "RISK-C001"
      description: "個人情報保護法違反"
      impact: "high"
      probability: "low"
      mitigation: "法務担当レビュー、利用規約・プライバシーポリシー整備"
      
    - id: "RISK-C002"
      description: "医療広告ガイドライン違反"
      impact: "medium"
      probability: "low"
      scope: "治療院等"
      mitigation: "誇大広告規制確認、コンプライアンスチェックリスト"

acceptance_criteria:
  functional:
    - "5分刻み枠、横持ちタイムライン、D&D編集が実用速度（300ms以内）で動作"
    - "受付可能月数・販売停止（単発/繰返）・複数日予約が設定通り反映"
    - "LINE予約→管理画面反映→自動リマインド→来店処理がE2Eで通る"
    - "予約表印刷が業務に耐える品質（顧客名・時刻が判読可能）"
    
  performance:
    - "日表示初期描画2秒以内（500予約/50リソース）"
    - "D&D操作反映300ms以内"
    - "LINE予約受付〜管理画面反映5秒以内"
    
  security:
    - "個人情報（氏名・電話・症状）がAES-256で暗号化保存"
    - "ロール別権限制御が正しく動作（スタッフが他スタッフ予約編集不可）"
    - "操作履歴が正確に記録（実行者・日時・変更内容）"
    
  usability:
    - "新規ユーザー（スタッフ）が1週間以内に基本操作習得"
    - "WCAG 2.1 AAコントラストチェック合格"
    - "色覚多様性モードで操作に支障なし"

release_strategy:
  phase_1:
    name: "MVP"
    timeline: "開発開始から3ヶ月"
    features:
      - "F001"  # 日表示タイムライン
      - "F002"  # D&D編集
      - "F003"  # LINE連携
      - "F004"  # 自動リマインド
      - "F005"  # 電話予約手入力
      - "F006"  # 印刷
      - "F007"  # 予約枠設定
      - "F008"  # 販売停止
    target_stores: "1〜2店（パイロット）"
    goals:
      - "基本操作検証"
      - "UI/UX初期フィードバック収集"
      
  phase_2:
    name: "機能拡張"
    timeline: "Phase 1から2ヶ月後"
    features:
      - "F101"  # 複数日予約
      - "F102"  # 事前ヒアリング
      - "F103"  # 検索/フィルタ
      - "F104"  # 横/縦切替
      - "F105"  # セグメント配信
    target_stores: "5〜10店"
    goals:
      - "運用定着"
      - "No-show率削減効果初期測定"
      
  phase_3:
    name: "本格展開"
    timeline: "Phase 2から3ヶ月後"
    features:
      - "F201"  # Web予約
      - "F202"  # カルテ連携
      - "F203"  # 高度セグメント
      - "F204"  # 週/月ビュー
    target_stores: "全店舗"
    goals:
      - "全社標準システム定着"
      - "KPI目標達成"

# 実装基盤状況 (2025-11-03時点)
implementation_foundation:
  technical_stack:
    status: "completed"
    completion_date: "2025-11-03"
    details:
      frontend:
        framework: "Next.js 15 + React 19 + TypeScript"
        ui_library: "shadcn/ui"
        file_structure: "App Router対応"
        implementation_status: "完全実装済み"
      
      backend:
        database: "Supabase (PostgreSQL)"
        authentication: "Supabase Auth"
        client_library: "Supabase Client (サーバー・クライアント対応)"
        implementation_status: "完全実装済み"
      
      testing:
        framework: "Jest + React Testing Library"
        approach: "TDD (Test-Driven Development)"
        coverage: "包括的テストスイート実装済み"
        implementation_status: "完全実装済み"

  data_model:
    status: "completed"
    completion_date: "2025-11-03"
    details:
      entities_implemented:
        - name: "Reservation"
          file: "/src/types/reservation.ts"
          status: "完全実装済み"
        - name: "Customer"
          file: "/src/types/reservation.ts"
          status: "完全実装済み"
        - name: "Menu"
          file: "/src/types/reservation.ts"
          status: "完全実装済み"
        - name: "Resource"
          file: "/src/types/reservation.ts"
          status: "完全実装済み"
        - name: "TimeSlot"
          file: "/src/types/reservation.ts"
          status: "完全実装済み"
        - name: "Block"
          file: "/src/types/reservation.ts"
          status: "完全実装済み（2025-11-03追加）"
          description: "販売停止設定（RFC 5545 RRULE対応）"

      service_layer:
        - name: "ReservationService"
          file: "/src/lib/services/reservation-service.ts"
          status: "完全実装済み"
          features:
            - "CRUD operations for all entities"
            - "Business logic validation"
            - "Conflict detection"
            - "Block衝突チェック統合（F008）"
            - "複数日予約一括登録（F101）"
            - "Statistics and reporting"
            - "Bulk operations"
        - name: "BlockService"
          file: "/src/lib/services/block-service.ts"
          status: "完全実装済み（2025-11-03追加）"
          features:
            - "Block CRUD operations"
            - "衝突チェック機能"
            - "繰り返しBlock展開（簡易RRULE処理）"
            - "期間別Block取得"

  ui_components:
    status: "completed"
    completion_date: "2025-11-03"
    details:
      pages_implemented:
        - name: "Timeline View"
          file: "/src/app/reservations/page.tsx"
          status: "完全実装済み"
          features:
            - "ガント形式タイムライン表示"
            - "完全なD&D機能（楽観的更新、300ms以内反映）"
            - "衝突検出・Block衝突検出統合"
            - "リソース別フィルタ"
            - "ステータス色分け表示"
            - "横/縦表示切替"
          updated: "2025-11-03"
        - name: "Registration Form"
          file: "/src/app/reservations/register/page.tsx"
          status: "完全実装済み"
          features:
            - "4ステップウィザード"
            - "顧客検索・新規登録"
            - "メニュー・スタッフ選択"
            - "複数日予約一括登録（最大5週間分）"
            - "合計料金表示"
            - "バリデーション"
          updated: "2025-11-03"
        - name: "List Management"
          file: "/src/app/reservations/list/page.tsx"
          status: "完全実装済み"
          features: ["検索", "フィルタ", "一括操作", "統計表示"]
        - name: "Block Management"
          file: "/src/app/blocks/page.tsx"
          status: "完全実装済み（2025-11-03追加）"
          features:
            - "Block作成フォーム"
            - "単発・繰り返しパターン対応"
            - "Block一覧表示"
            - "Block削除機能"
            - "リソース選択UI"

  test_coverage:
    status: "completed"
    completion_date: "2025-11-03"
    details:
      test_files:
        - "/src/__tests__/components/reservations/reservation-timeline.test.tsx"
        - "/src/__tests__/components/reservations/reservation-register.test.tsx"
        - "/src/__tests__/components/reservations/reservation-list.test.tsx"
        - "/src/__tests__/lib/reservation-service.test.ts"
      coverage_areas:
        - "機能テスト (完全実装済み)"
        - "性能テスト (完全実装済み、D&D 300ms要件含む)"
        - "D&D衝突検出テスト (2025-11-03追加)"
        - "D&Dロールバックテスト (2025-11-03追加)"
        - "アクセシビリティテスト (完全実装済み)"
        - "エラーハンドリングテスト (完全実装済み)"

  overall_progress:
    completion_percentage: "69%"
    completed_features: 9
    total_critical_features: 13
    completed_feature_list:
      - "F001 - 日表示タイムライン"
      - "F002 - ドラッグ&ドロップ編集（300ms以内反映、衝突検出）"
      - "F005 - 電話予約手入力"
      - "F006 - 予約表印刷"
      - "F007 - 予約枠設定"
      - "F008 - 販売停止設定（単発・繰り返しパターン）"
      - "F101 - 複数日予約一括登録"
      - "F103 - 検索/フィルタ"
      - "F104 - 横/縦表示切替"
    remaining_critical_features:
      - "F003 - LINE連携予約受付"
      - "F004 - 自動リマインド"
      - "F102 - 事前ヒアリング属性取得"
      - "F105 - 基礎セグメント配信"

    next_priorities:
      - priority: "critical"
        feature: "LINE Messaging API統合（F003）"
      - priority: "critical"
        feature: "自動リマインド配信システム（F004）"
      - priority: "medium"
        feature: "事前ヒアリング属性取得（F102）"

    update_date: "2025-11-03"
    update_summary: "D&D性能最適化、複数日予約UI統合、販売停止設定機能を完全実装"

critical_decisions:
  - decision: "5分刻み枠の採用"
    rationale: "整体・鍼灸の流動的施術時間に対応"
    tradeoffs:
      pros:
        - "細密時間管理による稼働率向上"
      cons:
        - "UI複雑化"
        - "顧客の選択肢過多"
    resolution: "デフォルト10分、5分は管理者設定で有効化"
    uncertainty: "顧客向けLINE予約は15分刻み推奨"
    
  - decision: "最大7ヶ月受付期間"
    rationale: "季節性イベント（夏前ダイエット施術）対応"
    tradeoffs:
      pros:
        - "長期予約対応"
      cons:
        - "変更率上昇リスク"
        - "データ量増大"
    resolution: "上限7ヶ月、デフォルト3ヶ月"
    
  - decision: "LINE優先、Web後回し"
    rationale: "開発工数削減、顧客接点統一"
    tradeoffs:
      pros:
        - "初期リリース早期化"
      cons:
        - "高齢者・法人ニーズ未対応"
    resolution: "Phase 1はLINE特化、Phase 2でWeb追加"
    alternative: "アーキテクチャはマルチチャネル前提設計"
    
  - decision: "パフォーマンス目標（2秒/300ms）"
    rationale: "UXリサーチ、ヒューマンインターフェース研究"
    evidence:
      - "Googleページ速度調査：2秒超で離脱率上昇"
      - "300msはリアルタイム感の閾値"
    uncertainty: "500予約/50リソースは平均規模想定、特大店舗は再検証必要"

open_issues:
  - id: "ISSUE-001"
    description: "既存LINE運用（配信頻度・認証形態）との整合性確認"
    priority: "high"
    deadline: "契約前"
    
  - id: "ISSUE-002"
    description: "カルテ/レセプトとの境界（別製品・連携IFの深さ）確定"
    priority: "high"
    deadline: "Phase 1開発開始前"
    
  - id: "ISSUE-003"
    description: "医療/準医療系の個人情報・広告規制整備"
    priority: "critical"
    deadline: "Phase 1リリース前"

references:
  - title: "リピッテ公式サイト"
    url: "https://repitte.com"
    relevance: "機能一覧、治療院向けページ、サービス概要"
    
  - title: "LINE Marketplace"
    relevance: "セグメント配信等の連携仕様"
    
  - title: "WCAG 2.1"
    url: "https://www.w3.org/WAI/WCAG21/quickref/"
    relevance: "アクセシビリティ基準"
    
  - title: "個人情報保護法"
    jurisdiction: "日本"
    
  - title: "医療広告ガイドライン"
    publisher: "厚生労働省"
    relevance: "治療院の広告規制"

# AI駆動開発用メタデータ
ai_development:
  code_generation_hints:
    backend:
      language: "Python"
      framework: "FastAPI"
      orm: "SQLAlchemy"
      database: "PostgreSQL"
      
    frontend:
      language: "TypeScript"
      framework: "React"
      ui_library: "shadcn/ui"
      state_management: "Zustand"
      
    testing:
      unit_test_framework: "pytest"
      e2e_test_framework: "Playwright"
      coverage_target: "80%"
      
  automation_targets:
    - "API endpoint generation from data model"
    - "CRUD operations for all entities"
    - "Form validation from schema"
    - "Test case generation from acceptance criteria"
    - "OpenAPI spec generation"
    
  llm_prompting_tips:
    - "Use feature_id to reference specific requirements"
    - "Link user stories to acceptance criteria for test generation"
    - "Extract KPI metrics for analytics dashboard implementation"
    - "Reference data_model for database migration scripts"
