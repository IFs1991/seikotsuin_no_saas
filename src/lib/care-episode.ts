export type CareEpisodeStatus = 'active' | 'paused' | 'completed' | 'cancelled';

export type VisitStageCode =
  | 'first_visit'
  | 'second_visit'
  | 'third_visit'
  | 'fifth_visit'
  | 'repeat';

export interface CareEpisodeMetrics {
  totalEpisodes: number;
  secondVisitReachedCount: number;
  fifthVisitReachedCount: number;
  secondVisitReachRate: number;
  fifthVisitReachRate: number;
  episodeContinuationRate: number;
  averageRevenuePerEpisode: number;
  averageVisitsPerEpisode: number;
}

export interface CareEpisodeMetricItem {
  care_episode_id: string | null;
  fee: number | null;
  visit_ordinal_in_episode: number | null;
  visit_stage_code: string | null;
}

type EpisodeAccumulator = {
  itemCount: number;
  totalRevenue: number;
  maxOrdinal: number;
};

const EMPTY_METRICS: CareEpisodeMetrics = {
  totalEpisodes: 0,
  secondVisitReachedCount: 0,
  fifthVisitReachedCount: 0,
  secondVisitReachRate: 0,
  fifthVisitReachRate: 0,
  episodeContinuationRate: 0,
  averageRevenuePerEpisode: 0,
  averageVisitsPerEpisode: 0,
};

export function getVisitStageCodeForOrdinal(ordinal: number): VisitStageCode {
  switch (ordinal) {
    case 1:
      return 'first_visit';
    case 2:
      return 'second_visit';
    case 3:
      return 'third_visit';
    case 5:
      return 'fifth_visit';
    default:
      return 'repeat';
  }
}

function getOrdinalFromStageCode(stageCode: string | null): number | null {
  switch (stageCode) {
    case 'first_visit':
      return 1;
    case 'second_visit':
      return 2;
    case 'third_visit':
      return 3;
    case 'fifth_visit':
      return 5;
    case 'repeat':
      return 999;
    default:
      return null;
  }
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

export function calculateCareEpisodeMetrics(
  items: CareEpisodeMetricItem[]
): CareEpisodeMetrics {
  const byEpisode = new Map<string, EpisodeAccumulator>();

  for (const item of items) {
    if (!item.care_episode_id) {
      continue;
    }

    const ordinal =
      item.visit_ordinal_in_episode ??
      getOrdinalFromStageCode(item.visit_stage_code) ??
      0;
    const existing = byEpisode.get(item.care_episode_id) ?? {
      itemCount: 0,
      totalRevenue: 0,
      maxOrdinal: 0,
    };

    existing.itemCount += 1;
    existing.totalRevenue += Number(item.fee ?? 0);
    existing.maxOrdinal = Math.max(existing.maxOrdinal, ordinal);
    byEpisode.set(item.care_episode_id, existing);
  }

  const totalEpisodes = byEpisode.size;
  if (totalEpisodes === 0) {
    return EMPTY_METRICS;
  }

  let secondVisitReachedCount = 0;
  let fifthVisitReachedCount = 0;
  let totalRevenue = 0;
  let totalVisits = 0;

  for (const episode of byEpisode.values()) {
    if (episode.maxOrdinal >= 2 || episode.itemCount >= 2) {
      secondVisitReachedCount += 1;
    }
    if (episode.maxOrdinal >= 5 || episode.itemCount >= 5) {
      fifthVisitReachedCount += 1;
    }
    totalRevenue += episode.totalRevenue;
    totalVisits += episode.itemCount;
  }

  const secondVisitReachRate = roundToOneDecimal(
    (secondVisitReachedCount / totalEpisodes) * 100
  );
  const fifthVisitReachRate = roundToOneDecimal(
    (fifthVisitReachedCount / totalEpisodes) * 100
  );

  return {
    totalEpisodes,
    secondVisitReachedCount,
    fifthVisitReachedCount,
    secondVisitReachRate,
    fifthVisitReachRate,
    episodeContinuationRate: secondVisitReachRate,
    averageRevenuePerEpisode: roundToTwoDecimals(totalRevenue / totalEpisodes),
    averageVisitsPerEpisode: roundToTwoDecimals(totalVisits / totalEpisodes),
  };
}
