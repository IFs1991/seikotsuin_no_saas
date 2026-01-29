-- ================================================================
-- clinics.parent_id self-reference guard validation
-- ================================================================
-- Spec: docs/stabilization/spec-parent-child-schema-v0.1.md
-- Purpose: validate clinics_parent_id_not_self after data check
-- DoD: DOD-02, DOD-08
-- Rollback: 20260127000101_clinics_parent_id_self_check_rollback.sql.backup
-- ================================================================

BEGIN;

ALTER TABLE public.clinics
VALIDATE CONSTRAINT clinics_parent_id_not_self;

COMMIT;
