import React from 'react';
import { fmtMoney, fmtDate, numberToWords } from '../../utils/formatters';

export function A4TaxInvoice({ invoice, settings, preview = false }) {
  if (!invoice) return null;

  const currentSettings = settings || {};

  return (
    <div
      id={preview ? undefined : "printable-receipt"}
      className={`${
        preview
          ? 'block shadow-lg border border-slate-300 rounded-lg p-6 my-2'
          : 'hidden print:block p-6'
      } font-sans text-xs text-black bg-white max-w-4xl mx-auto leading-normal box-border`}
    >
      {/* Title Header */}
      <div className="flex justify-between items-start border-b-2 border-black pb-3 mb-3">
        <div>
          <h2 className="text-xl font-black uppercase text-emerald-950 tracking-tight">
            {currentSettings.shop_name || 'Apollo Health Chemist & Druggist'}
          </h2>
          {currentSettings.tagline && (
            <div className="text-xs font-semibold text-slate-700">{currentSettings.tagline}</div>
          )}
          <div className="text-xs text-slate-700 mt-1">
            {currentSettings.address}, {currentSettings.city}, {currentSettings.state} - {currentSettings.pincode}
          </div>
          <div className="text-xs text-slate-700">
            Phone: {currentSettings.phone} {currentSettings.email ? `| Email: ${currentSettings.email}` : ''}
          </div>
          <div className="text-xs font-bold text-black mt-1">
            DL Nos: {currentSettings.dl_number_20b || 'DL-20B-129482'} (20B), {currentSettings.dl_number_21b || 'DL-21B-129483'} (21B){' '}
            {currentSettings.fssai_no ? `| FSSAI: ${currentSettings.fssai_no}` : ''}
          </div>
        </div>
        <div className="text-right">
          <div className="inline-block border-2 border-black px-3 py-1 font-bold text-sm uppercase bg-slate-100">
            {invoice.bill_type || 'TAX INVOICE'}
          </div>
          <div className="text-xs font-mono font-bold mt-2">GSTIN: {currentSettings.gstin || '07AAAAA0000A1Z5'}</div>
          <div className="text-xs text-slate-700">
            State: {currentSettings.state || 'Delhi'} (Code: {currentSettings.state_code || '07'})
          </div>
        </div>
      </div>

      {/* Invoice & Patient Info Grid */}
      <div className="grid grid-cols-2 gap-4 border border-black/80 rounded-md p-3 mb-3 bg-slate-50/70 text-xs">
        <div className="space-y-1">
          <div>
            <span className="text-slate-600 font-semibold">Invoice No:</span>{' '}
            <strong className="font-mono text-sm">{invoice.invoice_no}</strong>
          </div>
          <div>
            <span className="text-slate-600 font-semibold">Invoice Date:</span>{' '}
            <strong className="font-mono">{fmtDate(invoice.invoice_date)}</strong>
          </div>
          <div>
            <span className="text-slate-600 font-semibold">Payment Mode:</span>{' '}
            <strong className="uppercase">{invoice.payment_mode}</strong>
          </div>
        </div>
        <div className="space-y-1">
          <div>
            <span className="text-slate-600 font-semibold">Patient / Customer:</span>{' '}
            <strong className="font-semibold">{invoice.customer_name || 'Walk-in Customer'}</strong>
          </div>
          <div>
            <span className="text-slate-600 font-semibold">Contact:</span>{' '}
            <span className="font-mono">{invoice.customer_phone || '—'}</span>
          </div>
          <div>
            <span className="text-slate-600 font-semibold">Prescribed by Dr:</span>{' '}
            <strong>{invoice.doctor_name || '—'}</strong>{' '}
            {invoice.doctor_reg_no ? `(Reg: ${invoice.doctor_reg_no})` : ''}
          </div>
        </div>
      </div>

      {/* Medicine Items Table */}
      <div className="overflow-x-auto w-full mb-3">
        <table className="w-full text-xs border border-black/80 border-collapse min-w-[520px]">
          <thead>
            <tr className="bg-slate-200 border-b border-black font-bold text-black text-left">
              <th className="p-1.5 border-r border-black/60 w-8 text-center">#</th>
              <th className="p-1.5 border-r border-black/60">Description of Goods</th>
              <th className="p-1.5 border-r border-black/60 w-14">HSN</th>
              <th className="p-1.5 border-r border-black/60 w-20">Batch</th>
              <th className="p-1.5 border-r border-black/60 text-center w-16">Expiry</th>
              <th className="p-1.5 border-r border-black/60 text-right w-12">Qty</th>
              <th className="p-1.5 border-r border-black/60 text-right w-16">MRP</th>
              <th className="p-1.5 border-r border-black/60 text-right w-16">Rate</th>
              <th className="p-1.5 border-r border-black/60 text-right w-12">Disc%</th>
              <th className="p-1.5 border-r border-black/60 text-right w-12">GST%</th>
              <th className="p-1.5 text-right w-20">Amount (₹)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/40">
            {(invoice.items || []).map((it, idx) => (
              <tr key={idx} className="font-mono hover:bg-slate-50">
                <td className="p-1.5 border-r border-black/40 text-center font-sans">{idx + 1}</td>
                <td className="p-1.5 border-r border-black/40 font-sans font-semibold">{it.medicineName}</td>
                <td className="p-1.5 border-r border-black/40 text-slate-700">{it.hsnCode || '3004'}</td>
                <td className="p-1.5 border-r border-black/40 font-bold">{it.batchNo}</td>
                <td className="p-1.5 border-r border-black/40 text-center">{it.expiryDate?.slice(0, 7) || '—'}</td>
                <td className="p-1.5 border-r border-black/40 text-right font-bold tabular-nums">{it.qty}</td>
                <td className="p-1.5 border-r border-black/40 text-right tabular-nums">{fmtMoney(it.mrp)}</td>
                <td className="p-1.5 border-r border-black/40 text-right tabular-nums">{fmtMoney(it.unitPrice)}</td>
                <td className="p-1.5 border-r border-black/40 text-right tabular-nums">{it.discountPercent || 0}%</td>
                <td className="p-1.5 border-r border-black/40 text-right tabular-nums">{it.gstRate || 12}%</td>
                <td className="p-1.5 text-right font-bold tabular-nums">{fmtMoney(it.totalAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary & Tax Calculation Box */}
      <div className="grid grid-cols-2 gap-4 border border-black/80 rounded-md p-3 mb-4">
        <div className="space-y-2">
          <div>
            <span className="text-[11px] text-slate-600 font-semibold uppercase block">Amount Chargeable (in words):</span>
            <strong className="text-xs font-bold text-black">{numberToWords(invoice.total_amount)}</strong>
          </div>
          <div className="text-[10px] text-slate-600 pt-2 border-t border-slate-300">
            <strong>Terms & Conditions:</strong><br />
            {currentSettings.invoice_terms || '1. Goods once sold will not be taken back without original cash memo. 2. Refrigerated medicines are non-returnable.'}
          </div>
        </div>

        <div className="space-y-1 text-xs font-mono">
          <div className="flex justify-between">
            <span className="font-sans text-slate-700">Taxable Subtotal:</span>
            <span className="tabular-nums font-semibold">{fmtMoney(invoice.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-sans text-slate-700">CGST Amount:</span>
            <span className="tabular-nums font-semibold">{fmtMoney(invoice.cgst_total || invoice.gst_total / 2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-sans text-slate-700">SGST Amount:</span>
            <span className="tabular-nums font-semibold">{fmtMoney(invoice.sgst_total || invoice.gst_total / 2)}</span>
          </div>
          {invoice.discount_amount > 0 && (
            <div className="flex justify-between text-rose-700">
              <span className="font-sans">Special Discount:</span>
              <span className="tabular-nums font-semibold">-{fmtMoney(invoice.discount_amount)}</span>
            </div>
          )}
          {invoice.round_off !== 0 && (
            <div className="flex justify-between text-slate-600">
              <span className="font-sans">Round Off:</span>
              <span className="tabular-nums">{invoice.round_off > 0 ? `+${invoice.round_off}` : invoice.round_off}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-sm border-t-2 border-black pt-1.5 mt-1">
            <span className="font-sans">Grand Total:</span>
            <span className="tabular-nums">{fmtMoney(invoice.total_amount)}</span>
          </div>
        </div>
      </div>

      {/* Signature & Seal */}
      <div className="flex justify-between items-end pt-4">
        <div className="text-[10px] text-slate-500 font-sans">
          Generated via Chemist Shop ERP · Pharmacist Verified
        </div>
        <div className="text-center font-bold text-xs">
          <div className="mb-6 font-sans">For {currentSettings.shop_name || 'Apollo Health Chemist'}</div>
          <div className="border-t border-black pt-1 px-8 font-sans text-[11px]">
            Authorized Signatory / Registered Pharmacist
          </div>
        </div>
      </div>
    </div>
  );
}
