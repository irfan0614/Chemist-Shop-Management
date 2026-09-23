import React, { useState } from 'react';
import { Printer, FileText, Receipt, Check, Copy } from 'lucide-react';
import { Modal } from '../common/Modal';
import { ThermalReceipt } from './ThermalReceipt';
import { A4TaxInvoice } from './A4TaxInvoice';
import { useShop } from '../../context/ShopContext';
import { useToast } from '../../context/ToastContext';

export function InvoicePreviewModal({ isOpen, onClose, invoice }) {
  const { settings, triggerPrint } = useShop();
  const { showSuccess } = useToast();
  const [selectedFormat, setSelectedFormat] = useState(
    settings.thermal_printer_size || '80mm'
  );

  if (!invoice) return null;

  const handlePrint = () => {
    triggerPrint(invoice, selectedFormat);
    showSuccess(`Sent Invoice #${invoice.invoice_no} (${selectedFormat}) to printer`);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Tax Invoice #${invoice.invoice_no}`}
      subtitle={`Patient: ${invoice.customer_name || 'Walk-in'} · Total: ₹${Number(
        invoice.total_amount || 0
      ).toFixed(2)}`}
      maxWidth={selectedFormat === 'A4' ? 'max-w-4xl' : 'max-w-xl'}
    >
      <div className="space-y-4">
        {/* Format Selector Bar & Action */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-100 p-2.5 rounded-xl">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-slate-600 mr-1">Preview Format:</span>
            <button
              onClick={() => setSelectedFormat('80mm')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                selectedFormat === '80mm'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>80mm Thermal (3")</span>
            </button>
            <button
              onClick={() => setSelectedFormat('58mm')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                selectedFormat === '58mm'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>58mm Thermal (2")</span>
            </button>
            <button
              onClick={() => setSelectedFormat('A4')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                selectedFormat === 'A4'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>A4 Full Invoice</span>
            </button>
          </div>

          <button
            onClick={handlePrint}
            className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold rounded-xl shadow-md shadow-emerald-950/20 flex items-center gap-2 transition-all ml-auto"
          >
            <Printer className="w-4 h-4" />
            <span>Print {selectedFormat} Invoice</span>
          </button>
        </div>

        {/* Live Formatted Paper View Canvas */}
        <div className="bg-slate-200/60 p-4 sm:p-6 rounded-2xl flex justify-center items-start min-h-[300px] overflow-x-auto border border-slate-200">
          {selectedFormat === 'A4' ? (
            <div className="w-full">
              <A4TaxInvoice
                invoice={invoice}
                settings={{ ...settings, thermal_printer_size: 'A4' }}
                preview={true}
              />
            </div>
          ) : (
            <ThermalReceipt
              invoice={invoice}
              settings={{ ...settings, thermal_printer_size: selectedFormat }}
              preview={true}
            />
          )}
        </div>
      </div>
    </Modal>
  );
}
