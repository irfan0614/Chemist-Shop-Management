import React from 'react';
import { fmtMoney, fmtDate } from '../../utils/formatters';

export function ThermalReceipt({ invoice, settings, preview = false }) {
  if (!invoice) return null;

  const currentSettings = settings || {};
  const is58mm = currentSettings.thermal_printer_size === '58mm';
  const receiptWidth = is58mm ? '52mm' : '72mm';

  return (
    <div
      id={preview ? undefined : "printable-receipt"}
      className={`${
        preview
          ? 'block shadow-lg border border-slate-300 rounded-sm'
          : 'hidden print:block'
      } font-mono text-[11px] leading-tight text-black bg-white mx-auto box-border select-none`}
      style={{
        width: receiptWidth,
        maxWidth: receiptWidth,
        padding: '3.5mm 3mm',
        color: '#000000',
        backgroundColor: '#ffffff',
      }}
    >
      {/* Header */}
      <div className="text-center pb-1.5 border-b border-dashed border-black">
        <div className="font-bold text-xs uppercase tracking-tight break-words">
          {currentSettings.shop_name || 'Apollo Health Chemist & Druggist'}
        </div>
        {currentSettings.tagline && (
          <div className="text-[8.5px] uppercase tracking-wider text-black mt-0.5">
            {currentSettings.tagline}
          </div>
        )}
        <div className="text-[9px] mt-0.5 leading-snug">
          {currentSettings.address || 'Central Market'}
        </div>
        <div className="text-[9px]">
          {currentSettings.city || 'New Delhi'}, {currentSettings.state || 'Delhi'} - {currentSettings.pincode || '110001'}
        </div>
        {currentSettings.phone && (
          <div className="text-[9px]">Ph: {currentSettings.phone}</div>
        )}
        {currentSettings.dl_number_20b && (
          <div className="text-[8.5px]">
            DL No: {currentSettings.dl_number_20b}, {currentSettings.dl_number_21b}
          </div>
        )}
        {currentSettings.gstin && (
          <div className="text-[9px] font-bold">GSTIN: {currentSettings.gstin}</div>
        )}
      </div>

      {/* Bill Metadata */}
      <div className="py-1 border-b border-dashed border-black text-[9.5px] space-y-0.5">
        <div className="flex justify-between items-baseline gap-1">
          <span className="truncate">
            Inv: <strong className="font-bold">{invoice.invoice_no}</strong>
          </span>
          <span className="shrink-0 text-right font-medium">
            Date: {fmtDate(invoice.invoice_date)}
          </span>
        </div>
        <div className="flex justify-between items-baseline gap-1">
          <span className="truncate max-w-[62%]">
            Patient: {invoice.customer_name || 'Walk-in Customer'}
          </span>
          <span className="shrink-0 text-right uppercase font-semibold">
            Pay: {invoice.payment_mode}
          </span>
        </div>
        {invoice.doctor_name && (
          <div className="text-[8.5px] truncate">
            Dr: {invoice.doctor_name} {invoice.doctor_reg_no ? `(Reg:${invoice.doctor_reg_no})` : ''}
          </div>
        )}
      </div>

      {/* Item Table */}
      <table className="w-full text-[9.5px] my-1 border-collapse table-fixed">
        <thead>
          <tr className="border-b border-black text-left">
            <th className="py-0.5 text-left font-bold" style={{ width: is58mm ? '42%' : '44%' }}>
              Item (Batch)
            </th>
            <th className="py-0.5 text-center font-bold" style={{ width: is58mm ? '18%' : '18%' }}>
              Exp
            </th>
            <th className="py-0.5 text-right font-bold" style={{ width: is58mm ? '14%' : '14%' }}>
              Qty
            </th>
            <th className="py-0.5 text-right font-bold" style={{ width: is58mm ? '26%' : '24%' }}>
              Amt
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-dashed divide-black/30">
          {(invoice.items || []).map((it, idx) => (
            <tr key={idx} className="align-top">
              <td className="py-1 pr-1 text-left">
                <div className="font-bold leading-tight break-words text-[9.5px]">
                  {it.medicineName}
                </div>
                <div className="text-[8.5px] text-black font-normal mt-0.5">
                  B:{it.batchNo} · MRP:{fmtMoney(it.mrp)}
                </div>
              </td>
              <td className="py-1 px-0.5 text-center text-[8.5px] whitespace-nowrap tabular-nums">
                {it.expiryDate ? it.expiryDate.slice(0, 7) : '—'}
              </td>
              <td className="py-1 px-0.5 text-right font-bold tabular-nums">
                {it.qty}
              </td>
              <td className="py-1 pl-1 text-right font-bold tabular-nums whitespace-nowrap">
                {fmtMoney(it.totalAmount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Financials */}
      <div className="border-t border-dashed border-black pt-1 space-y-0.5 text-[9.5px]">
        <div className="flex justify-between items-center">
          <span>Subtotal:</span>
          <span className="tabular-nums font-semibold">{fmtMoney(invoice.subtotal)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span>GST Total:</span>
          <span className="tabular-nums font-semibold">{fmtMoney(invoice.gst_total)}</span>
        </div>
        {Number(invoice.discount_amount) > 0 && (
          <div className="flex justify-between items-center">
            <span>Discount:</span>
            <span className="tabular-nums font-semibold">-{fmtMoney(invoice.discount_amount)}</span>
          </div>
        )}
        {Number(invoice.round_off || 0) !== 0 && (
          <div className="flex justify-between items-center text-[8.5px]">
            <span>Round Off:</span>
            <span className="tabular-nums">
              {invoice.round_off > 0 ? `+${invoice.round_off}` : invoice.round_off}
            </span>
          </div>
        )}
        <div className="flex justify-between items-center font-bold border-t border-b border-black py-1 my-1">
          <span className="text-xs">NET PAYABLE:</span>
          <span className="text-xs tabular-nums">{fmtMoney(invoice.total_amount)}</span>
        </div>
      </div>

      {/* Footer Terms */}
      <div className="text-center text-[8px] pt-1.5 space-y-0.5 text-black border-t border-dashed border-black mt-1">
        <div className="leading-tight">
          {currentSettings.invoice_terms ||
            '1. Goods once sold will not be taken back without original bill. 2. Refrigerated medicines are non-returnable.'}
        </div>
        <div className="font-bold text-[9px] pt-1 tracking-wider uppercase">
          *** GET WELL SOON ***
        </div>
      </div>
    </div>
  );
}
