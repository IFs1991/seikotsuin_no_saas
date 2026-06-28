import type { Json } from '@/types/supabase';

export function isJson(value: unknown): value is Json {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isJson);
  }

  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).every(
      childValue => childValue === undefined || isJson(childValue)
    );
  }

  return false;
}

export function toJson(value: unknown): Json {
  const parsed = JSON.parse(JSON.stringify(value)) as unknown;
  if (!isJson(parsed)) {
    throw new Error('Value is not JSON serializable');
  }
  return parsed;
}

export function toJsonObject(value: unknown): Json {
  const json = toJson(value);
  if (json === null || Array.isArray(json) || typeof json !== 'object') {
    throw new Error('Value is not a JSON object');
  }
  return json;
}
