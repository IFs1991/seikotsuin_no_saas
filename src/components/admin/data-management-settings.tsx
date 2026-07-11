import { AlertTriangle, Database } from 'lucide-react';

import { Card } from '@/components/ui/card';

export function DataManagementSettings() {
  return (
    <Card className='space-y-4 border-amber-200 bg-amber-50 p-6'>
      <div className='flex items-start gap-3'>
        <AlertTriangle
          className='mt-0.5 h-5 w-5 shrink-0 text-amber-700'
          aria-hidden='true'
        />
        <div className='space-y-2'>
          <h3 className='text-lg font-semibold text-amber-950'>
            データ管理機能は現在提供していません
          </h3>
          <p className='text-sm leading-6 text-amber-900'>
            パイロット版では、CSVインポート、マスターデータ編集、アーカイブ、
            自動クリーンアップを実行できません。実処理のない操作ボタンや件数は表示しません。
          </p>
        </div>
      </div>

      <div className='flex items-start gap-3 rounded-md border border-amber-200 bg-white/70 p-4'>
        <Database
          className='mt-0.5 h-5 w-5 shrink-0 text-amber-700'
          aria-hidden='true'
        />
        <p className='text-sm leading-6 text-amber-950'>
          データの取り出しや修正が必要な場合は、対象院・対象期間・利用目的を記録し、
          運用責任者が承認した手順で対応してください。
        </p>
      </div>
    </Card>
  );
}
