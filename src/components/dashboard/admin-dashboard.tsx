'use client';

import { useMemo } from 'react';
import { ArrowRight, CheckCircle } from 'lucide-react';
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
  ADMIN_DASHBOARD_COPY,
  ADMIN_DASHBOARD_STYLES,
  buildSummaryMetrics,
  decorateDashboardClinics,
  formatCurrency,
  type DashboardClinic,
  type SummaryMetric,
} from '@/components/dashboard/admin-dashboard.utils';
import { cn } from '@/lib/utils';

function SummaryMetricCard({ label, value }: SummaryMetric) {
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
}

function ClinicPerformanceCard({ clinic }: { clinic: DashboardClinic }) {
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
        <Button
          variant='link'
          className={ADMIN_DASHBOARD_STYLES.clinicDetailButton}
        >
          {ADMIN_DASHBOARD_COPY.detailButton}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function AdminDashboard() {
  const {
    clinicsData,
    overallKpis,
    loading,
    error,
    refreshData,
    isRefreshing,
  } = useAdminDashboard();

  const { summaryMetrics, dashboardClinics, problematicClinics } =
    useMemo(() => {
      const decoratedClinics = decorateDashboardClinics(clinicsData);

      return {
        summaryMetrics: buildSummaryMetrics(overallKpis),
        dashboardClinics: decoratedClinics,
        problematicClinics: decoratedClinics.filter(
          clinic => clinic.isProblematic
        ),
      };
    }, [clinicsData, overallKpis]);

  return (
    <div className={ADMIN_DASHBOARD_STYLES.page}>
      <div className={ADMIN_DASHBOARD_STYLES.container}>
        <Card className={ADMIN_DASHBOARD_STYLES.rootCard}>
          <CardHeader>
            <CardTitle className={ADMIN_DASHBOARD_STYLES.title}>
              {ADMIN_DASHBOARD_COPY.title}
            </CardTitle>
            <CardDescription className={ADMIN_DASHBOARD_STYLES.description}>
              {ADMIN_DASHBOARD_COPY.description}
            </CardDescription>
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

                <div className={ADMIN_DASHBOARD_STYLES.summaryGrid}>
                  {summaryMetrics.map(metric => (
                    <SummaryMetricCard
                      key={metric.label}
                      label={metric.label}
                      value={metric.value}
                    />
                  ))}
                </div>

                {problematicClinics.length > 0 && (
                  <Card className={ADMIN_DASHBOARD_STYLES.alertCard}>
                    <CardTitle className={ADMIN_DASHBOARD_STYLES.alertTitle}>
                      <CheckCircle className='mr-2 h-5 w-5 text-red-500' />
                      {ADMIN_DASHBOARD_COPY.alertTitle}
                    </CardTitle>
                    <CardContent className={ADMIN_DASHBOARD_STYLES.alertBody}>
                      {ADMIN_DASHBOARD_COPY.alertDescription}
                      <ul className='mt-2 list-inside list-disc'>
                        {problematicClinics.map(clinic => (
                          <li key={clinic.id} className='text-sm'>
                            <span className='font-medium'>{clinic.name}</span> (
                            {ADMIN_DASHBOARD_COPY.performanceLabel}:{' '}
                            {clinic.averagePerformanceScore.toFixed(2)} / 5.0)
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}

                <section>
                  <h3 className={ADMIN_DASHBOARD_STYLES.sectionTitle}>
                    {ADMIN_DASHBOARD_COPY.performanceSectionTitle}
                  </h3>
                  {dashboardClinics.length === 0 ? (
                    <div className={ADMIN_DASHBOARD_STYLES.emptyState}>
                      {ADMIN_DASHBOARD_COPY.emptyState}
                    </div>
                  ) : (
                    <div className={ADMIN_DASHBOARD_STYLES.clinicGrid}>
                      {dashboardClinics.map(clinic => (
                        <ClinicPerformanceCard
                          key={clinic.id}
                          clinic={clinic}
                        />
                      ))}
                    </div>
                  )}
                </section>

                <div className={ADMIN_DASHBOARD_STYLES.footer}>
                  <Button
                    className={ADMIN_DASHBOARD_STYLES.primaryActionButton}
                  >
                    {ADMIN_DASHBOARD_COPY.exportButton}
                    <ArrowRight className='ml-2 h-4 w-4' />
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
