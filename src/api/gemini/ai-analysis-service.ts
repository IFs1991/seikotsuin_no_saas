import { supabase } from '@/lib/supabase/client';
import type { AIComment } from '@/types';

interface AnalysisData {
  salesData: any[];
  patientData: any[];
  therapistData: any[];
}

interface AnalysisResult {
  salesAnalysis: {
    total: number;
    trend: string;
    anomalies: string[];
  };
  patientMetrics: {
    total: number;
    newPatients: number;
    returnRate: number;
  };
  therapistPerformance: {
    topPerformer: string;
    metrics: Record<string, number>;
  };
  aiInsights: {
    summary: string;
    recommendations: string[];
    nextDayPlan: string[];
  };
}

/**
 * データベースから必要なデータを取得
 */
export async function fetchAnalysisData(): Promise<AnalysisData> {
  try {
    const [salesResponse, patientResponse, therapistResponse] =
      await Promise.all([
        supabase
          .from('revenues')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(30),

        supabase
          .from('patients')
          .select('*')
          .order('created_at', { ascending: false }),

        supabase
          .from('staff_performance')
          .select('*')
          .order('performance_score', { ascending: false }),
      ]);

    return {
      salesData: salesResponse.data || [],
      patientData: patientResponse.data || [],
      therapistData: therapistResponse.data || [],
    };
  } catch (error) {
    console.error('Failed to fetch analysis data:', error);
    throw new Error('データの取得に失敗しました');
  }
}

/**
 * 取得したデータを分析してレポートを生成
 */
export function generateAnalysisReport(data: AnalysisData): AnalysisResult {
  const { salesData, patientData, therapistData } = data;

  return {
    salesAnalysis: {
      total: salesData.reduce((acc, curr) => acc + (curr.amount || 0), 0),
      trend: calculateTrend(salesData),
      anomalies: detectAnomalies(salesData),
    },
    patientMetrics: {
      total: patientData.length,
      newPatients: patientData.filter(p => p.is_new).length,
      returnRate: calculateReturnRate(patientData),
    },
    therapistPerformance: {
      topPerformer: therapistData[0]?.staff_name || '',
      metrics: therapistData.reduce(
        (acc, curr) => ({
          ...acc,
          [curr.staff_name]: curr.performance_score,
        }),
        {}
      ),
    },
    aiInsights: {
      summary: generateSummary(salesData, patientData, therapistData),
      recommendations: generateRecommendations(salesData, patientData),
      nextDayPlan: generateNextDayPlan(salesData, patientData, therapistData),
    },
  };
}

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
    const aiComment: AIComment = {
      id: `ai-comment-${Date.now()}`,
      clinic_id: 'default-clinic',
      date: new Date().toISOString().split('T')[0],
      summary: parsed.summary || analysisResult.aiInsights?.summary || '',
      highlights: parsed.highlights?.length
        ? parsed.highlights
        : analysisResult.aiInsights?.recommendations || [],
      improvements: parsed.improvements || [
        '待ち時間の短縮が必要',
        '予約システムの最適化',
      ],
      suggestions: parsed.suggestions?.length
        ? parsed.suggestions
        : analysisResult.aiInsights?.nextDayPlan || [],
      created_at: new Date().toISOString(),
    };

    return aiComment;
  } catch (error) {
    console.error('AI comment generation failed:', error);
    return generateMockAIComment(analysisResult);
  }
}

// ヘルパー関数
function calculateTrend(salesData: any[]): string {
  if (salesData.length < 2) return '不明';

  const recent = salesData
    .slice(0, 7)
    .reduce((acc, curr) => acc + (curr.amount || 0), 0);
  const previous = salesData
    .slice(7, 14)
    .reduce((acc, curr) => acc + (curr.amount || 0), 0);

  return recent > previous
    ? '上昇傾向'
    : recent < previous
      ? '下降傾向'
      : '横ばい';
}

function detectAnomalies(salesData: any[]): string[] {
  // 簡単な異常値検知
  const amounts = salesData.map(d => d.amount || 0);
  const avg = amounts.reduce((acc, curr) => acc + curr, 0) / amounts.length;

  const anomalies: string[] = [];
  amounts.forEach((amount, index) => {
    if (amount > avg * 1.5) {
      const date = new Date(salesData[index].created_at).toLocaleDateString(
        'ja-JP'
      );
      anomalies.push(`${date}の売上が平均を大きく上回っています`);
    }
  });

  return anomalies;
}

function calculateReturnRate(patientData: any[]): number {
  const totalPatients = patientData.length;
  const returningPatients = patientData.filter(p => !p.is_new).length;

  return totalPatients > 0
    ? Math.round((returningPatients / totalPatients) * 100 * 10) / 10
    : 0;
}

function generateSummary(
  salesData: any[],
  _patientData: any[],
  _therapistData: any[]
): string {
  const trend = calculateTrend(salesData);
  return `全体的に${trend}で推移しており、患者満足度も良好です。`;
}

function generateRecommendations(
  salesData: any[],
  patientData: any[]
): string[] {
  const recommendations = [];

  if (patientData.filter(p => p.is_new).length > patientData.length * 0.3) {
    recommendations.push('新規患者の受入れ体制を強化することをお勧めします');
  }

  if (calculateTrend(salesData) === '下降傾向') {
    recommendations.push('売上向上のための施策を検討してください');
  } else {
    recommendations.push('現在の良好な傾向を維持しましょう');
  }

  return recommendations;
}

function generateNextDayPlan(
  _salesData: any[],
  _patientData: any[],
  _therapistData: any[]
): string[] {
  return [
    'スタッフミーティングで本日の振り返りを実施',
    '新規患者のフォローアップを優先的に行う',
    '人気施術の予約枠を調整する',
  ];
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
    const summary = typeof obj.summary === 'string' ? obj.summary : undefined;
    const arr = (v: any) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : undefined);
    return {
      summary,
      highlights: arr(obj.highlights),
      improvements: arr(obj.improvements),
      suggestions: arr(obj.suggestions),
    };
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
  return {
    id: `ai-comment-${Date.now()}`,
    clinic_id: 'default-clinic',
    date: new Date().toISOString().split('T')[0],
    summary: analysisResult.aiInsights?.summary || '',
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
    suggestions: analysisResult.aiInsights.nextDayPlan,
    created_at: new Date().toISOString(),
  };
}
