import type { Resource } from '@/types/reservation';
import type { SchedulerResource } from '../types';

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
  resource: ReservationFormResource
): SchedulerResource => ({
  id: resource.id,
  name: resource.name,
  capacity: resource.maxConcurrent,
  subLabel: resource.type !== 'staff' ? resource.type : undefined,
  type: resource.type === 'staff' ? 'staff' : 'facility',
  nominationFee: resource.nominationFee ?? 0,
});

export const buildSchedulerResources = (
  rawResources: ReservationFormResource[] | null | undefined
): SchedulerResource[] => {
  const resources: SchedulerResource[] = [];

  for (const resource of rawResources ?? []) {
    if (canUseResourceForReservationForm(resource)) {
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
