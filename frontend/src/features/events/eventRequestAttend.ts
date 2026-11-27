/**
 * Request for permission to attend an outside event (FDP, conference, workshop at another institution),
 * in the same tabular layout as the department's event forms — Word and PDF, with the HOD / Principal
 * decision printed in their rows once given in the portal.
 */
import { listItems } from '../../components/common/NumberedListInput';
import { Approval, EventRequest, approvalRows, budgetTotal, dmy, rupees, totalLine } from './eventRequestDocs';
import { ReportRow, TabularDoc, eventReportTablePdf, eventReportWord } from './eventReportTabular';

const time12 = (hm: string) => {
  const m = /^(\d{2}):(\d{2})$/.exec(hm || '');
  if (!m) return hm;
  const h = Number(m[1]);
  return `${((h + 11) % 12) + 1}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
};
const n = (v: string) => Math.max(0, Math.round(Number(String(v || '').replace(/[^\d.]/g, '')) || 0));

export function attendRows(r: EventRequest, approval?: Approval | null): ReportRow[] {
  const rows: ReportRow[] = [];
  const text = (label: string, v: string) => { const s = String(v || '').trim(); if (s) rows.push({ kind: 'text', label, lines: s.split('\n').map(x => x.trim()).filter(Boolean) }); };
  const numbered = (label: string, v: string) => { const items = listItems(v); if (items.length) rows.push({ kind: 'numbered', label, items }); };
  text('Name of the Event', r.title);
  rows.push({ kind: 'ticks', label: 'Event Type', options: 'type', chosen: r.types.length ? r.types : ['Other'], other: r.other_type });
  text('Organised by (Host Institution / Organisation)', r.host);
  text('Place, Mode', [r.place, r.mode].filter(Boolean).join(', '));
  const from = dmy(r.from_date); const to = dmy(r.to_date);
  rows.push({ kind: 'pair', label: 'Date(s), Time',
    a: ['Dates:', to && to !== from ? `From ${from} To ${to}` : from || '—'],
    b: ['Time:', r.from_time ? `From ${time12(r.from_time)}${r.to_time ? ` To ${time12(r.to_time)}` : ''}` : '—'] });
  r.organizers.filter(o => o.name).forEach(o => text('Faculty Name, Designation, Department', [o.name, o.designation, o.department].filter(Boolean).join(', ')));
  numbered('Purpose / Relevance to the Department', r.objectives);
  numbered('Expected Benefit to the Department', r.expected_outcomes);
  const costs = [['Registration fee', r.registration_fee], ['Travel (TA/DA)', r.travel], ['Lodging and boarding', r.lodging]]
    .filter(([, v]) => n(v as string)).map(([l, v]) => `${l}: ${rupees(n(v as string))}`);
  if (costs.length) text('Expenses Requested', costs.join('\n'));
  if (budgetTotal(r)) text('Total Amount Requested (Rs), in words', totalLine(r));
  text('On-duty Days Requested', r.od_days);
  rows.push({ kind: 'sign', label: 'Faculty Name(s) and Signature(s)', names: r.organizers.map(o => o.name).filter(Boolean) });
  const a = approvalRows(approval);
  rows.push({ kind: 'hod', ...a.hod }, { kind: 'principal', ...a.principal });
  return rows;
}

const docFor = (r: EventRequest, approval?: Approval | null): TabularDoc => ({
  rows: attendRows(r, approval), title: 'REQUEST FOR PERMISSION TO ATTEND',
  fileName: `Request to Attend - ${r.title || 'Event'}${r.from_date ? ` - ${dmy(r.from_date)}` : ''}`.replace(/[^A-Za-z0-9._ ()&-]+/g, '_'),
  author: r.organizers[0]?.name || undefined,
});
export const attendWord = (r: EventRequest, department: string, approval?: Approval | null) => eventReportWord({ department }, docFor(r, approval));
export const attendPdf = (r: EventRequest, department: string, approval?: Approval | null) => eventReportTablePdf({ department }, docFor(r, approval));
