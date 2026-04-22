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
  ADMIN_MANAGEMENT_ACTIONS,
  ADMIN_DASHBOARD_COPY,
  ADMIN_DASHBOARD_STYLES,
  buildAdminHomeViewModel,
  formatCurrency,
  type DashboardClinic,
  type ManagementAction,
  type ManagementSignal,
  type SummaryMetric,
} from '@/components/dashboard/admin-dashboard.utils';
import { cn } from '@/lib/utils';

const SIGNAL_TONE_CLASS = {
  neutral: ADMIN_DASHBOARD_STYLES.signalNeutral,
  warning: ADMIN_DASHBOARD_STYLES.signalWarning,
  success: ADMIN_DASHBOARD_STYLES.signalSuccess,
} as const;

const ADMIN_COMPARISON_HREF = '/multi-store';

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
}: {
  signals: readonly ManagementSignal[];
}) {
  return (
    <section>
      <div className={ADMIN_DASHBOARD_STYLES.sectionHeader}>
        <h3 className={ADMIN_DASHBOARD_STYLES.sectionTitle}>
          {ADMIN_DASHBOARD_COPY.signalTitle}
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

const ManagementActionsSection = memo(function ManagementActionsSection() {
  return (
    <section>
      <div className={ADMIN_DASHBOARD_STYLES.sectionHeader}>
        <h3 className={ADMIN_DASHBOARD_STYLES.sectionTitle}>
          {ADMIN_DASHBOARD_COPY.actionTitle}
        </h3>
        <p className={ADMIN_DASHBOARD_STYLES.sectionDescription}>
          {ADMIN_DASHBOARD_COPY.actionDescription}
        </p>
      </div>
      <div className={ADMIN_DASHBOARD_STYLES.actionGrid}>
        {ADMIN_MANAGEMENT_ACTIONS.map(action => (
          <ManagementActionCard key={action.href} action={action} />
        ))}
      </div>
    </section>
  );
});

const AttentionClinicCard = memo(function AttentionClinicCard({
  clinic,
}: {
  clinic: DashboardClinic;
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
          {ADMIN_DASHBOARD_COPY.performanceLabel}:{' '}
          <span className={ADMIN_DASHBOARD_STYLES.clinicKpiValue}>
            {clinic.averagePerformanceScore.toFixed(2)} / 5.0
          </span>
        </p>
        <Link
          href={ADMIN_COMPARISON_HREF}
          className={ADMIN_DASHBOARD_STYLES.clinicDetailLink}
        >
          {ADMIN_DASHBOARD_COPY.detailButton}
        </Link>
      </CardContent>
    </Card>
  );
});

const AttentionClinicsPanel = memo(function AttentionClinicsPanel({
  clinics,
}: {
  clinics: readonly DashboardClinic[];
}) {
  if (clinics.length === 0) {
    return (
      <Card className={ADMIN_DASHBOARD_STYLES.signalSuccess}>
        <CardHeader>
          <CardTitle className={ADMIN_DASHBOARD_STYLES.sectionTitle}>
            {ADMIN_DASHBOARD_COPY.noAlertsTitle}
          </CardTitle>
          <CardDescription>
            {ADMIN_DASHBOARD_COPY.noAlertsDescription}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className={ADMIN_DASHBOARD_STYLES.alertCard}>
      <CardTitle className={ADMIN_DASHBOARD_STYLES.alertTitle}>
        <AlertTriangle className='mr-2 h-5 w-5 text-amber-600' />
        {ADMIN_DASHBOARD_COPY.alertTitle}
      </CardTitle>
      <CardContent className={ADMIN_DASHBOARD_STYLES.alertBody}>
        {ADMIN_DASHBOARD_COPY.alertDescription}
        <ul className='mt-3 grid grid-cols-1 gap-3 md:grid-cols-2'>
          {clinics.map(clinic => (
            <li key={clinic.id}>
              <AttentionClinicCard clinic={clinic} />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
});

export default function AdminDashboard() {
  const {
    clinicsData,
    overallKpis,
    loading,
    error,
    refreshData,
    isRefreshing,
  } = useAdminDashboard();

  const { summaryMetrics, managementSignals, problematicClinics } = useMemo(
    () => buildAdminHomeViewModel(clinicsData, overallKpis),
    [clinicsData, overallKpis]
  );

  return (
    <div className={ADMIN_DASHBOARD_STYLES.page}>
      <div className={ADMIN_DASHBOARD_STYLES.container}>
        <Card className={ADMIN_DASHBOARD_STYLES.rootCard}>
          <CardHeader className={ADMIN_DASHBOARD_STYLES.header}>
            <div className={ADMIN_DASHBOARD_STYLES.headerRow}>
              <div>
                <CardTitle className={ADMIN_DASHBOARD_STYLES.title}>
                  {ADMIN_DASHBOARD_COPY.title}
                </CardTitle>
                <CardDescription className={ADMIN_DASHBOARD_STYLES.description}>
                  {ADMIN_DASHBOARD_COPY.description}
                </CardDescription>
              </div>
              <Link
                href={ADMIN_COMPARISON_HREF}
                className={ADMIN_DASHBOARD_STYLES.linkButton}
              >
                {ADMIN_DASHBOARD_COPY.comparisonButton}
                <ArrowRight className='ml-2 h-4 w-4' />
              </Link>
            </div>
          </CardHeader>
          <CardContent className={ADMIN_DASHBOARD_STYLES.body}>
            {loading ? (
              <div className={ADMIN_DASHBOARD_STYLES.loading}>
                {ADMIN_DASHBOARD_COPY.loading}
              </div>
            ) : error ? (
              <div className={ADMIN_DASHBOARD_STYLES.errorState}>
                <p>{ADMIN_DASHBOARD_COPY.errorTitle}</p>
                <p className='mt-2 text-sm'>{error}</p>
                <Button
                  className={cn(
                    'mt-4',
                    ADMIN_DASHBOARD_STYLES.primaryActionButton
                  )}
                  onClick={() => void refreshData()}
                >
                  {ADMIN_DASHBOARD_COPY.retryButton}
                </Button>
              </div>
            ) : (
              <>
                {isRefreshing && (
                  <p className={ADMIN_DASHBOARD_STYLES.statusText}>
                    {ADMIN_DASHBOARD_COPY.refreshing}
                  </p>
                )}

                <SummaryMetricsGrid metrics={summaryMetrics} />
                <ManagementSignalsGrid signals={managementSignals} />
                <AttentionClinicsPanel clinics={problematicClinics} />
                <ManagementActionsSection />
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
