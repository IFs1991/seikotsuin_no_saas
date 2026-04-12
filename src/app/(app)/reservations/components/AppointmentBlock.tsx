import React from 'react';
import { Appointment } from '../types';
import { COLORS } from '../constants';
import { MessageCircle } from 'lucide-react';

interface Props {
  appointment: Appointment;
  pixelsPerHour: number;
  startHourOfGrid: number;
  onClick: (appointment: Appointment) => void;
}

export const AppointmentBlock: React.FC<Props> = ({
  appointment,
  pixelsPerHour,
  startHourOfGrid,
  onClick,
}) => {
  const startOffsetMinutes =
    (appointment.startHour - startHourOfGrid) * 60 + appointment.startMinute;
  const durationMinutes =
    appointment.endHour * 60 +
    appointment.endMinute -
    (appointment.startHour * 60 + appointment.startMinute);

  // Calculate position and width
  const leftPos = (startOffsetMinutes / 60) * pixelsPerHour;
  const width = (durationMinutes / 60) * pixelsPerHour;

  const colorClass = COLORS[appointment.color];

  // Specific styling for full-row events like "Staff Holiday"
  const isFullRow = appointment.type === 'holiday';

  // Format time string
  const timeString = `${String(appointment.startHour).padStart(2, '0')}:${String(appointment.startMinute).padStart(2, '0')}-${String(appointment.endHour).padStart(2, '0')}:${String(appointment.endMinute).padStart(2, '0')}`;

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData(
      'application/json',
      JSON.stringify({
        id: appointment.id,
        originalResource: appointment.resourceId,
      })
    );
    e.dataTransfer.effectAllowed = 'move';
    // Optional: Set a custom drag image or style here
  };

  return (
    <div
      draggable={true}
      onDragStart={handleDragStart}
      onClick={e => {
        e.stopPropagation();
        onClick(appointment);
      }}
      className={`absolute top-1 bottom-1 rounded shadow-sm text-xs overflow-hidden leading-tight flex flex-col justify-center px-2 transition-all hover:brightness-95 hover:shadow-md cursor-pointer z-10 ${colorClass} ${isFullRow ? 'opacity-90' : ''}`}
      style={{
        left: `${leftPos}px`,
        width: `${width}px`,
        // If it's a holiday, span the whole height but visually it's just a block
        height: 'calc(100% - 4px)',
      }}
    >
      <div className='flex items-center gap-1 font-mono opacity-90 text-[10px] whitespace-nowrap pointer-events-none'>
        {appointment.icon && (
          <div className='bg-white/30 p-0.5 rounded-sm'>
            <MessageCircle size={8} />
          </div>
        )}
        {timeString}
      </div>
      <div className='font-bold truncate text-[11px] mt-0.5 pointer-events-none'>
        {appointment.title}
      </div>
      {appointment.subTitle && (
        <div className='mt-1 inline-flex pointer-events-none'>
          <span className='bg-rose-600/80 text-white px-1.5 py-0.5 rounded-full text-[9px] font-bold truncate'>
            {appointment.subTitle}
          </span>
        </div>
      )}
    </div>
  );
};
