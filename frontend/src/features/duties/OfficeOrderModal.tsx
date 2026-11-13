import React, { useState } from 'react';
import { Printer, X } from 'lucide-react';
import { PrintPortal } from '../../components/common/PrintPortal';

export interface DutyOrder {
  id: number;
  order_no: string;
  academic_year: string;
  faculty_email: string;
  faculty_name?: string;
  department?: string;
  duty_code: string;
  duty_name: string;
  position: string;
  effective_from: string;
  effective_to?: string | null;
  responsibilities?: string | null;
  status: 'Active' | 'Relieved' | 'Cancelled';
  relieved_on?: string | null;
  issued_by: string;
  issued_by_role: string;
  issued_at: string;
}

export const fmtLong = (d?: string | null) =>
  d ? new Date(String(d).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

/** Body label, e.g. "Institution's Innovation Council (IIC)". */
export const bodyLabel = (o: Pick<DutyOrder, 'duty_code' | 'duty_name'>) =>
  o.duty_code === 'OTHER' ? o.duty_name : `${o.duty_name} (${o.duty_code})`;

/**
 * Printable office order on the college letterhead. Shows the appointment order; for a relieved
 * appointment the relieving order can be printed too.
 */
export const OfficeOrderModal: React.FC<{ order: DutyOrder; onClose: () => void }> = ({ order, onClose }) => {
  const [kind, setKind] = useState<'appointment' | 'relieving'>('appointment');
  const relieving = kind === 'relieving';
  const signatory = (order.issued_by_role || 'principal').toUpperCase();
  const name = order.faculty_name || order.faculty_email;
  const dept = order.department ? `, Department of ${order.department}` : '';
  const body = bodyLabel(order);
  const duties = String(order.responsibilities || '').split('\n').map(l => l.replace(/^\s*[-•\d.)]+\s*/, '').trim()).filter(Boolean);
  const orderNo = relieving ? `${order.order_no}/R` : order.order_no;
  const orderDate = relieving ? fmtLong(order.relieved_on) : fmtLong(order.issued_at);

  return (
    <PrintPortal>
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
        <div className="bg-surface border border-borderLine rounded-2xl max-w-3xl w-full shadow-2xl flex flex-col max-h-[92vh] overflow-hidden print:max-h-none print:shadow-none print:border-none">
          <div className="p-4 border-b border-borderLine bg-surface-2 flex items-center justify-between gap-2 flex-wrap print:hidden">
            <span className="text-sm font-bold text-textPrimary">Office order · {order.order_no}</span>
            <div className="flex gap-2 items-center">
              {order.status === 'Relieved' && (
                <div className="flex rounded-xl border border-borderLine overflow-hidden text-[11px] font-bold">
                  {(['appointment', 'relieving'] as const).map(k => (
                    <button key={k} onClick={() => setKind(k)}
                      className={`px-3 py-1.5 capitalize ${kind === k ? 'bg-brand-primary text-white' : 'text-textSecondary'}`}>{k}</button>
                  ))}
                </div>
              )}
              <button onClick={() => window.print()} className="px-3.5 py-1.5 rounded-xl bg-brand-primary text-white text-xs font-bold inline-flex items-center gap-1.5"><Printer className="w-3.5 h-3.5" />Print / Save PDF</button>
              <button onClick={onClose} className="p-1.5 rounded-xl border border-borderLine text-textMuted" aria-label="Close"><X className="w-4 h-4" /></button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-950 print:p-0 print:bg-white print:overflow-visible">
            <div className="relative bg-white text-slate-900 p-8 sm:p-10 rounded-xl max-w-2xl mx-auto space-y-5 border border-slate-200 print:border-none print:p-0 print:rounded-none text-[13px] leading-relaxed">
              {order.status === 'Cancelled' && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="text-6xl font-black text-red-500/25 -rotate-12 border-8 border-red-500/25 px-6 py-2 rounded-xl">CANCELLED</span>
                </div>
              )}
              <div className="border-b-2 border-slate-900 pb-3 text-center">
                <h1 className="text-base font-black uppercase tracking-wide">Rajeev Gandhi Memorial College of Engineering &amp; Technology</h1>
                <p className="text-[10px] font-semibold text-slate-700 uppercase tracking-wider">(Autonomous) • Nandyal, Andhra Pradesh</p>
                <p className="text-[10px] text-slate-600 mt-0.5">Office of the {signatory === 'DIRECTOR' ? 'Director' : 'Principal'}</p>
              </div>

              <div className="flex justify-between text-xs font-bold">
                <span>Order No: {orderNo}</span>
                <span>Date: {orderDate}</span>
              </div>

              <h2 className="text-center font-black tracking-[0.3em] underline underline-offset-4">OFFICE ORDER</h2>

              <p className="text-xs"><b>Sub:</b> {relieving
                ? <>Relieving from the position of {order.position}, {body} — Orders issued.</>
                : <>Appointment as {order.position}, {body} — Orders issued.</>}</p>
              {relieving && <p className="text-xs"><b>Ref:</b> Office Order No. {order.order_no}, dated {fmtLong(order.issued_at)}.</p>}

              {relieving ? (
                <p className="text-justify indent-10">
                  {name}{dept}, who was appointed as <b>{order.position}</b> of the <b>{body}</b> vide the order cited, is hereby
                  relieved of the said responsibility <b>with effect from {fmtLong(order.relieved_on)}</b>. The management places on
                  record its appreciation of the services rendered.
                </p>
              ) : (
                <>
                  <p className="text-justify indent-10">
                    <b>With effect from {fmtLong(order.effective_from)}</b>, {name}{dept}, is hereby appointed as
                    {' '}<b>{order.position}</b> of the <b>{body}</b> of the college
                    {order.effective_to ? <>, up to <b>{fmtLong(order.effective_to)}</b></> : ', until further orders'}.
                  </p>
                  {duties.length > 0 && (
                    <div>
                      <p>The appointee shall discharge the following responsibilities:</p>
                      <ol className="list-decimal pl-8 mt-1 space-y-0.5">{duties.map((d, i) => <li key={i}>{d}</li>)}</ol>
                    </div>
                  )}
                  <p className="text-justify indent-10">
                    The appointee is requested to take charge, plan and coordinate the activities of the {order.duty_code === 'OTHER' ? 'committee' : order.duty_code}
                    {' '}in consultation with the IQAC, maintain records, and submit periodic reports to the undersigned.
                  </p>
                </>
              )}

              <div className="pt-12 flex justify-end">
                <div className="text-center">
                  <div className="w-44 border-b border-slate-400 mb-1" />
                  <p className="font-black text-xs">{signatory}</p>
                </div>
              </div>

              <div className="text-[11px] space-y-0.5">
                <p><b>To:</b> {name}{order.department ? `, ${order.department}` : ''}</p>
                <p><b>Copy to:</b> Head of the Department{order.department ? ` (${order.department})` : ''}; IQAC Coordinator; {order.duty_code !== 'IQAC' && order.duty_code !== 'OTHER' ? `${order.duty_code} records; ` : ''}Office file.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PrintPortal>
  );
};

export default OfficeOrderModal;
