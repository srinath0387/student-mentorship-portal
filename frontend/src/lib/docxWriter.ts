/**
 * Minimal .docx writer (WordprocessingML zipped with JSZip) — headings, paragraphs, tables,
 * page orientation. Enough for lesson plans and reports that faculty want to edit in Word.
 */
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

const esc = (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
type Align = 'left' | 'center' | 'right';
export type Run = { text: string; bold?: boolean; size?: number; color?: string };
export type Block = string;

const run = (r: Run) => {
  const props = `${r.bold ? '<w:b/>' : ''}${r.color ? `<w:color w:val="${r.color}"/>` : ''}${r.size ? `<w:sz w:val="${r.size * 2}"/><w:szCs w:val="${r.size * 2}"/>` : ''}`;
  // keep line breaks inside one paragraph
  return String(r.text ?? '').split('\n').map((t, i) => `${i ? '<w:r><w:br/></w:r>' : ''}<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${esc(t)}</w:t></w:r>`).join('');
};

export function para(content: string | Run | Run[], o: { align?: Align; spaceAfter?: number; bold?: boolean; size?: number; shade?: string; keepNext?: boolean } = {}): Block {
  const runs = (Array.isArray(content) ? content : [typeof content === 'string' ? { text: content } : content])
    .map(r => ({ bold: o.bold, size: o.size, ...r }));
  return `<w:p><w:pPr>${o.keepNext ? '<w:keepNext/>' : ''}${o.shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.shade}"/>` : ''}<w:spacing w:after="${o.spaceAfter ?? 80}"/>${o.align ? `<w:jc w:val="${o.align === 'center' ? 'center' : o.align}"/>` : ''}</w:pPr>${runs.map(run).join('')}</w:p>`;
}

export const heading = (text: string) => para({ text, bold: true, size: 11 }, { shade: 'EBF0F8', spaceAfter: 100, keepNext: true });

/** Numbered list from "1. a\n2. b" text or an array */
export function numbered(items: string[] | string, size = 10): Block {
  const list = Array.isArray(items) ? items : String(items || '').split('\n').map(l => l.replace(/^\s*(?:\d+[.)]|[-•*])\s*/, '').trim()).filter(Boolean);
  return list.map((t, i) => para({ text: `${i + 1}. ${t}`, size }, { spaceAfter: 40 })).join('');
}

/** widths in twentieths of a point (dxa); header row repeats on every page */
export function table(head: string[] | null, rows: (string | number | null | undefined)[][], widths: number[], o: { size?: number; boldFirstCol?: boolean } = {}): Block {
  const size = o.size ?? 9;
  const cell = (v: any, w: number, isHead: boolean, col: number) =>
    `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${isHead ? '<w:shd w:val="clear" w:color="auto" w:fill="1E3A5F"/>' : ''}</w:tcPr>`
    + para({ text: v == null ? '' : String(v), bold: isHead || (o.boldFirstCol && col === 0), size, color: isHead ? 'FFFFFF' : undefined }, { spaceAfter: 0 }) + '</w:tc>';
  const border = (side: string) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="9CA3AF"/>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="${widths.reduce((a, b) => a + b, 0)}" w:type="dxa"/><w:tblLayout w:type="fixed"/>`
    + `<w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('')}</w:tblBorders>`
    + `<w:tblCellMar><w:left w:w="70" w:type="dxa"/><w:right w:w="70" w:type="dxa"/></w:tblCellMar></w:tblPr>`
    + `<w:tblGrid>${widths.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`
    + (head ? `<w:tr><w:trPr><w:tblHeader/></w:trPr>${head.map((h, i) => cell(h, widths[i], true, i)).join('')}</w:tr>` : '')
    + rows.map(r => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${r.map((v, i) => cell(v, widths[i], false, i)).join('')}</w:tr>`).join('')
    + '</w:tbl>' + para('', { spaceAfter: 120 });
}

export async function saveDocx(fileName: string, blocks: Block[], o: { landscape?: boolean } = {}) {
  const [w, h] = o.landscape ? [16838, 11906] : [11906, 16838];
  const body = blocks.join('')
    + `<w:sectPr><w:pgSz w:w="${w}" w:h="${h}"${o.landscape ? ' w:orient="landscape"' : ''}/><w:pgMar w:top="900" w:right="900" w:bottom="900" w:left="900" w:header="500" w:footer="500" w:gutter="0"/></w:sectPr>`;
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
  zip.file('word/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="en-IN"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>');
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`);
  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  saveAs(blob, fileName.replace(/[^A-Za-z0-9._ ()&-]+/g, '_'));
}
