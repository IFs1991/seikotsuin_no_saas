export class ImportedFixtureWriter {
  async persist(
    client: {
      from(table: string): {
        insert(value: { clinic_id: string }): Promise<unknown>;
      };
    },
    clinicId: string
  ): Promise<void> {
    await client.from('fixture_rows').insert({ clinic_id: clinicId });
  }
}
