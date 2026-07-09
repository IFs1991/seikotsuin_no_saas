import { DEFAULT_SETTINGS } from '@/lib/admin-settings/defaults';
import { RESERVATION_CONFLICT_STATUS_FILTER } from '@/lib/reservations/conflict';
import {
  addJSTCalendarDays,
  differenceInJSTCalendarDays,
  getJSTMinutesOfDay,
  getJSTWeekdayKey,
  isJSTDateString,
  jstDateTimeToDate,
  parseJSTDateStart,
  toJSTDateString,
} from '@/lib/jst';
import type { Database } from '@/types/supabase';

const MAX_AVAILABILITY_RANGE_DAYS = 14;
const DEFAULT_MENU_DURATION_MINUTES = 60;
const TIME_PATTERN = /^\d{2}:\d{2}$/;
const SETTINGS_CATEGORIES = ['clinic_hours', 'booking_calendar'] as const;

type PublicQueryResult = {
  data: unknown;
  error: unknown;
};

type PublicAvailabilityFilterBuilder = PromiseLike<PublicQueryResult> & {
  eq(column: string, value: unknown): PublicAvailabilityFilterBuilder;
  in(
    column: string,
    values: readonly unknown[]
  ): PublicAvailabilityFilterBuilder;
  lt(column: string, value: unknown): PublicAvailabilityFilterBuilder;
  gt(column: string, value: unknown): PublicAvailabilityFilterBuilder;
  not(
    column: string,
    operator: string,
    value: string
  ): PublicAvailabilityFilterBuilder;
  order(
    column: string,
    options?: { ascending?: boolean }
  ): PublicAvailabilityFilterBuilder;
  single(): PromiseLike<PublicQueryResult>;
};

type PublicAvailabilityTableBuilder = {
  select(columns: string): unknown;
};

export type PublicAvailabilityClient = {
  from(table: string): PublicAvailabilityTableBuilder;
};

type ClinicSettingRow = Pick<
  Database['public']['Tables']['clinic_settings']['Row'],
  'category' | 'settings'
>;
type MenuRow = Pick<
  Database['public']['Tables']['menus']['Row'],
  'id' | 'duration_minutes'
>;
type ResourceRow = Pick<
  Database['public']['Tables']['resources']['Row'],
  'id' | 'display_order' | 'created_at'
>;
type ReservationRangeRow = Pick<
  Database['public']['Tables']['reservations']['Row'],
  'staff_id' | 'start_time' | 'end_time'
>;
type BlockRangeRow = Pick<
  Database['public']['Tables']['blocks']['Row'],
  'resource_id' | 'start_time' | 'end_time'
>;

type TimeRange = {
  start: string;
  end: string;
};

type ClinicHoursSettings = {
  hoursByDay: Record<string, unknown>;
  holidays: string[];
  specialClosures: unknown[];
};

type BookingCalendarSettings = {
  slotMinutes: number;
  allowOnlineBooking: boolean;
  maxAdvanceBookingDays: number;
  minAdvanceBookingHours: number;
};

type LoadedSettings = {
  clinicHours: ClinicHoursSettings;
  bookingCalendar: BookingCalendarSettings;
};

type DayWorkingHours = {
  isClosed: boolean;
  ranges: TimeRange[];
};

export type PublicAvailabilityResourceId = string | 'any';

export type PublicAvailabilityParams = {
  menuId: string;
  resourceId: PublicAvailabilityResourceId;
  dateFrom: string;
  dateTo: string;
};

export type PublicAvailabilitySlot = {
  start: string;
  available: boolean;
  resource_ids: string[];
};

export type PublicAvailabilityDay = {
  date: string;
  is_closed: boolean;
  slots: PublicAvailabilitySlot[];
};

export type PublicAvailabilityResult = {
  slot_minutes: number;
  days: PublicAvailabilityDay[];
};

export class AvailabilityValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AvailabilityValidationError';
  }
}

export class AvailabilityMenuNotFoundError extends Error {
  constructor(message = 'Menu not found or not available') {
    super(message);
    this.name = 'AvailabilityMenuNotFoundError';
  }
}

export class AvailabilityResourceNotFoundError extends Error {
  constructor(message = 'Resource not found') {
    super(message);
    this.name = 'AvailabilityResourceNotFoundError';
  }
}

export class AvailabilityBookingDisabledError extends Error {
  constructor(message = 'Online booking is disabled for this clinic') {
    super(message);
    this.name = 'AvailabilityBookingDisabledError';
  }
}

export class PublicBookingTimeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublicBookingTimeValidationError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFilterBuilder(
  value: unknown
): value is PublicAvailabilityFilterBuilder {
  return (
    isRecord(value) &&
    typeof value.eq === 'function' &&
    typeof value.in === 'function' &&
    typeof value.lt === 'function' &&
    typeof value.gt === 'function' &&
    typeof value.not === 'function' &&
    typeof value.order === 'function' &&
    typeof value.single === 'function' &&
    typeof value.then === 'function'
  );
}

function toFilterBuilder(value: unknown): PublicAvailabilityFilterBuilder {
  if (!isFilterBuilder(value)) {
    throw new Error('Unexpected public availability query builder');
  }

  return value;
}

function readNumber(
  source: Record<string, unknown>,
  key: string,
  fallback: number
): number {
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readPositiveNumber(
  source: Record<string, unknown>,
  key: string,
  fallback: number
): number {
  const value = readNumber(source, key, fallback);
  return value > 0 ? value : fallback;
}

function readNonNegativeNumber(
  source: Record<string, unknown>,
  key: string,
  fallback: number
): number {
  const value = readNumber(source, key, fallback);
  return value >= 0 ? value : fallback;
}

function readBoolean(
  source: Record<string, unknown>,
  key: string,
  fallback: boolean
): boolean {
  const value = source[key];
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeTimeRange(value: unknown): TimeRange | null {
  if (!isRecord(value)) {
    return null;
  }

  const start = value.start;
  const end = value.end;
  if (
    typeof start !== 'string' ||
    typeof end !== 'string' ||
    !TIME_PATTERN.test(start) ||
    !TIME_PATTERN.test(end)
  ) {
    return null;
  }

  return { start, end };
}

function normalizeTimeRanges(value: unknown): TimeRange[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(normalizeTimeRange)
    .filter((range): range is TimeRange => range !== null)
    .filter(range => toMinuteOfDay(range.start) < toMinuteOfDay(range.end));
}

function toMinuteOfDay(time: string): number {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

function toTimeString(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function rangesContainSlot(
  ranges: TimeRange[],
  startMinutes: number,
  endMinutes: number
): boolean {
  return ranges.some(range => {
    const rangeStart = toMinuteOfDay(range.start);
    const rangeEnd = toMinuteOfDay(range.end);
    return startMinutes >= rangeStart && endMinutes <= rangeEnd;
  });
}

function overlaps(startA: Date, endA: Date, startB: Date, endB: Date): boolean {
  return startA.getTime() < endB.getTime() && endA.getTime() > startB.getTime();
}

function normalizeClinicHours(settings: unknown): ClinicHoursSettings {
  const fallback = DEFAULT_SETTINGS.clinic_hours;
  const source = isRecord(settings) ? settings : fallback;
  const fallbackRecord = fallback as Record<string, unknown>;

  const hoursByDay = isRecord(source.hoursByDay)
    ? source.hoursByDay
    : (fallbackRecord.hoursByDay as Record<string, unknown>);

  const holidays = Array.isArray(source.holidays)
    ? source.holidays.filter(
        (value): value is string => typeof value === 'string'
      )
    : [];

  const specialClosures = Array.isArray(source.specialClosures)
    ? source.specialClosures
    : [];

  return { hoursByDay, holidays, specialClosures };
}

function normalizeBookingCalendar(settings: unknown): BookingCalendarSettings {
  const fallback = DEFAULT_SETTINGS.booking_calendar;
  const source = isRecord(settings) ? settings : fallback;
  const fallbackRecord = fallback as Record<string, unknown>;

  return {
    slotMinutes: readPositiveNumber(
      source,
      'slotMinutes',
      readPositiveNumber(fallbackRecord, 'slotMinutes', 30)
    ),
    allowOnlineBooking: readBoolean(
      source,
      'allowOnlineBooking',
      readBoolean(fallbackRecord, 'allowOnlineBooking', false)
    ),
    maxAdvanceBookingDays: readPositiveNumber(
      source,
      'maxAdvanceBookingDays',
      readPositiveNumber(fallbackRecord, 'maxAdvanceBookingDays', 30)
    ),
    minAdvanceBookingHours: readNonNegativeNumber(
      source,
      'minAdvanceBookingHours',
      readNonNegativeNumber(fallbackRecord, 'minAdvanceBookingHours', 2)
    ),
  };
}

function findSpecialClosure(
  settings: ClinicHoursSettings,
  dateString: string
): unknown | null {
  return (
    settings.specialClosures.find(
      item => isRecord(item) && item.date === dateString
    ) ?? null
  );
}

function getDayWorkingHours(
  settings: ClinicHoursSettings,
  dateString: string
): DayWorkingHours {
  if (settings.holidays.includes(dateString)) {
    return { isClosed: true, ranges: [] };
  }

  const specialClosure = findSpecialClosure(settings, dateString);
  if (isRecord(specialClosure)) {
    if (specialClosure.type === 'specialHours') {
      const specialRanges = normalizeTimeRanges(specialClosure.timeSlots);
      return {
        isClosed: specialRanges.length === 0,
        ranges: specialRanges,
      };
    }

    return { isClosed: true, ranges: [] };
  }

  const weekday = getJSTWeekdayKey(dateString);
  const rawDay = settings.hoursByDay[weekday];
  if (!isRecord(rawDay) || rawDay.isOpen !== true) {
    return { isClosed: true, ranges: [] };
  }

  const ranges = normalizeTimeRanges(rawDay.timeSlots ?? rawDay.timeRanges);
  return {
    isClosed: ranges.length === 0,
    ranges,
  };
}

function assertDateRange(dateFrom: string, dateTo: string): void {
  if (!isJSTDateString(dateFrom) || !isJSTDateString(dateTo)) {
    throw new AvailabilityValidationError(
      'date_from and date_to must be YYYY-MM-DD'
    );
  }

  const days = differenceInJSTCalendarDays(dateFrom, dateTo);
  if (days < 0) {
    throw new AvailabilityValidationError(
      'date_to must be greater than or equal to date_from'
    );
  }

  if (days >= MAX_AVAILABILITY_RANGE_DAYS) {
    throw new AvailabilityValidationError('date range must be 14 days or less');
  }
}

function isWithinAdvanceWindow(
  start: Date,
  settings: BookingCalendarSettings,
  now: Date
): boolean {
  const earliest = new Date(
    now.getTime() + settings.minAdvanceBookingHours * 60 * 60 * 1000
  );
  const latestDate = addJSTCalendarDays(
    toJSTDateString(now),
    settings.maxAdvanceBookingDays + 1
  );
  const latestExclusive = parseJSTDateStart(latestDate);

  return start.getTime() >= earliest.getTime() && start < latestExclusive;
}

function isSlotBoundary(start: Date, slotMinutes: number): boolean {
  const minutes = getJSTMinutesOfDay(start);
  return minutes % slotMinutes === 0;
}

function buildSlotsForDay(
  dateString: string,
  workingHours: DayWorkingHours,
  durationMinutes: number,
  slotMinutes: number,
  resourceIds: string[],
  reservations: ReservationRangeRow[],
  blocks: BlockRangeRow[],
  settings: BookingCalendarSettings,
  now: Date
): PublicAvailabilitySlot[] {
  if (workingHours.isClosed) {
    return [];
  }

  const candidateStarts = new Set<number>();
  for (const range of workingHours.ranges) {
    const rangeStart = toMinuteOfDay(range.start);
    const rangeEnd = toMinuteOfDay(range.end);
    for (let current = rangeStart; current < rangeEnd; current += slotMinutes) {
      candidateStarts.add(current);
    }
  }

  return Array.from(candidateStarts)
    .sort((a, b) => a - b)
    .map(startMinutes => {
      const endMinutes = startMinutes + durationMinutes;
      const startDate = jstDateTimeToDate(
        dateString,
        toTimeString(startMinutes)
      );
      const endDate = new Date(startDate.getTime() + durationMinutes * 60_000);
      const availableResourceIds = rangesContainSlot(
        workingHours.ranges,
        startMinutes,
        endMinutes
      )
        ? findAvailableResourceIds(
            resourceIds,
            startDate,
            endDate,
            reservations,
            blocks,
            settings,
            now
          )
        : [];

      return {
        start: toTimeString(startMinutes),
        available: availableResourceIds.length > 0,
        resource_ids: availableResourceIds,
      };
    });
}

function findAvailableResourceIds(
  resourceIds: string[],
  start: Date,
  end: Date,
  reservations: ReservationRangeRow[],
  blocks: BlockRangeRow[],
  settings: BookingCalendarSettings,
  now: Date
): string[] {
  if (
    start.getTime() <= now.getTime() ||
    !isWithinAdvanceWindow(start, settings, now) ||
    !isSlotBoundary(start, settings.slotMinutes)
  ) {
    return [];
  }

  return resourceIds.filter(resourceId => {
    const hasReservation = reservations.some(
      reservation =>
        reservation.staff_id === resourceId &&
        overlaps(
          start,
          end,
          new Date(reservation.start_time),
          new Date(reservation.end_time)
        )
    );
    if (hasReservation) {
      return false;
    }

    return !blocks.some(
      block =>
        block.resource_id === resourceId &&
        overlaps(
          start,
          end,
          new Date(block.start_time),
          new Date(block.end_time)
        )
    );
  });
}

export class PublicAvailabilityService {
  constructor(
    private readonly client: PublicAvailabilityClient,
    private readonly clinicId: string,
    private readonly now: () => Date = () => new Date()
  ) {}

  async getAvailability(
    params: PublicAvailabilityParams
  ): Promise<PublicAvailabilityResult> {
    assertDateRange(params.dateFrom, params.dateTo);

    const [settings, menu, resources] = await Promise.all([
      this.loadSettings(),
      this.loadMenu(params.menuId),
      this.loadResources(params.resourceId),
    ]);

    if (!settings.bookingCalendar.allowOnlineBooking) {
      throw new AvailabilityBookingDisabledError();
    }

    const resourceIds = resources.map(resource => resource.id);
    const durationMinutes =
      menu.duration_minutes ?? DEFAULT_MENU_DURATION_MINUTES;
    const rangeStart = parseJSTDateStart(params.dateFrom);
    const rangeEnd = parseJSTDateStart(addJSTCalendarDays(params.dateTo, 1));
    const [reservations, blocks] =
      resourceIds.length > 0
        ? await Promise.all([
            this.loadReservations(resourceIds, rangeStart, rangeEnd),
            this.loadBlocks(resourceIds, rangeStart, rangeEnd),
          ])
        : [[], []];

    const days: PublicAvailabilityDay[] = [];
    const dayCount =
      differenceInJSTCalendarDays(params.dateFrom, params.dateTo) + 1;
    const now = this.now();
    for (let offset = 0; offset < dayCount; offset += 1) {
      const date = addJSTCalendarDays(params.dateFrom, offset);
      const workingHours = getDayWorkingHours(settings.clinicHours, date);
      days.push({
        date,
        is_closed: workingHours.isClosed,
        slots: buildSlotsForDay(
          date,
          workingHours,
          durationMinutes,
          settings.bookingCalendar.slotMinutes,
          resourceIds,
          reservations,
          blocks,
          settings.bookingCalendar,
          now
        ),
      });
    }

    return {
      slot_minutes: settings.bookingCalendar.slotMinutes,
      days,
    };
  }

  async validateReservationTime(
    startIso: string,
    endIso: string
  ): Promise<void> {
    const settings = await this.loadSettings();
    const start = new Date(startIso);
    const end = new Date(endIso);
    const now = this.now();

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new PublicBookingTimeValidationError('Invalid reservation time');
    }

    if (start.getTime() <= now.getTime()) {
      throw new PublicBookingTimeValidationError(
        'Requested time must be in the future'
      );
    }

    if (!isWithinAdvanceWindow(start, settings.bookingCalendar, now)) {
      throw new PublicBookingTimeValidationError(
        'Requested time is outside the booking window'
      );
    }

    if (!isSlotBoundary(start, settings.bookingCalendar.slotMinutes)) {
      throw new PublicBookingTimeValidationError(
        'Requested time is outside the configured slot boundary'
      );
    }

    const date = toJSTDateString(start);
    const startMinutes = getJSTMinutesOfDay(start);
    const endMinutes = getJSTMinutesOfDay(end);
    const workingHours = getDayWorkingHours(settings.clinicHours, date);

    if (
      workingHours.isClosed ||
      endMinutes <= startMinutes ||
      !rangesContainSlot(workingHours.ranges, startMinutes, endMinutes)
    ) {
      throw new PublicBookingTimeValidationError(
        'Requested time is outside clinic hours'
      );
    }
  }

  private async loadSettings(): Promise<LoadedSettings> {
    const { data, error } = await toFilterBuilder(
      this.client.from('clinic_settings').select('category, settings')
    )
      .eq('clinic_id', this.clinicId)
      .in('category', Array.from(SETTINGS_CATEGORIES));

    if (error) {
      throw new Error('Failed to load public booking settings');
    }

    const rows = (data ?? []) as ClinicSettingRow[];
    const clinicHours = rows.find(row => row.category === 'clinic_hours');
    const bookingCalendar = rows.find(
      row => row.category === 'booking_calendar'
    );

    return {
      clinicHours: normalizeClinicHours(clinicHours?.settings),
      bookingCalendar: normalizeBookingCalendar(bookingCalendar?.settings),
    };
  }

  private async loadMenu(menuId: string): Promise<MenuRow> {
    const { data, error } = await toFilterBuilder(
      this.client.from('menus').select('id, duration_minutes')
    )
      .eq('id', menuId)
      .eq('clinic_id', this.clinicId)
      .eq('is_active', true)
      .eq('is_public', true)
      .eq('is_deleted', false)
      .single();

    if (error || !data) {
      throw new AvailabilityMenuNotFoundError();
    }

    return data as MenuRow;
  }

  private async loadResources(
    resourceId: PublicAvailabilityResourceId
  ): Promise<ResourceRow[]> {
    let query = toFilterBuilder(
      this.client.from('resources').select('id, display_order, created_at')
    )
      .eq('clinic_id', this.clinicId)
      .eq('type', 'staff')
      .eq('is_active', true)
      .eq('is_bookable', true)
      .eq('is_deleted', false);

    if (resourceId !== 'any') {
      query = query.eq('id', resourceId);
    }

    const { data, error } = await query
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error('Failed to load public booking resources');
    }

    const resources = (data ?? []) as ResourceRow[];
    if (resourceId !== 'any' && resources.length === 0) {
      throw new AvailabilityResourceNotFoundError();
    }

    return resources;
  }

  private async loadReservations(
    resourceIds: string[],
    start: Date,
    end: Date
  ): Promise<ReservationRangeRow[]> {
    const { data, error } = await toFilterBuilder(
      this.client.from('reservations').select('staff_id, start_time, end_time')
    )
      .eq('clinic_id', this.clinicId)
      .in('staff_id', resourceIds)
      .eq('is_deleted', false)
      .lt('start_time', end.toISOString())
      .gt('end_time', start.toISOString())
      .not('status', 'in', RESERVATION_CONFLICT_STATUS_FILTER);

    if (error) {
      throw new Error('Failed to load public booking reservations');
    }

    return (data ?? []) as ReservationRangeRow[];
  }

  private async loadBlocks(
    resourceIds: string[],
    start: Date,
    end: Date
  ): Promise<BlockRangeRow[]> {
    const { data, error } = await toFilterBuilder(
      this.client.from('blocks').select('resource_id, start_time, end_time')
    )
      .eq('clinic_id', this.clinicId)
      .in('resource_id', resourceIds)
      .eq('is_active', true)
      .eq('is_deleted', false)
      .lt('start_time', end.toISOString())
      .gt('end_time', start.toISOString());

    if (error) {
      throw new Error('Failed to load public booking blocks');
    }

    return (data ?? []) as BlockRangeRow[];
  }
}
