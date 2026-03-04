import Link from 'next/link';

/**
 * /master-data - 廃止済みページ
 *
 * このページは廃止されました。代替: /admin/settings
 */
export default function MasterDataPage() {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center p-8">
      <div className="max-w-md rounded-lg border border-yellow-300 bg-yellow-50 p-6 text-center">
        <h1 className="mb-4 text-xl font-bold text-yellow-800">
          このページは廃止されました
        </h1>
        <p className="mb-6 text-yellow-700">
          マスターデータ管理機能は「設定管理」に統合されました。
        </p>
        <Link
          href="/admin/settings"
          className="inline-block rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          設定管理ページへ移動
        </Link>
      </div>
    </div>
  );
}
