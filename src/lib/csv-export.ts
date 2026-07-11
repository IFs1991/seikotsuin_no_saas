export type CsvValue = string | number | boolean | null | undefined;

export type CsvColumn<Row> = {
  header: string;
  value: (row: Row) => CsvValue;
};

const CSV_FORMULA_PREFIX = /^[=+\-@\t\r]/;
const CSV_WHITESPACE_FORMULA_PREFIX = /^\s+[=+\-@]/;

export function escapeCsvCell(value: CsvValue): string {
  const rawValue = value === null || value === undefined ? '' : String(value);
  const protectedValue =
    typeof value === 'string' &&
    (CSV_FORMULA_PREFIX.test(rawValue) ||
      CSV_WHITESPACE_FORMULA_PREFIX.test(rawValue))
      ? `'${rawValue}`
      : rawValue;

  return `"${protectedValue.replace(/"/g, '""')}"`;
}

export function createCsv<Row>(
  rows: readonly Row[],
  columns: readonly CsvColumn<Row>[]
): string {
  const lines = [
    columns.map(column => escapeCsvCell(column.header)).join(','),
    ...rows.map(row =>
      columns.map(column => escapeCsvCell(column.value(row))).join(',')
    ),
  ];

  return `${lines.join('\r\n')}\r\n`;
}
