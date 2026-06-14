import * as fs from 'fs';
import * as path from 'path';

const ROOT_DIR = path.resolve(__dirname, '../../..');

const pilotTargets = [
  'src/app/(app)/app-shell.tsx',
  'src/app/(app)/dashboard/page.tsx',
  'src/components/navigation/header.tsx',
  'src/components/navigation/sidebar.tsx',
  'src/app/(app)/patients/page.tsx',
  'src/app/(app)/patients/[id]/page.tsx',
  'src/app/(app)/patients/list/page.tsx',
  'src/components/patients/conversion-funnel.tsx',
  'src/components/patients/risk-score-list.tsx',
  'src/components/dashboard/manager-dashboard.tsx',
  'src/components/revenue/manager-revenue-analysis.tsx',
  'src/app/(app)/staff/page.tsx',
  'src/components/staff/performance-metrics.tsx',
  'src/components/staff/shift-optimizer.tsx',
  'src/app/(app)/multi-store/page.tsx',
  'src/components/revenue/menu-ranking.tsx',
  'src/components/dashboard/patient-flow-heatmap.tsx',
  'src/components/master/admin-master-form.tsx',
] as const;

const prohibitedPatterns = [
  {
    name: 'hardcoded Tailwind hex color utilities',
    pattern: /\b(?:bg|text|border)-\[#/u,
  },
  {
    name: 'gray or slate dark-mode color pairs',
    pattern: /\bdark:(?:bg-gray|bg-slate|text-gray)/u,
  },
] as const;

describe('UI02: pilot hardcoded color guard', () => {
  test.each(pilotTargets)('%s has no prohibited pilot color patterns', file => {
    const absolutePath = path.join(ROOT_DIR, file);
    const content = fs.readFileSync(absolutePath, 'utf-8');

    for (const prohibitedPattern of prohibitedPatterns) {
      expect(content).not.toMatch(prohibitedPattern.pattern);
    }
  });
});
