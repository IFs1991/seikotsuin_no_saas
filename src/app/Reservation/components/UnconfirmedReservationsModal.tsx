import React, { useState } from 'react';
import { X, Check, Calendar, User, Scissors } from 'lucide-react';
import { Appointment } from '../types';
import { RESOURCES, MENUS } from '../constants';

interface Props {
  appointments: Appointment[];
  onClose: () => void;
  onConfirm: (appointment: Appointment) => void;
}

export const UnconfirmedReservationsModal: React.FC<Props> = ({ appointments: initialAppointments, onClose, onConfirm }) => {
  // Local state to simulate list reducing as user confirms
  const [list, setList] = useState(initialAppointments);

  const handleConfirm = (appt: Appointment) => {
    onConfirm(appt); // Inform parent to actually add it
    setList(prev => prev.filter(a => a.id !== appt.id)); // Remove from UI
  };

  const getResourceName = (id: string) => RESOURCES.find(r => r.id === id)?.name || '未定';
  const getMenuName = (id?: string) => MENUS.find(m => m.id === id)?.name || '未選択';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[80vh] animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-rose-50">
          <h2 className="text-lg font-bold text-rose-800 flex items-center gap-2">
             <Calendar className="w-5 h-5" />
             未確認のWEB予約 ({list.length}件)
          </h2>
          <button 
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-0 overflow-y-auto bg-gray-50">
          {list.length === 0 ? (
            <div className="p-10 text-center text-gray-500">
              未確認の予約はありません。全て処理されました。
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
                {list.map(appt => (
                  <div key={appt.id} className="bg-white p-4 sm:p-5 hover:bg-gray-50 transition-colors">
                    <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                        <div className="space-y-2 w-full">
                             <div className="flex items-center gap-2">
                                <span className="bg-rose-100 text-rose-600 text-xs px-2 py-0.5 rounded font-bold">WEB予約</span>
                                <span className="text-sm text-gray-500">{appt.date}</span>
                             </div>
                             <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                {appt.lastName} {appt.firstName} 様
                             </h3>
                             <div className="text-sm text-gray-600 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 mt-2">
                                 <div className="flex items-center gap-2">
                                     <Calendar className="w-4 h-4 text-gray-400" />
                                     <span className="font-mono font-bold">
                                         {String(appt.startHour).padStart(2, '0')}:{String(appt.startMinute).padStart(2, '0')} - {String(appt.endHour).padStart(2, '0')}:{String(appt.endMinute).padStart(2, '0')}
                                     </span>
                                 </div>
                                 <div className="flex items-center gap-2">
                                     <User className="w-4 h-4 text-gray-400" />
                                     <span>担当: {getResourceName(appt.resourceId)}</span>
                                 </div>
                                 <div className="flex items-center gap-2 sm:col-span-2">
                                     <Scissors className="w-4 h-4 text-gray-400" />
                                     <span>{getMenuName(appt.menuId)}</span>
                                 </div>
                             </div>
                             {appt.memo && (
                                 <div className="mt-2 text-xs bg-yellow-50 text-gray-600 p-2 rounded border border-yellow-100">
                                     {appt.memo}
                                 </div>
                             )}
                        </div>
                        <div className="flex sm:flex-col gap-2 w-full sm:w-auto mt-2 sm:mt-0 sm:ml-4">
                            <button 
                                onClick={() => handleConfirm(appt)}
                                className="flex-1 sm:flex-none px-4 py-2 bg-sky-600 text-white text-sm font-bold rounded shadow-sm hover:bg-sky-700 flex items-center justify-center gap-1 min-w-[100px]"
                            >
                                <Check className="w-4 h-4" />
                                確定する
                            </button>
                            <button className="flex-1 sm:flex-none px-4 py-2 bg-white border border-gray-300 text-gray-600 text-sm font-bold rounded shadow-sm hover:bg-gray-100 min-w-[100px]">
                                保留・詳細
                            </button>
                        </div>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-end">
          <button 
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 border border-transparent rounded-md text-sm font-bold text-white shadow-sm hover:bg-gray-700"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};