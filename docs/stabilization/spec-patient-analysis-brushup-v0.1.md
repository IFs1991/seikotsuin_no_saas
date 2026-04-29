# Patient Analysis Brush-up Spec v0.1

## Goal
Improve `/patients` so clinic staff and clinic admins can trust the patient analysis page during MVP operation.

The page must use the current customer/reservation SSOT:

- `public.customers`
- `public.reservations`
- `public.patient_visit_summary`

## Current State
- UI route: `src/app/(app)/patients/page.tsx`
- Hook: `src/hooks/usePatientAnalysis.ts`
- API: `GET /api/customers/analysis`
- Shared service: `src/lib/services/patient-analysis-service.ts`
- DB view: `public.patient_visit_summary`

The data path is connected, but two metrics still depend on legacy assumptions:

- `calculate_patient_ltv(patient_uuid)` reads legacy `revenues.patient_id`.
- `calculate_churn_risk_score(patient_uuid)` reads legacy `visits.patient_id`.

`patient_visit_summary.patient_id` is currently `customers.id`, so these RPCs can return mostly `0` when the clinic is using reservations/customers as the source of truth.

## Scope
- No database migration.
- No RLS policy change.
- No Supabase function replacement in this PR.
- Improve the application-level analysis service using columns already available in `patient_visit_summary`.
- Update `/patients` UI mapping so real visit segment data is visible.
- Add targeted tests for the service, hook, and page.

## Non-Goals
- Age, symptom, and region segmentation. Those require structured patient profile fields or intake forms and should be planned separately.
- True predictive LTV modeling.
- Notification or follow-up task persistence.
- Changing reservation status taxonomy.

## Metric Rules

### Conversion
Use `visit_count` from `patient_visit_summary`.

- Initial visit: all customers with at least one completed/arrived visit.
- Second visit: customers with `visit_count >= 2`.
- Continuing visit: customers with `visit_count >= 5`.

### LTV
For this MVP brush-up, `ltv` means current reservation-based lifetime value:

- `ltv = total_revenue`
- `total_revenue` comes from completed/arrived reservations in `patient_visit_summary`.

This is intentionally conservative and avoids false predictive values.

### Churn Risk
Calculate risk in application code from:

- `last_visit_date`
- `visit_count`
- `treatment_period_days`

Rules:

- No visit or no `last_visit_date`: score `0`, category `low`.
- Estimate expected gap:
  - If `visit_count > 1`, `treatment_period_days / (visit_count - 1)`.
  - Otherwise 30 days.
  - Minimum expected gap is 14 days.
- Compare days since last visit to expected gap:
  - Within expected gap: low.
  - 2x expected gap: low to medium.
  - 3x expected gap: medium.
  - 4x expected gap or more: high.

### Segments
Show real visit category segments from `visit_category`.

- `来院なし`
- `初診のみ`
- `軽度リピート`
- `中度リピート`
- `高度リピート`

## API Contract
`GET /api/customers/analysis?clinic_id=...` keeps the existing response shape:

- `conversionData`
- `visitCounts`
- `riskScores`
- `ltvRanking`
- `segmentData`
- `followUpList`
- `totalPatients`
- `activePatients`

`segmentData.visit` becomes the primary segment for the `/patients` page.

## Rollback Plan
No migration rollback is required.

If the application change causes issues:

1. Revert `src/lib/services/patient-analysis-service.ts`.
2. Revert `src/hooks/usePatientAnalysis.ts`.
3. Revert `src/app/(app)/patients/page.tsx`.
4. Revert the related tests.

The existing `/api/customers/analysis` route and DB view remain unchanged.

## DoD Mapping
- DOD-08: Tenant boundary remains enforced by `ensureClinicAccess` in `src/app/api/customers/analysis/route.ts`.
- DOD-09: UI continues to call server API through `src/lib/api-client.ts`.
- DOD-10: Type check must pass.
- DOD-11: Targeted Jest tests must pass.

## Acceptance Criteria
- The analysis service does not call legacy patient RPCs for LTV/risk.
- LTV ranking uses `patient_visit_summary.total_revenue`.
- Churn risk is non-zero for overdue repeat patients based on reservation-derived summary data.
- `/patients` displays visit category segments from real DB-backed data.
- No Supabase migration is added.
