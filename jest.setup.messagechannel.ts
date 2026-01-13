/**
 * React 19 scheduler MESSAGEPORT leak 対策
 *
 * React 19 の scheduler は MessageChannel が存在する場合それを使用し、
 * 存在しない場合は setTimeout にフォールバックします。
 *
 * jsdom + worker_threads の MessageChannel を使用すると、テスト終了後も
 * MessagePort が開いたままになり、Jest が「open handle」警告を出力します。
 *
 * この設定ファイルは setupFiles で実行され、React がロードされる前に
 * MessageChannel を無効化することで、scheduler に setTimeout を使わせます。
 */

const globalScope = globalThis as typeof globalThis & {
  MessageChannel?: typeof MessageChannel | undefined;
  MessagePort?: typeof MessagePort | undefined;
  __DISABLE_MESSAGEPORT__?: boolean;
};

// MessageChannel と MessagePort を undefined に設定
// React scheduler が setTimeout フォールバックを使用するよう強制
globalScope.__DISABLE_MESSAGEPORT__ = true;
Object.defineProperty(globalScope, 'MessageChannel', {
  value: undefined,
  writable: true,
  configurable: true,
});

Object.defineProperty(globalScope, 'MessagePort', {
  value: undefined,
  writable: true,
  configurable: true,
});

// 念のため window オブジェクトにも適用（jsdom 環境対策）
if (typeof window !== 'undefined') {
  try {
    Object.defineProperty(window, 'MessageChannel', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, 'MessagePort', {
      value: undefined,
      writable: true,
      configurable: true,
    });
  } catch {
    // window が readonly の場合は無視
  }
}
