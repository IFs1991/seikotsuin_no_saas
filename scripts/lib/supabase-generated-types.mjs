const POSTGREST_VERSION_PATTERN =
  /(\b__InternalSupabase:\s*\{\s*PostgrestVersion:\s*')[^']+(';\s*\};)/m;
const POSTGREST_PREAMBLE_PATTERN =
  /^(?:  \/\/[^\r\n]*\r?\n)*  __InternalSupabase: \{\r?\n    PostgrestVersion: '[^']+';\r?\n  \};\r?\n/m;

function readPostgrestPreamble(generatedTypes) {
  return generatedTypes.match(POSTGREST_PREAMBLE_PATTERN)?.[0] ?? null;
}

export function readPostgrestVersion(generatedTypes) {
  const match = generatedTypes.match(POSTGREST_VERSION_PATTERN);
  return match
    ? (match[0].match(/PostgrestVersion:\s*'([^']+)'/)?.[1] ?? null)
    : null;
}

export function replacePostgrestVersion(generatedTypes, version) {
  if (!POSTGREST_VERSION_PATTERN.test(generatedTypes)) {
    throw new Error(
      'Generated types do not contain __InternalSupabase.PostgrestVersion'
    );
  }

  return generatedTypes.replace(
    POSTGREST_VERSION_PATTERN,
    (_match, prefix, suffix) => `${prefix}${version}${suffix}`
  );
}

export function normalizePostgrestVersion(generatedTypes) {
  return generatedTypes.replace(POSTGREST_PREAMBLE_PATTERN, '');
}

export function preserveCommittedPostgrestVersion(
  generatedTypes,
  committedTypes
) {
  const generatedVersion = readPostgrestVersion(generatedTypes);
  const committedVersion = readPostgrestVersion(committedTypes);
  const generatedPreamble = readPostgrestPreamble(generatedTypes);
  const committedPreamble = readPostgrestPreamble(committedTypes);

  if (generatedVersion === null && committedVersion === null) {
    return {
      content: generatedTypes,
      generatedVersion,
      committedVersion,
      changed: false,
    };
  }

  if (generatedPreamble !== null && committedPreamble === null) {
    throw new Error(
      'Committed types are missing remote __InternalSupabase.PostgrestVersion metadata'
    );
  }

  if (generatedPreamble === null && committedPreamble !== null) {
    const databaseMarker = 'export type Database = {\n';

    if (!generatedTypes.includes(databaseMarker)) {
      throw new Error('Generated types do not contain export type Database');
    }

    return {
      content: generatedTypes.replace(
        databaseMarker,
        databaseMarker + committedPreamble
      ),
      generatedVersion,
      committedVersion,
      changed: true,
    };
  }

  if (generatedPreamble === null || committedPreamble === null) {
    throw new Error('Unable to resolve Supabase runtime metadata preamble');
  }

  return {
    content: generatedTypes.replace(generatedPreamble, committedPreamble),
    generatedVersion,
    committedVersion,
    changed: generatedVersion !== committedVersion,
  };
}
