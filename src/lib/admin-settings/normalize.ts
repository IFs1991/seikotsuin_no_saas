/**
 * 管理設定 — communication カテゴリの正規化
 * PR-05: route.ts から分離
 *
 * legacy flat 形式（emailEnabled が top-level）と
 * nested 形式（channels.emailEnabled）の両方を受け付け、
 * 統一された { channels, smtpSettings, templates } 形式に正規化する。
 *
 * smtpSettings.password は出力に含めない（非保存契約）。
 * smtpSettings.user は username へ吸収する。
 */

import { DEFAULT_SETTINGS } from './defaults';

type SettingsRecord = Record<string, unknown>;

const asRecord = (value: unknown): SettingsRecord | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as SettingsRecord)
    : null;

const readString = (value: unknown, fallback: string) =>
  typeof value === 'string' ? value : fallback;

const readBoolean = (value: unknown, fallback: boolean) =>
  typeof value === 'boolean' ? value : fallback;

const readNumber = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const getDefaultCommunicationSettings = () =>
  structuredClone(DEFAULT_SETTINGS.communication) as {
    channels: {
      emailEnabled: boolean;
      smsEnabled: boolean;
      lineEnabled: boolean;
      pushEnabled: boolean;
    };
    smtpSettings: {
      host: string;
      port: number;
      username: string;
      secure: boolean;
    };
    templates: unknown[];
  };

export const normalizeCommunicationSettings = (value: unknown) => {
  const defaults = getDefaultCommunicationSettings();
  const record = asRecord(value) ?? {};
  const channels = asRecord(record.channels);
  const smtpSettings = asRecord(record.smtpSettings);

  return {
    channels: {
      emailEnabled: readBoolean(
        channels?.emailEnabled ?? record.emailEnabled,
        defaults.channels.emailEnabled
      ),
      smsEnabled: readBoolean(
        channels?.smsEnabled ?? record.smsEnabled,
        defaults.channels.smsEnabled
      ),
      lineEnabled: readBoolean(
        channels?.lineEnabled ?? record.lineEnabled,
        defaults.channels.lineEnabled
      ),
      pushEnabled: readBoolean(
        channels?.pushEnabled ?? record.pushEnabled,
        defaults.channels.pushEnabled
      ),
    },
    smtpSettings: {
      host: readString(smtpSettings?.host, defaults.smtpSettings.host),
      port: readNumber(smtpSettings?.port, defaults.smtpSettings.port),
      username: readString(
        smtpSettings?.username ?? smtpSettings?.user,
        defaults.smtpSettings.username
      ),
      secure: readBoolean(smtpSettings?.secure, defaults.smtpSettings.secure),
    },
    templates: Array.isArray(record.templates)
      ? record.templates
      : defaults.templates,
  };
};
