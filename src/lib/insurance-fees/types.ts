import type { Database, Json } from '../../types/supabase';

export const INSURANCE_FEE_PROFESSION_TYPES = [
  'judo',
  'acupuncture',
  'moxibustion',
  'anma_massage',
  'common',
] as const;

export const INSURANCE_FEE_PAYER_CONTEXT_CODES = [
  'insurance',
  'workers_comp',
  'traffic_accident',
] as const;

export const INSURANCE_FEE_SCHEDULE_STATUSES = [
  'draft',
  'reviewed',
  'active',
  'superseded',
  'retired',
] as const;

export const INSURANCE_FEE_CONFIDENCE_LEVELS = [
  'high',
  'medium',
  'low',
] as const;

export const INSURANCE_FEE_WARNING_SEVERITIES = [
  'info',
  'warning',
  'needs_review',
  'blocked',
] as const;

export type InsuranceFeeProfessionType =
  (typeof INSURANCE_FEE_PROFESSION_TYPES)[number];
export type InsuranceFeePayerContextCode =
  (typeof INSURANCE_FEE_PAYER_CONTEXT_CODES)[number];
export type InsuranceFeeScheduleStatus =
  (typeof INSURANCE_FEE_SCHEDULE_STATUSES)[number];
export type InsuranceFeeConfidence =
  (typeof INSURANCE_FEE_CONFIDENCE_LEVELS)[number];
export type InsuranceFeeWarningSeverity =
  (typeof INSURANCE_FEE_WARNING_SEVERITIES)[number];

export type InsuranceFeeScheduleTableRow =
  Database['public']['Tables']['insurance_fee_schedules']['Row'];
export type InsuranceFeeItemTableRow =
  Database['public']['Tables']['insurance_fee_items']['Row'];
export type InsuranceFeeSourceSnapshotTableRow =
  Database['public']['Tables']['insurance_fee_source_snapshots']['Row'];
export type InsuranceFeeWarningDefinitionTableRow =
  Database['public']['Tables']['insurance_fee_warning_definitions']['Row'];

export type InsuranceFeeJsonObject = {
  readonly [key: string]: Json;
};

export type InsuranceFeeScheduleRecordInput = Pick<
  InsuranceFeeScheduleTableRow,
  | 'schedule_code'
  | 'schedule_name'
  | 'profession_type'
  | 'payer_context_code'
  | 'effective_from'
  | 'effective_to'
  | 'schedule_status'
  | 'source_id'
  | 'source_snapshot_hash'
>;

export type InsuranceFeeItemRecordInput = Pick<
  InsuranceFeeItemTableRow,
  | 'id'
  | 'schedule_code'
  | 'item_code'
  | 'item_name'
  | 'official_label'
  | 'category'
  | 'amount_yen'
  | 'unit'
  | 'billing_scope'
  | 'calculation_basis'
  | 'warning_codes_json'
  | 'manual_amount_required'
  | 'auto_calculation_allowed'
  | 'source_id'
  | 'source_snapshot_hash'
  | 'confidence'
  | 'sort_order'
>;

export type InsuranceFeeScheduleRecord = {
  schedule_code: string;
  schedule_name: string;
  profession_type: InsuranceFeeProfessionType;
  payer_context_code: InsuranceFeePayerContextCode;
  effective_from: string;
  effective_to: string | null;
  schedule_status: InsuranceFeeScheduleStatus;
  source_id: string;
  source_snapshot_hash: string | null;
};

export type InsuranceFeeItemRecord = {
  id: string;
  schedule_code: string;
  item_code: string;
  item_name: string;
  official_label: string | null;
  category: string;
  amount_yen: number | null;
  unit: string;
  billing_scope: string;
  calculation_basis?: string | null;
  applicable_conditions_json?: InsuranceFeeJsonObject;
  exclusion_conditions_json?: InsuranceFeeJsonObject;
  required_inputs_json?: InsuranceFeeJsonObject;
  warning_codes_json: unknown;
  manual_amount_required: boolean;
  auto_calculation_allowed: boolean;
  source_id: string;
  source_snapshot_hash: string | null;
  confidence?: InsuranceFeeConfidence;
  sort_order: number;
};

export type InsuranceFeeSourceSnapshotRecord = {
  source_id: string;
  content_hash: string | null;
};

export type InsuranceFeeWarningDefinitionRecord = {
  warning_code: string;
  severity?: InsuranceFeeWarningSeverity;
  message?: string;
  applies_to_profession_type?: InsuranceFeeProfessionType | null;
  applies_to_payer_context_code?: InsuranceFeePayerContextCode | null;
  auto_block_calculation?: boolean;
  manual_review_required?: boolean;
  is_active?: boolean;
  sort_order?: number;
};

const professionTypeSet = new Set<string>(INSURANCE_FEE_PROFESSION_TYPES);
const payerContextCodeSet = new Set<string>(INSURANCE_FEE_PAYER_CONTEXT_CODES);
const scheduleStatusSet = new Set<string>(INSURANCE_FEE_SCHEDULE_STATUSES);
const confidenceSet = new Set<string>(INSURANCE_FEE_CONFIDENCE_LEVELS);
const warningSeveritySet = new Set<string>(INSURANCE_FEE_WARNING_SEVERITIES);

export function isInsuranceFeeProfessionType(
  value: unknown
): value is InsuranceFeeProfessionType {
  return typeof value === 'string' && professionTypeSet.has(value);
}

export function isInsuranceFeePayerContextCode(
  value: unknown
): value is InsuranceFeePayerContextCode {
  return typeof value === 'string' && payerContextCodeSet.has(value);
}

export function isInsuranceFeeScheduleStatus(
  value: unknown
): value is InsuranceFeeScheduleStatus {
  return typeof value === 'string' && scheduleStatusSet.has(value);
}

export function isInsuranceFeeConfidence(
  value: unknown
): value is InsuranceFeeConfidence {
  return typeof value === 'string' && confidenceSet.has(value);
}

export function isInsuranceFeeWarningSeverity(
  value: unknown
): value is InsuranceFeeWarningSeverity {
  return typeof value === 'string' && warningSeveritySet.has(value);
}

export function assertInsuranceFeeProfessionType(
  value: unknown
): InsuranceFeeProfessionType {
  if (isInsuranceFeeProfessionType(value)) {
    return value;
  }
  throw new Error(`Invalid insurance fee profession type: ${String(value)}`);
}

export function assertInsuranceFeePayerContextCode(
  value: unknown
): InsuranceFeePayerContextCode {
  if (isInsuranceFeePayerContextCode(value)) {
    return value;
  }
  throw new Error(`Invalid insurance fee payer context code: ${String(value)}`);
}

export function assertInsuranceFeeScheduleStatus(
  value: unknown
): InsuranceFeeScheduleStatus {
  if (isInsuranceFeeScheduleStatus(value)) {
    return value;
  }
  throw new Error(`Invalid insurance fee schedule status: ${String(value)}`);
}

export function assertInsuranceFeeConfidence(
  value: unknown
): InsuranceFeeConfidence {
  if (isInsuranceFeeConfidence(value)) {
    return value;
  }
  throw new Error(`Invalid insurance fee confidence: ${String(value)}`);
}

export function parseInsuranceFeeWarningCodes(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const warningCodes: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') {
      return null;
    }
    warningCodes.push(item);
  }
  return warningCodes;
}

export function toInsuranceFeeScheduleRecord(
  row: InsuranceFeeScheduleRecordInput
): InsuranceFeeScheduleRecord {
  return {
    schedule_code: row.schedule_code,
    schedule_name: row.schedule_name,
    profession_type: assertInsuranceFeeProfessionType(row.profession_type),
    payer_context_code: assertInsuranceFeePayerContextCode(
      row.payer_context_code
    ),
    effective_from: row.effective_from,
    effective_to: row.effective_to,
    schedule_status: assertInsuranceFeeScheduleStatus(row.schedule_status),
    source_id: row.source_id,
    source_snapshot_hash: row.source_snapshot_hash,
  };
}

export function toInsuranceFeeItemRecord(
  row: InsuranceFeeItemRecordInput
): InsuranceFeeItemRecord {
  return {
    id: row.id,
    schedule_code: row.schedule_code,
    item_code: row.item_code,
    item_name: row.item_name,
    official_label: row.official_label,
    category: row.category,
    amount_yen: row.amount_yen,
    unit: row.unit,
    billing_scope: row.billing_scope,
    calculation_basis: row.calculation_basis,
    warning_codes_json: row.warning_codes_json,
    manual_amount_required: row.manual_amount_required,
    auto_calculation_allowed: row.auto_calculation_allowed,
    source_id: row.source_id,
    source_snapshot_hash: row.source_snapshot_hash,
    confidence: assertInsuranceFeeConfidence(row.confidence),
    sort_order: row.sort_order,
  };
}

export function toInsuranceFeeSourceSnapshotRecord(
  row: InsuranceFeeSourceSnapshotTableRow
): InsuranceFeeSourceSnapshotRecord {
  return {
    source_id: row.source_id,
    content_hash: row.content_hash,
  };
}

export function toInsuranceFeeWarningDefinitionRecord(
  row: InsuranceFeeWarningDefinitionTableRow
): InsuranceFeeWarningDefinitionRecord {
  return {
    warning_code: row.warning_code,
    severity: isInsuranceFeeWarningSeverity(row.severity)
      ? row.severity
      : undefined,
    message: row.message,
    applies_to_profession_type: row.applies_to_profession_type
      ? assertInsuranceFeeProfessionType(row.applies_to_profession_type)
      : null,
    applies_to_payer_context_code: row.applies_to_payer_context_code
      ? assertInsuranceFeePayerContextCode(row.applies_to_payer_context_code)
      : null,
    auto_block_calculation: row.auto_block_calculation,
    manual_review_required: row.manual_review_required,
    is_active: row.is_active,
    sort_order: row.sort_order,
  };
}
