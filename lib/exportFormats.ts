// The same export model as the Excel file, turned into:
//   preview  JSON the admin console shows before downloading
//   csv      one sheet as CSV (UTF-8, opens in Excel)
//   print    a print-ready page with the logo; the browser's "Save as PDF" makes the PDF

import { LOGO_PNG } from './brandLogo';
import type { ExportModel } from './paymentExport';
import type { Style, XCell, XSheet } from './xlsxStyled';

const BAND: Style[] = ['band', 'bandTitle', 'bandSub'];

export interface PreviewCell {
  text: string;
  style?: Style;
  link?: string;
}

export interface PreviewSheet {
  name: string;
  title: string;
  subtitle: string;
  rows: PreviewCell[][];
}

const day = (iso: string) => {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00+08:00` : iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kuala_Lumpur' });
};

function text(c: XCell): string {
  if (c.date) return day(c.date);
  if (c.v == null) return '';
  if (typeof c.v === 'number' && (c.s === 'money' || c.s === 'moneyAlt' || c.s === 'valueMoney' || c.s === 'totalMoney'))
    return `RM${c.v.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return String(c.v);
}

/** Rows of a sheet without its logo band and empty spacer rows. */
function bodyRows(sh: XSheet): XCell[][] {
  return sh.rows
    .map((r) => r.cells.map((c) => c ?? {}))
    .filter((cells) => cells.length > 0 && !cells.every((c) => !c.s || BAND.includes(c.s)) && cells.some((c) => c.v != null || c.date || c.s));
}

function bandText(sh: XSheet): { title: string; subtitle: string } {
  const title = sh.rows.flatMap((r) => r.cells).find((c) => c?.s === 'bandTitle' && c.v)?.v;
  const subtitle = sh.rows.flatMap((r) => r.cells).find((c) => c?.s === 'bandSub' && c.v)?.v;
  return { title: String(title ?? sh.name), subtitle: String(subtitle ?? '') };
}

export function toPreview(m: ExportModel): { title: string; generatedAt: string; sheets: PreviewSheet[] } {
  return {
    title: m.title,
    generatedAt: new Date().toISOString(),
    sheets: m.sheets.map((sh) => ({
      name: sh.name,
      ...bandText(sh),
      rows: bodyRows(sh).map((cells) =>
        cells.map((c) => ({ text: text(c), ...(c.s ? { style: c.s } : {}), ...(c.link ? { link: c.link } : {}) })),
      ),
    })),
  };
}

const csvCell = (v: unknown): string => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // stop spreadsheets running a cell as a formula
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** One sheet as CSV. Dates as YYYY-MM-DD, money as plain numbers, links as the address. */
export function toCsv(m: ExportModel, sheetName?: string | null): { name: string; csv: string } {
  const sh = m.sheets.find((s) => s.name === sheetName) ?? m.sheets.find((s) => s.name !== 'Summary') ?? m.sheets[0];
  const rows = bodyRows(sh).map((cells) => {
    const vals = cells.map((c) => (c.link ? c.link : c.date ? c.date.slice(0, 10) : (c.v ?? '')));
    while (vals.length && vals[vals.length - 1] === '') vals.pop();
    return vals;
  });
  // Every row gets the same number of columns, so blank cells at the end still line up.
  const width = Math.max(0, ...rows.map((r) => r.length));
  const lines = rows.map((r) => [...r, ...Array(width - r.length).fill('')].map(csvCell).join(','));
  return { name: sh.name, csv: `﻿${lines.join('\r\n')}\r\n` };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A print-ready page of every sheet. Opens the print dialog so the committee can save it as PDF. */
export function toPrintHtml(m: ExportModel): string {
  const p = toPreview(m);
  const logo = `data:image/png;base64,${LOGO_PNG.base64}`;
  const sheets = p.sheets
    .map((sh, i) => {
      const isTable = sh.rows.some((r) => r.some((c) => c.style === 'head'));
      const rows = sh.rows
        .map((r) => {
          const tag = r.some((c) => c.style === 'head') ? 'th' : 'td';
          return `<tr>${r
            .map((c) => {
              const t = esc(c.text);
              const inner = c.link ? `<a href="${esc(c.link)}">${t}</a>` : t;
              return `<${tag} class="${c.style ?? ''}">${inner}</${tag}>`;
            })
            .join('')}</tr>`;
        })
        .join('');
      return `<section class="${i ? 'next' : ''}"><header><img src="${logo}" alt=""><div><h1>${esc(sh.title)}</h1><p>${esc(sh.subtitle)}</p></div></header>
      <table class="${isTable ? 'grid' : 'summary'}">${rows}</table></section>`;
    })
    .join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${esc(m.file)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
@page { size: A4 landscape; margin: 12mm; }
* { box-sizing: border-box; }
body { margin: 0; font: 9pt/1.35 'Segoe UI', Roboto, Arial, sans-serif; color: #1d0b3a; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.bar { position: sticky; top: 0; display: flex; gap: 10px; align-items: center; padding: 10px 16px; background: #fbf6e6; border-bottom: 2px solid #1d0b3a; font-weight: 600; }
.bar button { padding: 8px 16px; border: 2px solid #1d0b3a; border-radius: 999px; background: #ffd91a; font: inherit; font-weight: 800; cursor: pointer; }
main { padding: 16px; }
section.next { break-before: page; margin-top: 24px; }
header { display: flex; gap: 16px; align-items: center; padding: 10px 16px; border-radius: 10px; background: #13042e; color: #fff; margin-bottom: 10px; }
header img { width: 90px; }
header h1 { margin: 0; font-size: 15pt; font-style: italic; color: #ffd91a; }
header p { margin: 2px 0 0; color: #d9cdf5; font-size: 8.5pt; }
table { width: 100%; border-collapse: collapse; }
table.grid th, table.grid td { border: 1px solid #dcd3ec; padding: 3px 5px; text-align: left; vertical-align: top; }
table.grid th { background: #5a12a8; color: #fff; }
table.grid tr:nth-child(odd) td { background: #f7f3ff; }
table.summary { width: auto; min-width: 50%; }
table.summary td { padding: 4px 10px; border-bottom: 1px solid #dcd3ec; }
td.section { color: #5a12a8; font-weight: 800; font-size: 11pt; border: 0 !important; padding-top: 12px !important; }
td.value, td.valueMoney { font-weight: 800; font-size: 12pt; text-align: right; background: #fbf6e6; }
td.note { color: #6b5f86; font-style: italic; border: 0 !important; }
td.ok { background: #c9f7ec !important; font-weight: 700; text-align: center; }
td.wait { background: #fff1a8 !important; font-weight: 700; text-align: center; }
td.bad { background: #ff1a9a !important; color: #fff; font-weight: 700; text-align: center; }
td.none { background: #edeaf2 !important; text-align: center; }
td.center, td.centerAlt, td.tick { text-align: center; font-weight: 700; }
td.mono, td.monoAlt { font-family: Consolas, monospace; }
td.totalLabel, td.total, td.totalMoney { background: #ede4ff !important; font-weight: 800; border-top: 2px solid #1d0b3a; }
a { color: #5a12a8; }
@media print { .bar { display: none; } main { padding: 0; } }
</style></head><body>
<div class="bar"><button type="button" onclick="window.print()">Save as PDF</button><span>In the print window, choose “Save as PDF” as the printer.</span></div>
<main>${sheets}</main>
<script>window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 400); });</script>
</body></html>`;
}
