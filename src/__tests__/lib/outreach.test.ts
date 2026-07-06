import {
  createOutreachDraft,
  fetchDormantCandidates,
  markOutreachRecipientBooked,
  OutreachDraftValidationError,
  resolveDormantCandidateDateRange,
  resolveOutreachAttribution,
  sendOutreachCampaign,
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
  line_user_id: string | null;
};

type CustomerRecipientRow = {
  id: string;
  name: string;
  last_visit_date: string | null;
  line_user_id: string | null;
};

type FailedLineOutboxRow = {
  line_user_id: string;
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

function createFailedLineQuery(rows: FailedLineOutboxRow[]) {
  const query = {
    eq: jest.fn(() => query),
    gte: jest.fn(() => query),
    in: jest.fn(() => query),
    returns: jest.fn(
      async (): Promise<QueryResult<FailedLineOutboxRow[]>> => ({
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

type OutreachRecipientFixture = {
  id: string;
  campaign_id: string;
  clinic_id: string;
  customer_id: string;
  line_user_id: string;
  delivery_status: string;
  booked_reservation_id: string | null;
  sent_at: string | null;
};

type CustomerSendFixture = {
  id: string;
  name: string;
  line_user_id: string | null;
  consent_marketing: boolean | null;
  is_deleted: boolean | null;
};

type CampaignFixture = {
  id: string;
  clinic_id: string;
  name: string;
  status: string;
  message_body: string;
  created_at: string;
  sent_at: string | null;
};

type FrequencyFixture = {
  campaign_id: string;
  customer_id: string;
  sent_at: string | null;
};

function createRowsQuery<T>(rows: T[]) {
  const query = {
    eq: jest.fn(() => query),
    neq: jest.fn(() => query),
    not: jest.fn(() => query),
    gte: jest.fn(() => query),
    in: jest.fn(() => query),
    returns: jest.fn(
      async (): Promise<QueryResult<T[]>> => ({ data: rows, error: null })
    ),
  };

  return query;
}

function createSendClient(params: {
  campaign: CampaignFixture;
  recipients: OutreachRecipientFixture[];
  customers: CustomerSendFixture[];
  recentRecipients?: FrequencyFixture[];
}) {
  const recipientQuery = createRowsQuery(params.recipients);
  const recentQuery = createRowsQuery(params.recentRecipients ?? []);
  const customerQuery = createRowsQuery(params.customers);
  const campaignMaybeSingle = jest.fn(
    async (): Promise<QueryResult<CampaignFixture>> => ({
      data: params.campaign,
      error: null,
    })
  );
  const campaignReturns = jest.fn(() => ({
    maybeSingle: campaignMaybeSingle,
  }));
  const campaignUpdateChain = {
    eq: jest.fn(() => campaignUpdateChain),
    select: jest.fn(() => ({
      returns: campaignReturns,
    })),
  };
  const campaignUpdate = jest.fn(() => campaignUpdateChain);
  const resetCampaignUpdateChain = {
    eq: jest.fn(() => resetCampaignUpdateChain),
    then<TResult1 = QueryResult<null>, TResult2 = never>(
      onfulfilled?:
        | ((value: QueryResult<null>) => TResult1 | PromiseLike<TResult1>)
        | null,
      onrejected?:
        | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
        | null
    ): PromiseLike<TResult1 | TResult2> {
      return Promise.resolve({ data: null, error: null }).then(
        onfulfilled ?? undefined,
        onrejected ?? undefined
      );
    },
  };
  const outboxInsert = jest.fn(async () => ({ error: null }));
  const recipientUpdateChain = {
    eq: jest.fn(() => recipientUpdateChain),
    in: jest.fn(async () => ({ error: null })),
  };
  const recipientUpdate = jest.fn(() => recipientUpdateChain);

  const from = jest.fn((table: string) => {
    if (table === 'patient_outreach_recipients') {
      return {
        select: jest.fn((columns: string) =>
          columns === 'campaign_id, customer_id, sent_at'
            ? recentQuery
            : recipientQuery
        ),
        update: recipientUpdate,
      };
    }
    if (table === 'customers') {
      return { select: jest.fn(() => customerQuery) };
    }
    if (table === 'patient_outreach_campaigns') {
      return {
        update: (update: unknown) => {
          if (
            typeof update === 'object' &&
            update !== null &&
            'status' in update &&
            update.status === 'draft'
          ) {
            return resetCampaignUpdateChain;
          }
          return campaignUpdate(update);
        },
      };
    }
    if (table === 'line_message_outbox') {
      return { insert: outboxInsert };
    }
    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    client: { from },
    recipientQuery,
    recentQuery,
    customerQuery,
    campaignUpdate,
    outboxInsert,
    recipientUpdate,
  };
}

function createAttributionClient(params: {
  campaignFound: boolean;
  recipientFound: boolean;
}) {
  const campaignQuery = {
    eq: jest.fn(() => campaignQuery),
    limit: jest.fn(() => campaignQuery),
    returns: jest.fn(
      async (): Promise<QueryResult<Array<{ id: string }>>> => ({
        data: params.campaignFound ? [{ id: CAMPAIGN_ID }] : [],
        error: null,
      })
    ),
  };
  const recipientQuery = {
    eq: jest.fn(() => recipientQuery),
    is: jest.fn(() => recipientQuery),
    limit: jest.fn(() => recipientQuery),
    returns: jest.fn(
      async (): Promise<QueryResult<Array<{ id: string }>>> => ({
        data: params.recipientFound ? [{ id: 'recipient-001' }] : [],
        error: null,
      })
    ),
  };
  const recipientUpdateChain = {
    eq: jest.fn(() => recipientUpdateChain),
    is: jest.fn(async () => ({ error: null })),
  };
  const recipientUpdate = jest.fn(() => recipientUpdateChain);

  const from = jest.fn((table: string) => {
    if (table === 'patient_outreach_campaigns') {
      return { select: jest.fn(() => campaignQuery) };
    }
    if (table === 'patient_outreach_recipients') {
      return {
        select: jest.fn(() => recipientQuery),
        update: recipientUpdate,
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    client: { from },
    campaignQuery,
    recipientQuery,
    recipientUpdate,
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
        line_user_id: 'U111',
      },
    ]);
    const failedLineQuery = createFailedLineQuery([{ line_user_id: 'U111' }]);
    const from = jest.fn((table: string) => {
      if (table === 'customers') {
        return { select: jest.fn(() => query) };
      }
      if (table === 'line_message_outbox') {
        return { select: jest.fn(() => failedLineQuery) };
      }
      throw new Error(`Unexpected table: ${table}`);
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
    expect(failedLineQuery.eq).toHaveBeenCalledWith('message_type', 'outreach');
    expect(failedLineQuery.eq).toHaveBeenCalledWith('status', 'failed');
    expect(failedLineQuery.gte).toHaveBeenCalledWith('attempts', 3);
    expect(result.candidates).toEqual([
      {
        customer_id: CUSTOMER_ID,
        name: '休眠 太郎',
        last_visit_date: '2026-05-20',
        days_since_last_visit: 47,
        total_visits: 4,
        lifetime_value: 32000,
        line_display_name: 'LINE太郎',
        line_delivery_warning: true,
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

  it('sends a draft campaign by enqueuing outreach LINE messages', async () => {
    const fixture = createSendClient({
      campaign: {
        id: CAMPAIGN_ID,
        clinic_id: CLINIC_ID,
        name: '休眠フォロー',
        status: 'draft',
        message_body: '{{name}}さん、ご予約をお待ちしています。',
        created_at: '2026-07-06T00:00:00.000Z',
        sent_at: null,
      },
      recipients: [
        {
          id: 'recipient-001',
          campaign_id: CAMPAIGN_ID,
          clinic_id: CLINIC_ID,
          customer_id: CUSTOMER_ID,
          line_user_id: 'U111',
          delivery_status: 'pending',
          booked_reservation_id: null,
          sent_at: null,
        },
      ],
      customers: [
        {
          id: CUSTOMER_ID,
          name: '休眠 太郎',
          line_user_id: 'U111',
          consent_marketing: true,
          is_deleted: false,
        },
      ],
    });

    const result = await sendOutreachCampaign(
      fixture.client,
      {
        clinicId: CLINIC_ID,
        campaignId: CAMPAIGN_ID,
        appUrl: 'https://app.example.com',
      },
      new Date('2026-07-06T00:00:00.000Z')
    );

    expect(result).toEqual({
      campaign_id: CAMPAIGN_ID,
      status: 'sent',
      enqueued_count: 1,
      sent_at: '2026-07-06T00:00:00.000Z',
    });
    expect(fixture.outboxInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        clinic_id: CLINIC_ID,
        line_user_id: 'U111',
        message_type: 'outreach',
        status: 'pending',
        payload: expect.objectContaining({
          text: expect.stringContaining('休眠 太郎さん'),
          confirmationUrl: `https://app.example.com/booking/${CLINIC_ID}?c=${CAMPAIGN_ID}`,
          outreach: {
            campaignId: CAMPAIGN_ID,
            recipientId: 'recipient-001',
            customerId: CUSTOMER_ID,
          },
        }),
      }),
    ]);
    expect(fixture.recipientUpdate).toHaveBeenCalledWith({
      delivery_status: 'pending',
      sent_at: '2026-07-06T00:00:00.000Z',
    });
  });

  it('rejects outreach send when the same patient was contacted within 30 days', async () => {
    const fixture = createSendClient({
      campaign: {
        id: CAMPAIGN_ID,
        clinic_id: CLINIC_ID,
        name: '休眠フォロー',
        status: 'draft',
        message_body: '{{name}}さん、ご予約をお待ちしています。',
        created_at: '2026-07-06T00:00:00.000Z',
        sent_at: null,
      },
      recipients: [
        {
          id: 'recipient-001',
          campaign_id: CAMPAIGN_ID,
          clinic_id: CLINIC_ID,
          customer_id: CUSTOMER_ID,
          line_user_id: 'U111',
          delivery_status: 'pending',
          booked_reservation_id: null,
          sent_at: null,
        },
      ],
      customers: [
        {
          id: CUSTOMER_ID,
          name: '休眠 太郎',
          line_user_id: 'U111',
          consent_marketing: true,
          is_deleted: false,
        },
      ],
      recentRecipients: [
        {
          campaign_id: '55555555-5555-4555-8555-555555555555',
          customer_id: CUSTOMER_ID,
          sent_at: '2026-06-20T00:00:00.000Z',
        },
      ],
    });

    await expect(
      sendOutreachCampaign(
        fixture.client,
        {
          clinicId: CLINIC_ID,
          campaignId: CAMPAIGN_ID,
          appUrl: 'https://app.example.com',
        },
        new Date('2026-07-06T00:00:00.000Z')
      )
    ).rejects.toBeInstanceOf(OutreachDraftValidationError);

    expect(fixture.campaignUpdate).not.toHaveBeenCalled();
    expect(fixture.outboxInsert).not.toHaveBeenCalled();
  });

  it('resolves attribution only when campaign and recipient match the customer', async () => {
    const fixture = createAttributionClient({
      campaignFound: true,
      recipientFound: true,
    });

    const attribution = await resolveOutreachAttribution(fixture.client, {
      clinicId: CLINIC_ID,
      campaignId: CAMPAIGN_ID,
      customerId: CUSTOMER_ID,
    });

    expect(attribution).toEqual({
      campaignId: CAMPAIGN_ID,
      recipientId: 'recipient-001',
    });
    expect(fixture.recipientQuery.eq).toHaveBeenCalledWith(
      'customer_id',
      CUSTOMER_ID
    );

    await markOutreachRecipientBooked(fixture.client, {
      clinicId: CLINIC_ID,
      campaignId: CAMPAIGN_ID,
      recipientId: 'recipient-001',
      reservationId: 'reservation-001',
    });
    expect(fixture.recipientUpdate).toHaveBeenCalledWith({
      booked_reservation_id: 'reservation-001',
    });
  });

  it('does not attribute when recipient lookup fails', async () => {
    const fixture = createAttributionClient({
      campaignFound: true,
      recipientFound: false,
    });

    await expect(
      resolveOutreachAttribution(fixture.client, {
        clinicId: CLINIC_ID,
        campaignId: CAMPAIGN_ID,
        customerId: CUSTOMER_ID,
      })
    ).resolves.toBeNull();
  });
});
