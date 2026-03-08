/**
 * F-01: blocks/reservations の snake_case クエリキー確認テスト
 * spec: docs/stabilization/spec-schema-frontend-alignment-v0.2.md
 *
 * 受け入れ条件:
 * - Supabase クエリで camelCase DBキーを使っていないこと
 * - insert/update ペイロードで camelCase DBキーを使っていないこと
 */

import * as fs from 'fs';
import * as path from 'path';

// camelCase のDBキー（blocks テーブル）
const BLOCKS_CAMEL_KEYS = [
  'resourceId',
  'startTime',
  'endTime',
  'createdAt',
  'updatedAt',
  'createdBy',
];

// camelCase のDBキー（reservations テーブル）
const RESERVATIONS_CAMEL_KEYS = [
  'customerId',
  'staffId',
  'menuId',
  'startTime',
  'endTime',
  'createdAt',
  'updatedAt',
];

// Supabase クエリメソッドのパターン
// .eq('camelCase', ...) / .gte('camelCase', ...) / .lte('camelCase', ...) / .order('camelCase', ...) 等
const QUERY_METHOD_PATTERN =
  /\.(eq|neq|gte|lte|lt|gt|order|or)\(\s*['"`](resourceId|startTime|endTime|createdAt|updatedAt|createdBy|customerId|staffId|menuId)['"`]/g;

// insert/update ペイロードの camelCase キーパターン
// { resourceId: ..., startTime: ... } のようなオブジェクトリテラル
const PAYLOAD_KEY_PATTERN =
  /\b(resourceId|startTime|endTime|createdAt|updatedAt|createdBy|customerId|staffId|menuId)\s*:/g;

// .or() 内のDBキーとしての camelCase パターン
// テンプレートリテラルの `.or(`...resourceId.lt.` のようなPostgREST filterを検出
const OR_FILTER_PATTERN =
  /\.or\([^)]*\b(resourceId|createdAt|updatedAt|createdBy|customerId|staffId|menuId)\.(lt|gt|lte|gte|eq|neq)\b/g;

const TARGET_FILES = [
  'src/app/api/blocks/route.ts',
  'src/lib/services/block-service.ts',
  'src/lib/services/reservation-service.ts',
];

function readFile(relativePath: string): string {
  const fullPath = path.resolve(process.cwd(), relativePath);
  return fs.readFileSync(fullPath, 'utf-8');
}

describe('F-01: blocks/reservations snake_case クエリキー', () => {
  describe('Supabase クエリフィルタに camelCase DBキーを使っていないこと', () => {
    for (const filePath of TARGET_FILES) {
      it(`${filePath} のクエリメソッドに camelCase キーがないこと`, () => {
        const content = readFile(filePath);
        const matches = [...content.matchAll(QUERY_METHOD_PATTERN)];
        expect(matches).toEqual([]);
      });
    }
  });

  describe('.or() フィルタに camelCase DBキーを使っていないこと', () => {
    // PostgREST filter: startTime.lt. / endTime.gt. 等の形式を検出
    const OR_START_END_PATTERN =
      /\.or\([^)]*\b(startTime|endTime)\.(lt|gt|lte|gte|eq|neq)\b/g;

    for (const filePath of TARGET_FILES) {
      it(`${filePath} の .or() 内に camelCase DBキーがないこと`, () => {
        const content = readFile(filePath);
        const matches1 = [...content.matchAll(OR_FILTER_PATTERN)];
        const matches2 = [...content.matchAll(OR_START_END_PATTERN)];
        expect(matches1).toEqual([]);
        expect(matches2).toEqual([]);
      });
    }
  });

  describe('insert/update ペイロードに camelCase DBキーを使っていないこと', () => {
    it('src/app/api/blocks/route.ts の insertData に camelCase キーがないこと', () => {
      const content = readFile('src/app/api/blocks/route.ts');

      // insertData オブジェクト部分を抽出
      const insertDataMatch = content.match(
        /const insertData\s*=\s*\{[\s\S]*?\};/
      );
      if (insertDataMatch) {
        const insertDataBlock = insertDataMatch[0];
        for (const key of BLOCKS_CAMEL_KEYS) {
          const keyPattern = new RegExp(`\\b${key}\\s*:`, 'g');
          expect(insertDataBlock).not.toMatch(keyPattern);
        }
      }
    });

    it('src/lib/services/block-service.ts の createBlock ペイロードに camelCase キーがないこと', () => {
      const content = readFile('src/lib/services/block-service.ts');

      // blockData オブジェクト部分を抽出
      const blockDataMatch = content.match(
        /const blockData\s*=\s*\{[\s\S]*?\};/
      );
      if (blockDataMatch) {
        const blockDataBlock = blockDataMatch[0];
        // createdAt, updatedAt は DB 側で自動生成されるが、コードで明示挿入している場合は snake_case であるべき
        expect(blockDataBlock).not.toMatch(/\bcreatedAt\s*:/);
        expect(blockDataBlock).not.toMatch(/\bupdatedAt\s*:/);
      }
    });

    it('src/lib/services/reservation-service.ts の createReservation ペイロードに camelCase キーがないこと', () => {
      const content = readFile('src/lib/services/reservation-service.ts');

      // reservationData オブジェクト部分を抽出
      const reservationDataMatch = content.match(
        /const reservationData\s*=\s*\{[\s\S]*?\};/
      );
      if (reservationDataMatch) {
        const reservationDataBlock = reservationDataMatch[0];
        expect(reservationDataBlock).not.toMatch(/\bcreatedAt\s*:/);
        expect(reservationDataBlock).not.toMatch(/\bupdatedAt\s*:/);
      }
    });

    it('src/lib/services/reservation-service.ts の update ペイロードのDBキーに camelCase がないこと', () => {
      const content = readFile('src/lib/services/reservation-service.ts');

      // .update({ key: value }) のkey部分（コロンの前）でcamelCaseを検出
      // key: value パターンの key 側だけを見る（value側のJS変数名は許容）
      const updateMatches = [...content.matchAll(/\.update\(\s*\{([^}]+)\}/g)];
      for (const match of updateMatches) {
        const updateBlock = match[1];
        // 各 key: value ペアからキー名を抽出
        const keyMatches = [...updateBlock.matchAll(/(\w+)\s*:/g)];
        const keys = keyMatches.map(m => m[1]);
        for (const key of keys) {
          expect(key).not.toMatch(
            /^(updatedAt|startTime|endTime|staffId|customerId|menuId|createdAt|createdBy|resourceId)$/
          );
        }
      }
    });
  });
});
