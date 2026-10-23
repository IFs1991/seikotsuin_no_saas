/**
 * 公開前の承認台帳・Works料金データ・公開文言の禁止事項
 * 仕様: Tiramisu共通サイト・LP統合 v2.0（A35〜A39, A42〜A46）
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  checkReleaseItem,
  decideRelease,
  evaluateReleaseReadiness,
  isProductionOrigin,
  isPublishableEmail,
  operatorProfile,
  publicSiteOrigin,
  publishableValue,
  releaseCheckItems,
  worksClaims,
  type ReleaseCheckItem,
} from '@/components/public/release-readiness';
import {
  worksGovernanceItems,
  worksNotProvided,
  worksPlans,
  worksServices,
  worksUseCases,
} from '@/components/public/works-content';
import { planItems } from '@/components/public/lp-content';

describe('公開前判定（A44/A46）', () => {
  it('現状の台帳では公開不可と判定し、公開に必要な残件を列挙する', () => {
    const result = evaluateReleaseReadiness();
    expect(result.ready).toBe(false);
    const ledgers = new Set(result.blocking.map(item => item.ledger));
    for (const ledger of [
      'B01',
      'B02',
      'B03',
      'B04',
      'B05',
      'B06',
      'B07',
      'B08',
      'B09',
    ]) {
      expect(ledgers.has(ledger as ReleaseCheckItem['ledger'])).toBe(true);
    }
    // プラグイン申請（B10）は公開判定とは別に扱う。
    expect(result.blocking.some(item => item.ledger === 'B10')).toBe(false);
    expect(result.deferred.map(item => item.ledger)).toEqual(['B10']);
  });

  // 成功系は架空のテスト値だけを使う（実在の事業者情報は使わない）。
  const fictitiousValues: Record<string, string> = {
    'operator-name': '（テスト用）架空の事業者名',
    'operator-brand': '（テスト用）架空のブランド',
    'contact-alternative': 'contact@fictional-tiramisu-test.co.jp',
    'operator-disclosure-text': '（テスト用）開示方針の文面',
    'public-origin': 'https://lp.fictional-tiramisu-test.co.jp',
  };
  const approveAll = (
    overrides: Record<string, string | null> = {}
  ): ReleaseCheckItem[] =>
    releaseCheckItems.map(item => ({
      ...item,
      status: 'approved_for_publication' as const,
      ...(item.requiredValue
        ? {
            requiredValue: {
              ...item.requiredValue,
              value:
                item.id in overrides
                  ? overrides[item.id]
                  : (fictitiousValues[item.id] ?? null),
            },
          }
        : {}),
    }));

  it('必須の実値を持つ項目は氏名・メール・origin・ブランド・開示方針の5件', () => {
    expect(
      releaseCheckItems
        .filter(item => item.requiredValue)
        .map(item => [item.id, item.requiredValue?.kind])
    ).toEqual([
      ['operator-name', 'text'],
      ['operator-brand', 'text'],
      ['contact-alternative', 'email'],
      ['operator-disclosure-text', 'text'],
      ['public-origin', 'origin'],
    ]);
    // 実値は台帳の値をそのまま参照し、別の値を持たない。
    const byId = new Map(releaseCheckItems.map(item => [item.id, item]));
    expect(byId.get('operator-name')?.requiredValue?.value).toBe(
      operatorProfile.name.value
    );
    expect(byId.get('contact-alternative')?.requiredValue?.value).toBe(
      operatorProfile.publicEmail.value
    );
    expect(byId.get('public-origin')?.requiredValue?.value).toBe(
      publicSiteOrigin.value
    );
  });

  it('全項目が公開承認済みで必須の実値も有効なら公開前条件を満たす', () => {
    const result = evaluateReleaseReadiness(approveAll());
    expect(result).toEqual({ ready: true, blocking: [], deferred: [] });
    expect(decideRelease(result, [])).toBe('READY_FOR_RELEASE');
  });

  it.each([
    ['氏名が null', 'operator-name', null],
    ['氏名が空文字', 'operator-name', ''],
    ['氏名が空白のみ', 'operator-name', ' \u3000\t'],
    ['公開メールが null', 'contact-alternative', null],
    ['公開メールが不正な形式', 'contact-alternative', 'not-an-email'],
    ['公開メールが例示ドメイン', 'contact-alternative', 'info@example.com'],
    ['本番originが null', 'public-origin', null],
    [
      '本番originが http',
      'public-origin',
      'http://lp.fictional-tiramisu-test.co.jp',
    ],
    ['本番originが不正なURL', 'public-origin', 'https//lp'],
    ['本番originが画像の仮ドメイン', 'public-origin', 'https://tiramisu.jp'],
    [
      '本番originが仮ドメインのサブドメイン',
      'public-origin',
      'https://www.tiramisu.jp',
    ],
    [
      '本番originがテンプレートの仮ドメイン',
      'public-origin',
      'https://your-app.vercel.app',
    ],
    [
      '本番originが資格情報付き',
      'public-origin',
      'https://user:pass@lp.fictional-tiramisu-test.co.jp',
    ],
    [
      '本番originがパス付き',
      'public-origin',
      'https://lp.fictional-tiramisu-test.co.jp/works',
    ],
    ['本番originが例示ドメイン', 'public-origin', 'https://example.com'],
    ['本番originが localhost', 'public-origin', 'https://localhost:3000'],
    ['本番originがIPアドレス', 'public-origin', 'https://127.0.0.1'],
  ])('全ステータス承認済みでも%sなら公開不可', (_label, id, value) => {
    const result = evaluateReleaseReadiness(approveAll({ [id]: value }));
    expect(result.ready).toBe(false);
    expect(result.blocking.map(item => item.id)).toEqual([id]);
    const blocked = result.blocking[0];
    expect(checkReleaseItem(blocked)).toMatchObject({
      approved: true,
      satisfied: false,
    });
    expect(checkReleaseItem(blocked).valueProblem).toEqual(expect.any(String));
    expect(decideRelease(result, [])).toBe('RELEASE_BLOCKED');
  });

  it('台帳が承認済みでも確認エラー（フォームURL・ビルド出力）があれば公開不可', () => {
    const result = evaluateReleaseReadiness(approveAll());
    expect(decideRelease(result, ['form-url'])).toBe('RELEASE_BLOCKED');
  });

  it('現状の台帳は公開不可で、未承認を承認済みとして扱わない', () => {
    const result = evaluateReleaseReadiness();
    expect(decideRelease(result, [])).toBe('RELEASE_BLOCKED');
    expect(
      releaseCheckItems.filter(
        item => item.status === 'approved_for_publication'
      )
    ).toEqual([]);
  });

  it('本番originとメールの検証は正当な値を受け入れる', () => {
    expect(isProductionOrigin('https://lp.fictional-tiramisu-test.co.jp')).toBe(
      true
    );
    expect(
      isProductionOrigin('https://lp.fictional-tiramisu-test.co.jp/')
    ).toBe(true);
    expect(
      isProductionOrigin('https://lp.fictional-tiramisu-test.co.jp?x=1')
    ).toBe(false);
    expect(isPublishableEmail('contact@fictional-tiramisu-test.co.jp')).toBe(
      true
    );
  });

  it('公開用の値は公開承認済みかつ空でない場合だけ返す', () => {
    expect(
      publishableValue({ value: '（テスト用）値', status: 'confirmed' })
    ).toBeNull();
    expect(
      publishableValue({ value: '  ', status: 'approved_for_publication' })
    ).toBeNull();
    expect(
      publishableValue({
        value: ' （テスト用）値 ',
        status: 'approved_for_publication',
      })
    ).toBe('（テスト用）値');
  });

  it('未承認の個人情報・未確定のoriginを値として持たない（A43/A45）', () => {
    expect(operatorProfile.name.value).toBeNull();
    expect(operatorProfile.publicEmail.value).toBeNull();
    expect(publicSiteOrigin.value).toBeNull();
    // 所在地・電話番号は方針文だけを持ち、実値の欄を設けない。
    expect(Object.keys(operatorProfile)).toEqual([
      'businessType',
      'name',
      'brand',
      'addressAndPhonePolicy',
      'publicEmail',
    ]);
    expect(operatorProfile.addressAndPhonePolicy.value).not.toMatch(/\d{2,}/);
  });
});

describe('Works 公開主張の管理表（A39, B05）', () => {
  const claimIds = new Set(worksClaims.map(claim => claim.claimId));

  it('Works LPの機能記述はすべて管理表に対応する', () => {
    const usedIds = [
      ...worksUseCases.map(item => item.claimId),
      ...worksServices.map(item => item.claimId),
      ...worksGovernanceItems.map(item => item.claimId),
      worksNotProvided.claimId,
    ];
    for (const id of usedIds) {
      expect(claimIds.has(id)).toBe(true);
    }
  });

  it('公開承認済みの主張は確認者と本番E2E確認日を持つ', () => {
    for (const claim of worksClaims) {
      if (claim.status === 'approved_for_publication') {
        expect(claim.reviewer).not.toBeNull();
        expect(claim.lastProductionE2eOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  it('Instagramは対応中、会計・Google マップ等は未提供として扱う', () => {
    const instagram = worksServices.find(item => item.name === 'Instagram');
    expect(instagram?.availability).toBe('in-progress');
    expect(instagram?.detail).toContain('現在は提供していません');
    for (const service of worksServices) {
      expect(service.name).not.toMatch(/会計|Google|freee|Square/);
    }
    expect(worksNotProvided.items.join('、')).toMatch(/会計・売上データの参照/);
    expect(worksNotProvided.items.join('、')).toMatch(
      /Google マップ・Google ビジネス プロフィール/
    );
  });
});

describe('Works料金（A35〜A38）', () => {
  it('3プランの月額・初期費用が2026-10-22の税別暫定価格と一致する', () => {
    expect(
      worksPlans.map(plan => ({
        key: plan.key,
        monthly: plan.monthlyFeeYen,
        initial: plan.initialFeeYen,
      }))
    ).toEqual([
      { key: 'light', monthly: 19800, initial: 49800 },
      { key: 'standard', monthly: 29800, initial: 100000 },
      { key: 'pro', monthly: 49800, initial: 150000 },
    ]);
  });

  it('主力として扱うのは Standard だけ', () => {
    expect(
      worksPlans.filter(plan => plan.featured).map(plan => plan.key)
    ).toEqual(['standard']);
  });

  it('OS料金（planItems）は Works料金で上書きされていない（A40）', () => {
    expect(
      planItems.map(plan => [
        plan.name,
        plan.monthlyPrice,
        plan.initialCost,
        plan.stores,
        plan.extraStore,
      ])
    ).toEqual([
      [
        'Group Starter',
        '¥78,000',
        '¥300,000〜',
        '5店舗まで',
        '6店舗目以降 ¥8,000/月',
      ],
      [
        'Group Standard',
        '¥128,000',
        '¥300,000〜¥500,000',
        '10店舗まで',
        '11店舗目以降 ¥8,000/月',
      ],
      ['Enterprise', '¥198,000〜', '¥500,000〜', '20店舗以上', '個別見積'],
    ]);
  });
});

describe('公開文言の禁止事項（A36〜A39, A42）', () => {
  const root = process.cwd();
  // 新しい公開ページとWorks・共通の表示データ（移設したOS LPの既存表現は B09 で別途確認）。
  const files = [
    'src/app/(public)/page.tsx',
    'src/app/(public)/works/page.tsx',
    'src/app/(public)/contact/page.tsx',
    'src/app/(public)/legal/page.tsx',
    'src/components/public/marketing-content.ts',
    'src/components/public/works-content.ts',
    'src/components/public/product-cards.tsx',
    'src/components/public/product-selector.tsx',
    'src/components/public/marketing-header.tsx',
    'src/components/public/marketing-footer.tsx',
  ];
  // 設計意図を説明するコメントは対象外にし、表示されうる文字列だけを検査する。
  const stripComments = (text: string) =>
    text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const sources = files.map(file => ({
    file,
    text: stripComments(fs.readFileSync(path.join(root, file), 'utf8')),
  }));

  it.each([
    ['実績のない人気表示', /人気|No\.1|ナンバーワン|最多/],
    ['架空の利用枠・無制限', /無制限|使い放題|[0-9,]+件/],
    ['未確定のサポート時間・SLA', /SLA|24時間|365日|営業日以内/],
    ['旧PoC・旧高価格案', /90日|30万円|300,000円|5万〜8万|50,000円〜/],
    ['根拠のない無料・公認・保証', /無料|追加費用なし|AI利用料ゼロ|公認|必ず/],
    ['画像の仮ドメイン・架空の導線', /tiramisu\.jp|導入事例|資料請求/],
    ['飲食業全般への拡張', /飲食/],
  ])('%s を含まない', (_label, pattern) => {
    for (const source of sources) {
      expect({
        file: source.file,
        match: source.text.match(pattern)?.[0],
      }).toEqual({ file: source.file, match: undefined });
    }
  });
});
