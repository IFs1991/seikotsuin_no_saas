import { Fragment } from 'react';

// 和文の見出しを読点・句点の後ろでだけ折り返し、1〜2文字だけが次の行に残るのを避ける。
// 要素を分けずに <wbr> を入れるだけなので、見出しやダイアログの読み上げ名は変わらない。
// 句が行幅より長い場合は overflow-wrap:anywhere でその句の中でも折り返す。
export function PhraseText({ text }: { text: string }) {
  const phrases = text.match(/[^、。]+[、。]*|[、。]+/g) ?? [text];
  return (
    <span className='break-keep [overflow-wrap:anywhere]'>
      {phrases.map((phrase, index) => (
        <Fragment key={`${index}-${phrase}`}>
          {index > 0 ? <wbr /> : null}
          {phrase}
        </Fragment>
      ))}
    </span>
  );
}
