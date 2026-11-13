// A designed .xlsx writer (no dependencies): brand colours, borders, money and date formats,
// clickable links, merged cells, a frozen header, filters, print setup and an embedded logo.
// Used for the payment exports. Built on the zip helper in xlsx.ts.

import { zip } from './xlsx';

export type Style =
  | 'band' // dark header band
  | 'bandTitle'
  | 'bandSub'
  | 'section'
  | 'head'
  | 'text'
  | 'textAlt'
  | 'center'
  | 'centerAlt'
  | 'money'
  | 'moneyAlt'
  | 'date'
  | 'dateAlt'
  | 'mono'
  | 'monoAlt'
  | 'link'
  | 'linkAlt'
  | 'ok'
  | 'wait'
  | 'bad'
  | 'none'
  | 'label'
  | 'value'
  | 'valueMoney'
  | 'totalLabel'
  | 'total'
  | 'totalMoney'
  | 'note'
  | 'tick';

export interface XCell {
  v?: string | number | null;
  /** A date as YYYY-MM-DD or an ISO time; written as a real Excel date. */
  date?: string | null;
  s?: Style;
  /** Makes the cell a clickable link showing v. */
  link?: string | null;
}

export interface XSheet {
  name: string;
  widths: number[];
  rows: { cells: (XCell | null)[]; height?: number }[];
  merges?: string[];
  /** Rows above this (1-based) stay in view while scrolling. */
  freezeRow?: number;
  autoFilter?: string;
  tab?: string;
  logo?: { png: Buffer; width: number; height: number; col: number; row: number; offX?: number; offY?: number };
  landscape?: boolean;
}

// ---------------------------------------------------------------------------
// styles
// ---------------------------------------------------------------------------

const INK = 'FF1D0B3A';
const FONTS = [
  `<font><sz val="10"/><color rgb="${INK}"/><name val="Calibri"/><family val="2"/></font>`, // 0 body
  `<font><b/><i/><sz val="20"/><color rgb="FFFFD91A"/><name val="Calibri"/><family val="2"/></font>`, // 1 band title
  `<font><sz val="10"/><color rgb="FFD9CDF5"/><name val="Calibri"/><family val="2"/></font>`, // 2 band sub
  `<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>`, // 3 header
  `<font><b/><sz val="10"/><color rgb="${INK}"/><name val="Calibri"/><family val="2"/></font>`, // 4 bold
  `<font><u/><sz val="10"/><color rgb="FF5A12A8"/><name val="Calibri"/><family val="2"/></font>`, // 5 link
  `<font><b/><sz val="16"/><color rgb="${INK}"/><name val="Calibri"/><family val="2"/></font>`, // 6 big value
  `<font><b/><sz val="12"/><color rgb="FF5A12A8"/><name val="Calibri"/><family val="2"/></font>`, // 7 section
  `<font><i/><sz val="9"/><color rgb="FF6B5F86"/><name val="Calibri"/><family val="2"/></font>`, // 8 note
  `<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>`, // 9 badge white
  `<font><sz val="10"/><color rgb="${INK}"/><name val="Consolas"/><family val="3"/></font>`, // 10 mono
];

const fill = (rgb: string) => `<fill><patternFill patternType="solid"><fgColor rgb="${rgb}"/><bgColor indexed="64"/></patternFill></fill>`;
const FILLS = [
  '<fill><patternFill patternType="none"/></fill>',
  '<fill><patternFill patternType="gray125"/></fill>',
  fill('FF13042E'), // 2 band
  fill('FF5A12A8'), // 3 header violet
  fill('FFF7F3FF'), // 4 zebra
  fill('FFC9F7EC'), // 5 ok
  fill('FFFFF1A8'), // 6 wait
  fill('FFFF1A9A'), // 7 bad
  fill('FFEDEAF2'), // 8 none
  fill('FFEDE4FF'), // 9 total
  fill('FFFBF6E6'), // 10 cream (summary values)
];

const side = (k: string, style: string, rgb: string) => `<${k} style="${style}"><color rgb="${rgb}"/></${k}>`;
const BORDERS = [
  '<border><left/><right/><top/><bottom/><diagonal/></border>',
  `<border>${side('left', 'thin', 'FFDCD3EC')}${side('right', 'thin', 'FFDCD3EC')}${side('top', 'thin', 'FFDCD3EC')}${side('bottom', 'thin', 'FFDCD3EC')}<diagonal/></border>`, // 1 grid
  `<border>${side('left', 'thin', 'FF5A12A8')}${side('right', 'thin', 'FF5A12A8')}${side('top', 'thin', 'FF5A12A8')}${side('bottom', 'medium', INK)}<diagonal/></border>`, // 2 header
  `<border>${side('left', 'thin', 'FFDCD3EC')}${side('right', 'thin', 'FFDCD3EC')}${side('top', 'medium', INK)}${side('bottom', 'medium', INK)}<diagonal/></border>`, // 3 total
  `<border><left/><right/><top/>${side('bottom', 'thin', 'FFDCD3EC')}<diagonal/></border>`, // 4 summary line
];

// numFmt 164 money, 165 date, 49 text
const NUMFMTS = '<numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;RM&quot;#,##0.00"/><numFmt numFmtId="165" formatCode="d mmm yyyy"/></numFmts>';

type Xf = { font: number; fill: number; border: number; num?: number; h?: 'left' | 'center' | 'right'; v?: 'top' | 'center' | 'bottom'; wrap?: boolean; indent?: number };
const XF: Record<Style, Xf> = {
  band: { font: 0, fill: 2, border: 0 },
  bandTitle: { font: 1, fill: 2, border: 0, v: 'bottom' },
  bandSub: { font: 2, fill: 2, border: 0, v: 'top', wrap: true },
  section: { font: 7, fill: 0, border: 0, v: 'bottom' },
  head: { font: 3, fill: 3, border: 2, v: 'center', wrap: true, h: 'left' },
  text: { font: 0, fill: 0, border: 1, v: 'center', wrap: true },
  textAlt: { font: 0, fill: 4, border: 1, v: 'center', wrap: true },
  center: { font: 4, fill: 0, border: 1, v: 'center', h: 'center' },
  centerAlt: { font: 4, fill: 4, border: 1, v: 'center', h: 'center' },
  money: { font: 0, fill: 0, border: 1, num: 164, v: 'center' },
  moneyAlt: { font: 0, fill: 4, border: 1, num: 164, v: 'center' },
  date: { font: 0, fill: 0, border: 1, num: 165, v: 'center', h: 'left' },
  dateAlt: { font: 0, fill: 4, border: 1, num: 165, v: 'center', h: 'left' },
  mono: { font: 10, fill: 0, border: 1, num: 49, v: 'center' },
  monoAlt: { font: 10, fill: 4, border: 1, num: 49, v: 'center' },
  link: { font: 5, fill: 0, border: 1, v: 'center' },
  linkAlt: { font: 5, fill: 4, border: 1, v: 'center' },
  ok: { font: 4, fill: 5, border: 1, v: 'center', h: 'center' },
  wait: { font: 4, fill: 6, border: 1, v: 'center', h: 'center' },
  bad: { font: 9, fill: 7, border: 1, v: 'center', h: 'center' },
  none: { font: 0, fill: 8, border: 1, v: 'center', h: 'center' },
  label: { font: 0, fill: 0, border: 4, v: 'center', indent: 1 },
  value: { font: 6, fill: 10, border: 4, v: 'center', h: 'right' },
  valueMoney: { font: 6, fill: 10, border: 4, num: 164, v: 'center', h: 'right' },
  totalLabel: { font: 4, fill: 9, border: 3, v: 'center' },
  total: { font: 4, fill: 9, border: 3, v: 'center', h: 'center' },
  totalMoney: { font: 4, fill: 9, border: 3, num: 164, v: 'center' },
  note: { font: 8, fill: 0, border: 0, v: 'top', wrap: true },
  tick: { font: 4, fill: 0, border: 1, v: 'center', h: 'center' },
};
const STYLE_IDS = Object.keys(XF) as Style[];
const styleId = (s: Style | undefined) => (s ? STYLE_IDS.indexOf(s) + 1 : 0);

function stylesXml(): string {
  const xfs = STYLE_IDS.map((k) => {
    const x = XF[k];
    const align =
      x.h || x.v || x.wrap || x.indent
        ? `<alignment${x.h ? ` horizontal="${x.h}"` : ''}${x.v ? ` vertical="${x.v}"` : ''}${x.wrap ? ' wrapText="1"' : ''}${x.indent ? ` indent="${x.indent}"` : ''}/>`
        : '';
    return `<xf numFmtId="${x.num ?? 0}" fontId="${x.font}" fillId="${x.fill}" borderId="${x.border}" xfId="0" applyFont="1" applyFill="1" applyBorder="1"${x.num != null ? ' applyNumberFormat="1"' : ''}${align ? ' applyAlignment="1"' : ''}>${align}</xf>`;
  });
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    NUMFMTS +
    `<fonts count="${FONTS.length}">${FONTS.join('')}</fonts>` +
    `<fills count="${FILLS.length}">${FILLS.join('')}</fills>` +
    `<borders count="${BORDERS.length}">${BORDERS.join('')}</borders>` +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    `<cellXfs count="${xfs.length + 1}"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>${xfs.join('')}</cellXfs>` +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>'
  );
}

// ---------------------------------------------------------------------------
// sheets
// ---------------------------------------------------------------------------

const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

export function colName(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** A1:B2 -> $A$1:$B$2 */
const absRef = (r: string) => r.replace(/([A-Z]+)(\d+)/g, (_m, c: string, n: string) => `$${c}$${n}`);

/** Excel stores dates as days since 30 Dec 1899 (Malaysia time for timestamps). */
function excelDate(v: string): number | null {
  const t = v.length === 10 ? Date.parse(`${v}T00:00:00Z`) : Date.parse(v) + 8 * 3600_000;
  if (Number.isNaN(t)) return null;
  return t / 86_400_000 + 25_569;
}

function cellXml(c: XCell, ref: string): string {
  const s = styleId(c.s);
  const sa = s ? ` s="${s}"` : '';
  if (c.date) {
    const n = excelDate(c.date);
    if (n != null) return `<c r="${ref}"${sa}><v>${n}</v></c>`;
  }
  if (c.link) {
    const label = String(c.v ?? 'Open');
    const f = `HYPERLINK("${c.link.replace(/"/g, '""')}","${label.replace(/"/g, '""')}")`;
    return `<c r="${ref}"${sa} t="str"><f>${esc(f)}</f><v>${esc(label)}</v></c>`;
  }
  if (c.v == null || c.v === '') return s ? `<c r="${ref}"${sa}/>` : '';
  if (typeof c.v === 'number' && Number.isFinite(c.v)) return `<c r="${ref}"${sa}><v>${c.v}</v></c>`;
  return `<c r="${ref}"${sa} t="inlineStr"><is><t xml:space="preserve">${esc(String(c.v))}</t></is></c>`;
}

function sheetXml(sh: XSheet, hasDrawing: boolean): string {
  const cols = `<cols>${sh.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`;
  const rows = sh.rows
    .map((r, i) => {
      const cells = r.cells.map((c, j) => (c ? cellXml(c, `${colName(j)}${i + 1}`) : '')).join('');
      const ht = r.height ? ` ht="${r.height}" customHeight="1"` : '';
      return `<row r="${i + 1}"${ht}>${cells}</row>`;
    })
    .join('');
  const pane = sh.freezeRow
    ? `<pane ySplit="${sh.freezeRow}" topLeftCell="A${sh.freezeRow + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${sh.freezeRow + 1}" sqref="A${sh.freezeRow + 1}"/>`
    : '';
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheetPr>${sh.tab ? `<tabColor rgb="${sh.tab}"/>` : ''}<pageSetUpPr fitToPage="1"/></sheetPr>` +
    `<sheetViews><sheetView workbookViewId="0" showGridLines="0" zoomScale="100">${pane}</sheetView></sheetViews>` +
    '<sheetFormatPr defaultRowHeight="18" customHeight="1"/>' +
    cols +
    `<sheetData>${rows}</sheetData>` +
    (sh.autoFilter ? `<autoFilter ref="${sh.autoFilter}"/>` : '') +
    (sh.merges?.length ? `<mergeCells count="${sh.merges.length}">${sh.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '') +
    '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>' +
    `<pageSetup paperSize="9" orientation="${sh.landscape === false ? 'portrait' : 'landscape'}" fitToWidth="1" fitToHeight="0"/>` +
    '<headerFooter><oddFooter>&amp;L&amp;8LEED 26&amp;C&amp;8&amp;A&amp;R&amp;8Page &amp;P of &amp;N</oddFooter></headerFooter>' +
    (hasDrawing ? '<drawing r:id="rId1"/>' : '') +
    '</worksheet>'
  );
}

function drawingXml(l: NonNullable<XSheet['logo']>): string {
  const emu = (px: number) => Math.round(px * 9525);
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<xdr:oneCellAnchor>' +
    `<xdr:from><xdr:col>${l.col}</xdr:col><xdr:colOff>${emu(l.offX ?? 0)}</xdr:colOff><xdr:row>${l.row}</xdr:row><xdr:rowOff>${emu(l.offY ?? 0)}</xdr:rowOff></xdr:from>` +
    `<xdr:ext cx="${emu(l.width)}" cy="${emu(l.height)}"/>` +
    '<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="LEED 26 logo" descr="LEED 26 logo"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>' +
    '<xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>' +
    `<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${emu(l.width)}" cy="${emu(l.height)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>` +
    '</xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>'
  );
}

export function buildStyledXlsx(sheets: XSheet[], meta: { title: string; author: string }): Buffer {
  const used = new Set<string>();
  const names = sheets.map((s, i) => {
    let n = s.name.replace(/[\\/?*[\]:]/g, '').slice(0, 31) || `Sheet${i + 1}`;
    while (used.has(n.toLowerCase())) n = `${n.slice(0, 28)}_${i + 1}`;
    used.add(n.toLowerCase());
    return n;
  });
  const drawn = sheets.map((s, i) => (s.logo ? i : -1)).filter((i) => i >= 0);
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

  const files: { name: string; data: string | Buffer }[] = [
    {
      name: '[Content_Types].xml',
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Default Extension="png" ContentType="image/png"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
        sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
        drawn.map((i) => `<Override PartName="/xl/drawings/drawing${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`).join('') +
        '</Types>',
    },
    {
      name: '_rels/.rels',
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
        '</Relationships>',
    },
    {
      name: 'docProps/core.xml',
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
        `<dc:title>${esc(meta.title)}</dc:title><dc:creator>${esc(meta.author)}</dc:creator>` +
        `<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>` +
        '</cp:coreProperties>',
    },
    {
      name: 'xl/workbook.xml',
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        `<sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>` +
        `<definedNames>${sheets
          .map((s, i) => (s.autoFilter ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${esc(names[i])}'!${absRef(s.autoFilter)}</definedName>` : ''))
          .join('')}</definedNames>` +
        '</workbook>',
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
        `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        '</Relationships>',
    },
    { name: 'xl/styles.xml', data: stylesXml() },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s, Boolean(s.logo)) })),
  ];
  for (const i of drawn) {
    const l = sheets[i].logo!;
    files.push(
      {
        name: `xl/worksheets/_rels/sheet${i + 1}.xml.rels`,
        data:
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${i + 1}.xml"/>` +
          '</Relationships>',
      },
      { name: `xl/drawings/drawing${i + 1}.xml`, data: drawingXml(l) },
      {
        name: `xl/drawings/_rels/drawing${i + 1}.xml.rels`,
        data:
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${i + 1}.png"/>` +
          '</Relationships>',
      },
      { name: `xl/media/image${i + 1}.png`, data: l.png },
    );
  }
  return zip(files);
}
