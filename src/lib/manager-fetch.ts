// manager 向け一覧 API 共通の全件取得ヘルパー。
// PostgREST の max_rows (supabase/config.toml: 1000) により1リクエストでは
// 1000行までしか返らないため、`.order('id').range(from, to)` でページングし
// 全行揃うまで取得する。

export const MANAGER_FETCH_PAGE_SIZE = 1000;

export type ManagerFetchPageResult<T> = {
  data: T[] | null;
  error: unknown;
};

export async function fetchAllRows<T>(
  fetchPage: (
    from: number,
    to: number
  ) => PromiseLike<ManagerFetchPageResult<T>>
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += MANAGER_FETCH_PAGE_SIZE) {
    const { data, error } = await fetchPage(
      from,
      from + MANAGER_FETCH_PAGE_SIZE - 1
    );
    if (error) {
      throw error;
    }

    const page = data ?? [];
    rows.push(...page);
    if (page.length < MANAGER_FETCH_PAGE_SIZE) {
      return rows;
    }
  }
}
