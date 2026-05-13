import type { Resource } from '@/types/reservation';
import type { Appointment, SchedulerResource } from '../types';

export type ReservationFormResource = Pick<
  Resource,
  | 'id'
  | 'name'
  | 'type'
  | 'maxConcurrent'
  | 'nominationFee'
  | 'isActive'
  | 'isBookable'
>;

const getResourceSortRank = (resourceType?: string) =>
  resourceType === 'staff' ? 0 : 1;

export const canUseResourceForReservationForm = (
  resource: ReservationFormResource
) => {
  if (resource.isActive === false) {
    return false;
  }

  return resource.type !== 'staff' || resource.isBookable === true;
};

const mapToSchedulerResource = (
  resource: ReservationFormResource,
  subLabel?: string
): SchedulerResource => ({
  id: resource.id,
  name: resource.name,
  capacity: resource.maxConcurrent,
  subLabel: subLabel ?? (resource.type !== 'staff' ? resource.type : undefined),
  type: resource.type === 'staff' ? 'staff' : 'facility',
  nominationFee: resource.nominationFee ?? 0,
});

export interface ShiftTimelineFilter {
  scheduledStaffIds: ReadonlySet<string>;
  appointmentResourceIds: ReadonlySet<string>;
}

export const buildAppointmentResourceIds = (
  appointments: readonly Appointment[]
): ReadonlySet<string> =>
  new Set(appointments.map(appointment => appointment.resourceId));

export const buildSchedulerResources = (
  rawResources: ReservationFormResource[] | null | undefined,
  shiftFilter?: ShiftTimelineFilter
): SchedulerResource[] => {
  const resources: SchedulerResource[] = [];

  for (const resource of rawResources ?? []) {
    if (!canUseResourceForReservationForm(resource)) {
      continue;
    }

    if (resource.type === 'staff' && shiftFilter) {
      if (shiftFilter.scheduledStaffIds.has(resource.id)) {
        resources.push(mapToSchedulerResource(resource));
        continue;
      }

      if (shiftFilter.appointmentResourceIds.has(resource.id)) {
        resources.push(mapToSchedulerResource(resource, 'シフト未設定'));
      }
    } else {
      resources.push(mapToSchedulerResource(resource));
    }
  }

  resources.sort(
    (a, b) =>
      getResourceSortRank(a.type) - getResourceSortRank(b.type) ||
      a.name.localeCompare(b.name, 'ja')
  );

  return resources;
};
