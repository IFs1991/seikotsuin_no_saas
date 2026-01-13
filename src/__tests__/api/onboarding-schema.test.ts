/**
 * オンボーディングZodスキーマ単体テスト
 *
 * TDDサイクル:
 * 1. RED: スキーマ実装前にテスト作成（失敗）
 * 2. GREEN: スキーマ実装後にテスト成功
 */

import { describe, expect, it } from '@jest/globals';
import {
  profileUpdateSchema,
  clinicCreateSchema,
  staffInviteSchema,
  seedMasterSchema,
  type ProfileUpdateDTO,
  type ClinicCreateDTO,
  type StaffInviteDTO,
  type SeedMasterDTO,
} from '@/app/api/onboarding/schema';

describe('Onboarding Schemas', () => {
  // ================================================================
  // profileUpdateSchema
  // ================================================================
  describe('profileUpdateSchema', () => {
    it('有効なプロフィールデータを受け入れる', () => {
      const result = profileUpdateSchema.safeParse({
        full_name: '山田太郎',
        phone_number: '090-1234-5678',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.full_name).toBe('山田太郎');
        expect(result.data.phone_number).toBe('090-1234-5678');
      }
    });

    it('空の氏名を拒否する', () => {
      const result = profileUpdateSchema.safeParse({
        full_name: '',
      });

      expect(result.success).toBe(false);
    });

    it('空白のみの氏名を拒否する', () => {
      const result = profileUpdateSchema.safeParse({
        full_name: '   ',
      });

      expect(result.success).toBe(false);
    });

    it('phone_numberはオプショナル', () => {
      const result = profileUpdateSchema.safeParse({
        full_name: '山田太郎',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.phone_number).toBeUndefined();
      }
    });

    it('255文字を超える氏名を拒否する', () => {
      const longName = 'あ'.repeat(256);
      const result = profileUpdateSchema.safeParse({
        full_name: longName,
      });

      expect(result.success).toBe(false);
    });

    it('氏名の前後の空白をトリムする', () => {
      const result = profileUpdateSchema.safeParse({
        full_name: '  山田太郎  ',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.full_name).toBe('山田太郎');
      }
    });
  });

  // ================================================================
  // clinicCreateSchema
  // ================================================================
  describe('clinicCreateSchema', () => {
    it('有効なクリニックデータを受け入れる', () => {
      const result = clinicCreateSchema.safeParse({
        name: 'テストクリニック',
        address: '東京都渋谷区1-1-1',
        phone_number: '03-1234-5678',
        opening_date: '2025-01-01',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('テストクリニック');
        expect(result.data.address).toBe('東京都渋谷区1-1-1');
      }
    });

    it('空のクリニック名を拒否する', () => {
      const result = clinicCreateSchema.safeParse({
        name: '',
      });

      expect(result.success).toBe(false);
    });

    it('address, phone_number, opening_dateはオプショナル', () => {
      const result = clinicCreateSchema.safeParse({
        name: 'テストクリニック',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.address).toBeUndefined();
        expect(result.data.phone_number).toBeUndefined();
        expect(result.data.opening_date).toBeUndefined();
      }
    });

    it('無効な日付形式を拒否する', () => {
      const result = clinicCreateSchema.safeParse({
        name: 'テストクリニック',
        opening_date: '2025/01/01', // YYYY-MM-DD形式でない
      });

      expect(result.success).toBe(false);
    });

    it('255文字を超えるクリニック名を拒否する', () => {
      const longName = 'あ'.repeat(256);
      const result = clinicCreateSchema.safeParse({
        name: longName,
      });

      expect(result.success).toBe(false);
    });
  });

  // ================================================================
  // staffInviteSchema
  // ================================================================
  describe('staffInviteSchema', () => {
    it('有効な招待データを受け入れる', () => {
      const result = staffInviteSchema.safeParse({
        invites: [
          { email: 'staff1@example.com', role: 'therapist' },
          { email: 'staff2@example.com', role: 'staff' },
        ],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.invites).toHaveLength(2);
        expect(result.data.invites[0].email).toBe('staff1@example.com');
        expect(result.data.invites[0].role).toBe('therapist');
      }
    });

    it('空の招待リストを受け入れる（スキップ用）', () => {
      const result = staffInviteSchema.safeParse({
        invites: [],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.invites).toHaveLength(0);
      }
    });

    it('無効なメールアドレスを拒否する', () => {
      const result = staffInviteSchema.safeParse({
        invites: [{ email: 'invalid-email', role: 'staff' }],
      });

      expect(result.success).toBe(false);
    });

    it('無効なロールを拒否する', () => {
      const result = staffInviteSchema.safeParse({
        invites: [{ email: 'test@example.com', role: 'invalid_role' }],
      });

      expect(result.success).toBe(false);
    });

    it('11件以上の招待を拒否する', () => {
      const invites = Array(11)
        .fill(null)
        .map((_, i) => ({
          email: `test${i}@example.com`,
          role: 'staff' as const,
        }));

      const result = staffInviteSchema.safeParse({ invites });

      expect(result.success).toBe(false);
    });

    it('roleが指定されない場合はstaffがデフォルト', () => {
      const result = staffInviteSchema.safeParse({
        invites: [{ email: 'test@example.com' }],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.invites[0].role).toBe('staff');
      }
    });
  });

  // ================================================================
  // seedMasterSchema
  // ================================================================
  describe('seedMasterSchema', () => {
    it('有効なマスタデータを受け入れる', () => {
      const result = seedMasterSchema.safeParse({
        treatment_menus: [
          { name: '肩こり治療', price: 3000, description: '30分コース' },
          { name: '腰痛治療', price: 4000 },
        ],
        payment_methods: ['現金', 'クレジットカード'],
        patient_types: ['初診', '再診'],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.treatment_menus).toHaveLength(2);
        expect(result.data.payment_methods).toHaveLength(2);
        expect(result.data.patient_types).toHaveLength(2);
      }
    });

    it('空のtreatment_menusを拒否する', () => {
      const result = seedMasterSchema.safeParse({
        treatment_menus: [],
      });

      expect(result.success).toBe(false);
    });

    it('treatment_menusは最低1件必要', () => {
      const result = seedMasterSchema.safeParse({
        treatment_menus: [{ name: '基本施術', price: 2000 }],
      });

      expect(result.success).toBe(true);
    });

    it('payment_methodsが指定されない場合はデフォルト値を使用', () => {
      const result = seedMasterSchema.safeParse({
        treatment_menus: [{ name: '基本施術', price: 2000 }],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.payment_methods).toEqual(['現金', 'クレジットカード']);
      }
    });

    it('patient_typesが指定されない場合はデフォルト値を使用', () => {
      const result = seedMasterSchema.safeParse({
        treatment_menus: [{ name: '基本施術', price: 2000 }],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.patient_types).toEqual(['初診', '再診']);
      }
    });

    it('負の価格を拒否する', () => {
      const result = seedMasterSchema.safeParse({
        treatment_menus: [{ name: '基本施術', price: -100 }],
      });

      expect(result.success).toBe(false);
    });

    it('空のメニュー名を拒否する', () => {
      const result = seedMasterSchema.safeParse({
        treatment_menus: [{ name: '', price: 2000 }],
      });

      expect(result.success).toBe(false);
    });

    it('descriptionはオプショナル', () => {
      const result = seedMasterSchema.safeParse({
        treatment_menus: [{ name: '基本施術', price: 2000 }],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.treatment_menus[0].description).toBeUndefined();
      }
    });
  });
});
