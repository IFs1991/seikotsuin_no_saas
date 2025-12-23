import React from 'react';
import { X, Bell, Info, AlertTriangle } from 'lucide-react';
import { Notification } from '../types';

interface Props {
  notifications: Notification[];
  onClose: () => void;
}

export const NotificationsModal: React.FC<Props> = ({ notifications, onClose }) => {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh] animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50">
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
             <Bell className="w-5 h-5 text-gray-500" />
             お知らせ
          </h2>
          <button 
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto">
            <div className="divide-y divide-gray-100">
                {notifications.map(note => (
                    <div key={note.id} className={`p-5 hover:bg-gray-50 transition-colors ${!note.isRead ? 'bg-sky-50/50' : ''}`}>
                        <div className="flex gap-3">
                            <div className="mt-1 flex-shrink-0">
                                {note.type === 'alert' ? (
                                    <AlertTriangle className="w-5 h-5 text-red-500" />
                                ) : note.type === 'system' ? (
                                    <Info className="w-5 h-5 text-gray-500" />
                                ) : (
                                    <Bell className="w-5 h-5 text-sky-500" />
                                )}
                            </div>
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs text-gray-500 font-mono">{note.date}</span>
                                    {!note.isRead && (
                                        <span className="text-[10px] bg-red-500 text-white px-1.5 rounded-sm font-bold">NEW</span>
                                    )}
                                </div>
                                <h3 className={`text-sm font-bold mb-1 ${note.type === 'alert' ? 'text-red-700' : 'text-gray-800'}`}>
                                    {note.title}
                                </h3>
                                <p className="text-sm text-gray-600 leading-relaxed">
                                    {note.content}
                                </p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
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