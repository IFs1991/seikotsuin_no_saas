import React, { useMemo, useState } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

const PerformanceMetrics: React.FC = () => {
  const [selectedStaff, setSelectedStaff] = useState('all');

  const staffMembers = useMemo(
    () => [
    { id: 1, name: '山田 太郎', role: '施術者', rating: 4.8 },
    { id: 2, name: '鈴木 花子', role: '施術者', rating: 4.5 },
    { id: 3, name: '佐藤 健一', role: '施術者', rating: 4.2 },
    ],
    []
  );

  const performanceData = {
    kpi: {
      patients: 85,
      satisfaction: 4.8,
      revenue: 950000,
      retention: 92,
    },
    skills: [
      { name: '施術技術', level: 90 },
      { name: '患者対応', level: 85 },
      { name: '診断能力', level: 80 },
      { name: 'チーム連携', level: 95 },
    ],
  };

  const visibleStaff = useMemo(
    () =>
      selectedStaff === 'all'
        ? staffMembers
        : staffMembers.filter(s => String(s.id) === selectedStaff),
    [selectedStaff, staffMembers]
  );

  return (
    <div className='bg-white dark:bg-gray-800 p-6 rounded-lg'>
      <Card className='bg-card mb-6'>
        <CardHeader className='bg-card'>
          <CardTitle className='text-xl font-bold text-[#1e3a8a]'>
            スタッフパフォーマンス分析
          </CardTitle>
          <CardDescription>個人別の実績とスキル評価</CardDescription>
        </CardHeader>
        <CardContent className='bg-card'>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
            <div className='space-y-4'>
              <div className='mb-2'>
                <span className='text-sm text-[#6b7280] mr-2'>絞り込み:</span>
                <select
                  value={selectedStaff}
                  onChange={e => setSelectedStaff(e.target.value)}
                  className='border rounded px-2 py-1'
                >
                  <option value='all'>全員</option>
                  {staffMembers.map(s => (
                    <option key={s.id} value={String(s.id)}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className='p-4 rounded-lg border border-[#e5e7eb]'>
                <h3 className='font-semibold mb-2'>主要KPI</h3>
                <div className='grid grid-cols-2 gap-4'>
                  <div className='text-center'>
                    <p className='text-sm text-[#6b7280]'>担当患者数</p>
                    <p className='text-2xl font-bold text-[#1e3a8a]'>
                      {performanceData.kpi.patients}
                    </p>
                  </div>
                  <div className='text-center'>
                    <p className='text-sm text-[#6b7280]'>患者満足度</p>
                    <p className='text-2xl font-bold text-[#10b981]'>
                      {performanceData.kpi.satisfaction}
                    </p>
                  </div>
                </div>
              </div>

              <div className='p-4 rounded-lg border border-[#e5e7eb]'>
                <h3 className='font-semibold mb-2'>スキルマトリックス</h3>
                <div className='space-y-2'>
                  {performanceData.skills.map(skill => (
                    <div key={skill.name} className='flex items-center'>
                      <span className='w-24 text-sm'>{skill.name}</span>
                      <div className='flex-1 h-2 bg-[#e5e7eb] rounded'>
                        <div
                          className='h-full bg-[#1e3a8a] rounded'
                          style={{ width: `${skill.level}%` }}
                        />
                      </div>
                      <span className='ml-2 text-sm'>{skill.level}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className='space-y-4'>
              <div className='p-4 rounded-lg border border-[#e5e7eb]'>
                <h3 className='font-semibold mb-2'>スタッフランキング</h3>
                <div className='space-y-2'>
                  {visibleStaff.map(staff => (
                    <div
                      key={staff.id}
                      className='flex items-center justify-between p-2 hover:bg-[#f9fafb] rounded'
                    >
                      <div className='flex items-center'>
                        <Avatar className='h-8 w-8'>
                          <AvatarFallback>{staff.name[0]}</AvatarFallback>
                        </Avatar>
                        <div className='ml-2'>
                          <p className='font-medium'>{staff.name}</p>
                          <p className='text-sm text-[#6b7280]'>{staff.role}</p>
                        </div>
                      </div>
                      <div className='flex items-center'>
                        <span className='text-[#1e3a8a] font-semibold'>
                          {staff.rating}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className='p-4 rounded-lg border border-[#e5e7eb]'>
                <h3 className='font-semibold mb-2'>最近のフィードバック</h3>
                <div className='space-y-2'>
                  <div className='p-2 bg-[#f9fafb] rounded'>
                    <p className='text-sm'>患者対応が丁寧で好評です。</p>
                    <p className='text-xs text-[#6b7280] mt-1'>2024/03/15</p>
                  </div>
                  <div className='p-2 bg-[#f9fafb] rounded'>
                    <p className='text-sm'>施術技術の向上が見られます。</p>
                    <p className='text-xs text-[#6b7280] mt-1'>2024/03/10</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PerformanceMetrics;
