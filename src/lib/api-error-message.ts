type ApiErrorMessagePayload = {
  error?: string | { message?: string | null } | null;
  details?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function getFirstFieldErrorMessage(details: unknown): string | null {
  if (!isRecord(details)) {
    return null;
  }

  const fieldErrors = details.fieldErrors;
  if (!isRecord(fieldErrors)) {
    return null;
  }

  for (const value of Object.values(fieldErrors)) {
    if (!Array.isArray(value)) {
      continue;
    }

    const message = value.find(
      (item): item is string => typeof item === 'string' && item.trim() !== ''
    );
    if (message) {
      return message;
    }
  }

  return null;
}

export function getApiErrorMessage(
  response: ApiErrorMessagePayload,
  fallback: string
): string {
  const fieldErrorMessage = getFirstFieldErrorMessage(response.details);
  if (fieldErrorMessage) {
    return fieldErrorMessage;
  }

  if (typeof response.error === 'string' && response.error.trim() !== '') {
    return response.error;
  }

  if (
    isRecord(response.error) &&
    typeof response.error.message === 'string' &&
    response.error.message.trim() !== ''
  ) {
    return response.error.message;
  }

  return fallback;
}
