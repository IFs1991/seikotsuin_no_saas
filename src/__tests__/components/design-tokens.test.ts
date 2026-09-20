import { readFileSync } from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';

type Rgb = readonly [number, number, number];
const css = postcss.parse(
  readFileSync(path.join(process.cwd(), 'src/app/globals.css'), 'utf8')
);

function tokens(selector: string): Map<string, string> {
  const result = new Map<string, string>();
  css.walkRules(selector, rule => {
    rule.walkDecls(decl => {
      result.set(decl.prop, decl.value);
    });
  });
  return result;
}

function color(values: Map<string, string>, name: string): Rgb {
  const value = values.get(`--${name}`);
  if (!value) throw new Error(`Missing ${name}`);
  const alias = /^var\(--([\w-]+)\)$/.exec(value);
  if (alias) return color(values, alias[1]);
  const components = value.split(/\s+/).map(component => parseFloat(component));
  const [hue, saturation, lightness] = components;
  if (
    components.length !== 3 ||
    components.some(component => !Number.isFinite(component))
  ) {
    throw new Error(`Invalid HSL ${name}`);
  }
  const s = saturation / 100;
  const l = lightness / 100;
  const a = s * Math.min(l, 1 - l);
  const channel = (offset: number) => {
    const k = (offset + hue / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [channel(0), channel(8), channel(4)];
}

function luminance(rgb: Rgb): number {
  const linear = rgb.map(value =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  );
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrast(a: Rgb, b: Rgb): number {
  const light = Math.max(luminance(a), luminance(b));
  const dark = Math.min(luminance(a), luminance(b));
  return (light + 0.05) / (dark + 0.05);
}

describe.each([
  ':root:has([data-app-theme])',
  ':root.dark:has([data-app-theme])',
])('%s', selector => {
  const palette = tokens(':root:has([data-app-theme])');
  for (const [name, value] of tokens(selector)) palette.set(name, value);
  it.each([
    ['foreground', 'background'],
    ['card-foreground', 'card'],
    ['popover-foreground', 'popover'],
    ['muted-foreground', 'card'],
    ['primary-foreground', 'primary'],
    ['primary-foreground', 'primary-hover'],
    ['accent-foreground', 'accent'],
    ['success', 'success-soft'],
    ['warning', 'warning-soft'],
    ['destructive', 'destructive-soft'],
    ['info', 'info-soft'],
  ])('maintains 4.5:1 text contrast: %s on %s', (fg, bg) => {
    expect(
      contrast(color(palette, fg), color(palette, bg))
    ).toBeGreaterThanOrEqual(4.5);
  });
  it.each(['surface-raised', 'surface-soft', 'surface-muted'])(
    'keeps input/focus boundaries distinguishable on %s',
    bg => {
      for (const fg of ['input', 'ring']) {
        expect(
          contrast(color(palette, fg), color(palette, bg))
        ).toBeGreaterThanOrEqual(3);
      }
    }
  );
  it('checks destructive hover after compositing 90% paint over the actual card surface', () => {
    const fill = color(palette, 'destructive');
    const background = color(palette, 'card');
    const blended: Rgb = [
      fill[0] * 0.9 + background[0] * 0.1,
      fill[1] * 0.9 + background[1] * 0.1,
      fill[2] * 0.9 + background[2] * 0.1,
    ];
    expect(
      contrast(color(palette, 'destructive-foreground'), blended)
    ).toBeGreaterThanOrEqual(4.5);
  });
});

it('preserves the public root palette and the legacy primary scale', () => {
  expect(tokens(':root').get('--primary')).toBe('221.2 83.2% 53.3%');
  expect(tokens(':root').get('--background')).toBe('0 0% 100%');
  expect(tokens('.dark').get('--primary')).toBe('217.2 91.2% 59.8%');
});
