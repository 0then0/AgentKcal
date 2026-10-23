/** RFC 4180 reader: quoted newlines, commas and doubled quotes; no dependencies. */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = [],
    row: string[] = [];
  let field = "",
    quoted = false,
    endedQuote = false;
  const source = input.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          endedQuote = true;
        }
      } else field += c;
    } else if (c === "," || c === "\r" || c === "\n") {
      row.push(field);
      field = "";
      endedQuote = false;
      if (c !== ",") {
        if (c === "\r" && source[i + 1] === "\n") i++;
        if (row.some(Boolean)) rows.push([...row]);
        row.length = 0;
      }
    } else if (c === '"' && !field && !endedQuote) quoted = true;
    else {
      if (endedQuote || c === '"') throw new Error("invalid CSV quoting");
      field += c;
    }
  }
  if (quoted) throw new Error("unterminated CSV quote; file skipped");
  if (field || row.length || endedQuote) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
