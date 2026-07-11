import { createCsv, escapeCsvCell } from '@/lib/csv-export';

describe('csv-export', () => {
  it('escapes quotes, commas and line breaks using RFC 4180 quoting', () => {
    expect(escapeCsvCell('a,"b"\nnext')).toBe('"a,""b""\nnext"');
  });

  it.each(['=SUM(1,1)', '+cmd', '-cmd', '@cmd', '\tcmd', '\r=cmd', '  =cmd'])(
    'neutralizes spreadsheet formula input: %s',
    value => {
      expect(escapeCsvCell(value)).toBe(`"'${value.replace(/"/g, '""')}"`);
    }
  );

  it('does not rewrite numeric negative values as formulas', () => {
    expect(escapeCsvCell(-42)).toBe('"-42"');
  });

  it('creates CRLF-delimited CSV with a stable header', () => {
    const csv = createCsv(
      [{ id: '1', name: '患者A' }],
      [
        { header: 'id', value: row => row.id },
        { header: 'name', value: row => row.name },
      ]
    );

    expect(csv).toBe('"id","name"\r\n"1","患者A"\r\n');
  });
});
