/**
 * CSPハッシュ値動的生成システム
 * Phase 3B Refactoring: ハードコードされたハッシュ値の動的生成
 */

import crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

export interface StylesheetHash {
  file: string;
  content: string;
  hash: string;
  algorithm: 'sha256' | 'sha384' | 'sha512';
}

export interface InlineStyleHash {
  content: string;
  hash: string;
  context: string; // どこで使われているか
}

/**
 * CSPハッシュ動的生成クラス
 */
export class CSPHashGenerator {
  private cachedHashes: Map<string, StylesheetHash> = new Map();
  private inlineStyleHashes: InlineStyleHash[] = [];

  /**
   * 文字列のSHA256ハッシュ生成
   */
  static generateHash(content: string, algorithm: 'sha256' | 'sha384' | 'sha512' = 'sha256'): string {
    const hash = crypto.createHash(algorithm);
    hash.update(content, 'utf8');
    return hash.digest('base64');
  }

  /**
   * ファイルからハッシュを生成
   */
  async generateFileHash(filePath: string, algorithm: 'sha256' | 'sha384' | 'sha512' = 'sha256'): Promise<StylesheetHash> {
    const cacheKey = `${filePath}:${algorithm}`;
    
    // キャッシュされたハッシュをチェック
    if (this.cachedHashes.has(cacheKey)) {
      const cached = this.cachedHashes.get(cacheKey)!;
      
      // ファイルの更新時間をチェック（開発時の自動更新用）
      if (process.env.NODE_ENV === 'development') {
        try {
          const stats = await fs.stat(filePath);
          const cacheTime = parseInt(cached.hash.split('-')[1] || '0');
          if (stats.mtimeMs > cacheTime) {
            // ファイルが更新されているのでキャッシュを無効化
            this.cachedHashes.delete(cacheKey);
          } else {
            return cached;
          }
        } catch (error) {
          // ファイルが存在しない場合はキャッシュを削除
          this.cachedHashes.delete(cacheKey);
        }
      } else {
        return cached;
      }
    }

    try {
      const content = await fs.readFile(filePath, 'utf8');
      const hash = CSPHashGenerator.generateHash(content, algorithm);
      
      const styleHash: StylesheetHash = {
        file: filePath,
        content,
        hash,
        algorithm,
      };

      // 本番環境でのみキャッシュ（開発環境はファイル変更を即座に反映）
      if (process.env.NODE_ENV === 'production') {
        this.cachedHashes.set(cacheKey, styleHash);
      }

      return styleHash;

    } catch (error) {
      console.error(`Failed to generate hash for file ${filePath}:`, error);
      throw new Error(`Hash generation failed for ${filePath}`);
    }
  }

  /**
   * Tailwind CSS等のビルド済みスタイルシートのハッシュ生成
   */
  async generateTailwindHashes(): Promise<string[]> {
    const possiblePaths = [
      '.next/static/css', // Next.jsビルド出力
      'public/css',       // 静的CSS
      'src/styles',       // ソースCSS
    ];

    const hashes: string[] = [];

    for (const basePath of possiblePaths) {
      try {
        const fullPath = path.resolve(basePath);
        const files = await fs.readdir(fullPath);
        
        for (const file of files) {
          if (file.endsWith('.css')) {
            const filePath = path.join(fullPath, file);
            const styleHash = await this.generateFileHash(filePath);
            hashes.push(`'sha256-${styleHash.hash}'`);
          }
        }
      } catch (error) {
        // ディレクトリが存在しない場合は無視
        continue;
      }
    }

    return hashes;
  }

  /**
   * インラインスタイルのハッシュ登録
   */
  registerInlineStyle(content: string, context: string): string {
    const hash = CSPHashGenerator.generateHash(content);
    
    // 既存のハッシュをチェック（重複防止）
    const existing = this.inlineStyleHashes.find(h => h.hash === hash);
    if (existing) {
      return hash;
    }

    this.inlineStyleHashes.push({
      content,
      hash,
      context,
    });

    return hash;
  }

  /**
   * 登録されたインラインスタイルのハッシュリスト取得
   */
  getInlineStyleHashes(): string[] {
    return this.inlineStyleHashes.map(h => `'sha256-${h.hash}'`);
  }

  /**
   * よく使われるインラインスタイルの事前登録
   */
  async preregisterCommonStyles(): Promise<void> {
    // Tailwind CSS等でよく使われるインラインスタイル
    const commonStyles = [
      // リセットCSS系
      '*,::before,::after{box-sizing:border-box;border-width:0;border-style:solid;border-color:#e5e7eb}',
      
      // フォント系
      'html{line-height:1.5;-webkit-text-size-adjust:100%;-moz-tab-size:4;tab-size:4;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans",sans-serif,"Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol","Noto Color Emoji"}',
      
      // Next.js特有
      '__next{--color-scheme:normal;--background:0 0% 100%;--foreground:222.2 84% 4.9%}',
      
      // シャドウ/UI系
      ':root{--background:0 0% 100%;--foreground:222.2 84% 4.9%;--card:0 0% 100%;--card-foreground:222.2 84% 4.9%;--popover:0 0% 100%}',
    ];

    for (const style of commonStyles) {
      this.registerInlineStyle(style, 'common-preregistered');
    }
  }

  /**
   * CSP用スタイルディレクティブの動的生成
   */
  async generateStyleSrcDirective(): Promise<string[]> {
    const directives = ["'self'"];
    
    // 外部スタイルソース
    directives.push('https://fonts.googleapis.com');
    
    // ビルド済みスタイルシートのハッシュ
    try {
      const tailwindHashes = await this.generateTailwindHashes();
      directives.push(...tailwindHashes);
    } catch (error) {
      console.warn('Failed to generate Tailwind CSS hashes:', error);
    }
    
    // インラインスタイルのハッシュ
    const inlineHashes = this.getInlineStyleHashes();
    directives.push(...inlineHashes);

    return directives;
  }

  /**
   * 開発環境での動的ハッシュ生成テスト
   */
  async testHashGeneration(): Promise<void> {
    if (process.env.NODE_ENV !== 'development') {
      return;
    }

    console.log('🔧 CSP Hash Generator Test');
    
    // 共通スタイルを事前登録
    await this.preregisterCommonStyles();
    
    // テスト用インラインスタイル
    const testStyles = [
      'color: red;',
      'background-color: #f0f0f0; margin: 10px;',
      '.test { display: none; }',
    ];
    
    for (const style of testStyles) {
      const hash = this.registerInlineStyle(style, 'test');
      console.log(`Style: ${style.substring(0, 50)}... => sha256-${hash}`);
    }
    
    // スタイルディレクティブ生成
    const styleDirectives = await this.generateStyleSrcDirective();
    console.log('Generated style-src directives:', styleDirectives.length);
    console.log('Sample directives:', styleDirectives.slice(0, 5));
  }

  /**
   * ハッシュ統計情報取得
   */
  getStatistics(): {
    cachedFiles: number;
    inlineStyles: number;
    totalHashes: number;
  } {
    return {
      cachedFiles: this.cachedHashes.size,
      inlineStyles: this.inlineStyleHashes.length,
      totalHashes: this.cachedHashes.size + this.inlineStyleHashes.length,
    };
  }

  /**
   * キャッシュクリア
   */
  clearCache(): void {
    this.cachedHashes.clear();
    this.inlineStyleHashes = [];
    console.log('CSP hash cache cleared');
  }
}

// シングルトンインスタンス
export const cspHashGenerator = new CSPHashGenerator();

// 開発環境での初期化
if (process.env.NODE_ENV === 'development') {
  // 非同期で共通スタイルを事前登録
  cspHashGenerator.preregisterCommonStyles().catch(error => {
    console.warn('Failed to preregister common styles:', error);
  });
}

// ビルド時のハッシュ生成用ヘルパー関数
export async function generateBuildTimeHashes(): Promise<{
  styleSrc: string[];
  scriptSrc: string[];
}> {
  const generator = new CSPHashGenerator();
  
  // 共通スタイルの事前登録
  await generator.preregisterCommonStyles();
  
  // スタイルディレクティブ生成
  const styleSrc = await generator.generateStyleSrcDirective();
  
  // 将来的にスクリプトハッシュも対応予定
  const scriptSrc = ["'self'"];
  
  return {
    styleSrc,
    scriptSrc,
  };
}