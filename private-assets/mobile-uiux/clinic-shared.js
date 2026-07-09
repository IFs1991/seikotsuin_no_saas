/* ════════════════════════════════════════════════════════════════════
   clinic-shared.js — 整骨院モバイルUI 共通モジュール（デザインシステム）
   全画面（ホーム/予約/患者分析/日報/設定/設定詳細）で共有する
   デザイントークン（配色）とテーマ適用ロジックの単一の真実の源。
   各 .dc.html から動的 import() で1度だけ読み込み、ブラウザにキャッシュされる。
   → 配色を変えたい時はこの1ファイルを編集すれば全画面に反映される。
   ════════════════════════════════════════════════════════════════════ */

/* ── デザイントークン（ライト / ダーク） ───────────────────────────── */
export const THEMES = {
  light: {
    '--stage-bg': '#e7eae7', '--screen-bg': '#f3f5f4', '--status-fg': '#1b2421',
    '--surface': '#ffffff', '--surface-2': '#f5f8f6', '--surface-3': '#eaeeec',
    '--border': '#e3e8e5', '--border-strong': '#cfd6d2',
    '--fg': '#1b2421', '--fg-2': '#5c6864', '--fg-3': '#9aa39e',
    '--primary': 'var(--accent, #2f7d72)', '--primary-fg': '#ffffff',
    '--primary-soft': '#e2efeb', '--on-primary-soft': 'var(--accent-deep, #1f5d54)',
    '--s-uc': '#a06a16', '--s-uc-bg': '#f6ecd6', '--s-cf': 'var(--accent-deep, #2f7d72)',
    '--s-cf-bg': '#dcece7', '--s-cn-bg': '#ecefed', '--s-ns': '#b34c40', '--s-ns-bg': '#f6e2de',
    '--now': '#b34c40', '--toast-bg': '#222c29', '--toast-fg': '#ffffff',
  },
  dark: {
    '--stage-bg': '#0b0e0d', '--screen-bg': '#0f1311', '--status-fg': '#e9efec',
    '--surface': '#181d1b', '--surface-2': '#1f2623', '--surface-3': '#28312d',
    '--border': '#2a322f', '--border-strong': '#3a443f',
    '--fg': '#e9efec', '--fg-2': '#9aa6a1', '--fg-3': '#6c7873',
    '--primary': 'var(--accent-bright, #4eb3a3)', '--primary-fg': '#0c1513',
    '--primary-soft': '#1d322d', '--on-primary-soft': 'var(--accent-bright, #79d2c3)',
    '--s-uc': '#d6ad58', '--s-uc-bg': '#352c14', '--s-cf': 'var(--accent-bright, #62c2b2)',
    '--s-cf-bg': '#16302a', '--s-cn-bg': '#252c29', '--s-ns': '#e08a7e', '--s-ns-bg': '#3a221e',
    '--now': '#e08a7e', '--toast-bg': '#e9efec', '--toast-fg': '#141a18',
  },
};

/* ── テーマ適用（描画後に CSS 変数をルートへ書き込む。メモ化あり） ──────
   テーマ／アクセントが前回と同じなら何もしない。
   従来は毎 componentDidUpdate で無条件に全プロパティ（約32個）を書き込んで
   いたため、入力やトグルのたびに無駄な setProperty が発生していた。
   インライン側の var(--x, fallback) がライト初期値を兼ねるので、
   モジュール読込前でも初回描画は正しく表示される（チラつきなし）。           */
export function applyTheme(root, themeName, props) {
  if (!root) return;
  const acc = (props && props.accent) || '';
  const key = (themeName || 'light') + '|' + acc;
  if (root.__dcThemeKey === key) return;           // 差分なし → スキップ
  root.__dcThemeKey = key;
  if (acc) {
    root.style.setProperty('--accent', acc);
    root.style.setProperty('--accent-deep', acc);
    root.style.setProperty('--accent-bright', acc);
  }
  const t = THEMES[themeName] || THEMES.light;
  for (const k in t) root.style.setProperty(k, t[k]);
}
