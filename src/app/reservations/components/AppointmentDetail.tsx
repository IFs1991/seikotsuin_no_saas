import React, { useState, useEffect } from 'react';
import { Appointment, MenuItem, MenuOptionItem, SchedulerResource } from '../types';
import { calculateEndTime, calculateDuration } from '../utils/time';
import { X, Trash2, Edit, Check, Undo } from 'lucide-react';
import { AppointmentSummary } from './AppointmentSummary';
import { AppointmentEditForm } from './AppointmentEditForm';

interface Props {
  appointment: Appointment;
  resources: SchedulerResource[];
  menus: MenuItem[];
  options: MenuOptionItem[];
  onClose: () => void;
  onUpdate: (updatedAppointment: Appointment) => void;
}

export const AppointmentDetail: React.FC<Props> = ({ appointment, resources, menus, options, onClose, onUpdate }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Appointment>(appointment);

  useEffect(() => {
    setFormData(appointment);
  }, [appointment]);

  const handleInputChange = (field: keyof Appointment, value: any) => {
    setFormData(prev => {
        const updated = { ...prev, [field]: value };
        
        let newEndHour = updated.endHour;
        let newEndMinute = updated.endMinute;

        if (field === 'startHour' || field === 'startMinute') {
            // Keep duration constant
            const currentDuration = calculateDuration(prev.startHour, prev.startMinute, prev.endHour, prev.endMinute);
            const res = calculateEndTime(updated.startHour, updated.startMinute, currentDuration);
            newEndHour = res.endHour;
            newEndMinute = res.endMinute;

        } else if (field === 'menuId' || field === 'optionId') {
            // Reset duration based on master data
            const menuId = field === 'menuId' ? value : prev.menuId;
            const optionId = field === 'optionId' ? value : prev.optionId;
            
            const menu = menus.find(m => m.id === menuId);
            const option = options.find(o => o.id === optionId);
            const newDuration = (menu?.durationMinutes || 0) + (option?.durationDeltaMinutes || 0);
            
            const res = calculateEndTime(updated.startHour, updated.startMinute, newDuration);
            newEndHour = res.endHour;
            newEndMinute = res.endMinute;
        }
        
        return {
            ...updated,
            endHour: newEndHour,
            endMinute: newEndMinute
        };
    });
  };

  const handleDurationChange = (newDuration: number) => {
    setFormData(prev => {
        const { endHour, endMinute } = calculateEndTime(prev.startHour, prev.startMinute, newDuration);
        return { ...prev, endHour, endMinute };
    });
  };

  const handleSave = () => {
    const title = (formData.lastName && formData.firstName)
        ? `${formData.lastName} ${formData.firstName}`
        : formData.title;
    
    onUpdate({ ...formData, title });
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setFormData(appointment);
    setIsEditing(false);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />

      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <h2 className="text-lg font-bold text-gray-800">
            {isEditing ? '予約を編集' : '予約詳細'}
          </h2>
          <div className="flex items-center gap-2">
            {!isEditing && (
                <button className="p-2 text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-colors" title="削除">
                <Trash2 className="w-5 h-5" />
                </button>
            )}
            <button 
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="p-4 sm:p-6 overflow-y-auto">
            {isEditing ? (
                <AppointmentEditForm 
                    formData={formData} 
                    resources={resources} 
                    menus={menus} 
                    options={options} 
                    onChange={handleInputChange} 
                    onDurationChange={handleDurationChange} 
                />
            ) : (
                <AppointmentSummary 
                    appointment={appointment} 
                    resources={resources} 
                    menus={menus} 
                    options={options} 
                    onEdit={() => setIsEditing(true)} 
                />
            )}
        </div>
        
        {/* Footer Actions */}
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-between items-center">
             {isEditing ? (
                 <div className="flex justify-end gap-3 w-full">
                     <button 
                        onClick={handleCancelEdit}
                        className="px-4 py-2 bg-white border border-gray-300 rounded-md text-sm font-bold text-gray-600 shadow-sm hover:bg-gray-100 flex items-center gap-1"
                     >
                        <Undo className="w-4 h-4" /> <span className="hidden sm:inline">キャンセル</span>
                     </button>
                     <button 
                        onClick={handleSave}
                        className="px-4 py-2 bg-sky-600 border border-transparent rounded-md text-sm font-bold text-white shadow-sm hover:bg-sky-700 flex items-center gap-1"
                     >
                        <Check className="w-4 h-4" /> 保存する
                     </button>
                 </div>
             ) : (
                <>
                <button className="text-xs font-bold text-sky-600 hover:underline">
                    詳細ページ
                </button>
                <div className="flex gap-2">
                    <button 
                        onClick={() => setIsEditing(true)}
                        className="px-4 py-2 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 flex items-center gap-1"
                    >
                        <Edit className="w-4 h-4" /> 編集
                    </button>
                    <button 
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-600 border border-transparent rounded-md text-sm font-bold text-white shadow-sm hover:bg-gray-700"
                    >
                        閉じる
                    </button>
                </div>
                </>
             )}
        </div>
      </div>
    </div>
  );
};