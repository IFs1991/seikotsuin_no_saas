import { z } from 'zod';
import { type AnalysisResult } from '@/lib/ai/analysis-client';
import { supabase } from '@/lib/supabase/client';
import type { AIComment } from '@/types';

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

export interface AiInsightItem {
  title: string;
  why: string;
  action: string;
  impact: InsightImpact;
}

export interface AiInsightAnomaly {
  title: string;
  evidence: string;
  action: string;
}

export interface AiInsightsResponse {
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

/**
 * Gemini AI APIを使用してAIコメントを生成
 */
export async function generateAIComment(
  analysisResult: AnalysisResult
): Promise<AIComment> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    // 開発中はモックデータを返す
    return generateMockAIComment(analysisResult);
  }

  try {
    const prompt = createAnalysisPrompt(analysisResult);

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent`;

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
    });

    if (!res.ok) {
      throw new Error(`Gemini API error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map((p: any) => p?.text ?? '')
        .join('\n') ?? '';

    // 応答はJSONで返すようプロンプトを設定しているが、安全のため抽出ロジックを用意
    const parsed = parseAIResponseTextToObject(text);

    // 型をAICommentに整形
    const summary =
      typeof parsed.summary === 'string' && parsed.summary.trim().length > 0
        ? parsed.summary
        : analysisResult.aiInsights.summary;

    const highlights =
      parsed.highlights && parsed.highlights.length > 0
        ? parsed.highlights
        : [...analysisResult.aiInsights.recommendations];

    const improvements =
      parsed.improvements && parsed.improvements.length > 0
        ? parsed.improvements
        : [
            '待ち時間の短縮が必要',
            '予約システムの最適化',
            '設備のメンテナンス',
          ];

    const suggestions =
      parsed.suggestions && parsed.suggestions.length > 0
        ? parsed.suggestions
        : [...analysisResult.aiInsights.nextDayPlan];

    const [datePart = ''] = new Date().toISOString().split('T');

    const aiComment: AIComment = {
      id: `ai-comment-${Date.now()}`,
      clinic_id: 'default-clinic',
      date: datePart,
      summary,
      highlights,
      improvements,
      suggestions,
      created_at: new Date().toISOString(),
    };

    return aiComment;
  } catch (error) {
    console.error('AI comment generation failed:', error);
    return generateMockAIComment(analysisResult);
  }
}

export async function generateAiInsights(
  clinicId: string,
  periodDays = 30
): Promise<AiInsightsResponse> {
  const input = await buildInsightInput(clinicId, periodDays);
  return await requestAiInsights(input);
}

async function buildInsightInput(
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
        evidence: `平均日商の1.5倍を超える売上が記録されています`,
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

function createAnalysisPrompt(analysisResult: AnalysisResult): string {
  return `
あなたは整骨院の経営アナリストです。以下のデータから、経営改善のための簡潔なコメントを日本語で作成してください。出力は必ず次のJSON形式のみで返してください（余計な前置きやコードブロックは不要）。

{
  "summary": string,               // 100文字以内の総評
  "highlights": string[3],         // 好調だった点 最大3つ（配列長は1〜3）
  "improvements": string[3],       // 改善が必要な点 最大3つ（配列長は1〜3）
  "suggestions": string[3]         // 明日への提案 最大3つ（配列長は1〜3）
}

入力データ:
- 売上合計: ${analysisResult.salesAnalysis.total.toLocaleString()} 円
- トレンド: ${analysisResult.salesAnalysis.trend}
- 患者総数: ${analysisResult.patientMetrics.total} 名
- 新規患者: ${analysisResult.patientMetrics.newPatients} 名
- リピート率: ${analysisResult.patientMetrics.returnRate} %
- 異常検知: ${(analysisResult.salesAnalysis.anomalies || []).join(' / ') || 'なし'}
`;
}

function parseAIResponseTextToObject(text: string): {
  summary?: string;
  highlights?: string[];
  improvements?: string[];
  suggestions?: string[];
} {
  if (!text) return {};
  // JSONとして直接解釈を試みる
  const tryParse = (s: string) => {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  };

  // ```json ... ``` の中身を抽出
  const fenced = text.match(/```(?:json)?\n([\s\S]*?)```/i);
  const candidateJson = fenced?.[1]?.trim() || text.trim();
  const obj = tryParse(candidateJson) || tryParse(extractFirstJsonObject(text));
  if (obj && typeof obj === 'object') {
    const summary =
      typeof obj.summary === 'string' && obj.summary.trim().length > 0
        ? obj.summary
        : undefined;
    const arr = (v: unknown) =>
      Array.isArray(v)
        ? v.filter((x): x is string => typeof x === 'string' && x.length > 0)
        : undefined;

    const parsedResult: {
      summary?: string;
      highlights?: string[];
      improvements?: string[];
      suggestions?: string[];
    } = {};

    if (summary) {
      parsedResult.summary = summary;
    }

    const highlights = arr(obj.highlights);
    if (highlights && highlights.length > 0) {
      parsedResult.highlights = highlights;
    }

    const improvements = arr(obj.improvements);
    if (improvements && improvements.length > 0) {
      parsedResult.improvements = improvements;
    }

    const suggestions = arr(obj.suggestions);
    if (suggestions && suggestions.length > 0) {
      parsedResult.suggestions = suggestions;
    }

    return parsedResult;
  }
  return {};
}

function extractFirstJsonObject(s: string): string {
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return s.slice(start, end + 1);
  }
  return '';
}

function generateMockAIComment(analysisResult: AnalysisResult): AIComment {
  const [datePart = ''] = new Date().toISOString().split('T');

  return {
    id: `ai-comment-${Date.now()}`,
    clinic_id: 'default-clinic',
    date: datePart,
    summary: analysisResult.aiInsights.summary,
    highlights: [
      '患者満足度が高水準を維持',
      '新規患者の獲得が順調',
      'スタッフのパフォーマンスが向上',
    ],
    improvements: [
      '待ち時間の短縮が必要',
      '予約システムの最適化',
      '設備のメンテナンス',
    ],
    suggestions: [...analysisResult.aiInsights.nextDayPlan],
    created_at: new Date().toISOString(),
  };
}
