import { NextRequest } from 'next/server';
import { z } from 'zod';
import { ensureClinicAccess } from '@/lib/supabase/guards';
import { createErrorResponse, createSuccessResponse } from '@/lib/api-helpers';

type InsightImpact = 'high' | 'mid' | 'low';

interface InsightTable {
  columns: string[];
  rows: Array<Array<string | number>>;
}

interface InsightInput {
  periodDays: number;
  tables: {
    revenue_daily: InsightTable;
    staff_revenue: InsightTable;
    patient_funnel: InsightTable;
  };
}

interface AiInsightItem {
  title: string;
  why: string;
  action: string;
  impact: InsightImpact;
}

interface AiInsightAnomaly {
  title: string;
  evidence: string;
  action: string;
}

interface AiInsightsResponse {
  summary: string;
  insights: AiInsightItem[];
  anomalies: AiInsightAnomaly[];
}

const MAX_REVENUE_ROWS = 90;
const MAX_STAFF_ROWS = 30;
const GEMINI_TIMEOUT_MS = 8000;

const aiInsightsSchema = z.object({
  summary: z.string().min(1),
  insights: z
    .array(
      z.object({
        title: z.string().min(1),
        why: z.string().min(1),
        action: z.string().min(1),
        impact: z.enum(['high', 'mid', 'low']),
      })
    )
    .min(1),
  anomalies: z
    .array(
      z.object({
        title: z.string().min(1),
        evidence: z.string().min(1),
        action: z.string().min(1),
      })
    )
    .optional()
    .default([]),
});

export async function GET(request: NextRequest) {
  const path = '/api/ai-insights';
  const clinicId = request.nextUrl.searchParams.get('clinic_id');
  const periodDaysParam = request.nextUrl.searchParams.get('period_days');
  const periodDays = periodDaysParam ? Number(periodDaysParam) : 30;

  if (!clinicId) {
    return createErrorResponse('clinic_id is required', 400);
  }
  if (!Number.isFinite(periodDays) || periodDays <= 0) {
    return createErrorResponse('period_days is invalid', 400);
  }

  try {
    const { supabase } = await ensureClinicAccess(request, path, clinicId, {
      requireClinicMatch: true,
    });

    const input = await buildInsightInput(supabase, clinicId, periodDays);
    const result = await requestAiInsights(input);
    return createSuccessResponse(result);
  } catch (error) {
    console.error('AI insights GET error:', error);
    return createErrorResponse('AIインサイトの取得に失敗しました', 500);
  }
}

async function buildInsightInput(
  supabase: Awaited<ReturnType<typeof ensureClinicAccess>>['supabase'],
  clinicId: string,
  periodDays: number
): Promise<InsightInput> {
  const { startDate, endDate } = getDateRange(periodDays);

  const [revenueRes, staffRes, patientRes] = await Promise.all([
    supabase
      .from('daily_revenue_summary')
      .select('revenue_date,total_revenue')
      .eq('clinic_id', clinicId)
      .gte('revenue_date', startDate)
      .lte('revenue_date', endDate)
      .order('revenue_date', { ascending: true }),
    supabase
      .from('staff_performance_summary')
      .select('staff_name,total_revenue_generated,total_visits')
      .eq('clinic_id', clinicId)
      .order('total_revenue_generated', { ascending: false })
      .limit(MAX_STAFF_ROWS),
    supabase
      .from('patient_visit_summary')
      .select('first_visit_date,last_visit_date,visit_count')
      .eq('clinic_id', clinicId)
      .or(`first_visit_date.gte.${startDate},last_visit_date.gte.${startDate}`),
  ]);

  if (revenueRes.error) {
    throw revenueRes.error;
  }
  if (staffRes.error) {
    throw staffRes.error;
  }
  if (patientRes.error) {
    throw patientRes.error;
  }

  const revenueRows = (revenueRes.data ?? [])
    .map(row => [
      toStringOrEmpty((row as any).revenue_date),
      toNumber((row as any).total_revenue),
    ])
    .filter(row => row[0])
    .slice(-MAX_REVENUE_ROWS);

  const staffRows = (staffRes.data ?? [])
    .map(row => [
      toStringOrEmpty((row as any).staff_name),
      toNumber((row as any).total_revenue_generated),
      toNumber((row as any).total_visits),
    ])
    .filter(row => row[0]);

  const { newPatients, returnPatients } = analyzePatientFunnel(
    patientRes.data ?? [],
    startDate,
    endDate
  );

  return {
    periodDays,
    tables: {
      revenue_daily: {
        columns: ['date', 'revenue'],
        rows: revenueRows,
      },
      staff_revenue: {
        columns: ['staff', 'revenue', 'count'],
        rows: staffRows,
      },
      patient_funnel: {
        columns: ['metric', 'value'],
        rows: [
          ['new', newPatients],
          ['return', returnPatients],
        ],
      },
    },
  };
}

async function requestAiInsights(
  input: InsightInput
): Promise<AiInsightsResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return buildFallbackInsights(input);
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const prompt = createInsightsPrompt(input);
    const endpoint =
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';

    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          topP: 0.95,
          topK: 40,
          maxOutputTokens: 512,
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Gemini API error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map((p: any) => p?.text ?? '')
        .join('\n') ?? '';

    const parsedJson = parseJsonFromText(text);
    const parsed = aiInsightsSchema.safeParse(parsedJson);
    if (parsed.success) {
      return {
        summary: parsed.data.summary,
        insights: parsed.data.insights as AiInsightItem[],
        anomalies: (parsed.data.anomalies ?? []) as AiInsightAnomaly[],
      };
    }
  } catch (error) {
    console.error('AI insights generation failed:', error);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }

  return buildFallbackInsights(input);
}

function getDateRange(periodDays: number) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - Math.max(periodDays - 1, 0));
  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
  };
}

function analyzePatientFunnel(
  rows: unknown[],
  startDate: string,
  endDate: string
) {
  let newPatients = 0;
  let returnPatients = 0;

  rows.forEach(row => {
    if (!isRecord(row)) return;
    const firstVisit = toStringOrEmpty(row.first_visit_date);
    const lastVisit = toStringOrEmpty(row.last_visit_date);
    const visitCount = toNumber(row.visit_count);

    if (firstVisit && firstVisit >= startDate && firstVisit <= endDate) {
      newPatients += 1;
      return;
    }

    if (
      lastVisit &&
      lastVisit >= startDate &&
      lastVisit <= endDate &&
      firstVisit &&
      firstVisit < startDate &&
      visitCount > 1
    ) {
      returnPatients += 1;
    }
  });

  return { newPatients, returnPatients };
}

function createInsightsPrompt(input: InsightInput): string {
  return `あなたは整骨院の経営アナリストです。以下のJSONテーブルを読み取り、経営改善のための簡潔なインサイトを日本語で作成してください。出力は必ず次のJSON形式のみで返してください（余計な前置きやコードブロックは不要）。

{
  "summary": string,                       // 120文字以内の総評
  "insights": [
    {
      "title": string,                     // 20文字以内の見出し
      "why": string,                       // 根拠/理由
      "action": string,                    // 推奨アクション
      "impact": "high" | "mid" | "low"
    }
  ],
  "anomalies": [
    {
      "title": string,
      "evidence": string,
      "action": string
    }
  ]
}

入力データ:
${JSON.stringify(input)}
`;
}

function buildFallbackInsights(input: InsightInput): AiInsightsResponse {
  const revenueRows = input.tables.revenue_daily.rows;
  const totalRevenue = revenueRows.reduce(
    (sum, row) => sum + (Number(row[1]) || 0),
    0
  );
  const avgRevenue =
    revenueRows.length > 0 ? Math.round(totalRevenue / revenueRows.length) : 0;
  const topStaff = input.tables.staff_revenue.rows[0]?.[0] ?? '不明';
  const newPatients = Number(input.tables.patient_funnel.rows[0]?.[1] ?? 0);
  const returnPatients = Number(input.tables.patient_funnel.rows[1]?.[1] ?? 0);

  const anomalies: AiInsightAnomaly[] = [];
  if (revenueRows.length >= 7) {
    const values = revenueRows.map(row => Number(row[1]) || 0);
    const average = values.reduce((sum, val) => sum + val, 0) / values.length;
    const max = Math.max(...values);
    if (average > 0 && max > average * 1.5) {
      anomalies.push({
        title: '売上の急増日が発生',
        evidence: '平均日商の1.5倍を超える売上が記録されています',
        action: '該当日の要因（メニュー/スタッフ/集客）を確認してください',
      });
    }
  }

  const summary =
    totalRevenue > 0
      ? `直近${input.periodDays}日で総売上は約${totalRevenue.toLocaleString()}円、平均日商は${avgRevenue.toLocaleString()}円です。`
      : `直近${input.periodDays}日分の集計データからインサイトを作成しました。`;

  return {
    summary,
    insights: [
      {
        title: '売上推移',
        why: `平均日商は約${avgRevenue.toLocaleString()}円です`,
        action: '高単価メニューの訴求と回数券の提案を強化してください',
        impact: 'mid',
      },
      {
        title: 'スタッフ別売上',
        why: `売上上位スタッフは${topStaff}です`,
        action: '成功パターンをスタッフ間で共有してください',
        impact: 'mid',
      },
      {
        title: '新規/再診比率',
        why: `新規${newPatients}名、再診${returnPatients}名の構成です`,
        action: '再診フォローの導線とリマインドを見直してください',
        impact: 'low',
      },
    ],
    anomalies,
  };
}

function parseJsonFromText(text: string): unknown {
  if (!text) return null;
  const tryParse = (s: string) => {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  };

  const fenced = text.match(/```(?:json)?\n([\s\S]*?)```/i);
  const candidateJson = fenced?.[1]?.trim() || text.trim();
  return tryParse(candidateJson) || tryParse(extractFirstJsonObject(text));
}

function extractFirstJsonObject(s: string): string {
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return s.slice(start, end + 1);
  }
  return '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return 0;
}

function toStringOrEmpty(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
