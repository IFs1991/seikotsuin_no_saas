begin;

select plan(8);

select has_table(
  'public',
  'calendar_feed_tokens',
  'calendar_feed_tokens table exists'
);

select has_column(
  'public',
  'calendar_feed_tokens',
  'token_hash',
  'calendar_feed_tokens.token_hash exists'
);

select col_is_unique(
  'public',
  'calendar_feed_tokens',
  'token_hash',
  'calendar_feed_tokens.token_hash is unique'
);

select isnt_empty(
  $$
    select 1
    from pg_constraint
    where conname = 'calendar_feed_tokens_type_check'
      and conrelid = 'public.calendar_feed_tokens'::regclass
  $$,
  'calendar_feed_tokens feed_type constraint exists'
);

select isnt_empty(
  $$
    select 1
    from pg_constraint
    where conname = 'calendar_feed_tokens_target_check'
      and conrelid = 'public.calendar_feed_tokens'::regclass
  $$,
  'calendar_feed_tokens target constraint exists'
);

select isnt_empty(
  $$
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'calendar_feed_tokens'
      and policyname = 'calendar_feed_tokens_select_scoped'
  $$,
  'calendar_feed_tokens scoped select policy exists'
);

select isnt_empty(
  $$
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'calendar_feed_tokens'
      and indexname = 'calendar_feed_tokens_staff_active_idx'
  $$,
  'calendar_feed_tokens staff active index exists'
);

select isnt_empty(
  $$
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'calendar_feed_tokens'
      and indexname = 'calendar_feed_tokens_clinic_active_idx'
  $$,
  'calendar_feed_tokens clinic active index exists'
);

select * from finish();

rollback;
