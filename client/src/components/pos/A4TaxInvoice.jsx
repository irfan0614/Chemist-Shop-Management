import React from 'react';
import { fmtMoney, fmtDate, numberToWords } from '../../utils/formatters';

export function A4TaxInvoice({ invoice, settings }) {
  if (!invoice) return null;

  return (
    <div
      id="printable-receipt"
      className="hidden print:block font-sans text-xs text-black bg-white p-6 max-w-4xl mx-auto leading-normal"
    >
      {/* Title Header */}
      <div className="flex justify-between items-start border-b-2 border-slate-900 pb-3 mb-3">
        <div>
          <h2 className="text-xl font-black uppercase text-emerald-950 tracking-tight">{settings.shop_name}</h2>
          <div className="text-xs font-semibold text-slate-700">{settings.tagline}</div>
          <div className="text-xs text-slate-600 mt-1">{settings.address}, {settings.city}, {settings.state} - {settings.pincode}</div>
          <div className="text-xs text-slate-600">Phone: {settings.phone} | Email: {settings.email}</div>
          <div className="text-xs font-bold text-slate-900 mt-1">
            DL Nos: {settings.dl_number_20b} (20B), {settings.dl_number_21b} (21B) | FSSAI: {settings.fssai_no}
          </div>
        </div>
        <div className="text-right">
          <div className="inline-block border border-slate-900 px-3 py-1 font-bold text-sm uppercase bg-slate-100">
            {invoice.bill_type || 'TAX INVOICE'}
          </div>
          <div className="text-xs font-mono font-bold mt-2">GSTIN: {settings.gstin}</div>
          <div className="text-xs text-slate-600">State: {settings.state} (Code: {settings.state_code || '07'})</div>
        </div>
      </div>

      {/* Invoice & Patient Info Grid */}
      <div className="grid grid-cols-2 gap-4 border border-slate-300 rounded-lg p-3 mb-3 bg-slate-50 text-xs">
        <div className="space-y-1">
          <div><span className="text-slate-500 font-semibold">Invoice No:</span> <strong className="font-mono text-sm">{invoice.invoice_no}</strong></div>
          <div><span className="text-slate-500 font-semibold">Invoice Date:</span> <strong className="font-mono">{fmtDate(invoice.invoice_date)}</strong></div>
          <div><span className="text-slate-500 font-semibold">Payment Mode:</span> <strong className="uppercase">{invoice.payment_mode}</strong></div>
        </div>
        <div className="space-y-1">
          <div><span className="text-slate-500 font-semibold">Patient / Customer:</span> <strong>{invoice.customer_name || 'Walk-in'}</strong></div>
          <div><span className="text-slate-500 font-semibold">Contact:</span> <span className="font-mono">{invoice.customer_phone || '—'}</span></div>
          <div>
            <span className="text-slate-500 font-semibold">Prescribed by Dr:</span>{' '}
            <strong>{invoice.doctor_name || '—'}</strong> {invoice.doctor_reg_no ? `(Reg: ${invoice.doctor_reg_no})` : ''}
          </div>
        </div>
      </div>

      {/* Medicine Items Table */}
      <table className="w-full text-xs border border-slate-300 mb-3 border-collapse">
        <thead>
          <tr className="bg-slate-200/80 border-b border-slate-300 font-bold text-slate-800 text-left">
            <th className="p-2 border-r border-slate-300 w-8 text-center">#</th>
            <th className="p-2 border-r border-slate-300">Description of Goods</th>
            <th className="p-2 border-r border-slate-300">HSN</th>
            <th className="p-2 border-r border-slate-300">Batch</th>
            <th className="p-2 border-r border-slate-300 text-center">Expiry</th>
            <th className="p-2 border-r border-slate-300 text-right">Qty</th>
            <th className="p-2 border-r border-slate-300 text-right">MRP</th>
            <th className="p-2 border-r border-slate-300 text-right">Rate</th>
            <th className="p-2 border-r border-slate-300 text-right">Disc%</th>
            <th className="p-2 border-r border-slate-300 text-right">GST%</th>
            <th className="p-2 text-right">Amount (₹)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {(invoice.items || []).map((it, idx) => (
            <tr key={idx} className="hover:bg-slate-50 font-mono">
              <td className="p-2 border-r border-slate-200 text-center font-sans">{idx + 1}</td>
              <td className="p-2 border-r border-slate-200 font-sans font-semibold">{it.medicineName}</td>
              <td className="p-2 border-r border-slate-200 text-slate-600">{it.hsnCode || '3004'}</td>
              <td className="p-2 border-r border-slate-200 font-bold">{it.batchNo}</td>
              <td className="p-2 border-r border-slate-200 text-center">{it.expiryDate?.slice(0, 7) || '—'}</td>
              <td className="p-2 border-r border-slate-200 text-right font-bold">{it.qty}</td>
              <td className="p-2 border-r border-slate-200 text-right">{fmtMoney(it.mrp)}</td>
              <td className="p-2 border-r border-slate-200 text-right">{fmtMoney(it.unitPrice)}</td>
              <td className="p-2 border-r border-slate-200 text-right">{it.discountPercent || 0}%</td>
              <td className="p-2 border-r border-slate-200 text-right">{it.gstRate || 12}%</td>
              <td className="p-2 text-right font-bold">{fmtMoney(it.totalAmount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Summary & Tax Calculation Box */}
      <div className="grid grid-cols-2 gap-4 border border-slate-300 rounded-lg p-3 mb-4">
        <div className="space-y-2">
          <div>
            <span className="text-[11px] text-slate-500 font-semibold uppercase block">Amount Chargeable (in words):</span>
            <strong className="text-xs font-bold text-slate-900">{numberToWords(invoice.total_amount)}</strong>
          </div>
          <div className="text-[10px] text-slate-500 pt-2 border-t border-slate-200">
            <strong>Terms & Conditions:</strong><br />
            {settings.invoice_terms || '1. Goods once sold will not be taken back without original cash memo.'}
          </div>
        </div>

        <div className="space-y-1.5 text-xs font-mono">
          <div className="flex justify-between">
            <span className="font-sans text-slate-600">Taxable Subtotal:</span>
            <span>{fmtMoney(invoice.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-sans text-slate-600">CGST Amount:</span>
            <span>{fmtMoney(invoice.cgst_total || invoice.gst_total / 2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-sans text-slate-600">SGST Amount:</span>
            <span>{fmtMoney(invoice.sgst_total || invoice.gst_total / 2)}</span>
          </div>
          {invoice.discount_amount > 0 && (
            <div className="flex justify-between text-rose-600">
              <span className="font-sans">Special Discount:</span>
              <span>-{fmtMoney(invoice.discount_amount)}</span>
            </div>
          )}
          {invoice.round_off !== 0 && (
            <div className="flex justify-between text-slate-500">
              <span className="font-sans">Round Off:</span>
              <span>{invoice.round_off > 0 ? `+${invoice.round_off}` : invoice.round_off}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-sm border-t-2 border-slate-900 pt-1.5 mt-1">
            <span className="font-sans">Grand Total:</span>
            <span>{fmtMoney(invoice.total_amount)}</span>
          </div>
        </div>
      </div>

      {/* Signature & Seal */}
      <div className="flex justify-between items-end pt-8">
        <div className="text-[11px] text-slate-500">
          Generated via Chemist Shop ERP · Pharmacist Verified
        </div>
        <div className="text-center font-bold text-xs">
          <div className="mb-8 font-sans">For {settings.shop_name}</div>
          <div className="border-t border-slate-400 pt-1 px-8">Authorized Signatory / Registered Pharmacist</div>
        </div>
      </div>
    </div>
  );
}
