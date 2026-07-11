import { aliasedHandler } from './shared';

export async function POST() {
  return processApiRequest(new Request('https://example.test'));
}

export const PATCH = async () => {
  const parsed = ExampleSchema.safeParse({});
  return parsed;
};

export { aliasedHandler as DELETE };

export async function GET() {
  return { ok: true };
}

declare function processApiRequest(request: Request): Promise<unknown>;
declare const ExampleSchema: { safeParse(value: unknown): unknown };
