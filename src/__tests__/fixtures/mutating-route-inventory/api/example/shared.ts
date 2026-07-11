export async function aliasedHandler() {
  await ensureClinicAccess();
  await client.from('records').delete();
  await client.from('dedupe').upsert({ key: 'fixture' });
  return { deleted: true };
}

declare function ensureClinicAccess(): Promise<void>;
declare const client: {
  from(table: string): {
    delete(): Promise<unknown>;
    upsert(value: unknown): Promise<unknown>;
  };
};
