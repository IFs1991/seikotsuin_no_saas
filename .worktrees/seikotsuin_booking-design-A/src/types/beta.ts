/**
 * ベータ運用検証（M4）関連の型定義
 *
 * このファイルには以下が含まれます：
 * - ベータ運用モニタリングデータ
 * - フィードバック収集
 * - 改善バックログ
 * - Go/No-Go判定資料
 */

/**
 * ベータ運用モニタリングデータ
 */
export interface BetaUsageMetrics {
  clinicId: string;
  clinicName: string;
  periodStart: string;
  periodEnd: string;

  // 利用状況メトリクス
  loginCount: number;
  uniqueUsers: number;
  dashboardViewCount: number;
  dailyReportSubmissions: number;
  patientAnalysisViewCount: number;

  // エンゲージメント指標
  averageSessionDuration: number; // 分単位
  dailyActiveRate: number; // パーセント
  featureAdoptionRate: {
    dashboard: number;
    dailyReports: number;
    patientAnalysis: number;
    aiInsights: number;
  };

  // データ品質
  dailyReportCompletionRate: number; // パーセント
  dataAccuracy: number; // パーセント

  // パフォーマンス
  averageLoadTime: number; // ミリ秒
  errorRate: number; // パーセント

  createdAt: string;
  updatedAt: string;
}

/**
 * ベータフィードバック
 */
export interface BetaFeedback {
  id: string;
  clinicId: string;
  userId: string;
  userName: string;

  // フィードバック内容
  category: 'feature_request' | 'bug_report' | 'usability' | 'performance' | 'other';
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;

  // 関連情報
  affectedFeature?: string;
  stepsToReproduce?: string;
  expectedBehavior?: string;
  actualBehavior?: string;

  // スクリーンショット・添付ファイル
  attachments?: string[];

  // ステータス
  status: 'new' | 'acknowledged' | 'in_progress' | 'resolved' | 'closed';
  priority: 'p0' | 'p1' | 'p2' | 'p3';

  // 対応情報
  assignedTo?: string;
  resolution?: string;
  resolvedAt?: string;

  createdAt: string;
  updatedAt: string;
}

/**
 * 改善バックログ
 */
export interface ImprovementBacklog {
  id: string;

  // バックログ情報
  title: string;
  description: string;
  category: 'feature' | 'enhancement' | 'bug_fix' | 'technical_debt' | 'documentation';

  // 優先度・見積もり
  priority: 'critical' | 'high' | 'medium' | 'low';
  estimatedEffort: 'xs' | 's' | 'm' | 'l' | 'xl'; // Tシャツサイズ見積もり
  businessValue: number; // 1-10スケール

  // 関連情報
  relatedFeedbackIds: string[];
  affectedClinics: string[];

  // ステータス
  status: 'backlog' | 'planned' | 'in_progress' | 'completed' | 'cancelled';
  milestone?: string;

  // 実装情報
  assignedTo?: string;
  startedAt?: string;
  completedAt?: string;

  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

/**
 * 重大インシデント
 */
export interface CriticalIncident {
  id: string;

  // インシデント情報
  title: string;
  description: string;
  severity: 'p0' | 'p1' | 'p2' | 'p3';
  category: 'security' | 'data_loss' | 'service_outage' | 'performance' | 'other';

  // 影響範囲
  affectedClinics: string[];
  affectedUsers: number;
  impactDescription: string;

  // 対応状況
  status: 'detected' | 'investigating' | 'mitigating' | 'resolved' | 'post_mortem';
  detectedAt: string;
  acknowledgedAt?: string;
  resolvedAt?: string;

  // 対応チーム
  incidentCommander?: string;
  assignedTeam: string[];

  // 根本原因と対策
  rootCause?: string;
  mitigationSteps?: string[];
  preventionMeasures?: string[];

  createdAt: string;
  updatedAt: string;
}

/**
 * Go/No-Go判定資料
 */
export interface GoNoGoDecision {
  id: string;

  // 判定期間
  evaluationPeriod: {
    start: string;
    end: string;
  };

  // 参加ベータ院
  participatingClinics: {
    clinicId: string;
    clinicName: string;
    usageMetrics: BetaUsageMetrics;
  }[];

  // 成功基準評価
  successCriteria: {
    // KPIダッシュボード閲覧率: 主要ユーザの80%が週2回以上アクセス
    dashboardAccessRate: {
      target: number;
      actual: number;
      status: 'pass' | 'fail' | 'warning';
      comment: string;
    };

    // 日報登録完了率: 稼働院の90%以上が営業日当日に登録
    dailyReportCompletionRate: {
      target: number;
      actual: number;
      status: 'pass' | 'fail' | 'warning';
      comment: string;
    };

    // 重大インシデントゼロ
    criticalIncidents: {
      target: number;
      actual: number;
      status: 'pass' | 'fail' | 'warning';
      incidents: CriticalIncident[];
    };

    // CSフィードバック: ベータ参加院の満足度4.0/5.0以上
    customerSatisfaction: {
      target: number;
      actual: number;
      status: 'pass' | 'fail' | 'warning';
      responses: number;
      comment: string;
    };
  };

  // 三者レビュー
  stakeholderReviews: {
    customerSuccess: {
      reviewer: string;
      decision: 'go' | 'no-go' | 'conditional';
      reasoning: string;
      concerns: string[];
      recommendations: string[];
      reviewedAt: string;
    };
    technical: {
      reviewer: string;
      decision: 'go' | 'no-go' | 'conditional';
      reasoning: string;
      concerns: string[];
      recommendations: string[];
      reviewedAt: string;
    };
    security: {
      reviewer: string;
      decision: 'go' | 'no-go' | 'conditional';
      reasoning: string;
      concerns: string[];
      recommendations: string[];
      reviewedAt: string;
    };
  };

  // 最終判定
  finalDecision: 'go' | 'no-go' | 'conditional';
  decisionRationale: string;
  conditions?: string[];

  // フォローアップ計画
  followUpPlan?: {
    immediateActions: string[];
    shortTermActions: string[];
    longTermActions: string[];
  };

  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

/**
 * ベータ運用レポート（2週間）
 */
export interface BetaTwoWeekReport {
  id: string;

  // レポート期間
  reportPeriod: {
    start: string;
    end: string;
    weekNumber: number;
  };

  // 活用状況サマリー
  usageSummary: {
    totalClinics: number;
    activeClinics: number;
    totalUsers: number;
    activeUsers: number;
    aggregatedMetrics: BetaUsageMetrics;
  };

  // 改善要望
  improvementRequests: {
    total: number;
    byCategory: Record<string, number>;
    topRequests: BetaFeedback[];
  };

  // 重大不具合
  criticalIssues: {
    total: number;
    resolved: number;
    pending: number;
    issues: CriticalIncident[];
  };

  // 成功事例
  successStories: {
    clinicId: string;
    clinicName: string;
    story: string;
    metrics: Partial<BetaUsageMetrics>;
  }[];

  // 課題と対策
  challengesAndActions: {
    challenge: string;
    impact: string;
    proposedAction: string;
    priority: 'high' | 'medium' | 'low';
  }[];

  createdAt: string;
  createdBy: string;
}

/**
 * MVPローンチ後フォローアップ計画
 */
export interface PostMVPFollowUpPlan {
  id: string;

  // 改善バックログ
  improvementBacklog: {
    immediate: ImprovementBacklog[]; // 1ヶ月以内
    shortTerm: ImprovementBacklog[]; // 1-3ヶ月
    longTerm: ImprovementBacklog[]; // 3ヶ月以降
  };

  // サポート体制
  supportStructure: {
    // サポートチーム
    team: {
      role: string;
      members: string[];
      responsibilities: string[];
    }[];

    // サポートチャネル
    channels: {
      type: 'email' | 'chat' | 'phone' | 'in_person';
      availability: string;
      responseTimeSLA: string;
    }[];

    // オンコール体制
    onCallSchedule: {
      level: 'p0' | 'p1' | 'p2' | 'p3';
      schedule: string;
      escalationPath: string[];
    };
  };

  // モニタリング計画
  monitoringPlan: {
    metrics: string[];
    frequency: string;
    alertThresholds: Record<string, number>;
    reviewCadence: string;
  };

  // トレーニング計画
  trainingPlan: {
    initialTraining: {
      target: string;
      duration: string;
      materials: string[];
    };
    ongoingTraining: {
      frequency: string;
      topics: string[];
    };
  };

  // コミュニケーション計画
  communicationPlan: {
    regularUpdates: {
      frequency: string;
      channel: string;
      stakeholders: string[];
    };
    releaseNotes: {
      frequency: string;
      channel: string;
    };
  };

  createdAt: string;
  updatedAt: string;
  createdBy: string;
}
