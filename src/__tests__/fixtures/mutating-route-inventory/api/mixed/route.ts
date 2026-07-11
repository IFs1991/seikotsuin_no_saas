export async function GET() {
  return { ok: true };
}

export async function POST() {
  return client.from('records').update({ reviewed: true });
}

declare const client: {
  from(table: string): {
    update(value: unknown): Promise<unknown>;
  };
};
