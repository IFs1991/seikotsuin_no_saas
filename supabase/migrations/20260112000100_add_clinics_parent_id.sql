-- ================================================================
-- Add parent_id to clinics table (Parent-Child Scope Model)
-- ================================================================
-- Spec: docs/stabilization/spec-parent-child-schema-v0.1.md
-- Related: docs/stabilization/spec-rls-tenant-boundary-v0.1.md
--
-- Purpose:
--   Enable parent-child clinic hierarchy for multi-location organizations.
--   Clinics under the same parent can access each other's data (sibling access).
--
-- Impact:
--   - custom_access_token_hook will automatically detect parent_id and
--     populate clinic_scope_ids with all sibling clinic IDs
--   - can_access_clinic() already supports clinic_scope_ids array check
--   - No application code changes required
--
-- Rollback: 20260112000101_add_clinics_parent_id_rollback.sql.backup
-- ================================================================

BEGIN;

-- ================================================================
-- 1. Add parent_id column
-- ================================================================
-- NULL = top-level (HQ) clinic or standalone clinic
-- Non-NULL = child clinic under a parent organization

ALTER TABLE public.clinics
ADD COLUMN parent_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.clinics.parent_id IS
'Parent clinic ID for hierarchical organization structure.
NULL means this is a top-level (HQ) or standalone clinic.
Clinics with the same parent_id share tenant boundary (sibling access allowed).
@see docs/stabilization/spec-rls-tenant-boundary-v0.1.md';

-- ================================================================
-- 2. Create index for performance
-- ================================================================
-- Used by custom_access_token_hook to find sibling clinics

CREATE INDEX idx_clinics_parent_id ON public.clinics(parent_id)
WHERE parent_id IS NOT NULL;

-- ================================================================
-- 3. Add helper function for getting sibling clinic IDs
-- ================================================================
-- Used for debugging and admin operations

CREATE OR REPLACE FUNCTION public.get_sibling_clinic_ids(clinic_id UUID)
RETURNS UUID[] AS $$
DECLARE
    parent UUID;
    siblings UUID[];
BEGIN
    -- Get parent of the given clinic
    SELECT c.parent_id INTO parent
    FROM public.clinics c
    WHERE c.id = clinic_id;

    IF parent IS NULL THEN
        -- This clinic might be a parent itself, get its children + itself
        SELECT ARRAY_AGG(c.id) INTO siblings
        FROM public.clinics c
        WHERE c.parent_id = clinic_id OR c.id = clinic_id;
    ELSE
        -- Get all clinics under the same parent + the parent itself
        SELECT ARRAY_AGG(c.id) INTO siblings
        FROM public.clinics c
        WHERE c.parent_id = parent OR c.id = parent;
    END IF;

    RETURN COALESCE(siblings, ARRAY[clinic_id]);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.get_sibling_clinic_ids(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_sibling_clinic_ids(UUID) IS
'Returns array of clinic IDs that share the same parent organization.
Includes the parent clinic itself and all child clinics.
Used for debugging and admin operations.';

-- ================================================================
-- 4. Add view for clinic hierarchy visualization
-- ================================================================

CREATE OR REPLACE VIEW public.clinic_hierarchy AS
SELECT
    c.id,
    c.name,
    c.parent_id,
    p.name AS parent_name,
    CASE
        WHEN c.parent_id IS NULL THEN 'HQ/Standalone'
        ELSE 'Child'
    END AS clinic_type,
    (SELECT COUNT(*) FROM public.clinics child WHERE child.parent_id = c.id) AS child_count
FROM public.clinics c
LEFT JOIN public.clinics p ON c.parent_id = p.id
WHERE c.is_active = true
ORDER BY COALESCE(c.parent_id, c.id), c.parent_id NULLS FIRST, c.name;

COMMENT ON VIEW public.clinic_hierarchy IS
'Hierarchical view of clinic parent-child relationships.
HQ/Standalone clinics are shown first, followed by their children.';

-- Grant access to authenticated users (RLS on clinics table still applies)
GRANT SELECT ON public.clinic_hierarchy TO authenticated;

COMMIT;

-- ================================================================
-- Post-Migration Notes
-- ================================================================
--
-- 1. Verify column was added:
--    SELECT column_name, data_type, is_nullable
--    FROM information_schema.columns
--    WHERE table_name = 'clinics' AND column_name = 'parent_id';
--
-- 2. Verify index was created:
--    SELECT indexname FROM pg_indexes
--    WHERE tablename = 'clinics' AND indexname = 'idx_clinics_parent_id';
--
-- 3. Test sibling function:
--    SELECT get_sibling_clinic_ids('your-clinic-uuid');
--
-- 4. Set up parent-child relationships:
--    -- Example: Set clinic B as child of clinic A (HQ)
--    UPDATE clinics SET parent_id = 'clinic-a-uuid' WHERE id = 'clinic-b-uuid';
--
-- 5. Verify JWT now includes clinic_scope_ids:
--    -- After re-login, check JWT claims
--    SELECT current_setting('request.jwt.claims', true)::jsonb->'clinic_scope_ids';
--
-- ================================================================
