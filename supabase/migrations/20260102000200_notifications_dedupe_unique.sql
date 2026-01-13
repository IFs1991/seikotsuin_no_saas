-- ================================================================
-- notifications unique constraint for related entities
-- ================================================================

WITH ranked AS (
  SELECT
    ctid,
    ROW_NUMBER() OVER (
      PARTITION BY related_entity_type, related_entity_id, type
      ORDER BY created_at DESC
    ) AS rn
  FROM public.notifications
  WHERE related_entity_type IS NOT NULL
    AND related_entity_id IS NOT NULL
)
DELETE FROM public.notifications
WHERE ctid IN (SELECT ctid FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_unique_related_entity
ON public.notifications (related_entity_type, related_entity_id, type);
