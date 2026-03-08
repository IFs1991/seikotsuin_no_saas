/**
 * F-02: MFA security_events の payload 契約テスト
 * spec: docs/stabilization/spec-schema-frontend-alignment-v0.2.md
 *
 * security_events テーブルの SSOT (baseline migration):
 *   event_type       varchar(100) NOT NULL
 *   event_category   varchar(50)  NOT NULL
 *   event_description text        NOT NULL
 *   event_data       jsonb        NOT NULL DEFAULT '{}'
 *
 * 受け入れ条件:
 * - event_details を使っていないこと
 * - event_category, event_description が挿入されていること
 */

import * as fs from 'fs';
import * as path from 'path';

const MFA_FILES = ['src/lib/mfa/mfa-manager.ts', 'src/lib/mfa/backup-codes.ts'];

function readFile(relativePath: string): string {
  const fullPath = path.resolve(process.cwd(), relativePath);
  return fs.readFileSync(fullPath, 'utf-8');
}

describe('F-02: MFA security_events payload 契約', () => {
  describe('event_details を使っていないこと', () => {
    for (const filePath of MFA_FILES) {
      it(`${filePath} に event_details が存在しないこと`, () => {
        const content = readFile(filePath);
        expect(content).not.toContain('event_details');
      });
    }
  });

  describe('security_events 挿入時に required 列が揃っていること', () => {
    for (const filePath of MFA_FILES) {
      it(`${filePath} の security_events insert に event_category が含まれること`, () => {
        const content = readFile(filePath);
        // .from('security_events').insert({ ... }) ブロックを探す
        const insertBlocks = [
          ...content.matchAll(
            /from\(['"]security_events['"]\)\s*\.insert\(\s*\{([\s\S]*?)\}\s*\)/g
          ),
        ];

        // security_events への挿入がある場合、event_category が含まれていること
        if (insertBlocks.length > 0) {
          for (const match of insertBlocks) {
            expect(match[1]).toContain('event_category');
          }
        }
      });

      it(`${filePath} の security_events insert に event_description が含まれること`, () => {
        const content = readFile(filePath);
        const insertBlocks = [
          ...content.matchAll(
            /from\(['"]security_events['"]\)\s*\.insert\(\s*\{([\s\S]*?)\}\s*\)/g
          ),
        ];

        if (insertBlocks.length > 0) {
          for (const match of insertBlocks) {
            expect(match[1]).toContain('event_description');
          }
        }
      });

      it(`${filePath} の security_events insert に event_data が含まれること`, () => {
        const content = readFile(filePath);
        const insertBlocks = [
          ...content.matchAll(
            /from\(['"]security_events['"]\)\s*\.insert\(\s*\{([\s\S]*?)\}\s*\)/g
          ),
        ];

        if (insertBlocks.length > 0) {
          for (const match of insertBlocks) {
            expect(match[1]).toContain('event_data');
          }
        }
      });
    }
  });
});
