import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  PIXELS_PER_HOUR,
  SIDEBAR_WIDTH,
  GRID_START_HOUR,
  GRID_END_HOUR,
  SNAP_MINUTES,
  CLICK_SNAP_MINUTES,
} from '../constants';
import { AppointmentBlock } from './AppointmentBlock';
import {
  Appointment,
  AppointmentDensity,
  AppointmentUpdateResult,
  SchedulerResource,
  TimeSlot,
} from '../types';
import {
  calculateTimeFromX,
  calculateDuration,
  calculateEndTime,
  timeToMinutes,
  hasTimeConflict,
} from '../utils/time';
import {
  groupAppointmentsByResource,
  positionAppointmentsInTwoLanes,
} from '../utils/view';

interface Props {
  appointments: Appointment[];
  resources: SchedulerResource[];
  timeSlots: TimeSlot[];
  onAppointmentClick: (appointment: Appointment) => void;
  onTimeSlotClick: (resourceId: string, hour: number, minute: number) => void;
  onAppointmentMove: (
    id: string,
    newResourceId: string,
    newStartHour: number,
    newStartMinute: number
  ) => Promise<AppointmentUpdateResult>;
  onMoveError?: (message: string) => void;
  density: AppointmentDensity;
  readOnly?: boolean;
}

const SchedulerComponent: React.FC<Props> = ({
  appointments,
  resources,
  timeSlots,
  onAppointmentClick,
  onTimeSlotClick,
  onAppointmentMove,
  onMoveError,
  density,
  readOnly = false,
}) => {
  const [now, setNow] = useState(new Date());
  const bodyScrollRef = useRef<HTMLDivElement | null>(null);
  const headerScrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [maxScrollLeft, setMaxScrollLeft] = useState(0);
  const appointmentsByResource = useMemo(
    () => groupAppointmentsByResource(appointments),
    [appointments]
  );
  const positionedAppointmentsByResource = useMemo(() => {
    const positioned = new Map(
      Array.from(appointmentsByResource.entries()).map(
        ([resourceId, resourceAppointments]) => [
          resourceId,
          positionAppointmentsInTwoLanes(resourceAppointments),
        ]
      )
    );

    return positioned;
  }, [appointmentsByResource]);
  const rowHeightClass = density === 'compact' ? 'h-14' : 'h-20';
  const timelineWidth = timeSlots.length * PIXELS_PER_HOUR;
  const totalTimelineWidth = SIDEBAR_WIDTH + timelineWidth;
  const canScrollHorizontally = maxScrollLeft > 0;

  const syncHeaderScroll = useCallback((nextScrollLeft: number) => {
    if (headerScrollRef.current) {
      headerScrollRef.current.scrollLeft = nextScrollLeft;
    }
  }, []);

  const updateScrollMetrics = useCallback(() => {
    const body = bodyScrollRef.current;
    if (!body) {
      setMaxScrollLeft(0);
      setScrollLeft(0);
      syncHeaderScroll(0);
      return;
    }

    const nextMaxScrollLeft = Math.max(0, body.scrollWidth - body.clientWidth);
    const nextScrollLeft = Math.min(body.scrollLeft, nextMaxScrollLeft);

    if (body.scrollLeft !== nextScrollLeft) {
      body.scrollLeft = nextScrollLeft;
    }

    setMaxScrollLeft(nextMaxScrollLeft);
    setScrollLeft(nextScrollLeft);
    syncHeaderScroll(nextScrollLeft);
  }, [syncHeaderScroll]);

  const scrollTimelineTo = useCallback(
    (nextScrollLeft: number) => {
      const clampedScrollLeft = Math.min(
        Math.max(nextScrollLeft, 0),
        maxScrollLeft
      );

      if (bodyScrollRef.current) {
        bodyScrollRef.current.scrollLeft = clampedScrollLeft;
      }

      setScrollLeft(clampedScrollLeft);
      syncHeaderScroll(clampedScrollLeft);
    },
    [maxScrollLeft, syncHeaderScroll]
  );

  const getScrollStep = useCallback(() => {
    const bodyWidth = bodyScrollRef.current?.clientWidth ?? 0;
    return Math.max(PIXELS_PER_HOUR, Math.floor(bodyWidth / 2));
  }, []);

  const handleScrollBackward = useCallback(() => {
    scrollTimelineTo(scrollLeft - getScrollStep());
  }, [getScrollStep, scrollLeft, scrollTimelineTo]);

  const handleScrollForward = useCallback(() => {
    scrollTimelineTo(scrollLeft + getScrollStep());
  }, [getScrollStep, scrollLeft, scrollTimelineTo]);

  const handleScrollSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      scrollTimelineTo(Number(e.target.value));
    },
    [scrollTimelineTo]
  );

  const handleTimelineScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const nextScrollLeft = e.currentTarget.scrollLeft;
      setScrollLeft(nextScrollLeft);
      setMaxScrollLeft(
        Math.max(0, e.currentTarget.scrollWidth - e.currentTarget.clientWidth)
      );
      syncHeaderScroll(nextScrollLeft);
    },
    [syncHeaderScroll]
  );

  // Update current time every minute to keep the red line accurate
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    updateScrollMetrics();

    const body = bodyScrollRef.current;
    if (!body) return;

    window.addEventListener('resize', updateScrollMetrics);

    if (typeof ResizeObserver === 'undefined') {
      return () => window.removeEventListener('resize', updateScrollMetrics);
    }

    const observer = new ResizeObserver(() => updateScrollMetrics());
    observer.observe(body);
    if (body.firstElementChild) {
      observer.observe(body.firstElementChild);
    }

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateScrollMetrics);
    };
  }, [
    density,
    resources.length,
    timeSlots.length,
    totalTimelineWidth,
    updateScrollMetrics,
  ]);

  // Calculate position of the current time line
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const endHour =
    timeSlots.length > 0
      ? timeSlots[timeSlots.length - 1].hour + 1
      : GRID_START_HOUR + 1;

  let currentTimePos = -1;
  // Note: In a real app, check if displayed date matches today.
  // Here we assume it's relevant if time is within grid range.
  if (currentHour >= GRID_START_HOUR && currentHour < endHour) {
    const hoursFromStart = currentHour - GRID_START_HOUR;
    currentTimePos =
      hoursFromStart * PIXELS_PER_HOUR + (currentMinute / 60) * PIXELS_PER_HOUR;
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (readOnly) return;

    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (
    e: React.DragEvent<HTMLDivElement>,
    targetResourceId: string
  ) => {
    if (readOnly) return;

    e.preventDefault();
    const data = e.dataTransfer.getData('application/json');

    if (!data) return;

    try {
      const { id } = JSON.parse(data);

      // Find the appointment being moved
      const appointmentToMove = appointments.find(a => a.id === id);
      if (!appointmentToMove) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;

      // Use utility with SNAP_MINUTES (15 min for drag)
      const { hour: newStartHour, minute: newStartMinute } = calculateTimeFromX(
        x,
        SNAP_MINUTES
      );

      // Calculate new end time to check for conflicts
      const duration = calculateDuration(
        appointmentToMove.startHour,
        appointmentToMove.startMinute,
        appointmentToMove.endHour,
        appointmentToMove.endMinute
      );
      const { endHour, endMinute } = calculateEndTime(
        newStartHour,
        newStartMinute,
        duration
      );

      const newStartMins = timeToMinutes(newStartHour, newStartMinute);
      const newEndMins = timeToMinutes(endHour, endMinute);

      // Check for conflicts
      const hasConflict = appointments.some(a => {
        // Ignore the appointment itself
        if (a.id === id) return false;
        // Only check appointments on the target resource
        if (a.resourceId !== targetResourceId) return false;

        const aStartMins = timeToMinutes(a.startHour, a.startMinute);
        const aEndMins = timeToMinutes(a.endHour, a.endMinute);

        return hasTimeConflict(newStartMins, newEndMins, aStartMins, aEndMins);
      });

      if (hasConflict) {
        onMoveError?.('予約が重複しているため移動できません。');
        return;
      }

      await onAppointmentMove(
        id,
        targetResourceId,
        newStartHour,
        newStartMinute
      );
    } catch {
      onMoveError?.('予約移動データを読み取れませんでした。');
    }
  };

  const handleSlotClick = (
    e: React.MouseEvent<HTMLDivElement>,
    resourceId: string
  ) => {
    if (readOnly) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;

    // Use utility with CLICK_SNAP_MINUTES (5 min for click)
    const { hour, minute } = calculateTimeFromX(x, CLICK_SNAP_MINUTES);

    onTimeSlotClick(resourceId, hour, minute);
  };

  const handleSlotKeyDown = (
    e: React.KeyboardEvent<HTMLDivElement>,
    resourceId: string
  ) => {
    if (readOnly || (e.key !== 'Enter' && e.key !== ' ')) {
      return;
    }

    e.preventDefault();
    onTimeSlotClick(resourceId, GRID_START_HOUR, 0);
  };

  return (
    <div className='bg-white m-4 shadow border border-gray-300 rounded overflow-hidden flex flex-col h-full'>
      {/* Header Row */}
      <div className='flex border-b border-gray-300 bg-slate-700 text-white z-20 sticky top-0'>
        <div
          className='flex-shrink-0 border-r border-slate-500 bg-slate-700'
          style={{ width: `${SIDEBAR_WIDTH}px` }}
        ></div>

        <div
          ref={headerScrollRef}
          className='flex-grow overflow-hidden relative'
        >
          <div className='flex' style={{ width: `${timelineWidth}px` }}>
            {timeSlots.map(slot => (
              <div
                key={slot.hour}
                className='flex-shrink-0 flex items-center justify-center border-r border-slate-600 text-sm font-bold'
                style={{ width: `${PIXELS_PER_HOUR}px`, height: '36px' }}
              >
                {slot.label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Grid Body */}
      <div
        ref={bodyScrollRef}
        className='flex-grow overflow-y-auto overflow-x-auto timeline-scroll scrollbar-thin bg-gray-50 relative'
        onScroll={handleTimelineScroll}
      >
        <div
          style={{
            width: `${totalTimelineWidth}px`,
          }}
        >
          {resources.map(resource => {
            if (resource.id === 'separator') {
              return (
                <div
                  key='sep'
                  className='h-1 bg-sky-200 border-y border-sky-300 w-full sticky left-0 z-30'
                  style={{
                    width: `${totalTimelineWidth}px`,
                  }}
                ></div>
              );
            }

            const positionedAppointments =
              positionedAppointmentsByResource.get(resource.id) ?? [];
            const isFacility = resource.type === 'facility';

            return (
              <div
                key={resource.id}
                className={`flex relative ${rowHeightClass} border-b border-gray-300 hover:bg-gray-50 transition-colors group`}
              >
                {/* Resource Header */}
                <div
                  className='sticky left-0 flex-shrink-0 z-30 border-r border-gray-400 p-2 flex flex-col justify-center text-sm bg-slate-600 text-white shadow-[2px_0_5px_rgba(0,0,0,0.1)]'
                  style={{ width: `${SIDEBAR_WIDTH}px` }}
                >
                  <div className='font-bold flex items-center gap-1'>
                    {resource.name}
                    {resource.capacity && (
                      <span className='text-xs font-normal'>
                        ({resource.capacity})
                      </span>
                    )}
                  </div>
                  {resource.subLabel && (
                    <div className='text-[10px] text-gray-300 mt-1'>
                      {resource.subLabel}
                    </div>
                  )}
                  {!isFacility && resource.name !== '指名なし' && (
                    <div className='text-[9px] text-gray-400 mt-0.5'>
                      {String(GRID_START_HOUR).padStart(2, '0')}:00-
                      {String(GRID_END_HOUR).padStart(2, '0')}:00
                    </div>
                  )}
                </div>

                {/* Timeline Area */}
                <div
                  role='button'
                  tabIndex={readOnly ? -1 : 0}
                  className={`relative flex bg-white transition-colors ${
                    readOnly ? 'cursor-default' : 'cursor-pointer'
                  }`}
                  onDragOver={handleDragOver}
                  onDrop={e => handleDrop(e, resource.id)}
                  onClick={e => handleSlotClick(e, resource.id)}
                  onKeyDown={e => handleSlotKeyDown(e, resource.id)}
                  style={{ width: `${timelineWidth}px` }}
                >
                  {/* Grid Lines */}
                  {timeSlots.map(slot => (
                    <div
                      key={slot.hour}
                      className='flex-shrink-0 border-r border-gray-200 h-full relative pointer-events-none'
                      style={{ width: `${PIXELS_PER_HOUR}px` }}
                    >
                      {Array.from({ length: 11 }, (_, index) => {
                        const lineNumber = index + 1;

                        return (
                          <div
                            key={lineNumber}
                            className={`absolute top-0 bottom-0 w-0 ${
                              lineNumber === 6
                                ? 'border-l border-gray-200'
                                : 'border-l border-gray-100'
                            }`}
                            style={{
                              left: `${(lineNumber / 12) * 100}%`,
                            }}
                          ></div>
                        );
                      })}
                    </div>
                  ))}

                  {/* Appointments Layer */}
                  <div className='absolute top-0 bottom-0 left-0 right-0'>
                    {positionedAppointments.map(positionedAppointment => (
                      <AppointmentBlock
                        key={positionedAppointment.appointment.id}
                        appointment={positionedAppointment.appointment}
                        pixelsPerHour={PIXELS_PER_HOUR}
                        startHourOfGrid={GRID_START_HOUR}
                        onClick={onAppointmentClick}
                        density={density}
                        draggable={!readOnly}
                        laneIndex={positionedAppointment.laneIndex}
                        laneCount={positionedAppointment.laneCount}
                      />
                    ))}
                  </div>

                  {/* Current Time Line */}
                  {currentTimePos > 0 && (
                    <div
                      className='absolute top-0 bottom-0 z-20 pointer-events-none border-l-2 border-red-500 opacity-60'
                      style={{ left: `${currentTimePos}px` }}
                    >
                      <div className='absolute -top-1 -left-[5px] w-2 h-2 bg-red-500 rounded-full shadow-sm'></div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className='flex items-center gap-2 border-t border-gray-200 bg-white px-3 py-2'>
        <button
          type='button'
          aria-label='早い時間帯へ移動'
          title='早い時間帯へ移動'
          onClick={handleScrollBackward}
          disabled={!canScrollHorizontally || scrollLeft <= 0}
          className='flex h-8 w-8 flex-shrink-0 items-center justify-center rounded border border-gray-300 bg-white text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40'
        >
          <ChevronLeft className='h-4 w-4' />
        </button>
        <input
          type='range'
          min={0}
          max={maxScrollLeft}
          step={1}
          value={Math.min(scrollLeft, maxScrollLeft)}
          onChange={handleScrollSliderChange}
          disabled={!canScrollHorizontally}
          aria-label='タイムラインの横スクロール'
          className='h-2 min-w-0 flex-1 cursor-pointer accent-sky-600 disabled:cursor-not-allowed disabled:opacity-40'
        />
        <button
          type='button'
          aria-label='遅い時間帯へ移動'
          title='遅い時間帯へ移動'
          onClick={handleScrollForward}
          disabled={!canScrollHorizontally || scrollLeft >= maxScrollLeft}
          className='flex h-8 w-8 flex-shrink-0 items-center justify-center rounded border border-gray-300 bg-white text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40'
        >
          <ChevronRight className='h-4 w-4' />
        </button>
      </div>
    </div>
  );
};

export const Scheduler = React.memo(SchedulerComponent);
