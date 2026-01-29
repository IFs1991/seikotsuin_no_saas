-- ================================================================
-- clinics.parent_id self-reference guard
-- ================================================================
-- Spec: docs/stabilization/spec-parent-child-schema-v0.1.md
-- Purpose: prevent parent_id referencing self (A -> A)
-- DoD: DOD-02, DOD-08
-- Rollback: 20260127000101_clinics_parent_id_self_check_rollback.sql.backup
-- ================================================================

BEGIN;

ALTER TABLE public.clinics
ADD CONSTRAINT clinics_parent_id_not_self
CHECK (parent_id IS NULL OR parent_id <> id)
NOT VALID;

COMMIT;

-- Optional: validate later after confirming no legacy self-references.
-- ALTER TABLE public.clinics VALIDATE CONSTRAINT clinics_parent_id_not_self;
