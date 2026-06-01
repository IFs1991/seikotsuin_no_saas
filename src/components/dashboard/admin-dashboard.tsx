'use client';

import { memo, useMemo } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import useAdminDashboard from '@/hooks/useAdminDashboard';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  ADMIN_DASHBOARD_STYLES,
  buildAdminHomeViewModel,
  formatCurrency,
  getAdminDashboardCopy,
  getAdminManagementActions,
  type AdminDashboardVariant,
  type DashboardClinic,
  type ManagementAction,
  type ManagementSignal,
  type SummaryMetric,
} from '@/components/dashboard/admin-dashboard.utils';
import { cn } from '@/lib/utils';
import { useOptionalUserProfileContext } from '@/providers/user-profile-context';
import { isAreaManagerRole } from '@/lib/constants/roles';

const SIGNAL_TONE_CLASS = {
  neutral: ADMIN_DASHBOARD_STYLES.signalNeutral,
  warning: ADMIN_DASHBOARD_STYLES.signalWarning,
  success: ADMIN_DASHBOARD_STYLES.signalSuccess,
} as const;

const ADMIN_COMPARISON_HREF = '/multi-store';
type AdminDashboardCopy = ReturnType<typeof getAdminDashboardCopy>;

const SummaryMetricCard = memo(function SummaryMetricCard({
  label,
  value,
}: SummaryMetric) {
  return (
    <Card className={ADMIN_DASHBOARD_STYLES.metricCard}>
      <CardTitle className={ADMIN_DASHBOARD_STYLES.metricTitle}>
        {label}
      </CardTitle>
      <CardContent className={ADMIN_DASHBOARD_STYLES.metricValue}>
        {value}
      </CardContent>
    </Card>
  );
});

const SummaryMetricsGrid = memo(function SummaryMetricsGrid({
  metrics,
}: {
  metrics: readonly SummaryMetric[];
}) {
  return (
    <div className={ADMIN_DASHBOARD_STYLES.summaryGrid}>
      {metrics.map(metric => (
        <SummaryMetricCard
          key={metric.label}
          label={metric.label}
          value={metric.value}
        />
      ))}
    </div>
  );
});

const ManagementSignalCard = memo(function ManagementSignalCard({
  signal,
}: {
  signal: ManagementSignal;
}) {
  return (
    <Card
      className={cn(
        ADMIN_DASHBOARD_STYLES.signalCard,
        SIGNAL_TONE_CLASS[signal.tone]
      )}
    >
      <CardTitle className={ADMIN_DASHBOARD_STYLES.signalLabel}>
        {signal.label}
      </CardTitle>
      <CardContent className='p-0'>
        <p className={ADMIN_DASHBOARD_STYLES.signalValue}>{signal.value}</p>
        <p className={ADMIN_DASHBOARD_STYLES.signalDetail}>{signal.detail}</p>
      </CardContent>
    </Card>
  );
});

const ManagementSignalsGrid = memo(function ManagementSignalsGrid({
  signals,
  copy,
}: {
  signals: readonly ManagementSignal[];
  copy: AdminDashboardCopy;
}) {
  return (
    <section>
      <div className={ADMIN_DASHBOARD_STYLES.sectionHeader}>
        <h3 className={ADMIN_DASHBOARD_STYLES.sectionTitle}>
          {copy.signalTitle}
        </h3>
      </div>
      <div className={ADMIN_DASHBOARD_STYLES.signalGrid}>
        {signals.map(signal => (
          <ManagementSignalCard key={signal.label} signal={signal} />
        ))}
      </div>
    </section>
  );
});

const ManagementActionCard = memo(function ManagementActionCard({
  action,
}: {
  action: ManagementAction;
}) {
  return (
    <Link href={action.href} className={ADMIN_DASHBOARD_STYLES.actionCard}>
      <span>
        <span className={ADMIN_DASHBOARD_STYLES.actionTitle}>
          {action.label}
        </span>
        <span className={ADMIN_DASHBOARD_STYLES.actionDescription}>
          {action.description}
        </span>
      </span>
      <span className={ADMIN_DASHBOARD_STYLES.actionCta}>
        {action.cta}
        <ArrowRight className='ml-1 h-4 w-4' />
      </span>
    </Link>
  );
});

const ManagementActionsSection = memo(function ManagementActionsSection({
  actions,
  copy,
}: {
  actions: readonly ManagementAction[];
  copy: AdminDashboardCopy;
}) {
  return (
    <section>
      <div className={ADMIN_DASHBOARD_STYLES.sectionHeader}>
        <h3 className={ADMIN_DASHBOARD_STYLES.sectionTitle}>
          {copy.actionTitle}
        </h3>
        <p className={ADMIN_DASHBOARD_STYLES.sectionDescription}>
          {copy.actionDescription}
        </p>
      </div>
      <div className={ADMIN_DASHBOARD_STYLES.actionGrid}>
        {actions.map(action => (
          <ManagementActionCard key={action.href} action={action} />
        ))}
      </div>
    </section>
  );
});

const AttentionClinicCard = memo(function AttentionClinicCard({
  clinic,
  copy,
}: {
  clinic: DashboardClinic;
  copy: AdminDashboardCopy;
}) {
  return (
    <Card
      className={cn(
        ADMIN_DASHBOARD_STYLES.clinicCard,
        clinic.isProblematic && ADMIN_DASHBOARD_STYLES.problematicClinicCard
      )}
    >
      <CardTitle className={ADMIN_DASHBOARD_STYLES.clinicTitle}>
        {clinic.name}
      </CardTitle>
      <CardContent className={ADMIN_DASHBOARD_STYLES.clinicBody}>
        <p>
          売上:{' '}
          <span className='font-medium'>
            {formatCurrency(clinic.totalRevenue)}
          </span>
        </p>
        <p>
          患者数:{' '}
          <span className='font-medium'>{clinic.totalPatientCount}人</span>
        </p>
        <p>
          {copy.performanceLabel}:{' '}
          <span className={ADMIN_DASHBOARD_STYLES.clinicKpiValue}>
            {clinic.averagePerformanceScore.toFixed(2)} / 5.0
          </span>
        </p>
        <Link
          href={ADMIN_COMPARISON_HREF}
          className={ADMIN_DASHBOARD_STYLES.clinicDetailLink}
        >
          {copy.detailButton}
        </Link>
      </CardContent>
    </Card>
  );
});

const ClinicPerformanceCard = memo(function ClinicPerformanceCard({
  clinic,
  copy,
}: {
  clinic: DashboardClinic;
  copy: AdminDashboardCopy;
}) {
  return (
    <Card className={ADMIN_DASHBOARD_STYLES.clinicPerformanceCard}>
      <div className={ADMIN_DASHBOARD_STYLES.clinicPerformanceHeader}>
        <CardTitle className={ADMIN_DASHBOARD_STYLES.clinicPerformanceName}>
          {clinic.name}
        </CardTitle>
        <span
          className={cn(
            ADMIN_DASHBOARD_STYLES.clinicPerformanceBadge,
            clinic.isProblematic
              ? ADMIN_DASHBOARD_STYLES.clinicPerformanceBadgeWarning
              : ADMIN_DASHBOARD_STYLES.clinicPerformanceBadgeStable
          )}
        >
          {clinic.isProblematic ? copy.attentionBadge : copy.stableBadge}
        </span>
      </div>
      <CardContent className='p-0'>
        <p className={ADMIN_DASHBOARD_STYLES.clinicPerformanceScore}>
          {clinic.averagePerformanceScore.toFixed(2)} / 5.0
        </p>
        <dl className={ADMIN_DASHBOARD_STYLES.clinicPerformanceMeta}>
          <div>
            <dt>{copy.summaryLabels[0]}</dt>
            <dd className='font-semibold text-slate-950'>
              {formatCurrency(clinic.totalRevenue)}
            </dd>
          </div>
          <div>
            <dt>{copy.summaryLabels[1]}</dt>
            <dd className='font-semibold text-slate-950'>
              {clinic.totalPatientCount.toLocaleString()}人
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
});

const ClinicPerformancePanel = memo(function ClinicPerformancePanel({
  clinics,
  copy,
}: {
  clinics: readonly DashboardClinic[];
  copy: AdminDashboardCopy;
}) {
  if (clinics.length === 0) {
    return (
      <Card className={ADMIN_DASHBOARD_STYLES.signalNeutral}>
        <CardHeader>
          <CardTitle className={ADMIN_DASHBOARD_STYLES.sectionTitle}>
            {copy.noClinicPerformanceTitle}
          </CardTitle>
          <CardDescription>
            {copy.noClinicPerformanceDescription}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <section>
      <div className={ADMIN_DASHBOARD_STYLES.sectionHeader}>
        <h3 className={ADMIN_DASHBOARD_STYLES.sectionTitle}>
          {copy.clinicPerformanceTitle}
        </h3>
        <p className={ADMIN_DASHBOARD_STYLES.sectionDescription}>
          {copy.clinicPerformanceDescription}
        </p>
      </div>
      <div className={ADMIN_DASHBOARD_STYLES.clinicPerformanceGrid}>
        {clinics.map(clinic => (
          <ClinicPerformanceCard key={clinic.id} clinic={clinic} copy={copy} />
        ))}
      </div>
    </section>
  );
});

const AttentionClinicsPanel = memo(function AttentionClinicsPanel({
  clinics,
  copy,
}: {
  clinics: readonly DashboardClinic[];
  copy: AdminDashboardCopy;
}) {
  if (clinics.length === 0) {
    return (
      <Card className={ADMIN_DASHBOARD_STYLES.signalSuccess}>
        <CardHeader>
          <CardTitle className={ADMIN_DASHBOARD_STYLES.sectionTitle}>
            {copy.noAlertsTitle}
          </CardTitle>
          <CardDescription>{copy.noAlertsDescription}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className={ADMIN_DASHBOARD_STYLES.alertCard}>
      <CardTitle className={ADMIN_DASHBOARD_STYLES.alertTitle}>
        <AlertTriangle className='mr-2 h-5 w-5 text-amber-600' />
        {copy.alertTitle}
      </CardTitle>
      <CardContent className={ADMIN_DASHBOARD_STYLES.alertBody}>
        {copy.alertDescription}
        <ul className='mt-3 grid grid-cols-1 gap-3 md:grid-cols-2'>
          {clinics.map(clinic => (
            <li key={clinic.id}>
              <AttentionClinicCard clinic={clinic} copy={copy} />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
});

export default function AdminDashboard() {
  const profileContext = useOptionalUserProfileContext();
  const variant: AdminDashboardVariant =
    profileContext &&
    (profileContext.loading || isAreaManagerRole(profileContext.profile?.role))
      ? 'area-manager'
      : 'hq';
  const copy = getAdminDashboardCopy(variant);
  const managementActions = getAdminManagementActions(variant);
  const {
    clinicsData,
    overallKpis,
    loading,
    error,
    refreshData,
    isRefreshing,
  } = useAdminDashboard();

  const {
    summaryMetrics,
    managementSignals,
    dashboardClinics,
    problematicClinics,
  } = useMemo(
    () => buildAdminHomeViewModel(clinicsData, overallKpis, variant),
    [clinicsData, overallKpis, variant]
  );

  return (
    <div className={ADMIN_DASHBOARD_STYLES.page}>
      <div className={ADMIN_DASHBOARD_STYLES.container}>
        <Card className={ADMIN_DASHBOARD_STYLES.rootCard}>
          <CardHeader className={ADMIN_DASHBOARD_STYLES.header}>
            <div className={ADMIN_DASHBOARD_STYLES.headerRow}>
              <div>
                <CardTitle className={ADMIN_DASHBOARD_STYLES.title}>
                  {copy.title}
                </CardTitle>
                <CardDescription className={ADMIN_DASHBOARD_STYLES.description}>
                  {copy.description}
                </CardDescription>
              </div>
              <Link
                href={ADMIN_COMPARISON_HREF}
                className={ADMIN_DASHBOARD_STYLES.linkButton}
              >
                {copy.comparisonButton}
                <ArrowRight className='ml-2 h-4 w-4' />
              </Link>
            </div>
          </CardHeader>
          <CardContent className={ADMIN_DASHBOARD_STYLES.body}>
            {loading ? (
              <div className={ADMIN_DASHBOARD_STYLES.loading}>
                {copy.loading}
              </div>
            ) : error ? (
              <div className={ADMIN_DASHBOARD_STYLES.errorState}>
                <p>{copy.errorTitle}</p>
                <p className='mt-2 text-sm'>{error}</p>
                <Button
                  className={cn(
                    'mt-4',
                    ADMIN_DASHBOARD_STYLES.primaryActionButton
                  )}
                  onClick={() => void refreshData()}
                >
                  {copy.retryButton}
                </Button>
              </div>
            ) : (
              <>
                {isRefreshing && (
                  <p className={ADMIN_DASHBOARD_STYLES.statusText}>
                    {copy.refreshing}
                  </p>
                )}

                <SummaryMetricsGrid metrics={summaryMetrics} />
                <ManagementSignalsGrid
                  signals={managementSignals}
                  copy={copy}
                />
                <ClinicPerformancePanel
                  clinics={dashboardClinics}
                  copy={copy}
                />
                <AttentionClinicsPanel
                  clinics={problematicClinics}
                  copy={copy}
                />
                <ManagementActionsSection
                  actions={managementActions}
                  copy={copy}
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
