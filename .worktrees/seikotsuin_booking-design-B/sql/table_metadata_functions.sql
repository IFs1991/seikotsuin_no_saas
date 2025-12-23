-- =================================================================
-- テーブルメタデータ取得関数 - 本番環境用
-- =================================================================

-- 管理可能なテーブル一覧を取得する関数
CREATE OR REPLACE FUNCTION get_manageable_tables()
RETURNS TABLE(table_name text)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT 
    t.table_name::text
  FROM 
    information_schema.tables t
  WHERE 
    t.table_schema = 'public'
    AND t.table_type = 'BASE TABLE'
    AND t.table_name NOT IN (
      -- システムテーブルを除外
      'auth',
      'storage',
      'realtime',
      'supabase_functions',
      -- 監査・ログテーブルを除外
      'audit_logs',
      'system_logs',
      -- バックアップ・一時テーブルを除外
      '_backup',
      '_temp',
      '_migration'
    )
    AND t.table_name !~ '^_.*'  -- アンダースコアで始まるテーブルを除外
    AND t.table_name !~ '.*_backup$'  -- バックアップテーブルを除外
    -- 管理対象として適切なテーブルのみ
    AND t.table_name IN (
      'treatment_menus',
      'menu_categories',
      'staff_members', 
      'patient_profiles',
      'clinic_settings',
      'appointment_slots',
      'medical_records',
      'payment_records',
      'insurance_claims',
      'system_settings'
    )
  ORDER BY 
    t.table_name;
$$;

-- テーブルのカラム情報を取得する関数
CREATE OR REPLACE FUNCTION get_table_columns(table_name_param text)
RETURNS TABLE(
  column_name text,
  data_type text,
  is_nullable boolean,
  column_default text,
  character_maximum_length integer,
  numeric_precision integer,
  numeric_scale integer,
  foreign_table text,
  foreign_column text
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT 
    c.column_name::text,
    c.data_type::text,
    CASE WHEN c.is_nullable = 'YES' THEN true ELSE false END as is_nullable,
    c.column_default::text,
    c.character_maximum_length,
    c.numeric_precision,
    c.numeric_scale,
    -- 外部キー情報を取得
    COALESCE(
      (SELECT 
         ccu.table_name::text
       FROM 
         information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name
         JOIN information_schema.constraint_column_usage ccu
           ON ccu.constraint_name = tc.constraint_name
       WHERE 
         tc.constraint_type = 'FOREIGN KEY'
         AND tc.table_name = table_name_param
         AND kcu.column_name = c.column_name
       LIMIT 1),
      NULL
    ) as foreign_table,
    COALESCE(
      (SELECT 
         ccu.column_name::text
       FROM 
         information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name
         JOIN information_schema.constraint_column_usage ccu
           ON ccu.constraint_name = tc.constraint_name
       WHERE 
         tc.constraint_type = 'FOREIGN KEY'
         AND tc.table_name = table_name_param
         AND kcu.column_name = c.column_name
       LIMIT 1),
      NULL
    ) as foreign_column
  FROM 
    information_schema.columns c
  WHERE 
    c.table_schema = 'public'
    AND c.table_name = table_name_param
    -- システムカラムを除外
    AND c.column_name NOT IN (
      'created_at',
      'updated_at', 
      'deleted_at',
      'created_by',
      'updated_by',
      'version'
    )
  ORDER BY 
    c.ordinal_position;
$$;

-- テーブルの制約情報を取得する関数
CREATE OR REPLACE FUNCTION get_table_constraints(table_name_param text)
RETURNS TABLE(
  constraint_name text,
  constraint_type text,
  column_name text,
  foreign_table_name text,
  foreign_column_name text
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT 
    tc.constraint_name::text,
    tc.constraint_type::text,
    kcu.column_name::text,
    ccu.table_name::text as foreign_table_name,
    ccu.column_name::text as foreign_column_name
  FROM 
    information_schema.table_constraints tc
    LEFT JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
    LEFT JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
  WHERE 
    tc.table_schema = 'public'
    AND tc.table_name = table_name_param
    AND tc.constraint_type IN ('PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE', 'CHECK')
  ORDER BY 
    tc.constraint_type, tc.constraint_name;
$$;

-- インデックス情報を取得する関数
CREATE OR REPLACE FUNCTION get_table_indexes(table_name_param text)
RETURNS TABLE(
  index_name text,
  column_names text[],
  is_unique boolean,
  index_type text
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT 
    i.indexname::text as index_name,
    ARRAY(
      SELECT 
        a.attname::text
      FROM 
        pg_attribute a
      WHERE 
        a.attrelid = idx.indrelid
        AND a.attnum = ANY(idx.indkey)
      ORDER BY 
        array_position(idx.indkey, a.attnum)
    ) as column_names,
    idx.indisunique as is_unique,
    am.amname::text as index_type
  FROM 
    pg_indexes i
    JOIN pg_class c ON c.relname = i.indexname
    JOIN pg_index idx ON idx.indexrelid = c.oid
    JOIN pg_am am ON am.oid = c.relam
  WHERE 
    i.schemaname = 'public'
    AND i.tablename = table_name_param
    -- システムインデックスを除外
    AND i.indexname NOT LIKE '%_pkey'
    AND i.indexname NOT LIKE 'pg_%'
  ORDER BY 
    i.indexname;
$$;

-- 関数の権限設定
GRANT EXECUTE ON FUNCTION get_manageable_tables() TO authenticated;
GRANT EXECUTE ON FUNCTION get_table_columns(text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_table_constraints(text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_table_indexes(text) TO authenticated;

-- セキュリティコメント
COMMENT ON FUNCTION get_manageable_tables() IS '管理画面で操作可能なテーブル一覧を取得（認証ユーザーのみ）';
COMMENT ON FUNCTION get_table_columns(text) IS '指定テーブルのカラム定義情報を取得（認証ユーザーのみ）';
COMMENT ON FUNCTION get_table_constraints(text) IS '指定テーブルの制約情報を取得（認証ユーザーのみ）';
COMMENT ON FUNCTION get_table_indexes(text) IS '指定テーブルのインデックス情報を取得（認証ユーザーのみ）';