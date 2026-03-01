-- ================================================================
-- Phase 6: Security Hardening - MFA & Legacy Password Columns
-- ================================================================
-- 4a. user_mfa_settings.secret_key が平文保存
--     → encrypt_mfa_secret() を実装（pgcrypto pgp_sym_encrypt）
--     → 本番運用前に暗号化鍵の設定が必要
-- 4b. staff.password_hash / user_permissions.hashed_password が不要
--     → DEPRECATEDコメント追加
-- 4c. SECURITY DEFINER トリガー関数のテナント境界検証
--     → log_reservation_created等は reservations.clinic_id を
--       reservation_history.clinic_id にコピーするため問題なし
-- 4d. notifications INSERT は service_role 限定に修正済み → 確認OK
-- リスク: 低
-- ================================================================

BEGIN;

-- ================================================================
-- 4a. MFA秘密鍵暗号化関数の実装
-- ================================================================

-- pgcrypto拡張の有効化（既存の場合はスキップ）
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- encrypt_mfa_secret: 暗号化関数
-- 注意: 本番運用前に app.settings.mfa_encryption_key を設定すること
CREATE OR REPLACE FUNCTION encrypt_mfa_secret(secret_text TEXT)
RETURNS TEXT AS $$
DECLARE
    encryption_key TEXT;
BEGIN
    -- 暗号化鍵を設定から取得
    BEGIN
        encryption_key := current_setting('app.settings.mfa_encryption_key', true);
    EXCEPTION WHEN OTHERS THEN
        encryption_key := NULL;
    END;

    -- 暗号化鍵が未設定の場合は平文で返す（開発環境用）
    -- TODO: 本番環境では必ず暗号化鍵を設定すること
    IF encryption_key IS NULL OR encryption_key = '' THEN
        RAISE WARNING '[SECURITY] MFA encryption key not configured. Storing secret in plaintext. Set app.settings.mfa_encryption_key before production use.';
        RETURN secret_text;
    END IF;

    -- pgp_sym_encrypt で暗号化
    RETURN encode(pgp_sym_encrypt(secret_text, encryption_key), 'base64');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- decrypt_mfa_secret: 復号化関数
CREATE OR REPLACE FUNCTION decrypt_mfa_secret(encrypted_text TEXT)
RETURNS TEXT AS $$
DECLARE
    encryption_key TEXT;
BEGIN
    -- 暗号化鍵を設定から取得
    BEGIN
        encryption_key := current_setting('app.settings.mfa_encryption_key', true);
    EXCEPTION WHEN OTHERS THEN
        encryption_key := NULL;
    END;

    -- 暗号化鍵が未設定の場合はそのまま返す（平文保存されている前提）
    IF encryption_key IS NULL OR encryption_key = '' THEN
        RETURN encrypted_text;
    END IF;

    -- pgp_sym_decrypt で復号化
    RETURN pgp_sym_decrypt(decode(encrypted_text, 'base64'), encryption_key);
EXCEPTION WHEN OTHERS THEN
    -- 復号化失敗時（平文データの場合等）はそのまま返す
    RETURN encrypted_text;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION encrypt_mfa_secret(TEXT) IS
'MFA TOTP秘密鍵を暗号化する。
app.settings.mfa_encryption_key が設定されている場合は pgp_sym_encrypt を使用。
未設定の場合は平文で返す（開発環境用）。
本番運用前に必ず暗号化鍵を設定すること。';

COMMENT ON FUNCTION decrypt_mfa_secret(TEXT) IS
'暗号化されたMFA TOTP秘密鍵を復号化する。
encrypt_mfa_secret() で暗号化されたデータを復号化。
平文データの場合はそのまま返す（後方互換性）。';

-- 権限制御: デフォルトの PUBLIC アクセスを除去し、authenticated のみに制限
-- decrypt_mfa_secret は特に秘密鍵を返す関数のため厳格に制限
REVOKE ALL ON FUNCTION encrypt_mfa_secret(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION decrypt_mfa_secret(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION encrypt_mfa_secret(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION decrypt_mfa_secret(TEXT) TO authenticated;

-- ================================================================
-- 4a-2. user_mfa_settings テーブルへのコメント追加
-- ================================================================

COMMENT ON COLUMN public.user_mfa_settings.secret_key IS
'[SECURITY WARNING] TOTP秘密鍵。
本番環境では encrypt_mfa_secret() で暗号化して保存すること。
app.settings.mfa_encryption_key の設定が必要。
参照: decrypt_mfa_secret() で復号化。';

-- ================================================================
-- 4b. Legacy パスワードカラムの DEPRECATED マーク
-- ================================================================

COMMENT ON COLUMN public.staff.password_hash IS
'[DEPRECATED] Supabase Auth を使用しているため不要。
次回の破壊的マイグレーション時に DROP 予定。
新規コードでは auth.users を使用すること。';

COMMENT ON COLUMN public.user_permissions.hashed_password IS
'[DEPRECATED] Supabase Auth を使用しているため不要。
値は ''managed_by_supabase'' 固定。
次回の破壊的マイグレーション時に DROP 予定。';

-- ================================================================
-- 4c. SECURITY DEFINER トリガー関数のテナント境界検証
-- ================================================================
-- log_reservation_created / log_reservation_updated / log_reservation_deleted は
-- reservations テーブルの NEW/OLD レコードから直接 clinic_id を参照するため、
-- テナント境界を超えることはない。
-- ただし、reservation_history に clinic_id を明示的にコピーするように修正。

CREATE OR REPLACE FUNCTION log_reservation_created()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.reservation_history (
        reservation_id,
        clinic_id,
        action,
        new_value,
        created_by,
        ip_address
    ) VALUES (
        NEW.id,
        NEW.clinic_id,  -- テナント境界を明示的にコピー
        'created',
        to_jsonb(NEW),
        auth.uid(),
        inet_client_addr()
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION log_reservation_updated()
RETURNS TRIGGER AS $$
DECLARE
    v_action VARCHAR(50);
    v_change_reason TEXT;
BEGIN
    IF OLD.status != NEW.status THEN
        v_action := 'status_changed';
    ELSIF OLD.start_time != NEW.start_time OR OLD.end_time != NEW.end_time THEN
        v_action := 'rescheduled';
    ELSE
        v_action := 'updated';
    END IF;

    IF NEW.status = 'cancelled' THEN
        v_change_reason := NEW.cancellation_reason;
    END IF;

    INSERT INTO public.reservation_history (
        reservation_id,
        clinic_id,
        action,
        old_value,
        new_value,
        change_reason,
        created_by,
        ip_address
    ) VALUES (
        NEW.id,
        NEW.clinic_id,  -- テナント境界を明示的にコピー
        v_action,
        to_jsonb(OLD),
        to_jsonb(NEW),
        v_change_reason,
        auth.uid(),
        inet_client_addr()
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION log_reservation_deleted()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.reservation_history (
        reservation_id,
        clinic_id,
        action,
        old_value,
        created_by,
        ip_address
    ) VALUES (
        OLD.id,
        OLD.clinic_id,  -- テナント境界を明示的にコピー
        'deleted',
        to_jsonb(OLD),
        auth.uid(),
        inet_client_addr()
    );
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
