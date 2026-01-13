-- ================================================================
-- security_events severity normalization
-- ================================================================
-- Normalize legacy severity values and enforce allowed levels.

UPDATE public.security_events
SET severity_level = CASE severity_level
  WHEN 'high' THEN 'error'
  WHEN 'medium' THEN 'warning'
  WHEN 'low' THEN 'info'
  ELSE severity_level
END
WHERE severity_level IN ('high', 'medium', 'low');

ALTER TABLE public.security_events
DROP CONSTRAINT IF EXISTS security_events_severity_level_check;

ALTER TABLE public.security_events
ADD CONSTRAINT security_events_severity_level_check
CHECK (severity_level IN ('info', 'warning', 'error', 'critical'));
