export const MASTER_DATA_REPLACEMENT_ROUTE = '/admin/settings';

export const MASTER_DATA_DEPRECATION_MESSAGE =
  'master-data / system_settings は廃止されました。/admin/settings と /api/admin/settings を利用してください。';

export function createMasterDataDeprecationError() {
  return new Error(MASTER_DATA_DEPRECATION_MESSAGE);
}
