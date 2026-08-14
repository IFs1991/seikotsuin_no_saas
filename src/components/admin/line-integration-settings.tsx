'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  Check,
  CheckCircle2,
  Clipboard,
  ExternalLink,
  KeyRound,
  Loader2,
  MessageCircle,
  ShieldCheck,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button, buttonClassName } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

type SetupStatus = 'prepared' | 'verified' | 'consumed' | 'expired' | 'revoked';

type LineSetupState = {
  credentials: {
    app_type: 'mini_app' | 'liff';
    bot_display_name: string | null;
    bot_picture_url: string | null;
    is_active: boolean;
    messaging_channel_id: string;
    oa_basic_id: string | null;
    provider_identity_verified_at: string | null;
    setup_completed_at: string | null;
    webhook_verified_at: string | null;
  } | null;
  encryption_ready: boolean;
  features: {
    line_booking_enabled: boolean;
    line_chat_enabled: boolean;
    line_notification_enabled: boolean;
  };
  setup: {
    endpointUrl: string;
    expires_at: string;
    id: string;
    public_jwk: unknown;
    public_key_kid: string | null;
    provider_identity_verified: boolean;
    redirectUrl: string;
    status: SetupStatus;
    webhookUrl: string;
  } | null;
};

type ChatSettings = {
  auto_reply_enabled: boolean;
  auto_reply_message: string;
  line_chat_enabled: boolean;
  retention_days: number;
  webhook_verified: boolean;
};

type VerifyForm = {
  appEndpointId: string;
  appType: 'mini_app' | 'liff';
  channelSecret: string;
  liffId: string;
  loginChannelId: string;
  messagingChannelId: string;
  providerConfigurationConfirmed: boolean;
  publicKeyKid: string;
  testIdToken: string;
  testLineUserId: string;
};

const INITIAL_FORM: VerifyForm = {
  appEndpointId: '',
  appType: 'mini_app',
  channelSecret: '',
  liffId: '',
  loginChannelId: '',
  messagingChannelId: '',
  providerConfigurationConfirmed: false,
  publicKeyKid: '',
  testIdToken: '',
  testLineUserId: '',
};

const STEPS = ['準備', 'LINE Console設定', '接続確認', '有効化'] as const;

export function LineIntegrationSettings({
  clinicId,
}: {
  clinicId?: string | null;
}) {
  const [state, setState] = useState<LineSetupState | null>(null);
  const [chatSettings, setChatSettings] = useState<ChatSettings | null>(null);
  const [form, setForm] = useState<VerifyForm>(INITIAL_FORM);
  const [enableBooking, setEnableBooking] = useState(false);
  const [enableNotifications, setEnableNotifications] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    setError(null);
    try {
      const [setup, chat] = await Promise.all([
        apiRequest<LineSetupState>(
          `/api/admin/line-setup?clinic_id=${encodeURIComponent(clinicId)}`
        ),
        apiRequest<ChatSettings>(
          `/api/admin/line-chat/settings?clinic_id=${encodeURIComponent(clinicId)}`
        ),
      ]);
      setState(setup);
      setChatSettings(chat);
      setEnableBooking(
        setup.setup ? false : setup.features.line_booking_enabled
      );
      setEnableNotifications(
        setup.setup ? false : setup.features.line_notification_enabled
      );
    } catch (requestError) {
      setError(toErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [clinicId]);

  useEffect(() => {
    void load();
  }, [load]);

  const currentStep = useMemo(() => {
    if (state?.credentials?.setup_completed_at) return 4;
    if (state?.setup?.status === 'verified') return 4;
    if (state?.setup?.status === 'prepared') return 2;
    return 1;
  }, [state]);

  const run = async (action: () => Promise<void>) => {
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (requestError) {
      setError(toErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  };

  const prepare = () =>
    run(async () => {
      if (!clinicId) return;
      const result = await apiRequest<LineSetupState>('/api/admin/line-setup', {
        method: 'POST',
        body: JSON.stringify({ clinic_id: clinicId }),
      });
      setState(result);
      setEnableBooking(false);
      setEnableNotifications(false);
      setNotice(
        '公開鍵と登録URLを準備しました。次はLINE Consoleで登録します。'
      );
    });

  const verify = () =>
    run(async () => {
      if (!clinicId || !state?.setup) return;
      const result = await apiRequest<{
        pushTestSent: boolean;
        state: LineSetupState;
      }>('/api/admin/line-setup/verify', {
        method: 'POST',
        body: JSON.stringify({
          app_endpoint_id: emptyToNull(form.appEndpointId),
          app_type: form.appType,
          channel_secret: form.channelSecret,
          clinic_id: clinicId,
          liff_id: emptyToNull(form.liffId),
          login_channel_id: emptyToNull(form.loginChannelId),
          messaging_channel_id: form.messagingChannelId,
          provider_configuration_confirmed: form.providerConfigurationConfirmed,
          public_key_kid: form.publicKeyKid,
          setup_session_id: state.setup.id,
          test_id_token: emptyToNull(form.testIdToken),
          test_line_user_id: emptyToNull(form.testLineUserId),
        }),
      });
      setState(result.state);
      setForm(previous => ({
        ...previous,
        channelSecret: '',
        testIdToken: '',
      }));
      setNotice(
        result.pushTestSent
          ? 'Provider同一性の確認とテスト通知に成功しました。'
          : 'Messaging APIとLINE公式アカウント情報を確認しました。LINE予約は追加確認後に有効化できます。'
      );
    });

  const discardSetup = () =>
    run(async () => {
      if (!clinicId || !state?.setup) return;
      const result = await apiRequest<LineSetupState>('/api/admin/line-setup', {
        method: 'DELETE',
        body: JSON.stringify({
          clinic_id: clinicId,
          setup_session_id: state.setup.id,
        }),
      });
      setState(result);
      setForm(INITIAL_FORM);
      setEnableBooking(result.features.line_booking_enabled);
      setEnableNotifications(result.features.line_notification_enabled);
      setNotice('接続確認を破棄しました。新しい設定で準備し直せます。');
    });

  const complete = () =>
    run(async () => {
      if (!clinicId || !state?.setup) return;
      const result = await apiRequest<LineSetupState>(
        '/api/admin/line-setup/complete',
        {
          method: 'POST',
          body: JSON.stringify({
            clinic_id: clinicId,
            enable_booking: enableBooking,
            enable_notifications: enableNotifications,
            setup_session_id: state.setup.id,
          }),
        }
      );
      setState(result);
      setNotice('店舗のLINE連携を有効化しました。');
      await load();
    });

  const saveChatSettings = () =>
    run(async () => {
      if (!clinicId || !chatSettings) return;
      const result = await apiRequest<ChatSettings>(
        '/api/admin/line-chat/settings',
        {
          method: 'PATCH',
          body: JSON.stringify({ ...chatSettings, clinic_id: clinicId }),
        }
      );
      setChatSettings(previous =>
        previous ? { ...previous, ...result } : previous
      );
      setNotice('LINEチャット設定を保存しました。');
    });

  const saveFeatureSettings = () =>
    run(async () => {
      if (!clinicId) return;
      const result = await apiRequest<LineSetupState>('/api/admin/line-setup', {
        method: 'PATCH',
        body: JSON.stringify({
          clinic_id: clinicId,
          enable_booking: enableBooking,
          enable_notifications: enableNotifications,
        }),
      });
      setState(result);
      setNotice('LINE予約・通知の設定を保存しました。');
    });

  const copy = async (label: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(null), 2000);
  };

  if (!clinicId) {
    return (
      <Alert variant='medical-warning'>
        <AlertTitle>店舗を選択してください</AlertTitle>
        <AlertDescription>
          LINE連携は店舗ごとに独立して設定します。
        </AlertDescription>
      </Alert>
    );
  }

  if (loading) {
    return (
      <div className='flex items-center justify-center py-12 text-muted-foreground'>
        <Loader2 className='mr-2 h-5 w-5 animate-spin' />
        LINE連携設定を読み込んでいます
      </div>
    );
  }

  return (
    <div className='space-y-6' data-testid='line-integration-settings'>
      <SetupProgress currentStep={currentStep} />

      {error && (
        <Alert variant='medical-error'>
          <AlertTitle>処理できませんでした</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {notice && (
        <Alert variant='medical-success'>
          <CheckCircle2 className='h-4 w-4' />
          <AlertTitle>完了</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {!state?.encryption_ready && (
        <Alert variant='security-warning'>
          <ShieldCheck className='h-4 w-4' />
          <AlertTitle>管理者によるSecret設定が必要です</AlertTitle>
          <AlertDescription>
            LINE credential暗号化キーが未設定のため、接続準備を開始できません。
          </AlertDescription>
        </Alert>
      )}

      {!state?.setup && !state?.credentials?.setup_completed_at && (
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-xl'>
              <KeyRound className='h-5 w-5' />
              1. 接続の準備
            </CardTitle>
            <CardDescription>
              TiramisuがRSA鍵ペアを生成し、秘密鍵は暗号化して24時間だけ保管します。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={prepare}
              disabled={submitting || !state?.encryption_ready}
            >
              {submitting && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
              接続準備を始める
            </Button>
          </CardContent>
        </Card>
      )}

      {state?.setup && state.setup.status === 'prepared' && (
        <>
          <ConsoleRegistrationCard
            copied={copied}
            onCopy={copy}
            setup={state.setup}
          />
          <VerificationCard
            form={form}
            onChange={updates =>
              setForm(previous => ({ ...previous, ...updates }))
            }
            onVerify={verify}
            submitting={submitting}
          />
          <Card>
            <CardHeader>
              <CardTitle className='text-base'>
                入力内容を修正できない場合
              </CardTitle>
              <CardDescription>
                テスト通知の送信先やProvider設定を変更する場合は、この一時的な接続確認を破棄して新しい再試行キーで準備し直します。現在利用中のLINE連携には影響しません。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                type='button'
                variant='outline'
                onClick={discardSetup}
                disabled={submitting}
              >
                接続確認を破棄してやり直す
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      {state?.setup?.status === 'verified' && (
        <Card>
          <CardHeader>
            <div className='flex items-center justify-between gap-3'>
              <CardTitle className='text-xl'>4. 店舗で有効化</CardTitle>
              <Badge>Messaging API確認済み</Badge>
            </div>
            <CardDescription>
              利用する機能だけを選択してください。後から店舗単位で変更できます。
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-5'>
            <FeatureSwitch
              checked={enableBooking}
              description={
                state.setup.provider_identity_verified
                  ? '公開予約でLINE認証を利用します。'
                  : 'ID tokenとテスト送信先の同一性確認後に有効化できます。'
              }
              disabled={!state.setup.provider_identity_verified}
              label='LINE予約'
              onCheckedChange={setEnableBooking}
            />
            <FeatureSwitch
              checked={enableNotifications}
              description='予約通知や空き枠通知をLINEへ送信します。'
              label='LINE通知'
              onCheckedChange={setEnableNotifications}
            />
            <div className='rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground'>
              LINEチャットはWebhook受信確認後に有効化できます。まずはOFFで完了します。
            </div>
            <Button onClick={complete} disabled={submitting}>
              {submitting && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
              この内容で連携を有効化
            </Button>
            <div className='border-t pt-4'>
              <p className='mb-3 text-sm text-muted-foreground'>
                Provider設定やテスト通知先を修正する場合は、検証結果を破棄して新しい再試行キーで準備し直します。現在利用中のLINE連携には影響しません。
              </p>
              <Button
                type='button'
                variant='outline'
                onClick={discardSetup}
                disabled={submitting}
              >
                検証結果を破棄してやり直す
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {state?.credentials?.setup_completed_at && !state.setup && (
        <ConnectedSummary
          enableBooking={enableBooking}
          enableNotifications={enableNotifications}
          onBookingChange={setEnableBooking}
          onNotificationChange={setEnableNotifications}
          onSave={saveFeatureSettings}
          state={state}
          submitting={submitting}
        />
      )}

      {state?.credentials?.setup_completed_at &&
        !state.setup &&
        chatSettings && (
          <ChatSettingsCard
            settings={chatSettings}
            onChange={updates =>
              setChatSettings(previous =>
                previous ? { ...previous, ...updates } : previous
              )
            }
            onSave={saveChatSettings}
            submitting={submitting}
          />
        )}
    </div>
  );
}

function SetupProgress({ currentStep }: { currentStep: number }) {
  return (
    <Card>
      <CardContent className='pt-6'>
        <div className='mb-3 flex items-center justify-between gap-2 text-xs sm:text-sm'>
          {STEPS.map((step, index) => (
            <div
              className={
                index + 1 <= currentStep
                  ? 'font-medium text-primary'
                  : 'text-muted-foreground'
              }
              key={step}
            >
              {index + 1}. {step}
            </div>
          ))}
        </div>
        <Progress value={currentStep} max={4} className='h-2' />
      </CardContent>
    </Card>
  );
}

function ConsoleRegistrationCard({
  copied,
  onCopy,
  setup,
}: {
  copied: string | null;
  onCopy: (label: string, value: string) => Promise<void>;
  setup: NonNullable<LineSetupState['setup']>;
}) {
  const publicJwk = JSON.stringify(setup.public_jwk, null, 2);
  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-xl'>2. LINE Consoleで登録</CardTitle>
        <CardDescription>
          Provider・Messaging API channel・LINE MINI
          App（推奨）を同じProvider内に作成してください。 この操作はLINE
          Developers Consoleで手動実施します。
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-5'>
        <Alert variant='medical-info'>
          <AlertTitle>異なるProviderを混在させないでください</AlertTitle>
          <AlertDescription>
            LINE user
            IDの同一性はProvider境界に依存します。既存Providerを変更すると患者の明示的な再リンクが必要です。
          </AlertDescription>
        </Alert>
        <CopyField
          label='公開JWK'
          value={publicJwk}
          copied={copied}
          onCopy={onCopy}
          multiline
        />
        <CopyField
          label='Webhook URL'
          value={setup.webhookUrl}
          copied={copied}
          onCopy={onCopy}
        />
        <CopyField
          label='エンドポイントURL'
          value={setup.endpointUrl}
          copied={copied}
          onCopy={onCopy}
        />
        <CopyField
          label='リダイレクトURL'
          value={setup.redirectUrl}
          copied={copied}
          onCopy={onCopy}
        />
        <div className='flex flex-wrap items-center gap-3'>
          <a
            className={buttonClassName({ variant: 'outline' })}
            href='https://developers.line.biz/console/'
            target='_blank'
            rel='noreferrer'
          >
            LINE Developers Consoleを開く
            <ExternalLink className='ml-2 h-4 w-4' />
          </a>
          <span className='text-sm text-muted-foreground'>
            有効期限: {new Date(setup.expires_at).toLocaleString('ja-JP')}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function VerificationCard({
  form,
  onChange,
  onVerify,
  submitting,
}: {
  form: VerifyForm;
  onChange: (updates: Partial<VerifyForm>) => void;
  onVerify: () => void;
  submitting: boolean;
}) {
  const requiredReady =
    form.messagingChannelId.trim() &&
    form.channelSecret.trim() &&
    form.publicKeyKid.trim() &&
    form.loginChannelId.trim() &&
    form.liffId.trim() &&
    (form.appType === 'mini_app' ? form.appEndpointId.trim() : true) &&
    form.providerConfigurationConfirmed &&
    Boolean(form.testIdToken.trim()) === Boolean(form.testLineUserId.trim());
  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-xl'>3. 接続確認</CardTitle>
        <CardDescription>
          まずMessaging APIを確認します。LINE予約を使う場合は、ID
          tokenと同じ利用者へのテスト送信でProvider境界も確認します。
        </CardDescription>
      </CardHeader>
      <CardContent className='grid gap-5 md:grid-cols-2'>
        <Field label='Messaging API Channel ID' required>
          <Input
            aria-label='Messaging API Channel ID'
            value={form.messagingChannelId}
            onChange={event =>
              onChange({ messagingChannelId: event.target.value })
            }
          />
        </Field>
        <Field label='公開鍵KID' required>
          <Input
            aria-label='公開鍵KID'
            value={form.publicKeyKid}
            onChange={event => onChange({ publicKeyKid: event.target.value })}
          />
        </Field>
        <Field label='Channel secret' required>
          <Input
            aria-label='Channel secret'
            type='password'
            autoComplete='new-password'
            value={form.channelSecret}
            onChange={event => onChange({ channelSecret: event.target.value })}
          />
        </Field>
        <Field label='アプリ種別'>
          <select
            className='flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm'
            value={form.appType}
            onChange={event =>
              onChange({
                appType: event.target.value === 'liff' ? 'liff' : 'mini_app',
              })
            }
          >
            <option value='mini_app'>LINE MINI App（推奨）</option>
            <option value='liff'>既存LIFF</option>
          </select>
        </Field>
        <Field label='LINE Login / MINI App Channel ID' required>
          <Input
            aria-label='LINE Login / MINI App Channel ID'
            value={form.loginChannelId}
            onChange={event => onChange({ loginChannelId: event.target.value })}
          />
        </Field>
        <Field
          label={
            form.appType === 'mini_app'
              ? 'MINI App Endpoint ID'
              : 'LIFF Endpoint ID（任意）'
          }
          required={form.appType === 'mini_app'}
        >
          <Input
            aria-label={
              form.appType === 'mini_app'
                ? 'MINI App Endpoint ID'
                : 'LIFF Endpoint ID（任意）'
            }
            value={form.appEndpointId}
            onChange={event => onChange({ appEndpointId: event.target.value })}
          />
        </Field>
        <Field label='予約画面の実行用LIFF ID' required>
          <Input
            aria-label='予約画面の実行用LIFF ID'
            value={form.liffId}
            onChange={event => onChange({ liffId: event.target.value })}
          />
          <p className='text-xs text-muted-foreground'>
            MINI Appを選んだ場合も、予約画面をLINE内で初期化するLIFF
            IDを入力します。
          </p>
        </Field>
        <Field label='テスト送信先LINE user ID（LINE予約を使う場合）'>
          <Input
            placeholder='Uから始まる33文字'
            value={form.testLineUserId}
            onChange={event => onChange({ testLineUserId: event.target.value })}
          />
        </Field>
        <Field label='LINE Login ID token（LINE予約を使う場合）'>
          <Input
            type='password'
            autoComplete='off'
            value={form.testIdToken}
            onChange={event => onChange({ testIdToken: event.target.value })}
          />
        </Field>
        <div className='md:col-span-2 rounded-md border bg-muted/30 p-4'>
          <label className='flex items-start gap-3 text-sm'>
            <input
              aria-label='Provider構成を確認しました'
              className='mt-1 h-4 w-4 rounded border-input'
              type='checkbox'
              checked={form.providerConfigurationConfirmed}
              onChange={event =>
                onChange({
                  providerConfigurationConfirmed: event.target.checked,
                })
              }
            />
            <span>
              Messaging API、LINE Login / MINI
              Appを同じProviderで作成し、Channel secretがこのMessaging
              APIチャネルの値であることを確認しました。
            </span>
          </label>
        </div>
        <div className='md:col-span-2'>
          <Button onClick={onVerify} disabled={submitting || !requiredReady}>
            {submitting && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
            Messaging APIを確認
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ConnectedSummary({
  enableBooking,
  enableNotifications,
  onBookingChange,
  onNotificationChange,
  onSave,
  state,
  submitting,
}: {
  enableBooking: boolean;
  enableNotifications: boolean;
  onBookingChange: (value: boolean) => void;
  onNotificationChange: (value: boolean) => void;
  onSave: () => void;
  state: LineSetupState;
  submitting: boolean;
}) {
  const credentials = state.credentials;
  if (!credentials) return null;
  return (
    <Card>
      <CardHeader>
        <div className='flex items-center justify-between gap-3'>
          <CardTitle className='flex items-center gap-2 text-xl'>
            <CheckCircle2 className='h-5 w-5 text-green-600' />
            LINE連携済み
          </CardTitle>
          <Badge>有効化済み</Badge>
        </div>
        <CardDescription>
          {credentials.bot_display_name ?? 'LINE公式アカウント'}（
          {credentials.oa_basic_id ?? 'Basic ID未取得'}）
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-5'>
        <FeatureSwitch
          checked={enableBooking}
          description={
            credentials.provider_identity_verified_at
              ? '公開予約でLINE認証を利用します。'
              : 'Provider同一性の確認がない接続では有効化できません。再接続時にID token確認を行ってください。'
          }
          disabled={!credentials.provider_identity_verified_at}
          label='LINE予約'
          onCheckedChange={onBookingChange}
        />
        <FeatureSwitch
          checked={enableNotifications}
          description='予約通知や空き枠通知をLINEへ送信します。'
          label='LINE通知'
          onCheckedChange={onNotificationChange}
        />
        <div className='flex items-center justify-between rounded-md border p-4 text-sm'>
          <span>LINEチャット</span>
          <Badge variant='outline'>
            {state.features.line_chat_enabled ? 'ON' : 'OFF'}
          </Badge>
        </div>
        <Button onClick={onSave} disabled={submitting}>
          {submitting && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
          LINE予約・通知設定を保存
        </Button>
      </CardContent>
    </Card>
  );
}

function ChatSettingsCard({
  settings,
  onChange,
  onSave,
  submitting,
}: {
  settings: ChatSettings;
  onChange: (updates: Partial<ChatSettings>) => void;
  onSave: () => void;
  submitting: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2 text-xl'>
          <MessageCircle className='h-5 w-5' />
          LINEチャット設定
        </CardTitle>
        <CardDescription>
          本文保持期間と固定受付文を店舗単位で管理します。
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-5'>
        <FeatureSwitch
          checked={settings.line_chat_enabled}
          description={
            settings.webhook_verified
              ? '店舗の会話受信・返信を有効にします。'
              : 'Webhookの受信確認後に有効化できます。'
          }
          disabled={!settings.webhook_verified}
          label='LINEチャット'
          onCheckedChange={value => onChange({ line_chat_enabled: value })}
        />
        <FeatureSwitch
          checked={settings.auto_reply_enabled}
          description='同一患者へ24時間に最大1回、固定受付文を送ります。'
          label='固定受付文の自動返信'
          onCheckedChange={value => onChange({ auto_reply_enabled: value })}
        />
        <Field label='固定受付文'>
          <Textarea
            rows={4}
            maxLength={1000}
            value={settings.auto_reply_message}
            onChange={event =>
              onChange({ auto_reply_message: event.target.value })
            }
          />
        </Field>
        <Field label='メッセージ本文の保持日数（1〜365日）'>
          <Input
            type='number'
            min={1}
            max={365}
            value={settings.retention_days}
            onChange={event =>
              onChange({ retention_days: Number(event.target.value) })
            }
          />
        </Field>
        <Button onClick={onSave} disabled={submitting}>
          {submitting && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
          チャット設定を保存
        </Button>
      </CardContent>
    </Card>
  );
}

function CopyField({
  label,
  value,
  copied,
  onCopy,
  multiline = false,
}: {
  label: string;
  value: string;
  copied: string | null;
  onCopy: (label: string, value: string) => Promise<void>;
  multiline?: boolean;
}) {
  return (
    <Field label={label}>
      <div className='flex items-start gap-2'>
        {multiline ? (
          <Textarea
            readOnly
            rows={7}
            value={value}
            className='font-mono text-xs'
          />
        ) : (
          <Input readOnly value={value} />
        )}
        <Button
          type='button'
          variant='outline'
          size='sm'
          onClick={() => void onCopy(label, value)}
          aria-label={`${label}をコピー`}
        >
          {copied === label ? (
            <Check className='h-4 w-4' />
          ) : (
            <Clipboard className='h-4 w-4' />
          )}
        </Button>
      </div>
    </Field>
  );
}

function FeatureSwitch({
  checked,
  description,
  disabled = false,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  description: string;
  disabled?: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className='flex items-center justify-between gap-4 rounded-md border p-4'>
      <div>
        <div className='font-medium'>{label}</div>
        <div className='text-sm text-muted-foreground'>{description}</div>
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        aria-label={label}
      />
    </div>
  );
}

function Field({
  children,
  label,
  required = false,
}: {
  children: ReactNode;
  label: string;
  required?: boolean;
}) {
  return (
    <div className='space-y-2'>
      <Label>
        {label}
        {required && <span className='ml-1 text-destructive'>*</span>}
      </Label>
      {children}
    </div>
  );
}

async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== 'object')
    throw new Error('APIレスポンスが不正です');
  const envelope = payload as {
    data?: unknown;
    error?: unknown;
    success?: unknown;
  };
  if (!response.ok || envelope.success !== true) {
    throw new Error(
      typeof envelope.error === 'string' ? envelope.error : '処理に失敗しました'
    );
  }
  return envelope.data as T;
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '処理に失敗しました';
}
