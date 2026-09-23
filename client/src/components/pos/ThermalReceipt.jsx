import React from 'react';
import { fmtMoney, fmtDate } from '../../utils/formatters';

export function ThermalReceipt({ invoice, settings }) {
  if (!invoice) return null;

  const is58mm = settings.thermal_printer_size === '58mm';

  return (
    <div
      id="printable-receipt"
      className="hidden print:block font-mono text-[11px] leading-tight text-black bg-white mx-auto"
      style={{ width: is58mm ? '54mm' : '76mm' }}
    >
      {/* Header */}
      <div className="text-center pb-2 border-b border-dashed border-black">
        <div className="font-bold text-sm tracking-tight">{settings.shop_name}</div>
        {settings.tagline && <div className="text-[9px] uppercase">{settings.tagline}</div>}
        <div className="text-[10px] mt-0.5">{settings.address}</div>
        <div className="text-[10px]">{settings.city}, {settings.state} - {settings.pincode}</div>
        {settings.phone && <div className="text-[10px]">Ph: {settings.phone}</div>}
        {settings.dl_number_20b && <div className="text-[9px]">DL No: {settings.dl_number_20b}, {settings.dl_number_21b}</div>}
        {settings.gstin && <div className="text-[9px] font-bold">GSTIN: {settings.gstin}</div>}
      </div>

      {/* Bill Metadata */}
      <div className="py-1.5 border-b border-dashed border-black text-[10px] space-y-0.5">
        <div className="flex justify-between">
          <span>Inv: <strong className="font-bold">{invoice.invoice_no}</strong></span>
          <span>Date: {fmtDate(invoice.invoice_date)}</span>
        </div>
        <div className="flex justify-between">
          <span>Patient: {invoice.customer_name || 'Walk-in'}</span>
          <span>Pay: {invoice.payment_mode}</span>
        </div>
        {invoice.doctor_name && (
          <div className="text-[9px]">
            Dr: {invoice.doctor_name} {invoice.doctor_reg_no ? `(Reg: ${invoice.doctor_reg_no})` : ''}
          </div>
        )}
      </div>

      {/* Item Table */}
      <table className="w-full text-[10px] my-1.5">
        <thead>
          <tr className="border-b border-black text-left">
            <th className="py-0.5">Item (Batch)</th>
            <th className="text-center">Exp</th>
            <th className="text-right">Qty</th>
            <th className="text-right">Amt</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-dashed divide-slate-300">
          {(invoice.items || []).map((it, idx) => (
            <tr key={idx}>
              <td className="py-1">
                <div className="font-bold truncate max-w-[120px]">{it.medicineName}</div>
                <div className="text-[9px] text-slate-600">B:{it.batchNo} · MRP:{fmtMoney(it.mrp)}</div>
              </td>
              <td className="text-center text-[9px]">{it.expiryDate?.slice(0, 7) || '—'}</td>
              <td className="text-right font-bold">{it.qty}</td>
              <td className="text-right font-bold">{fmtMoney(it.totalAmount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Financials */}
      <div className="border-t border-dashed border-black pt-1.5 space-y-1 text-[10px]">
        <div className="flex justify-between">
          <span>Subtotal:</span>
          <span>{fmtMoney(invoice.subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span>GST Total:</span>
          <span>{fmtMoney(invoice.gst_total)}</span>
        </div>
        {invoice.discount_amount > 0 && (
          <div className="flex justify-between">
            <span>Discount:</span>
            <span>-{fmtMoney(invoice.discount_amount)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-sm border-t border-b border-black py-1 my-1">
          <span>NET PAYABLE:</span>
          <span>{fmtMoney(invoice.total_amount)}</span>
        </div>
      </div>

      {/* Footer Terms */}
      <div className="text-center text-[8px] pt-2 space-y-0.5 text-slate-700">
        <div>{settings.invoice_terms || '1. Goods once sold will not be taken back.'}</div>
        <div className="font-bold text-[9px] pt-1">*** GET WELL SOON ***</div>
      </div>
    </div>
  );
}
