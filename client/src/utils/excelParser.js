/**
 * Client-side Spreadsheet / CSV / XML Excel Parser and Exporter
 * Zero external dependencies, pure standard JavaScript & Web APIs
 */

/**
 * Escapes XML special characters for SpreadsheetML
 */
function escapeXml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Escapes CSV cell value per RFC-4180
 */
function escapeCsv(cell) {
  if (cell === null || cell === undefined) return '';
  const str = String(cell);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Parses RFC-4180 CSV / TSV text
 */
export function parseCsvText(text, delimiter = ',') {
  if (!text) return [];
  
  // Auto-detect delimiter if tab or comma
  if (text.includes('\t') && (!text.includes(',') || text.split('\t').length > text.split(',').length)) {
    delimiter = '\t';
  }

  const rows = [];
  let currentRow = [];
  let currentCell = '';
  let insideQuote = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuote && nextChar === '"') {
        currentCell += '"';
        i++; // skip escaped quote
      } else {
        insideQuote = !insideQuote;
      }
    } else if (char === delimiter && !insideQuote) {
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if ((char === '\r' || char === '\n') && !insideQuote) {
      if (char === '\r' && nextChar === '\n') {
        i++; // skip \n of CRLF
      }
      currentRow.push(currentCell.trim());
      if (currentRow.some((c) => c !== '')) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += char;
    }
  }

  if (currentCell !== '' || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((c) => c !== '')) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Parses XML Spreadsheet 2003 (.xls) or text table
 */
export function parseExcelXmlText(xmlString) {
  const rows = [];
  const rowRegex = /<Row[^>]*>([\s\S]*?)<\/Row>/gi;
  const cellRegex = /<Cell[^>]*>[\s\S]*?<Data[^>]*>([\s\S]*?)<\/Data>[\s\S]*?<\/Cell>/gi;

  let rowMatch;
  while ((rowMatch = rowRegex.exec(xmlString)) !== null) {
    const rowContent = rowMatch[1];
    const cells = [];
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
      let val = cellMatch[1] || '';
      val = val
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
      cells.push(val.trim());
    }
    if (cells.length > 0 && cells.some((c) => c !== '')) {
      rows.push(cells);
    }
  }
  return rows;
}

/**
 * Normalizes and parses uploaded File object (.xlsx, .xls, .csv, .tsv, .txt)
 */
export async function parseUploadedFile(file) {
  const fileName = file.name.toLowerCase();

  // For CSV, TSV, TXT or XML-based XLS
  const text = await file.text();

  let table = [];
  if (text.includes('<?xml') || text.includes('<Workbook') || text.includes('<ss:Workbook')) {
    table = parseExcelXmlText(text);
  } else {
    table = parseCsvText(text);
  }

  if (!table || table.length < 2) {
    throw new Error('Spreadsheet appears to be empty or missing data rows.');
  }

  // Header row
  const rawHeaders = table[0].map((h) => String(h).trim());
  let dataRows = table.slice(1);

  // If row 1 is instruction / guidance text, skip it
  if (
    dataRows.length > 0 &&
    (dataRows[0][0] || '').toLowerCase().includes('required')
  ) {
    dataRows = dataRows.slice(1);
  }

  // Map each row to normalized object
  const parsedRecords = dataRows.map((row, idx) => {
    const rawObj = {};
    rawHeaders.forEach((h, hIdx) => {
      rawObj[h] = row[hIdx] !== undefined ? row[hIdx] : '';
    });

    // Extract standardized fields
    const name = findFieldValue(rawObj, ['medicine name', 'name', 'drug name', 'medicine', 'product name']);
    const generic_name = findFieldValue(rawObj, ['generic name', 'generic', 'salt composition', 'composition', 'salt', 'generic / composition']);
    const brand = findFieldValue(rawObj, ['brand', 'brand name', 'trade name']);
    const manufacturer = findFieldValue(rawObj, ['manufacturer', 'mfr', 'company', 'pharma company']);
    const category = findFieldValue(rawObj, ['category', 'category name', 'type']);
    const dosage_form = findFieldValue(rawObj, ['dosage form', 'form', 'type (tablet/syrup)']) || 'Tablet';
    const strength = findFieldValue(rawObj, ['strength', 'power', 'potency']);
    const pack_size = parseInt(findFieldValue(rawObj, ['pack size', 'pack', 'package size']) || 10) || 10;
    const unit = findFieldValue(rawObj, ['unit', 'packaging unit', 'uom']) || 'Strips';
    const hsn_code = findFieldValue(rawObj, ['hsn code', 'hsn', 'hsn/sac']) || '3004';
    const gst_rate = parseFloat(findFieldValue(rawObj, ['gst rate (%)', 'gst rate', 'gst %', 'gst', 'tax rate']) || 12.0) || 12.0;
    const schedule_type = normalizeScheduleType(findFieldValue(rawObj, ['drug schedule', 'schedule', 'schedule type', 'rx schedule']));
    const rxRaw = findFieldValue(rawObj, ['prescription required (yes/no)', 'prescription required', 'rx required', 'is_prescription_required']);
    const is_prescription_required = rxRaw ? (rxRaw.toUpperCase() === 'YES' || rxRaw.toUpperCase() === 'TRUE' || rxRaw === '1') : schedule_type !== 'NONE';
    const reorder_level = parseInt(findFieldValue(rawObj, ['reorder level', 'min stock', 'alert stock', 'threshold']) || 15) || 15;
    const storage_temperature = findFieldValue(rawObj, ['storage temp', 'storage temperature', 'storage']) || 'Room Temperature';
    const barcode = findFieldValue(rawObj, ['barcode', 'ean', 'upc', 'barcode number']);

    // Batch details
    const batch_no = findFieldValue(rawObj, ['batch no', 'batch number', 'batch', 'lot no', 'lot']);
    let expiry_date = findFieldValue(rawObj, ['expiry date (yyyy-mm-dd)', 'expiry date', 'expiry', 'exp date', 'exp']);
    const mfg_date = findFieldValue(rawObj, ['mfg date (yyyy-mm-dd)', 'mfg date', 'manufacturing date', 'mfg']);
    const purchase_cost = parseFloat(findFieldValue(rawObj, ['purchase cost (rs)', 'purchase cost', 'cost price', 'purchase rate', 'cost']) || 0) || 0;
    const mrp = parseFloat(findFieldValue(rawObj, ['mrp (rs)', 'mrp', 'maximum retail price']) || 0) || 0;
    const selling_price = parseFloat(findFieldValue(rawObj, ['selling price (rs)', 'selling price', 'rate', 'retail price']) || mrp) || mrp;
    const initial_stock = parseInt(findFieldValue(rawObj, ['initial stock qty', 'initial stock', 'opening stock', 'stock', 'qty', 'quantity']) || 0) || 0;
    const rack_shelf = findFieldValue(rawObj, ['rack shelf', 'rack', 'shelf', 'location', 'rack location']);

    // Expiry date cleanup (DD/MM/YYYY -> YYYY-MM-DD)
    if (expiry_date && expiry_date.includes('/')) {
      const parts = expiry_date.split('/');
      if (parts.length === 3 && parts[2].length === 4) {
        expiry_date = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }

    return {
      _rowNum: idx + 2, // 1-indexed Excel row
      name,
      generic_name,
      brand,
      manufacturer,
      category,
      dosage_form,
      strength,
      pack_size,
      unit,
      hsn_code,
      gst_rate,
      schedule_type,
      is_prescription_required,
      reorder_level,
      storage_temperature,
      barcode,
      batch_no,
      expiry_date,
      mfg_date,
      purchase_cost,
      mrp,
      selling_price,
      initial_stock,
      rack_shelf,
      raw: rawObj,
    };
  });

  return parsedRecords;
}

function findFieldValue(obj, aliases) {
  const keys = Object.keys(obj);
  for (const alias of aliases) {
    const match = keys.find((k) => k.trim().toLowerCase() === alias.toLowerCase());
    if (match && obj[match] !== undefined && String(obj[match]).trim() !== '') {
      return String(obj[match]).trim();
    }
  }
  return '';
}

function normalizeScheduleType(val) {
  if (!val) return 'NONE';
  const s = String(val).toUpperCase().trim();
  if (s.includes('H1')) return 'H1';
  if (s.includes('H')) return 'H';
  if (s.includes('X')) return 'X';
  if (s.includes('G')) return 'G';
  return 'NONE';
}

/**
 * Validates parsed medicine rows for visual feedback in UI
 */
export function validateMedicineRows(rows) {
  return rows.map((row) => {
    const issues = [];
    let status = 'valid';

    if (!row.name || !row.name.trim()) {
      issues.push('Missing medicine name');
      status = 'error';
    }

    if (row.batch_no && !row.expiry_date) {
      issues.push('Batch provided without expiry date');
      if (status !== 'error') status = 'warning';
    }

    if (row.mrp < 0 || isNaN(row.mrp)) {
      issues.push('Invalid MRP');
      if (status !== 'error') status = 'warning';
    }

    if (row.selling_price > row.mrp && row.mrp > 0) {
      issues.push('Selling price cannot exceed MRP');
      if (status !== 'error') status = 'warning';
    }

    return {
      ...row,
      _status: status,
      _issues: issues,
    };
  });
}

/**
 * Download sample template directly in browser as Excel XML (.xls)
 */
export function triggerExcelTemplateDownload() {
  const headers = [
    'Medicine Name',
    'Generic Name',
    'Brand',
    'Manufacturer',
    'Category',
    'Dosage Form',
    'Strength',
    'Pack Size',
    'Unit',
    'HSN Code',
    'GST Rate (%)',
    'Drug Schedule',
    'Prescription Required (YES/NO)',
    'Reorder Level',
    'Storage Temp',
    'Batch No',
    'Expiry Date (YYYY-MM-DD)',
    'Mfg Date (YYYY-MM-DD)',
    'Purchase Cost (Rs)',
    'MRP (Rs)',
    'Selling Price (Rs)',
    'Initial Stock Qty',
    'Rack Shelf',
    'Barcode',
  ];

  const instructions = [
    'Required (e.g. Paracetamol 650)',
    'Optional composition',
    'Brand / Trade name',
    'Pharma Company',
    'e.g. Antibiotics, Analgesics, Cardiac',
    'Tablet/Capsule/Syrup/Injection/Ointment',
    'e.g. 650mg, 500mg, 10ml',
    'Number per pack (e.g. 10 or 15)',
    'Strips/Bottles/Vials/Tubes/Boxes',
    'Default 3004',
    '0, 5, 12, 18, or 28',
    'NONE, H, H1, X, or G',
    'YES or NO',
    'Stock alert limit (e.g. 15)',
    'Room Temp or 2-8°C',
    'Optional initial batch (e.g. B2401)',
    'Format: YYYY-MM-DD (e.g. 2027-08-31)',
    'Format: YYYY-MM-DD',
    'Purchase price per unit (Rs)',
    'Maximum Retail Price (Rs)',
    'Retail Selling Price (Rs)',
    'Opening units in stock',
    'Storage location (e.g. Rack A-1)',
    'EAN/UPC barcode number',
  ];

  const sampleRows = [
    [
      'Augmentin 625 Duo Tablet',
      'Amoxycillin and Potassium Clavulanate',
      'Augmentin',
      'GlaxoSmithKline Pharmaceuticals',
      'Antibiotics',
      'Tablet',
      '625mg',
      10,
      'Strips',
      '3004',
      12.0,
      'H',
      'YES',
      20,
      'Room Temperature',
      'AUG2401',
      '2027-06-30',
      '2024-06-01',
      152.5,
      204.85,
      198.0,
      50,
      'Rack A-1',
      '8901030010203',
    ],
    [
      'Dolo 650 Tablet',
      'Paracetamol IP',
      'Dolo',
      'Micro Labs Ltd',
      'Analgesics & Antipyretics',
      'Tablet',
      '650mg',
      15,
      'Strips',
      '3004',
      12.0,
      'NONE',
      'NO',
      50,
      'Room Temperature',
      'DL650B01',
      '2027-12-31',
      '2024-11-01',
      22.0,
      33.6,
      33.0,
      100,
      'Rack B-2',
      '8901040010204',
    ],
    [
      'Azithral 500 Tablet',
      'Azithromycin IP',
      'Azithral',
      'Alembic Pharmaceuticals',
      'Antibiotics',
      'Tablet',
      '500mg',
      5,
      'Strips',
      '3004',
      12.0,
      'H1',
      'YES',
      15,
      'Room Temperature',
      'AZ500A1',
      '2026-10-31',
      '2024-05-01',
      78.4,
      125.0,
      119.0,
      30,
      'Rack A-3',
      '8901050010205',
    ],
    [
      'Pantocid 40 Tablet',
      'Pantoprazole Sodium Gastro-resistant',
      'Pantocid',
      'Sun Pharma Laboratories',
      'Gastrointestinal',
      'Tablet',
      '40mg',
      15,
      'Strips',
      '3004',
      12.0,
      'H',
      'YES',
      25,
      'Room Temperature',
      'PAN40B12',
      '2027-09-30',
      '2024-08-01',
      95.0,
      158.0,
      150.0,
      40,
      'Rack C-1',
      '8901060010206',
    ],
    [
      'Corex-DX Cough Syrup',
      'Dextromethorphan + Chlorpheniramine',
      'Corex',
      'Pfizer India',
      'Respiratory & ENT',
      'Syrup',
      '100ml',
      1,
      'Bottles',
      '3004',
      12.0,
      'H',
      'YES',
      10,
      'Room Temperature',
      'CDX1001',
      '2026-08-31',
      '2024-07-01',
      75.0,
      118.5,
      115.0,
      25,
      'Rack D-4',
      '8901070010207',
    ],
  ];

  const xmlContent = generateExcelXmlDocument('Medicines_Bulk_Template', headers, instructions, sampleRows);
  downloadBlob(xmlContent, 'application/vnd.ms-excel', 'medicines_bulk_upload_template.xls');
}

/**
 * Export medicines list to formatted Excel (.xls) or CSV
 */
export function exportMedicinesToExcel(medicines, filename = 'medicines_catalog') {
  const headers = [
    'Medicine Name',
    'Generic Name',
    'Brand',
    'Manufacturer',
    'Category',
    'Dosage Form',
    'Strength',
    'Pack Size',
    'Unit',
    'HSN Code',
    'GST Rate (%)',
    'Drug Schedule',
    'Rx Required',
    'Total Stock',
    'Batches Count',
    'Est. MRP (Rs)',
    'Min Selling Price (Rs)',
    'Earliest Expiry',
    'Reorder Level',
    'Barcode',
  ];

  const rows = (medicines || []).map((m) => [
    m.name || '',
    m.generic_name || m.salt_composition || '',
    m.brand || '',
    m.manufacturer || '',
    m.categoryName || 'General',
    m.dosage_form || 'Tablet',
    m.strength || '',
    m.pack_size || 10,
    m.unit || 'Strips',
    m.hsn_code || '3004',
    m.gst_rate !== undefined ? m.gst_rate : 12.0,
    m.schedule_type || 'NONE',
    m.is_prescription_required ? 'YES' : 'NO',
    m.totalStock || 0,
    m.batchCount || (m.batches?.length || 0),
    m.mrp || 0,
    m.sellingPrice || 0,
    m.earliestExpiry || '—',
    m.reorder_level || 15,
    m.barcode || '',
  ]);

  const xmlContent = generateExcelXmlDocument('Medicines_Catalog', headers, null, rows);
  downloadBlob(xmlContent, 'application/vnd.ms-excel', `${filename}_${Date.now()}.xls`);
}

function generateExcelXmlDocument(sheetTitle, headers, instructions, rows) {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
  <Title>${escapeXml(sheetTitle)}</Title>
  <Author>MedCloud Pharmacy ERP</Author>
  <Created>${new Date().toISOString()}</Created>
 </DocumentProperties>
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Borders/>
   <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#000000"/>
  </Style>
  <Style ss:ID="Header">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#047857"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#047857"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#047857"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#047857"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#FFFFFF" ss:Bold="1"/>
   <Interior ss:Color="#059669" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="InstructionRow">
   <Alignment ss:Vertical="Center" ss:WrapText="1"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="9" ss:Color="#475569" ss:Italic="1"/>
   <Interior ss:Color="#F1F5F9" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="DataCell">
   <Alignment ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#1E293B"/>
  </Style>
  <Style ss:ID="NumberCell">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#1E293B"/>
   <NumberFormat ss:Format="#,##0.00"/>
  </Style>
  <Style ss:ID="IntegerCell">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#1E293B"/>
   <NumberFormat ss:Format="#,##0"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="${escapeXml(sheetTitle)}">
  <Table ss:DefaultRowHeight="20">
`;

  headers.forEach(() => {
    xml += `   <Column ss:AutoFitWidth="1" ss:Width="120"/>\n`;
  });

  xml += `   <Row ss:Height="26" ss:StyleID="Header">\n`;
  headers.forEach((h) => {
    xml += `    <Cell ss:StyleID="Header"><Data ss:Type="String">${escapeXml(h)}</Data></Cell>\n`;
  });
  xml += `   </Row>\n`;

  if (instructions && instructions.length > 0) {
    xml += `   <Row ss:Height="22" ss:StyleID="InstructionRow">\n`;
    instructions.forEach((inst) => {
      xml += `    <Cell ss:StyleID="InstructionRow"><Data ss:Type="String">${escapeXml(inst)}</Data></Cell>\n`;
    });
    xml += `   </Row>\n`;
  }

  rows.forEach((row) => {
    xml += `   <Row ss:Height="20">\n`;
    row.forEach((val) => {
      const isNum = typeof val === 'number' && !isNaN(val);
      const isInt = isNum && Number.isInteger(val);
      if (isNum) {
        xml += `    <Cell ss:StyleID="${isInt ? 'IntegerCell' : 'NumberCell'}"><Data ss:Type="Number">${val}</Data></Cell>\n`;
      } else {
        xml += `    <Cell ss:StyleID="DataCell"><Data ss:Type="String">${escapeXml(val)}</Data></Cell>\n`;
      }
    });
    xml += `   </Row>\n`;
  });

  xml += `  </Table>
 </Worksheet>
</Workbook>`;
  return xml;
}

function downloadBlob(content, mimeType, filename) {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
