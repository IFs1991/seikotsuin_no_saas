// src/appと同じ階層の入口がNext.jsのbuild対象。既存の境界ロジックは一か所に保つ。
export { middleware } from '../middleware';

// Next.jsの静的解析のためmatcherはこの入口にリテラルで定義する。
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
