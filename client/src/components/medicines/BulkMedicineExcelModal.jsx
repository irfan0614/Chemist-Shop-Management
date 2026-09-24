import React, { useState, useRef } from 'react';
import {
  FileSpreadsheet,
  Upload,
  Download,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FileText,
  HelpCircle,
  RefreshCw,
  Layers,
  ArrowRight,
  Info,
  Sparkles,
} from 'lucide-react';
import { Modal } from '../common/Modal';
import { Badge, DrugScheduleBadge } from '../common/Badge';
import {
  parseUploadedFile,
  validateMedicineRows,
  triggerExcelTemplateDownload,
} from '../../utils/excelParser';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { fmtMoney } from '../../utils/formatters';

export function BulkMedicineExcelModal({ isOpen, onClose, onSuccess }) {
  const [file, setFile] = useState(null);
  const [parsedRows, setParsedRows] = useState([]);
  const [validatedRows, setValidatedRows] = useState([]);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [updateDuplicates, setUpdateDuplicates] = useState(true);
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'valid' | 'issues'
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);
  const { showSuccess, showError } = useToast();

  const handleReset = () => {
    setFile(null);
    setParsedRows([]);
    setValidatedRows([]);
    setIsProcessingFile(false);
    setIsImporting(false);
    setActiveTab('all');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileChange = async (selectedFile) => {
    if (!selectedFile) return;
    setFile(selectedFile);
    setIsProcessingFile(true);
    try {
      const records = await parseUploadedFile(selectedFile);
      setParsedRows(records);
      const validated = validateMedicineRows(records);
      setValidatedRows(validated);
    } catch (err) {
      showError(err.message || 'Failed to parse Excel/CSV file.');
      handleReset();
    } finally {
      setIsProcessingFile(false);
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleExecuteImport = async () => {
    const validItems = validatedRows.filter((r) => r._status !== 'error');
    if (validItems.length === 0) {
      showError('No valid rows to import. Please check validation errors.');
      return;
    }

    setIsImporting(true);
    try {
      const res = await api.post('/medicines/bulk-import', {
        medicines: validItems,
        updateDuplicates,
      });

      showSuccess(
        `Import complete! ${res.created} created, ${res.updated} updated, ${res.batchesAdded} batches added.`
      );
      if (onSuccess) onSuccess();
      handleReset();
      onClose();
    } catch (err) {
      showError('Bulk import failed: ' + err.message);
    } finally {
      setIsImporting(false);
    }
  };

  const validCount = validatedRows.filter((r) => r._status === 'valid').length;
  const warningCount = validatedRows.filter((r) => r._status === 'warning').length;
  const errorCount = validatedRows.filter((r) => r._status === 'error').length;

  const displayedRows = validatedRows.filter((r) => {
    if (activeTab === 'valid') return r._status === 'valid';
    if (activeTab === 'issues') return r._status === 'error' || r._status === 'warning';
    return true;
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        handleReset();
        onClose();
      }}
      title="Bulk Medicine Upload & Excel Catalog Import"
      subtitle="Import medicines in bulk, auto-create categories, assign GST & Drug Schedules, and initialize batch stock"
      maxWidth="max-w-5xl"
    >
      <div className="space-y-4 text-xs">
        {/* Template & Guidelines Banner */}
        <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-indigo-50 border border-emerald-200/80 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white shrink-0 shadow-md shadow-emerald-900/10">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                <span>Standardized Pharmacy Excel Template</span>
                <span className="bg-emerald-600/10 text-emerald-700 text-[10px] font-bold px-1.5 py-0.5 rounded">.XLS / .CSV</span>
              </h4>
              <p className="text-[11px] text-slate-600 mt-0.5">
                Pre-configured with Indian pharma columns: Schedules (H/H1/X/OTC), HSN 3004, GST rates, and opening batch inventory.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={triggerExcelTemplateDownload}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-300 font-bold rounded-xl text-xs shadow-sm hover:border-emerald-400 transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Excel Template</span>
            </button>
          </div>
        </div>

        {/* Step 1: File Dropzone (if no rows yet) */}
        {validatedRows.length === 0 ? (
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all ${
              dragActive
                ? 'border-emerald-500 bg-emerald-50/50'
                : 'border-slate-300 bg-slate-50/50 hover:bg-slate-50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv,.tsv,.txt"
              className="hidden"
              onChange={(e) => handleFileChange(e.target.files[0])}
            />

            <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 mx-auto mb-3">
              <Upload className="w-6 h-6" />
            </div>

            <h3 className="font-bold text-slate-800 text-sm mb-1">
              Choose an Excel or CSV file to import
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mb-4">
              Drag and drop your spreadsheet here, or click to browse. Supports <span className="font-mono font-semibold text-slate-700">.xlsx</span>, <span className="font-mono font-semibold text-slate-700">.xls</span>, and <span className="font-mono font-semibold text-slate-700">.csv</span> files.
            </p>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessingFile}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs shadow-sm transition-all"
            >
              {isProcessingFile ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Reading Spreadsheet…</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>Browse File on Computer</span>
                </>
              )}
            </button>
          </div>
        ) : (
          /* Step 2: Data Preview & Validation Inspection */
          <div className="space-y-3">
            {/* Top Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 border border-slate-200/80 rounded-xl p-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-600" />
                <span className="font-bold text-slate-900">{file?.name}</span>
                <span className="text-[11px] text-slate-500">
                  ({(file?.size / 1024).toFixed(1)} KB)
                </span>
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-xs font-semibold text-rose-600 hover:underline ml-2"
                >
                  Change File
                </button>
              </div>

              {/* Status Tabs */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setActiveTab('all')}
                  className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all ${
                    activeTab === 'all'
                      ? 'bg-slate-900 text-white'
                      : 'bg-white text-slate-600 border border-slate-200'
                  }`}
                >
                  All ({validatedRows.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('valid')}
                  className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all flex items-center gap-1 ${
                    activeTab === 'valid'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  }`}
                >
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Ready ({validCount})</span>
                </button>
                {(warningCount > 0 || errorCount > 0) && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('issues')}
                    className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all flex items-center gap-1 ${
                      activeTab === 'issues'
                        ? 'bg-amber-600 text-white'
                        : 'bg-amber-50 text-amber-800 border border-amber-200'
                    }`}
                  >
                    <AlertTriangle className="w-3 h-3" />
                    <span>Issues ({warningCount + errorCount})</span>
                  </button>
                )}
              </div>
            </div>

            {/* Preview Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100/80 sticky top-0 text-[11px] font-bold text-slate-700 uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="p-2.5 w-12 text-center">Row</th>
                    <th className="p-2.5">Status</th>
                    <th className="p-2.5">Medicine Name</th>
                    <th className="p-2.5">Generic / Salt</th>
                    <th className="p-2.5">Category</th>
                    <th className="p-2.5">Form / Strength</th>
                    <th className="p-2.5">Schedule</th>
                    <th className="p-2.5">GST%</th>
                    <th className="p-2.5">Batch</th>
                    <th className="p-2.5">Expiry</th>
                    <th className="p-2.5 text-right">Stock</th>
                    <th className="p-2.5 text-right">MRP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-sans">
                  {displayedRows.map((r, idx) => (
                    <tr
                      key={idx}
                      className={
                        r._status === 'error'
                          ? 'bg-rose-50/50'
                          : r._status === 'warning'
                          ? 'bg-amber-50/40'
                          : 'hover:bg-slate-50'
                      }
                    >
                      <td className="p-2.5 text-center font-mono text-slate-400 text-[10px]">
                        {r._rowNum}
                      </td>
                      <td className="p-2.5">
                        {r._status === 'valid' && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100/80 px-1.5 py-0.5 rounded">
                            <CheckCircle2 className="w-3 h-3" /> Ready
                          </span>
                        )}
                        {r._status === 'warning' && (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded"
                            title={r._issues.join(', ')}
                          >
                            <AlertTriangle className="w-3 h-3" /> Warning
                          </span>
                        )}
                        {r._status === 'error' && (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded"
                            title={r._issues.join(', ')}
                          >
                            <XCircle className="w-3 h-3" /> Error
                          </span>
                        )}
                      </td>
                      <td className="p-2.5 font-bold text-slate-900">
                        {r.name || <span className="text-rose-500 italic">Missing Name</span>}
                        {r.brand && <div className="text-[10px] font-normal text-slate-400">{r.brand}</div>}
                      </td>
                      <td className="p-2.5 text-slate-600 max-w-[150px] truncate" title={r.generic_name}>
                        {r.generic_name || '—'}
                      </td>
                      <td className="p-2.5">
                        <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-[10px]">
                          {r.category || 'General'}
                        </span>
                      </td>
                      <td className="p-2.5 text-slate-700">
                        {r.dosage_form} {r.strength ? `· ${r.strength}` : ''}
                      </td>
                      <td className="p-2.5">
                        <DrugScheduleBadge scheduleType={r.schedule_type} />
                      </td>
                      <td className="p-2.5 font-mono">{r.gst_rate}%</td>
                      <td className="p-2.5 font-mono text-[11px] text-indigo-700">
                        {r.batch_no || '—'}
                      </td>
                      <td className="p-2.5 font-mono text-[11px] text-slate-600">
                        {r.expiry_date || '—'}
                      </td>
                      <td className="p-2.5 font-mono font-bold text-right text-slate-900">
                        {r.initial_stock || 0}
                      </td>
                      <td className="p-2.5 font-mono font-bold text-right text-slate-900">
                        {fmtMoney(r.mrp || 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Options & Settings */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={updateDuplicates}
                  onChange={(e) => setUpdateDuplicates(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
                />
                <span className="text-xs font-semibold text-slate-800">
                  Update existing medicine details if name and strength already exist in catalog
                </span>
              </label>

              <div className="text-[11px] text-slate-500">
                <span className="font-bold text-emerald-700">{validCount + warningCount}</span> rows will be imported
              </div>
            </div>
          </div>
        )}

        {/* Modal Action Buttons */}
        <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-2">
          <div className="text-[11px] text-slate-500 flex items-center gap-1">
            <Info className="w-3.5 h-3.5 text-slate-400" />
            <span>Automatic drug schedule detection and GST classification</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                handleReset();
                onClose();
              }}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors"
            >
              Cancel
            </button>

            {validatedRows.length > 0 && (
              <button
                type="button"
                onClick={handleExecuteImport}
                disabled={isImporting || validCount + warningCount === 0}
                className="inline-flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs shadow-md shadow-emerald-950/20 transition-all"
              >
                {isImporting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Importing into Pharmacy…</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Confirm & Import ({validCount + warningCount} Items)</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
