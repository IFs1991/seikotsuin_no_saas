import * as fs from 'fs';
import * as path from 'path';

const GLOBALS_CSS = path.resolve(__dirname, '../../app/globals.css');

function extractDarkBlock(content: string): string {
  const darkStart = content.indexOf('.dark');
  expect(darkStart).toBeGreaterThanOrEqual(0);

  const blockStart = content.indexOf('{', darkStart);
  expect(blockStart).toBeGreaterThanOrEqual(0);

  let depth = 0;
  for (let index = blockStart; index < content.length; index += 1) {
    const char = content[index];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) {
      return content.slice(blockStart + 1, index);
    }
  }

  throw new Error('Could not find the end of the .dark block');
}

describe('UI01: dark theme CSS variables', () => {
  const darkBlock = extractDarkBlock(fs.readFileSync(GLOBALS_CSS, 'utf-8'));

  const requiredVariables = [
    '--background',
    '--foreground',
    '--card',
    '--card-foreground',
    '--popover',
    '--popover-foreground',
    '--primary',
    '--primary-foreground',
    '--secondary',
    '--secondary-foreground',
    '--muted',
    '--muted-foreground',
    '--accent',
    '--accent-foreground',
    '--destructive',
    '--destructive-foreground',
    '--border',
    '--input',
    '--ring',
  ];

  test.each(requiredVariables)('%s is defined in the .dark block', variable => {
    expect(darkBlock).toMatch(new RegExp(`${variable}:\\s*[^;]+;`));
  });

  test('card and popover stay lifted above the dark background', () => {
    expect(darkBlock).toContain('--background: 222.2 84% 4.9%;');
    expect(darkBlock).toContain('--card: 222.2 47.4% 11.2%;');
    expect(darkBlock).toContain('--popover: 222.2 47.4% 11.2%;');
  });

  test('legacy custom variables remain defined for existing utilities', () => {
    expect(darkBlock).toContain('--bg-color: #1f2937;');
    expect(darkBlock).toContain('--text-color: #f3f4f6;');
    expect(darkBlock).toContain('--surface-color: #374151;');
    expect(darkBlock).toContain('--border-color: #4b5563;');
  });
});
