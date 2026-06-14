import * as fs from 'fs';
import * as path from 'path';

const BUTTON_FILE = path.resolve(__dirname, '../../components/ui/button.tsx');
const CARD_FILE = path.resolve(__dirname, '../../components/ui/card.tsx');

describe('UI03: Button and Card variant surface', () => {
  test('Button keeps only the maintained variant and size API', () => {
    const content = fs.readFileSync(BUTTON_FILE, 'utf-8');

    const maintainedButtonTypes = [
      "| 'default'",
      "| 'destructive'",
      "| 'outline'",
      "| 'secondary'",
      "| 'ghost'",
      "| 'link'",
      "| 'medical-primary'",
      "| 'medical-urgent'",
      "| 'admin-primary'",
      "| 'admin-secondary'",
      "| 'patient-primary'",
      "size?: 'default' | 'sm' | 'lg' | 'icon' | 'touch' | 'emergency';",
    ];

    for (const typeLine of maintainedButtonTypes) {
      expect(content).toContain(typeLine);
    }

    expect(content).not.toContain('priority?:');
    expect(content).not.toContain("role?: 'staff'");
    expect(content).not.toContain("'medical-neutral'");
    expect(content).not.toContain("'patient-gentle'");
    expect(content).toContain('export function buttonClassName');
  });

  test('Card exposes only the base card API plus interactive behavior', () => {
    const content = fs.readFileSync(CARD_FILE, 'utf-8');

    expect(content).toContain('interactive?: boolean;');
    expect(content).not.toContain('variant?:');
    expect(content).not.toContain('priority?:');
    expect(content).not.toContain('elevation?:');
    expect(content).not.toContain("variant='dashboard'");
  });
});
