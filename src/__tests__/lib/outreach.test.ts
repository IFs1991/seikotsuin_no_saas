import {
  createOutreachDraft,
  fetchDormantCandidates,
  OutreachDraftValidationError,
  resolveDormantCandidateDateRange,
} from '@/lib/outreach';

const CLINIC_ID = '11111111-1111-4111-8111-111111111111';
const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';
const CAMPAIGN_ID = '33333333-3333-4333-8333-333333333333';

type QueryResult<T> = {
  data: T | null;
  error: { message: string } | null;
};

type CustomerCandidateRow = {
  id: string;
  name: string;
  last_visit_date: string | null;
  total_visits: number | null;
  lifetime_value: number | null;
  line_display_name: string | null;
};

type CustomerRecipientRow = {
  id: string;
  name: string;
  last_visit_date: string | null;
  line_user_id: string | null;
};

function createCandidateQuery(rows: CustomerCandidateRow[]) {
  const query = {
    eq: jest.fn(() => query),
    not: jest.fn(() => query),
    gte: jest.fn(() => query),
    lte: jest.fn(() => query),
    order: jest.fn(() => query),
    limit: jest.fn(() => query),
    returns: jest.fn(
      async (): Promise<QueryResult<CustomerCandidateRow[]>> => ({
        data: rows,
        error: null,
      })
    ),
  };

  return query;
}

function createRecipientCustomerQuery(rows: CustomerRecipientRow[]) {
  const query = {
    eq: jest.fn(() => query),
    not: jest.fn(() => query),
    gte: jest.fn(() => query),
    lte: jest.fn(() => query),
    in: jest.fn(() => query),
    returns: jest.fn(
      async (): Promise<QueryResult<CustomerRecipientRow[]>> => ({
        data: rows,
        error: null,
      })
    ),
  };

  return query;
}

function createDraftClient(rows: CustomerRecipientRow[]) {
  const customerQuery = createRecipientCustomerQuery(rows);
  const campaignInsert = jest.fn();
  const recipientInsert = jest.fn(async () => ({ error: null }));
  const single = jest.fn(async () => ({
    data: {
      id: CAMPAIGN_ID,
      status: 'draft',
      created_at: '2026-07-06T00:00:00.000Z',
    },
    error: null,
  }));
  const campaignSelect = jest.fn(() => ({ single }));

  campaignInsert.mockReturnValue({ select: campaignSelect });

  const from = jest.fn((table: string) => {
    if (table === 'customers') {
      return {
        select: jest.fn(() => customerQuery),
      };
    }
    if (table === 'patient_outreach_campaigns') {
      return {
        insert: campaignInsert,
      };
    }
    if (table === 'patient_outreach_recipients') {
      return {
        insert: recipientInsert,
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    client: { from },
    customerQuery,
    campaignInsert,
    recipientInsert,
  };
}

describe('outreach dormant segment', () => {
  it('resolves the dormant last-visit window in JST calendar days', () => {
    const range = resolveDormantCandidateDateRange(
      30,
      60,
      new Date('2026-07-06T00:00:00.000Z')
    );

    expect(range).toEqual({
      today: '2026-07-06',
      dateFrom: '2026-05-07',
      dateTo: '2026-06-06',
    });
  });

  it('fetches only clinic-scoped marketing-consented LINE candidates', async () => {
    const query = createCandidateQuery([
      {
        id: CUSTOMER_ID,
        name: '休眠 太郎',
        last_visit_date: '2026-05-20',
        total_visits: 4,
        lifetime_value: 32000,
        line_display_name: 'LINE太郎',
      },
    ]);
    const from = jest.fn((table: string) => {
      if (table !== 'customers') {
        throw new Error(`Unexpected table: ${table}`);
      }
      return { select: jest.fn(() => query) };
    });

    const result = await fetchDormantCandidates(
      { from },
      { clinic_id: CLINIC_ID, days_from: 30, days_to: 60 },
      new Date('2026-07-06T00:00:00.000Z')
    );

    expect(query.eq).toHaveBeenCalledWith('clinic_id', CLINIC_ID);
    expect(query.eq).toHaveBeenCalledWith('consent_marketing', true);
    expect(query.not).toHaveBeenCalledWith('line_user_id', 'is', null);
    expect(query.gte).toHaveBeenCalledWith('last_visit_date', '2026-05-07');
    expect(query.lte).toHaveBeenCalledWith('last_visit_date', '2026-06-06');
    expect(result.candidates).toEqual([
      {
        customer_id: CUSTOMER_ID,
        name: '休眠 太郎',
        last_visit_date: '2026-05-20',
        days_since_last_visit: 47,
        total_visits: 4,
        lifetime_value: 32000,
        line_display_name: 'LINE太郎',
      },
    ]);
  });

  it('rejects draft creation when selected customers are no longer eligible', async () => {
    const fixture = createDraftClient([]);

    await expect(
      createOutreachDraft(
        fixture.client,
        {
          clinic_id: CLINIC_ID,
          name: '休眠フォロー',
          days_from: 30,
          days_to: 60,
          message_body: '{{name}}さん、ご予約をお待ちしています。',
          customer_ids: [CUSTOMER_ID],
        },
        'user-1',
        new Date('2026-07-06T00:00:00.000Z')
      )
    ).rejects.toBeInstanceOf(OutreachDraftValidationError);

    expect(fixture.campaignInsert).not.toHaveBeenCalled();
    expect(fixture.recipientInsert).not.toHaveBeenCalled();
  });

  it('creates a draft campaign and pending recipients after server-side recheck', async () => {
    const fixture = createDraftClient([
      {
        id: CUSTOMER_ID,
        name: '休眠 太郎',
        last_visit_date: '2026-05-20',
        line_user_id: 'U111',
      },
    ]);

    const result = await createOutreachDraft(
      fixture.client,
      {
        clinic_id: CLINIC_ID,
        name: '休眠フォロー',
        days_from: 30,
        days_to: 60,
        message_body: '{{name}}さん、ご予約をお待ちしています。',
        customer_ids: [CUSTOMER_ID],
      },
      'user-1',
      new Date('2026-07-06T00:00:00.000Z')
    );

    expect(fixture.customerQuery.eq).toHaveBeenCalledWith(
      'consent_marketing',
      true
    );
    expect(fixture.customerQuery.not).toHaveBeenCalledWith(
      'line_user_id',
      'is',
      null
    );
    expect(fixture.campaignInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        clinic_id: CLINIC_ID,
        status: 'draft',
        message_body: '{{name}}さん、ご予約をお待ちしています。',
        created_by: 'user-1',
      })
    );
    expect(fixture.recipientInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        campaign_id: CAMPAIGN_ID,
        clinic_id: CLINIC_ID,
        customer_id: CUSTOMER_ID,
        line_user_id: 'U111',
        delivery_status: 'pending',
      }),
    ]);
    expect(result).toEqual({
      campaign_id: CAMPAIGN_ID,
      status: 'draft',
      selected_count: 1,
      created_at: '2026-07-06T00:00:00.000Z',
    });
  });
});
