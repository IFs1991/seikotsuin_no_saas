# Care Episode / Visit Stage Phase 2 Spec v0.5

Source: `docs/tiramisu_revenue_context_spec_v0.5.md`, Phase 2.

## Scope

Phase 2 adds long-term patient journey analysis without replacing the current
`daily_report_items` SSOT.

- Use `customers`, not legacy `patients`, as the customer root.
- Add `care_episodes` for clinic/customer-scoped treatment episodes.
- Add `visit_stage_definitions` for canonical visit stages.
- Attach episode/stage columns to `daily_report_items`.
- Add route support for creating/updating episodes, attaching an item to an
  episode, and recalculating visit ordinals/stages.
- Expose Phase 2 metrics from `/api/revenue`.

## DB Objects

- `supabase/migrations/20260514000200_care_episode_visit_stage_phase2.sql`
- `supabase/rollbacks/20260514000200_care_episode_visit_stage_phase2_rollback.sql`

New tables:

- `public.care_episodes`
- `public.visit_stage_definitions`

New `daily_report_items` columns:

- `care_episode_id`
- `visit_ordinal_in_episode`
- `visit_stage_code`

## Security

- New RLS policies use `app_private.get_current_role()` and
  `app_private.can_access_clinic(clinic_id)`.
- `anon` grants are revoked for new tables.
- `visit_stage_definitions` is authenticated select-only.
- `care_episodes` is authenticated select/insert/update for staff roles.
- `validate_daily_report_items_analysis_refs()` fail-closes when an item links
  to a care episode from another clinic or customer.

## API

- `POST /api/care-episodes`
- `PATCH /api/care-episodes/:id`
- `POST /api/daily-reports/items/:id/care-episode`
- `POST /api/care-episodes/recalculate-visit-stages`

## Metrics

`/api/revenue` returns `careEpisodeMetrics`:

- `totalEpisodes`
- `secondVisitReachedCount`
- `fifthVisitReachedCount`
- `secondVisitReachRate`
- `fifthVisitReachRate`
- `episodeContinuationRate`
- `averageRevenuePerEpisode`
- `averageVisitsPerEpisode`

## DoD

- Migration string tests pass.
- Route tests pass for scoped create/update/attach/recalculate.
- `npm run type-check` passes after `npm run supabase:types`.
- New code does not add `any`, `as any`, `@ts-ignore`, or unsafe RLS weakening.
