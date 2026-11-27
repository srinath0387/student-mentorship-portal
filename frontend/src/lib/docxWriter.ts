/**
 * Minimal .docx writer (WordprocessingML zipped with JSZip) — paragraphs with coloured runs,
 * tables (merged cells, borderless layout tables), an inline picture, page orientation.
 * Enough for lesson plans and reports that faculty want to edit in Word.
 */
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

const esc = (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
type Align = 'left' | 'center' | 'right';
export type Run = { text: string; bold?: boolean; size?: number; color?: string; font?: string };
export type Block = string;

const run = (r: Run) => {
  const props = `${r.font ? `<w:rFonts w:ascii="${r.font}" w:hAnsi="${r.font}" w:cs="${r.font}"/>` : ''}${r.bold ? '<w:b/>' : ''}${r.color ? `<w:color w:val="${r.color}"/>` : ''}${r.size ? `<w:sz w:val="${r.size * 2}"/><w:szCs w:val="${r.size * 2}"/>` : ''}`;
  // keep line breaks inside one paragraph
  return String(r.text ?? '').split('\n').map((t, i) => `${i ? '<w:r><w:br/></w:r>' : ''}<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${esc(t)}</w:t></w:r>`).join('');
};

export function para(content: string | Run | Run[], o: { align?: Align; spaceAfter?: number; bold?: boolean; size?: number; shade?: string; keepNext?: boolean; font?: string; ruleBelow?: boolean } = {}): Block {
  const runs = (Array.isArray(content) ? content : [typeof content === 'string' ? { text: content } : content])
    .map(r => ({ bold: o.bold, size: o.size, font: o.font, ...r }));
  const border = o.ruleBelow ? '<w:pBdr><w:bottom w:val="single" w:sz="12" w:space="2" w:color="000000"/></w:pBdr>' : '';
  return `<w:p><w:pPr>${o.keepNext ? '<w:keepNext/>' : ''}${border}${o.shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.shade}"/>` : ''}<w:spacing w:before="0" w:after="${o.spaceAfter ?? 80}"/>${o.align ? `<w:jc w:val="${o.align}"/>` : ''}</w:pPr>${runs.map(run).join('')}</w:p>`;
}

export const heading = (text: string) => para({ text, bold: true, size: 11 }, { shade: 'EBF0F8', spaceAfter: 100, keepNext: true });

/** Numbered list from "1. a\n2. b" text or an array */
export function numbered(items: string[] | string, size = 10): Block {
  const list = Array.isArray(items) ? items : String(items || '').split('\n').map(l => l.replace(/^\s*(?:\d+[.)]|[-•*])\s*/, '').trim()).filter(Boolean);
  return list.map((t, i) => para({ text: `${i + 1}. ${t}`, size }, { spaceAfter: 40 })).join('');
}

/** A table cell: plain text, or styled runs / raw blocks, optionally spanning columns */
export type Cell = string | number | null | undefined | {
  runs?: Run[]; blocks?: Block; span?: number; align?: Align; bold?: boolean; shade?: string; vAlign?: 'top' | 'center' | 'bottom';
};

/** widths in twentieths of a point (dxa); header row repeats on every page */
export function table(head: Cell[] | null, rows: Cell[][], widths: number[], o: {
  size?: number; boldFirstCol?: boolean; borderless?: boolean; headShade?: string; headColor?: string; font?: string; align?: Align; vAlign?: 'top' | 'center';
} = {}): Block {
  const size = o.size ?? 9;
  const cell = (v: Cell, col: number, isHead: boolean) => {
    const obj = v != null && typeof v === 'object' ? v : null;
    const span = obj?.span || 1;
    const w = widths.slice(col, col + span).reduce((a, b) => a + b, 0);
    const shade = isHead ? (o.headShade ?? '1E3A5F') : obj?.shade;
    const color = isHead ? (o.headColor ?? 'FFFFFF') : undefined;
    const runs: Run[] = obj?.runs ?? [{ text: obj ? '' : v == null ? '' : String(v) }];
    const body = obj?.blocks ?? para(runs.map(r => ({ color, ...r })), {
      spaceAfter: 0, size, font: o.font, align: obj?.align ?? (isHead ? 'center' : o.align),
      bold: isHead || obj?.bold || (o.boldFirstCol && col === 0),
    });
    return { span, xml: `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ''}${shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${shade}"/>` : ''}<w:vAlign w:val="${obj?.vAlign ?? o.vAlign ?? 'top'}"/></w:tcPr>${body}</w:tc>` };
  };
  const rowXml = (cells: Cell[], isHead: boolean) => {
    let col = 0; let xml = '';
    for (const c of cells) { const x = cell(c, col, isHead); xml += x.xml; col += x.span; }
    return xml;
  };
  const border = (side: string) => `<w:${side} w:val="${o.borderless ? 'nil' : 'single'}" w:sz="6" w:space="0" w:color="000000"/>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="${widths.reduce((a, b) => a + b, 0)}" w:type="dxa"/><w:tblLayout w:type="fixed"/>`
    + `<w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('')}</w:tblBorders>`
    + `<w:tblCellMar><w:top w:w="30" w:type="dxa"/><w:left w:w="70" w:type="dxa"/><w:bottom w:w="30" w:type="dxa"/><w:right w:w="70" w:type="dxa"/></w:tblCellMar></w:tblPr>`
    + `<w:tblGrid>${widths.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`
    + (head ? `<w:tr><w:trPr><w:tblHeader/></w:trPr>${rowXml(head, true)}</w:tr>` : '')
    + rows.map(r => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${rowXml(r, false)}</w:tr>`).join('')
    + '</w:tbl>' + para('', { spaceAfter: 120 });
}

/** An inline picture; add the same id + bytes to saveDocx({ images }) */
export function picture(id: string, widthCm: number, heightCm: number, align: Align = 'center'): Block {
  const cx = Math.round(widthCm * 360000); const cy = Math.round(heightCm * 360000);
  const n = Math.abs([...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % 100000 + 1;
  return `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/><w:jc w:val="${align}"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${n}" name="Picture ${n}"/>`
    + `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">`
    + `<pic:nvPicPr><pic:cNvPr id="${n}" name="image${n}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
    + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

export async function saveDocx(fileName: string, blocks: Block[], o: { landscape?: boolean; images?: { id: string; data: Uint8Array; ext: 'png' | 'jpeg' }[]; font?: string } = {}) {
  const [w, h] = o.landscape ? [16838, 11906] : [11906, 16838];
  const body = blocks.join('')
    + `<w:sectPr><w:pgSz w:w="${w}" w:h="${h}"${o.landscape ? ' w:orient="landscape"' : ''}/><w:pgMar w:top="850" w:right="850" w:bottom="850" w:left="850" w:header="500" w:footer="500" w:gutter="0"/></w:sectPr>`;
  const font = o.font || 'Calibri';
  const images = o.images || [];
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    + images.map(im => `<Relationship Id="${im.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${im.id}.${im.ext}"/>`).join('') + '</Relationships>');
  for (const im of images) zip.file(`word/media/${im.id}.${im.ext}`, im.data);
  zip.file('word/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}" w:eastAsia="${font}"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="en-IN"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="252" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`);
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body}</w:body></w:document>`);
  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  saveAs(blob, fileName.replace(/[^A-Za-z0-9._ ()&-]+/g, '_'));
}
