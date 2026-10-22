// 公開サイト（共通トップ・Works／OS LP・問い合わせ・法務）の公開前判定に使う静的な承認台帳。
//
// - 値は公開してよいものだけを入れる。未確定・未承認は null とし、架空の値で埋めない。
// - 事業者の氏名は回答済みだが、公開用原稿への掲載確認前のため非公開の原本だけで管理する。
// - 所在地・電話番号の実値はここを含むリポジトリのどこにも入れない（請求時に個別提供する運用）。
// - サーバー側（公開ページの描画と公開前チェック）からだけ参照し、client componentへ渡さない。
// - build や本番リクエスト処理では判定しない。公開前にリリース担当が
//   `npm run public-site:release-check` で明示的に実行する。
//
// 状態の意味:
//   missing                  未決定・未入手
//   draft                    文案・実装はあるが、事業者の確認前
//   confirmed                事業者が事実として確認済み（公開・掲載の承認は未了）
//   approved_for_publication 公開・掲載まで承認済み

export type PublicationStatus =
  | 'missing'
  | 'draft'
  | 'confirmed'
  | 'approved_for_publication';

export interface PublishableField {
  value: string | null;
  status: PublicationStatus;
}

// 参照画像・テンプレートに含まれる仮のドメイン。公開物・承認値のどちらにも使ってはいけない。
export const PLACEHOLDER_DOMAINS: readonly string[] = [
  'tiramisu.jp',
  'your-app.vercel.app',
];
// 例示・試験用に予約されたドメイン（RFC 2606 / 6761）。本番の値として承認しない。
const RESERVED_DOMAINS = ['example.com', 'example.net', 'example.org'];
const RESERVED_TLDS = ['test', 'example', 'invalid', 'localhost', 'local'];

function isNonProductionHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  const matches = (domain: string) =>
    host === domain || host.endsWith(`.${domain}`);
  if ([...PLACEHOLDER_DOMAINS, ...RESERVED_DOMAINS].some(matches)) return true;
  const labels = host.split('.');
  if (labels.length < 2) return true;
  if (RESERVED_TLDS.includes(labels[labels.length - 1])) return true;
  // IPアドレス（IPv4・角括弧付きIPv6）は公開originとして扱わない。
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[');
}

export function isPublishableText(value: string | null): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isPublishableEmail(value: string | null): boolean {
  if (!isPublishableText(value)) return false;
  const match = /^[^\s@]+@([^\s@]+\.[^\s@]+)$/.exec(value.trim());
  return match !== null && !isNonProductionHost(match[1]);
}

// 本番originは https・資格情報なし・パスや query なしの origin だけを認める。
export function isProductionOrigin(value: string | null): boolean {
  if (!isPublishableText(value)) return false;
  const trimmed = value.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return false;
  }
  return (
    url.protocol === 'https:' &&
    url.username === '' &&
    url.password === '' &&
    url.pathname === '/' &&
    url.search === '' &&
    url.hash === '' &&
    (trimmed === url.origin || trimmed === `${url.origin}/`) &&
    !isNonProductionHost(url.hostname)
  );
}

// 公開ページで表示してよい値。公開承認済みで空でない値だけを返し、それ以外は null。
export function publishableValue(field: PublishableField): string | null {
  return field.status === 'approved_for_publication' &&
    isPublishableText(field.value)
    ? field.value.trim()
    : null;
}

export interface OperatorProfile {
  businessType: PublishableField;
  name: PublishableField;
  brand: PublishableField;
  addressAndPhonePolicy: PublishableField;
  publicEmail: PublishableField;
}

// /legal・/contact で使う運営者情報。value が null の項目は「公開前に確定」と表示する。
export const operatorProfile: OperatorProfile = {
  businessType: { value: '個人事業主', status: 'confirmed' },
  name: { value: null, status: 'confirmed' },
  brand: {
    value: 'Tiramisu（サービスブランド。屋号の届出・商標の登録状況は確認中）',
    status: 'draft',
  },
  addressAndPhonePolicy: {
    value:
      '所在地および電話番号は、ご請求に応じて遅滞なく電子メール等でお知らせします。お申し込み前にもご請求いただけます。「事業者情報の開示請求」からお問い合わせください。',
    status: 'draft',
  },
  publicEmail: { value: null, status: 'missing' },
};

// 正式な本番origin。未確認の間は null のままにし、metadataBase・絶対URLを仮造りしない。
export const publicSiteOrigin: PublishableField = {
  value: null,
  status: 'missing',
};

export interface WorksClaim {
  claimId: string;
  feature: string;
  requirement: string;
  evidence: string;
  enablement: string;
  /** 本番環境でのE2E確認日（YYYY-MM-DD）。未確認は null */
  lastProductionE2eOn: string | null;
  /** 確認者。未確認は null */
  reviewer: string | null;
  status: PublicationStatus;
}

const WORKS_REFERENCE =
  'IFs1991/TiramisuWorks_setup_module HEAD 20f38e2 のREADME・plugin/skills/setup/SKILL.md（コードを実行・取込せず参照のみ）';

// 公開主張の管理表。Works LP の各記述は claimId でここに対応する。
// 「コードはあるが運用フラグOFF・E2E未確認」は一般提供機能として扱わない。
export const worksClaims: readonly WorksClaim[] = [
  {
    claimId: 'works-entry-chatgpt',
    feature: 'ChatGPTを入口にした依頼',
    requirement:
      'MCP OAuth接続、対応するChatGPTプラン・環境（顧客標準はPlusとされている）',
    evidence: `${WORKS_REFERENCE}: OAuth接続・本人/組織/接続の確認手順`,
    enablement: '未確認（本番の公開設定・審査状況を未照合）',
    lastProductionE2eOn: null,
    reviewer: null,
    status: 'draft',
  },
  {
    claimId: 'works-slack',
    feature: 'Slackでの依頼・承認の連絡',
    requirement:
      'Slackの本人対応付け、店舗ごとの承認チャンネル、運用flagと組織binding',
    evidence: `${WORKS_REFERENCE}: Slack Approval Bridgeは既定停止、実Slack検証は別ゲート`,
    enablement: '既定停止（運用flag OFF）',
    lastProductionE2eOn: null,
    reviewer: null,
    status: 'draft',
  },
  {
    claimId: 'works-line',
    feature: 'LINE公式アカウント向け文面の下書き・承認',
    requirement:
      'LINE公式アカウント、Slack本人対応付け、配信Workflow、宛先と同意',
    evidence: `${WORKS_REFERENCE}: LINE本文案の本人承認に必要な設定、Broadcastは既定Grant外`,
    enablement: '未確認（Connectorは configuration_required）',
    lastProductionE2eOn: null,
    reviewer: null,
    status: 'draft',
  },
  {
    claimId: 'works-line-draft',
    feature: '連絡文の下書きと承認（ユースケース）',
    requirement: 'works-line と同じ',
    evidence: `${WORKS_REFERENCE}`,
    enablement: '未確認',
    lastProductionE2eOn: null,
    reviewer: null,
    status: 'draft',
  },
  {
    claimId: 'works-reservation',
    feature: '予約サービスとの連携',
    requirement: '対象サービスごとの契約・Sandbox/本番接続',
    evidence: `${WORKS_REFERENCE}: Square予約はSandbox実装、実接続は未検証`,
    enablement: '未確認',
    lastProductionE2eOn: null,
    reviewer: null,
    status: 'draft',
  },
  {
    claimId: 'works-instagram',
    feature: 'Instagram（対応中・未提供として表示）',
    requirement: 'Provider審査（approval_required）',
    evidence: `${WORKS_REFERENCE}: InstagramのMCP公開連携は未対応`,
    enablement: '未提供',
    lastProductionE2eOn: null,
    reviewer: null,
    status: 'draft',
  },
  {
    claimId: 'works-not-provided',
    feature:
      '現在提供していないもの（会計・売上参照、Google マップ／GBP、画像・動画公開、決済・返金）',
    requirement: '-',
    evidence:
      '2026-10-22 事業者決定（未実装として提供済み訴求から除外）、Works README',
    enablement: '未提供',
    lastProductionE2eOn: null,
    reviewer: null,
    status: 'draft',
  },
  {
    claimId: 'works-approval-flow',
    feature: '依頼と承認の流れ（ユースケース）',
    requirement: '承認者・権限の設定',
    evidence: `${WORKS_REFERENCE}: Approval Payload Hash、承認後の実行`,
    enablement: '未確認',
    lastProductionE2eOn: null,
    reviewer: null,
    status: 'draft',
  },
  {
    claimId: 'works-records',
    feature: '作業の記録（ユースケース）',
    requirement: '対象の組織・店舗の設定',
    evidence: `${WORKS_REFERENCE}: append-only Audit`,
    enablement: '未確認',
    lastProductionE2eOn: null,
    reviewer: null,
    status: 'draft',
  },
  {
    claimId: 'works-scope-check',
    feature: '対象の組織・店舗の確認',
    requirement: 'OAuth接続',
    evidence: `${WORKS_REFERENCE}: get_profile／list_organizations／list_connections`,
    enablement: '未確認',
    lastProductionE2eOn: null,
    reviewer: null,
    status: 'draft',
  },
  {
    claimId: 'works-approval-boundary',
    feature: 'ChatGPT側の許可設定を承認の代わりにしない',
    requirement: '-',
    evidence: `${WORKS_REFERENCE}: App Permissionsをサーバー認可や本人承認の代わりにしない`,
    enablement: '未確認',
    lastProductionE2eOn: null,
    reviewer: null,
    status: 'draft',
  },
  {
    claimId: 'works-audit-records',
    feature: '依頼・承認・実行の記録',
    requirement: '-',
    evidence: `${WORKS_REFERENCE}: append-only Audit`,
    enablement: '未確認',
    lastProductionE2eOn: null,
    reviewer: null,
    status: 'draft',
  },
  {
    claimId: 'works-limitations',
    feature: '仕組みの限界（外部障害・結果確認・保証しない旨）',
    requirement: '-',
    evidence: `${WORKS_REFERENCE}: outcome_unknown は自動再送せず確認を求める`,
    enablement: '-',
    lastProductionE2eOn: null,
    reviewer: null,
    status: 'draft',
  },
];

export type LedgerId =
  | 'B01'
  | 'B02'
  | 'B03'
  | 'B04'
  | 'B05'
  | 'B06'
  | 'B07'
  | 'B08'
  | 'B09'
  | 'B10';

export type RequiredValueKind = 'text' | 'email' | 'origin';

export interface RequiredValue {
  kind: RequiredValueKind;
  value: string | null;
}

export interface ReleaseCheckItem {
  id: string;
  ledger: LedgerId;
  label: string;
  status: PublicationStatus;
  /** 承認に加えて実値が必要な項目。承認状態だけでは公開可能にしない */
  requiredValue?: RequiredValue;
  /** release: 公開サイトの公開に必要／plugin-submission: 後続のプラグイン申請に必要 */
  requiredFor: 'release' | 'plugin-submission';
  nextAction: string;
}

// 公開前の残件・承認台帳（仕様書 第17章 B01〜B10 と、移設したOS LPの再承認項目）。
export const releaseCheckItems: readonly ReleaseCheckItem[] = [
  {
    id: 'operator-name',
    ledger: 'B01',
    label: '事業者の氏名の法務本文への掲載',
    status: operatorProfile.name.status,
    requiredValue: { kind: 'text', value: operatorProfile.name.value },
    requiredFor: 'release',
    nextAction:
      '回答済みの氏名を再収集せず、公開用原稿への掲載を事業者が承認したら operatorProfile.name に反映する',
  },
  {
    id: 'operator-brand',
    ledger: 'B01',
    label: '屋号・ブランド表記',
    status: operatorProfile.brand.status,
    requiredValue: { kind: 'text', value: operatorProfile.brand.value },
    requiredFor: 'release',
    nextAction: 'Tiramisu の表記（屋号かサービスブランドか）を事業者が確認する',
  },
  {
    id: 'contact-form-operation',
    ledger: 'B02',
    label: 'Googleフォームの現物・受信・通知・担当・返信手段',
    status: 'missing',
    requiredFor: 'release',
    nextAction:
      '設問・通知先・ログイン要否を現物確認する。試験送信は別途承認を得てから行う',
  },
  {
    id: 'contact-alternative',
    ledger: 'B02',
    label: 'フォームが使えない場合の代替窓口・公開用業務メール',
    status: operatorProfile.publicEmail.status,
    requiredValue: { kind: 'email', value: operatorProfile.publicEmail.value },
    requiredFor: 'release',
    nextAction: '公開してよい業務用の連絡手段を事業者が決める',
  },
  {
    id: 'operator-disclosure-operation',
    ledger: 'B03',
    label: '所在地・電話番号の請求時開示の運用（受付から返信まで）',
    status: 'missing',
    requiredFor: 'release',
    nextAction:
      '非公開の原本、通知先、担当、返信に使う業務メールを決め、契約前の請求から返信までを限定試験する',
  },
  {
    id: 'operator-disclosure-text',
    ledger: 'B03',
    label: '所在地・電話番号の開示方針の掲載文',
    status: operatorProfile.addressAndPhonePolicy.status,
    requiredValue: {
      kind: 'text',
      value: operatorProfile.addressAndPhonePolicy.value,
    },
    requiredFor: 'release',
    nextAction: '運用確認のあと、掲載文を事業者が承認する',
  },
  {
    id: 'public-origin',
    ledger: 'B04',
    label: '正式な本番origin（canonical・metadataBase・申請URL）',
    status: publicSiteOrigin.status,
    requiredValue: { kind: 'origin', value: publicSiteOrigin.value },
    requiredFor: 'release',
    nextAction:
      '既存設定から本番originを確認し、metadataBaseと絶対canonicalを確定する（画像の仮ドメインは使わない）',
  },
  {
    id: 'works-claims',
    ledger: 'B05',
    label: 'Works LPの機能記述（公開主張の管理表）',
    status: worksClaims.every(
      claim => claim.status === 'approved_for_publication'
    )
      ? 'approved_for_publication'
      : 'draft',
    requiredFor: 'release',
    nextAction:
      '各claimの実装・有効化・本番E2Eの根拠を照合し、確認者と確認日を記録する',
  },
  {
    id: 'works-plan-scope',
    ledger: 'B06',
    label:
      'プランの利用範囲（課金単位・接続・業務・利用者・実行枠・追加料金・支援上限）',
    status: 'missing',
    requiredFor: 'release',
    nextAction: '事業者が決める。決まるまで料金カードは定性的な説明に留める',
  },
  {
    id: 'works-pricing-publication',
    ledger: 'B07',
    label: 'Works料金（暫定固定・税別）の掲載文言と販売条件',
    status: 'confirmed',
    requiredFor: 'release',
    nextAction: '金額・掲載文言・販売条件を事業者が最終承認する',
  },
  {
    id: 'subscription-terms',
    ledger: 'B07',
    label: 'サブスク条件（支払・期間・更新・解約・返金・税表記）',
    status: 'missing',
    requiredFor: 'release',
    nextAction:
      '製品別に確定し、LP・規約・運営者情報・申込導線を一致させる。解約を電話だけに限定しない',
  },
  {
    id: 'data-handling',
    ledger: 'B08',
    label: '製品別のデータ取扱い（実フロー・保持・削除・委託・送信先）',
    status: 'missing',
    requiredFor: 'release',
    nextAction: '実データフローを調査し、プライバシーポリシーの本文を確定する',
  },
  {
    id: 'legal-approval',
    ledger: 'B09',
    label: '利用規約・プライバシーポリシー・運営者情報の最終承認',
    status: 'draft',
    requiredFor: 'release',
    nextAction:
      '事業者と必要な専門家が確認する。特商法表示の要否は実際の販売方法から判断する',
  },
  {
    id: 'os-migrated-claims',
    ledger: 'B09',
    label:
      '移設したOS LPの既存表現（料金・税表記、削減試算、単店舗プラン、導入検討エリア、資料請求の提供物）',
    status: 'draft',
    requiredFor: 'release',
    nextAction:
      '移設を再承認とみなさず、根拠を確認して掲載可否を事業者が判断する',
  },
  {
    id: 'plugin-submission',
    ledger: 'B10',
    label: 'プラグイン申請の4URL・公開者・審査資料',
    status: 'missing',
    requiredFor: 'plugin-submission',
    nextAction: '本番URLの検証後に別タスクで確認する（今回は申請しない）',
  },
];

const requiredValueChecks: Record<
  RequiredValueKind,
  { isValid: (value: string | null) => boolean; problem: string }
> = {
  text: { isValid: isPublishableText, problem: '値が未設定または空です' },
  email: {
    isValid: isPublishableEmail,
    problem: '公開用メールアドレスが未設定または不正な形式です',
  },
  origin: {
    isValid: isProductionOrigin,
    problem:
      '本番originが未設定、または https の正式なoriginではありません（仮ドメイン・資格情報・パスを含む値は不可）',
  },
};

export interface ReleaseItemCheck {
  approved: boolean;
  /** 実値が要件を満たさない場合の理由（値そのものは含めない） */
  valueProblem: string | null;
  satisfied: boolean;
}

// 1項目の判定。公開承認と必須の実値の両方を満たした場合だけ satisfied。
export function checkReleaseItem(item: ReleaseCheckItem): ReleaseItemCheck {
  const approved = item.status === 'approved_for_publication';
  let valueProblem: string | null = null;
  if (item.requiredValue) {
    const check = requiredValueChecks[item.requiredValue.kind];
    if (!check.isValid(item.requiredValue.value)) valueProblem = check.problem;
  }
  return { approved, valueProblem, satisfied: approved && !valueProblem };
}

export interface ReleaseReadinessResult {
  ready: boolean;
  blocking: ReleaseCheckItem[];
  deferred: ReleaseCheckItem[];
}

export function evaluateReleaseReadiness(
  items: readonly ReleaseCheckItem[] = releaseCheckItems
): ReleaseReadinessResult {
  const pending = items.filter(item => !checkReleaseItem(item).satisfied);
  const blocking = pending.filter(item => item.requiredFor === 'release');
  const deferred = pending.filter(
    item => item.requiredFor === 'plugin-submission'
  );
  return { ready: blocking.length === 0, blocking, deferred };
}

export type ReleaseVerdict = 'READY_FOR_RELEASE' | 'RELEASE_BLOCKED';

// 公開前チェックの最終判定。承認台帳と、公開前チェックで見つかった確認エラー
// （フォームURLの不正、ビルド出力の仮ドメイン・非公開文字列など）を合わせて決める唯一の箇所。
export function decideRelease(
  result: ReleaseReadinessResult,
  checkErrors: readonly string[]
): ReleaseVerdict {
  return result.ready && checkErrors.length === 0
    ? 'READY_FOR_RELEASE'
    : 'RELEASE_BLOCKED';
}
