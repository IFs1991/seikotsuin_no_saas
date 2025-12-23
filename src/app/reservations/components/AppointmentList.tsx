import React, { useState, useMemo } from 'react';
import { Appointment, SchedulerResource } from '../types';
import { COLORS } from '../constants';
import { ArrowRight, ChevronUp, ChevronDown, ArrowUpDown } from 'lucide-react';

interface Props {
  appointments: Appointment[];
  resources: SchedulerResource[];
  onSelect: (appointment: Appointment) => void;
}

type SortField = 'time' | 'resource' | 'customer' | 'status';
type SortDirection = 'asc' | 'desc';

export const AppointmentList: React.FC<Props> = ({ appointments, resources, onSelect }) => {
  const [sortField, setSortField] = useState<SortField>('time');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const getResourceName = (id: string) => {
    return resources.find(r => r.id === id)?.name || id;
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc'); // Reset to asc when changing field
    }
  };

  const sortedAppointments = useMemo(() => {
    return [...appointments].sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'time':
          // Compare start time (minutes from midnight)
          const timeA = a.startHour * 60 + a.startMinute;
          const timeB = b.startHour * 60 + b.startMinute;
          comparison = timeA - timeB;
          break;
        case 'resource':
          const resA = getResourceName(a.resourceId);
          const resB = getResourceName(b.resourceId);
          comparison = resA.localeCompare(resB, 'ja');
          break;
        case 'customer':
          const nameA = a.lastName || a.title;
          const nameB = b.lastName || b.title;
          comparison = nameA.localeCompare(nameB, 'ja');
          break;
        case 'status':
          // Sort by type (normal < holiday < blocked) for example
          comparison = a.type.localeCompare(b.type);
          break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [appointments, sortField, sortDirection]);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-4 h-4 text-gray-300 opacity-0 group-hover:opacity-50 transition-opacity" />;
    return sortDirection === 'asc' 
      ? <ChevronUp className="w-4 h-4 text-sky-600" /> 
      : <ChevronDown className="w-4 h-4 text-sky-600" />;
  };

  const renderHeader = (field: SortField, label: string, className: string = "") => (
    <th 
      scope="col" 
      onClick={() => handleSort(field)}
      className={`px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-gray-100 transition-colors group select-none ${className}`}
    >
      <div className="flex items-center gap-1">
        {label}
        <SortIcon field={field} />
      </div>
    </th>
  );

  return (
    <div className="p-4 sm:p-6 overflow-y-auto h-full">
      <div className="bg-white shadow rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {renderHeader('time', '時間')}
                {renderHeader('resource', '担当スタッフ')}
                {renderHeader('customer', '顧客名・内容')}
                {renderHeader('status', '状態')}
                <th scope="col" className="relative px-6 py-3">
                  <span className="sr-only">詳細</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedAppointments.map((appt) => (
                <tr 
                  key={appt.id} 
                  className="hover:bg-sky-50 cursor-pointer transition-colors group"
                  onClick={() => onSelect(appt)}
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-mono">
                    {String(appt.startHour).padStart(2, '0')}:{String(appt.startMinute).padStart(2, '0')} 
                    <span className="text-gray-400 mx-1">-</span>
                    {String(appt.endHour).padStart(2, '0')}:{String(appt.endMinute).padStart(2, '0')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 font-medium">
                    {getResourceName(appt.resourceId)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-800">
                    {appt.title}
                    {appt.subTitle && <span className="ml-2 font-normal text-xs text-gray-400">({appt.subTitle})</span>}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                     <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${COLORS[appt.color].replace('text-white', 'text-gray-800').replace('bg-', 'bg-opacity-20 bg-')}`}>
                       {appt.type === 'normal' ? '予約' : appt.type === 'holiday' ? '休み' : 'ブロック'}
                     </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <ArrowRight className="w-5 h-5 text-gray-300 group-hover:text-sky-500 transition-colors" />
                  </td>
                </tr>
              ))}
              {sortedAppointments.length === 0 && (
                <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-gray-500">
                        表示する予約データがありません。
                    </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};