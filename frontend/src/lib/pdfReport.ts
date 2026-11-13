/**
 * Shared PDF builder for official reports (lesson plans, minutes of meetings, event reports).
 * College letterhead, section headings, tables, wrapped paragraphs, photo grid, signature row,
 * page numbers. Everything runs in the browser with jsPDF.
 */
import type { jsPDF as JsPDF } from 'jspdf';

export const COLLEGE = 'RAJEEV GANDHI MEMORIAL COLLEGE OF ENGINEERING & TECHNOLOGY';
export const COLLEGE_SUB = '(Autonomous) · Nandyal, Andhra Pradesh';

const M = 15; // page margin (mm)

export async function urlToDataUrl(url: string): Promise<string | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const blob = await r.blob();
    return await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = () => res(null); fr.readAsDataURL(blob); });
  } catch { return null; }
}

/** Re-encode an image at a smaller size (the crest PNG is large; photos are capped too). */
async function shrink(dataUrl: string, maxSide: number, type: 'image/png' | 'image/jpeg'): Promise<string> {
  return new Promise(res => {
    const i = new Image();
    i.onload = () => {
      const s = Math.min(1, maxSide / Math.max(i.naturalWidth, i.naturalHeight));
      if (s === 1 && type === 'image/jpeg' && dataUrl.startsWith('data:image/jpeg')) return res(dataUrl);
      const c = document.createElement('canvas');
      c.width = Math.round(i.naturalWidth * s); c.height = Math.round(i.naturalHeight * s);
      const ctx = c.getContext('2d')!;
      if (type === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
      ctx.drawImage(i, 0, 0, c.width, c.height);
      res(c.toDataURL(type, 0.85));
    };
    i.onerror = () => res(dataUrl);
    i.src = dataUrl;
  });
}

function imageSize(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise(res => { const i = new Image(); i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => res({ w: 4, h: 3 }); i.src = dataUrl; });
}

export class ReportPdf {
  doc!: JsPDF;
  y = M;
  autoTable!: (doc: any, opts: any) => void;
  private crest: string | null = null;
  private dept = '';

  static async create(department: string, orientation: 'portrait' | 'landscape' = 'portrait') {
    const r = new ReportPdf();
    const { jsPDF } = await import('jspdf');
    r.autoTable = (await import('jspdf-autotable')).default as any;
    r.doc = new jsPDF({ unit: 'mm', format: 'a4', orientation });
    const crest = await urlToDataUrl('/rgmcet-crest.png');
    r.crest = crest ? await shrink(crest, 220, 'image/png') : null;
    r.dept = department;
    r.letterhead();
    return r;
  }

  get W() { return this.doc.internal.pageSize.getWidth(); }
  get H() { return this.doc.internal.pageSize.getHeight(); }
  get inner() { return this.W - 2 * M; }

  letterhead() {
    const d = this.doc;
    if (this.crest) { try { d.addImage(this.crest, 'PNG', M, 10, 18, 18); } catch { /* ignore bad image */ } }
    const cx = this.W / 2 + 10;
    d.setFont('helvetica', 'bold'); d.setTextColor(20);
    let size = 13;
    d.setFontSize(size);
    while (size > 9.5 && d.getTextWidth(COLLEGE) > this.inner - 30) { size -= 0.5; d.setFontSize(size); }
    const lines: string[] = d.splitTextToSize(COLLEGE, this.inner - 30);
    let y = 14.5;
    for (const l of lines) { d.text(l, cx, y, { align: 'center' }); y += size * 0.42; }
    d.setFont('helvetica', 'normal'); d.setFontSize(9); d.setTextColor(70);
    d.text(COLLEGE_SUB, cx, y + 0.8, { align: 'center' }); y += 5.2;
    if (this.dept) { d.setFont('helvetica', 'bold'); d.setFontSize(10); d.setTextColor(30); d.text(`Department of ${this.dept}`, cx, y + 0.6, { align: 'center' }); y += 5; }
    const rule = Math.max(31, y + 1.5);
    d.setDrawColor(20); d.setLineWidth(0.6); d.line(M, rule, this.W - M, rule);
    d.setLineWidth(0.2); d.line(M, rule + 1.2, this.W - M, rule + 1.2);
    this.y = rule + 8;
    d.setTextColor(20);
  }

  ensure(h: number) { if (this.y + h > this.H - 18) { this.doc.addPage(); this.y = M + 2; } }

  title(text: string, sub?: string) {
    const d = this.doc;
    this.ensure(14);
    d.setFont('helvetica', 'bold'); d.setFontSize(13); d.text(text.toUpperCase(), this.W / 2, this.y, { align: 'center', maxWidth: this.inner });
    const lines = d.splitTextToSize(text.toUpperCase(), this.inner).length;
    this.y += 5 * lines + 1;
    if (sub) { d.setFont('helvetica', 'normal'); d.setFontSize(10); d.setTextColor(60); d.text(sub, this.W / 2, this.y, { align: 'center', maxWidth: this.inner }); d.setTextColor(20); this.y += 6; }
    this.y += 2;
  }

  /** "Ref: … " on the left, "Date: …" on the right */
  refLine(left: string, right: string) {
    const d = this.doc;
    d.setFont('helvetica', 'normal'); d.setFontSize(9.5);
    if (left) d.text(left, M, this.y);
    if (right) d.text(right, this.W - M, this.y, { align: 'right' });
    this.y += 6;
  }

  heading(text: string, keepWith = 24) {
    const d = this.doc;
    this.ensure(keepWith);
    d.setFillColor(235, 240, 248); d.rect(M, this.y - 4.5, this.inner, 6.5, 'F');
    d.setFont('helvetica', 'bold'); d.setFontSize(10.5); d.text(text, M + 2, this.y);
    this.y += 6;
  }

  para(text?: string | null, opts: { bullets?: boolean } = {}) {
    if (!text || !String(text).trim()) return;
    const d = this.doc;
    d.setFont('helvetica', 'normal'); d.setFontSize(10);
    const blocks = String(text).split(/\n+/).map(s => s.trim()).filter(Boolean);
    for (const b of blocks) {
      const bullet = opts.bullets || /^[-•*]\s/.test(b);
      const clean = b.replace(/^[-•*]\s*/, '');
      const lines = d.splitTextToSize(clean, this.inner - (bullet ? 6 : 0));
      for (let i = 0; i < lines.length; i++) {
        this.ensure(5.2);
        if (bullet && i === 0) d.text('•', M + 1.5, this.y);
        d.text(lines[i], M + (bullet ? 6 : 0), this.y);
        this.y += 5;
      }
      this.y += 1;
    }
    this.y += 1;
  }

  /** Two-column label / value table */
  keyValues(rows: [string, string | number | null | undefined][]) {
    const body = rows.filter(([, v]) => v != null && String(v).trim() !== '').map(([k, v]) => [k, String(v)]);
    if (!body.length) return;
    this.autoTable(this.doc, {
      startY: this.y, margin: { left: M, right: M }, body, theme: 'grid',
      styles: { fontSize: 9.5, cellPadding: 1.8, textColor: 20, lineColor: 160, lineWidth: 0.15 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 52, fillColor: [246, 248, 251] } },
    });
    this.y = (this.doc as any).lastAutoTable.finalY + 5;
  }

  table(head: string[], body: (string | number | null | undefined)[][], columnStyles: Record<number, any> = {}) {
    if (!body.length) return;
    this.autoTable(this.doc, {
      startY: this.y, margin: { left: M, right: M }, head: [head], body: body.map(r => r.map(c => (c == null ? '' : String(c)))), theme: 'grid',
      styles: { fontSize: 8.8, cellPadding: 1.6, textColor: 20, lineColor: 160, lineWidth: 0.15, valign: 'top' },
      headStyles: { fillColor: [30, 58, 95], textColor: 255, fontStyle: 'bold' },
      columnStyles,
    });
    this.y = (this.doc as any).lastAutoTable.finalY + 5;
  }

  /** Photos, two per row, with captions */
  async photos(items: { url: string; caption?: string | null }[]) {
    const d = this.doc;
    const colW = (this.inner - 6) / 2;
    let col = 0; let rowH = 0;
    for (const it of items) {
      const raw = await urlToDataUrl(it.url);
      if (!raw) continue;
      const data = await shrink(raw, 1200, 'image/jpeg');
      const { w, h } = await imageSize(data);
      const ih = Math.min(70, colW * (h / w));
      const iw = ih * (w / h);
      const need = ih + 9;
      if (col === 0) { this.ensure(need); rowH = 0; }
      const x = M + col * (colW + 6) + (colW - iw) / 2;
      const fmt = data.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      try { d.addImage(data, fmt, x, this.y, iw, ih); d.setDrawColor(180); d.rect(x, this.y, iw, ih); } catch { continue; }
      if (it.caption) {
        d.setFont('helvetica', 'italic'); d.setFontSize(8.5); d.setTextColor(70);
        d.text(d.splitTextToSize(it.caption, colW)[0], M + col * (colW + 6) + colW / 2, this.y + ih + 4, { align: 'center' });
        d.setTextColor(20);
      }
      rowH = Math.max(rowH, need);
      col++;
      if (col === 2) { col = 0; this.y += rowH + 2; }
    }
    if (col === 1) this.y += rowH + 2;
  }

  /** Signature boxes along the bottom: names under a line */
  signatures(labels: { role: string; name?: string | null }[]) {
    const d = this.doc;
    this.ensure(28);
    this.y += 14;
    const w = this.inner / labels.length;
    labels.forEach((l, i) => {
      const cx = M + w * i + w / 2;
      d.setDrawColor(60); d.line(cx - w / 2 + 6, this.y, cx + w / 2 - 6, this.y);
      d.setFont('helvetica', 'bold'); d.setFontSize(9.5); d.text(l.role, cx, this.y + 5, { align: 'center' });
      if (l.name) { d.setFont('helvetica', 'normal'); d.setFontSize(8.5); d.text(l.name, cx, this.y + 9.5, { align: 'center', maxWidth: w - 4 }); }
    });
    this.y += 14;
  }

  save(fileName: string) {
    const d = this.doc;
    const n = d.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      d.setPage(i);
      d.setFont('helvetica', 'normal'); d.setFontSize(8); d.setTextColor(120);
      d.text(`Page ${i} of ${n}`, this.W - M, this.H - 8, { align: 'right' });
      d.text(`Generated ${new Date().toLocaleDateString('en-IN')} · RGM ManageBAC`, M, this.H - 8);
    }
    d.save(fileName.replace(/[^A-Za-z0-9._ -]+/g, '_'));
  }
}

export const fmtD = (v: any) => {
  if (!v) return '';
  const s = String(v instanceof Date ? v.toISOString() : v).slice(0, 10);
  return new Date(s + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};
