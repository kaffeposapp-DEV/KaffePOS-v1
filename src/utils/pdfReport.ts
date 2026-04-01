// src/utils/pdfReport.ts
// ═══════════════════════════════════════════════════════════════════
// KaffePOS — Professional PDF Report Generator
// Layout: Cover → Exec Summary → P&L → Trend Chart → Menu → Payment
//         → Inventory → Expense → AI Insight → Operational Cash
// ═══════════════════════════════════════════════════════════════════

import { downloadPDFReport } from './downloadFile';

// ── Color palette ────────────────────────────────────────────────────────────
const C = {
  orange:  [249, 115, 22]  as [number,number,number],
  dark:    [15,  23,  42]  as [number,number,number],
  slate:   [30,  41,  59]  as [number,number,number],
  gray:    [100, 116, 139] as [number,number,number],
  light:   [248, 250, 252] as [number,number,number],
  green:   [22,  163, 74]  as [number,number,number],
  red:     [220, 38,  38]  as [number,number,number],
  blue:    [37,  99,  235] as [number,number,number],
  purple:  [124, 58,  237] as [number,number,number],
  amber:   [217, 119, 6]   as [number,number,number],
  white:   [255, 255, 255] as [number,number,number],
  border:  [226, 232, 240] as [number,number,number],
  bgGreen: [240, 253, 244] as [number,number,number],
  bgRed:   [254, 242, 242] as [number,number,number],
  bgBlue:  [239, 246, 255] as [number,number,number],
  bgOrange:[255, 247, 237] as [number,number,number],
};

const fRp = (n: number) =>
  'Rp ' + new Intl.NumberFormat('id-ID').format(Math.round(n || 0));

function hexToRgb(hex: string): [number,number,number] {
  const h = hex.replace('#','');
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}

// ── Chart renderers (pure jsPDF canvas) ──────────────────────────────────────

/** Horizontal bar chart */
function drawHBar(
  doc: any, data: {label:string; value:number; pct?:number}[],
  x: number, y: number, w: number, barH: number,
  color: [number,number,number], bgColor = C.light
) {
  const max = Math.max(...data.map(d => d.value), 1);
  const gap = barH + 4;
  data.forEach((d, i) => {
    const by = y + i * gap;
    const bw = (d.value / max) * (w - 32);
    // Label
    doc.setFontSize(5.5); doc.setFont('helvetica','normal'); doc.setTextColor(...C.gray);
    doc.text(d.label.slice(0, 22), x, by + barH - 1);
    // Background
    doc.setFillColor(...bgColor);
    doc.roundedRect(x + 32, by, w - 32, barH, 0.8, 0.8, 'F');
    // Fill
    if (bw > 0) {
      doc.setFillColor(...color);
      doc.roundedRect(x + 32, by, bw, barH, 0.8, 0.8, 'F');
    }
    // Value
    const pctStr = d.pct !== undefined ? `${d.pct}%` : fRp(d.value);
    doc.setFontSize(5.5); doc.setFont('helvetica','bold'); doc.setTextColor(...C.slate);
    doc.text(pctStr, x + w, by + barH - 1, { align: 'right' });
  });
}

/** Line chart (mini sparkline) */
function drawLineChart(
  doc: any, data: {label:string; value:number}[],
  x: number, y: number, w: number, h: number,
  color: [number,number,number]
) {
  if (data.length < 2) return;
  const max = Math.max(...data.map(d => d.value), 1);
  const pts = data.map((d, i) => ({
    px: x + (i / (data.length - 1)) * w,
    py: y + h - (d.value / max) * h,
  }));

  // Grid lines
  doc.setDrawColor(...C.border); doc.setLineWidth(0.15);
  [0.25, 0.5, 0.75, 1].forEach(f => {
    doc.line(x, y + h * f, x + w, y + h * f);
  });

  // Area fill
  doc.setFillColor(color[0], color[1], color[2]);
  // Simplified area as a polygon path
  const areaPoints: number[][] = [];
  pts.forEach(p => areaPoints.push([p.px, p.py]));
  areaPoints.push([pts[pts.length-1].px, y + h]);
  areaPoints.push([pts[0].px, y + h]);
  try { (doc as any).polygon(areaPoints, 'F'); doc.setGState(doc.GState({ opacity: 1 })); } catch {}

  // Line
  doc.setDrawColor(...color); doc.setLineWidth(0.7);
  for (let i = 1; i < pts.length; i++) {
    doc.line(pts[i-1].px, pts[i-1].py, pts[i].px, pts[i].py);
  }

  // Dots
  pts.forEach(p => {
    doc.setFillColor(255,255,255); doc.circle(p.px, p.py, 0.9, 'F');
    doc.setFillColor(...color); doc.circle(p.px, p.py, 0.6, 'F');
  });

  // X labels
  doc.setFontSize(4.5); doc.setFont('helvetica','normal'); doc.setTextColor(...C.gray);
  data.forEach((d, i) => {
    doc.text(d.label, pts[i].px, y + h + 3.5, { align: 'center' });
  });

  // Peak annotation
  const peakIdx = data.reduce((max, d, i, arr) => d.value > arr[max].value ? i : max, 0);
  const peak = pts[peakIdx];
  doc.setFontSize(4.5); doc.setFont('helvetica','bold'); doc.setTextColor(...color);
  doc.text(fRp(data[peakIdx].value), peak.px, peak.py - 2, { align: 'center' });
}

/** Donut chart */
function drawDonut(
  doc: any, data: {label:string; value:number; color:string}[],
  cx: number, cy: number, r: number
) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return;
  let angle = -Math.PI / 2;
  data.forEach(d => {
    const sweep = (d.value / total) * 2 * Math.PI;
    const rgb = hexToRgb(d.color);
    doc.setFillColor(...rgb);
    const steps = Math.max(20, Math.round(sweep * 12));
    const pts: number[][] = [[cx, cy]];
    for (let i = 0; i <= steps; i++) {
      const a = angle + (i / steps) * sweep;
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    try { (doc as any).polygon(pts, 'F'); } catch {}
    angle += sweep;
  });
  // Inner circle (donut hole)
  doc.setFillColor(...C.white); doc.circle(cx, cy, r * 0.52, 'F');
  // Center label
  doc.setFontSize(5); doc.setFont('helvetica','normal'); doc.setTextColor(...C.gray);
  doc.text('Total', cx, cy - 1.5, { align: 'center' });
  doc.setFontSize(6.5); doc.setFont('helvetica','bold'); doc.setTextColor(...C.slate);
  doc.text(new Intl.NumberFormat('id-ID').format(total), cx, cy + 3.5, { align: 'center' });
}

/** Mini vertical bar chart */
function drawVBar(
  doc: any, data: {label:string; value:number}[],
  x: number, y: number, w: number, h: number,
  colors: [number,number,number][]
) {
  const max = Math.max(...data.map(d => d.value), 1);
  const bw = (w - (data.length - 1) * 2) / data.length;
  data.forEach((d, i) => {
    const bh = (d.value / max) * h;
    const bx = x + i * (bw + 2);
    const by = y + h - bh;
    const col = colors[i % colors.length];
    if (bh > 0) {
      doc.setFillColor(...col);
      doc.roundedRect(bx, by, bw, bh, 0.5, 0.5, 'F');
    }
    // Label
    doc.setFontSize(4.5); doc.setFont('helvetica','normal'); doc.setTextColor(...C.gray);
    doc.text(d.label.slice(0, 6), bx + bw / 2, y + h + 3, { align: 'center' });
  });
}

// ── KPI Box ───────────────────────────────────────────────────────────────────
function kpiBox(
  doc: any,
  label: string, value: string, sub: string | null,
  x: number, y: number, w: number, h: number,
  bg: [number,number,number], vc: [number,number,number],
  iconChar?: string
) {
  doc.setFillColor(...bg);
  doc.roundedRect(x, y, w, h, 2, 2, 'F');
  let ty = y + 6;
  if (iconChar) {
    doc.setFontSize(9); doc.setTextColor(...vc);
    doc.text(iconChar, x + 3.5, ty + 1);
    const tw = doc.getTextWidth(iconChar);
    doc.setFontSize(5.5); doc.setFont('helvetica','normal'); doc.setTextColor(...C.gray);
    doc.text(label, x + 3.5 + tw + 1, ty);
  } else {
    doc.setFontSize(6); doc.setFont('helvetica','normal'); doc.setTextColor(...C.gray);
    doc.text(label, x + w / 2, ty, { align: 'center' });
  }
  doc.setFontSize(8.5); doc.setFont('helvetica','bold'); doc.setTextColor(...vc);
  doc.text(value, x + w / 2, y + h - (sub ? 5.5 : 3.5), { align: 'center' });
  if (sub) {
    doc.setFontSize(5.5); doc.setFont('helvetica','normal'); doc.setTextColor(...C.gray);
    doc.text(sub, x + w / 2, y + h - 1.5, { align: 'center' });
  }
}

// ── Section heading ───────────────────────────────────────────────────────────
function sectionHead(
  doc: any, title: string, sub: string | null,
  x: number, y: number, w: number,
  color: [number,number,number] = C.orange
) {
  doc.setFillColor(...color);
  doc.roundedRect(x, y, 3, 8, 0.5, 0.5, 'F');
  doc.setFontSize(9.5); doc.setFont('helvetica','bold'); doc.setTextColor(...C.dark);
  doc.text(title, x + 6, y + 6.5);
  if (sub) {
    doc.setFontSize(6); doc.setFont('helvetica','normal'); doc.setTextColor(...C.gray);
    doc.text(sub, x + 6 + doc.getTextWidth(title) + 3, y + 6.5);
  }
  doc.setDrawColor(...C.border); doc.setLineWidth(0.2);
  const tw = 6 + doc.getTextWidth(title) + (sub ? 3 + doc.getTextWidth(sub) : 0) + 4;
  doc.line(x + tw, y + 4, x + w, y + 4);
  return y + 14;
}

// ── Legend row (for donut) ────────────────────────────────────────────────────
function legendRow(doc: any, items: {label:string;value:number;color:string;total:number}[], x:number, y:number, colW:number) {
  items.forEach((d, i) => {
    const col = i % 2 === 0 ? x : x + colW + 4;
    const row = y + Math.floor(i / 2) * 5;
    const rgb = hexToRgb(d.color);
    doc.setFillColor(...rgb); doc.circle(col + 1.5, row + 1.5, 1.5, 'F');
    doc.setFontSize(5.5); doc.setFont('helvetica','normal'); doc.setTextColor(...C.gray);
    doc.text(d.label.slice(0,18), col + 5, row + 2.5);
    doc.setFont('helvetica','bold'); doc.setTextColor(...C.slate);
    const pct = d.total > 0 ? Math.round(d.value / d.total * 100) : 0;
    doc.text(`${pct}%`, col + colW - 2, row + 2.5, { align: 'right' });
  });
}

// ── MAIN EXPORT ───────────────────────────────────────────────────────────────
export interface ReportData {
  storeName:     string;
  tagline?:      string;
  address?:      string;
  phone?:        string;
  logoData?:     string;
  period:        string;
  periodLabel:   string;
  nowStr:        string;
  // Financial
  totalRevenue:  number;
  totalCogs:     number;
  grossProfit:   number;
  totalExpenses: number;
  netProfit:     number;
  grossMargin:   number;
  avgTrx:        number;
  txCount:       number;
  // Charts
  trendData:     {label:string; value:number}[];
  menuRanking:   {label:string; value:number; sub:string; rev:number}[];
  paymentData:   {label:string; value:number; color:string}[];
  stockData:     {label:string; stock:number; unit:string; min:number; pct:number}[];
  // Expenses
  expensesByCategory: {label:string; value:number}[];
  expenseList:        any[];
  // Cash register
  cashRegister:   any[];
  // AI Insight
  aiInsight?:     string | null;
  aiTips?:        string[];
}

export async function generateProfessionalPDF(data: ReportData): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const autoTable  = (await import('jspdf-autotable')).default;

  const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W    = doc.internal.pageSize.getWidth();  // 210
  const PH   = doc.internal.pageSize.getHeight(); // 297
  const ML   = 14, MR = 14;
  const CW   = W - ML - MR;
  let y = 0;

  const {
    storeName, tagline, address, phone, logoData,
    periodLabel, nowStr, totalRevenue, totalCogs, grossProfit,
    totalExpenses, netProfit, grossMargin, avgTrx, txCount,
    trendData, menuRanking, paymentData, stockData,
    expensesByCategory, expenseList, cashRegister, aiInsight, aiTips,
  } = data;

  // ── Page utilities ────────────────────────────────────────────────────────────────────────────────
  const drawPageFooter = (pageNum: number, totalPages: number) => {
    doc.setFillColor(...C.orange); doc.rect(0, PH - 8, W, 8, 'F');
    doc.setFontSize(5.5); doc.setFont('helvetica','normal'); doc.setTextColor(255,255,255);
    doc.text(`${storeName}  ·  Laporan ${periodLabel}  ·  Dibuat oleh KaffePOS`, ML, PH - 2.5);
    doc.text(`Hal. ${pageNum} / ${totalPages}  ·  ${nowStr}`, W - MR, PH - 2.5, { align: 'right' });
  };

  // Track pages that already have a header (prevent double-stamping)
  const pagedHeaders = new Set<number>();

  const addPageHeader = (pageNum?: number) => {
    const pg = pageNum ?? (doc as any).getCurrentPageInfo().pageNumber;
    if (pagedHeaders.has(pg)) return 22;
    pagedHeaders.add(pg);
    const curPg = (doc as any).getCurrentPageInfo().pageNumber;
    if (pg !== curPg) doc.setPage(pg);
    doc.setFillColor(...C.light); doc.rect(0, 0, W, 18, 'F');
    doc.setFillColor(...C.orange); doc.rect(0, 0, W, 1.2, 'F');
    if (logoData && logoData.length > 50) {
      try {
        const fmt = logoData.startsWith('data:image/png') ? 'PNG' : 'JPEG';
        doc.addImage(logoData, fmt, W - MR - 12, 3, 12, 12);
      } catch {}
    }
    doc.setFontSize(8); doc.setFont('helvetica','bold'); doc.setTextColor(...C.orange);
    doc.text(storeName, ML, 10);
    doc.setFontSize(6); doc.setFont('helvetica','normal'); doc.setTextColor(...C.gray);
    doc.text(`Laporan ${periodLabel}  ·  ${txCount} transaksi  ·  ${nowStr}`, ML, 15.5);
    if (pg !== curPg) doc.setPage(curPg);
    return 22;
  };

  const np = (need: number) => {
    if (y + need > PH - 22) {
      doc.addPage();
      addPageHeader();
      y = 22;
    }
    return y;
  };

  // safeAutoTable: wraps autoTable to stamp header on every new page it creates, then syncs y
  const safeAutoTable = (opts: any) => {
    const origDidDrawPage = opts.didDrawPage;
    opts.didDrawPage = (d: any) => {
      addPageHeader(d.pageNumber);
      if (origDidDrawPage) origDidDrawPage(d);
    };
    autoTable(doc, opts);
    const lastPg = doc.getNumberOfPages();
    doc.setPage(lastPg);
    y = (doc as any).lastAutoTable.finalY + 12;
  };

  const secHead = (title: string, sub: string | null = null) => {
    np(20);
    y = sectionHead(doc, title, sub, ML, y, CW);
  };

  // ════════════════════════════════════════════════════════
  // PAGE 1 — COVER
  // ════════════════════════════════════════════════════════
  // Dark background gradient effect
  doc.setFillColor(...C.dark); doc.rect(0, 0, W, 130, 'F');
  doc.setFillColor(30, 41, 59); doc.rect(0, 100, W, 30, 'F');

  // Orange accent bar
  doc.setFillColor(...C.orange); doc.rect(0, 130, W, 3, 'F');

  // Logo
  let logoH = 0;
  if (logoData && logoData.length > 50) {
    try {
      const fmt = logoData.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      doc.addImage(logoData, fmt, ML, 18, 22, 22);
      logoH = 22;
    } catch {}
  }

  // Store name
  doc.setFontSize(28); doc.setFont('helvetica','bold'); doc.setTextColor(255, 255, 255);
  doc.text(storeName, logoH > 0 ? ML + 26 : ML, logoH > 0 ? 28 : 32);

  if (tagline) {
    doc.setFontSize(10); doc.setFont('helvetica','italic'); doc.setTextColor(253, 186, 116);
    doc.text(tagline, logoH > 0 ? ML + 26 : ML, logoH > 0 ? 38 : 42);
  }

  // Contact info
  const infoLine = [address, phone].filter(Boolean).join('  ·  ');
  if (infoLine) {
    doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(148, 163, 184);
    doc.text(infoLine, ML, 55);
  }

  // Report title block
  doc.setFontSize(15); doc.setFont('helvetica','bold'); doc.setTextColor(255,255,255);
  doc.text('LAPORAN KEUANGAN & ANALITIK', ML, 82);

  doc.setFontSize(9); doc.setFont('helvetica','normal'); doc.setTextColor(148, 163, 184);
  doc.text(`Periode: ${periodLabel.toUpperCase()}   ·   ${txCount} Transaksi   ·   ${nowStr}`, ML, 90);

  // Decorative divider
  doc.setDrawColor(249, 115, 22); doc.setLineWidth(0.5);
  doc.line(ML, 96, ML + 40, 96);
  doc.setDrawColor(148, 163, 184); doc.setLineWidth(0.3);
  doc.line(ML + 42, 96, W - MR, 96);

  // Cover KPI cards
  const coverKPIs = [
    { l: 'Total Pendapatan',    v: fRp(totalRevenue),       bg: C.bgOrange, vc: [154,52,18]  as [number,number,number] },
    { l: 'Laba Bersih',         v: fRp(netProfit),          bg: netProfit >= 0 ? C.bgGreen : C.bgRed, vc: netProfit >= 0 ? C.green : C.red },
    { l: 'Margin Kotor',        v: `${grossMargin}%`,       bg: C.bgBlue,   vc: C.blue },
    { l: 'Total Transaksi',     v: String(txCount),         bg: [250,245,255] as [number,number,number], vc: C.purple },
  ];
  const ckW = (CW - 9) / 4;
  coverKPIs.forEach((k, i) => kpiBox(doc, k.l, k.v, null, ML + i * (ckW + 3), 104, ckW, 18, k.bg, k.vc));

  // Cover content area
  y = 140;
  doc.setFontSize(8); doc.setFont('helvetica','bold'); doc.setTextColor(...C.slate);
  doc.text('ISI LAPORAN:', ML, y); y += 7;
  const toc = [
    '01  Ringkasan Eksekutif & KPI Utama',
    '02  Laporan Laba Rugi Lengkap',
    '03  Tren Penjualan Harian (Grafik)',
    '04  Analisis Menu Terlaris',
    '05  Komposisi Metode Pembayaran',
    '06  Status Inventori & Stok Kritis',
    '07  Detail Pengeluaran Operasional',
    '08  Saldo Kasir & Kas Operasional',
    aiInsight ? '09  Analisis & Rekomendasi AI' : '',
  ].filter(Boolean);
  toc.forEach(t => {
    doc.setFontSize(7.5); doc.setFont('helvetica','normal'); doc.setTextColor(...C.gray);
    doc.text(t, ML + 4, y); y += 6;
  });

  // Cover footer
  doc.setFontSize(6.5); doc.setFont('helvetica','normal'); doc.setTextColor(100, 116, 139);
  doc.text('Dokumen ini dibuat otomatis oleh KaffePOS. Bersifat rahasia — hanya untuk keperluan internal.', W / 2, PH - 18, { align: 'center' });
  doc.setFillColor(...C.orange); doc.rect(0, PH - 8, W, 8, 'F');
  doc.setFontSize(6); doc.setTextColor(255,255,255);
  doc.text(`${storeName}  ·  www.kaffepos.app`, W / 2, PH - 2.5, { align: 'center' });

  // ════════════════════════════════════════════════════════
  // PAGE 2+ — CONTENT
  // ════════════════════════════════════════════════════════
  doc.addPage();
  y = addPageHeader();

  // ── SECTION 1: RINGKASAN EKSEKUTIF ───────────────────────────────
  secHead('RINGKASAN EKSEKUTIF', `Periode: ${periodLabel}`);

  const kw = (CW - 10) / 3;
  const kpis = [
    { l: 'Total Pendapatan',    v: fRp(totalRevenue),  sub: `${txCount} transaksi`,        bg: C.bgOrange, vc: [154,52,18]  as [number,number,number] },
    { l: 'Laba Kotor',          v: fRp(grossProfit),   sub: `Margin ${grossMargin}%`,       bg: grossProfit >= 0 ? C.bgGreen : C.bgRed, vc: grossProfit >= 0 ? C.green : C.red },
    { l: 'Pengeluaran Ops',     v: fRp(totalExpenses), sub: `${expenseList.length} item`,   bg: C.bgRed,   vc: C.red },
    { l: 'Laba Bersih',         v: fRp(netProfit),     sub: netProfit >= 0 ? '▲ Profit' : '▼ Rugi', bg: netProfit >= 0 ? C.bgGreen : C.bgRed, vc: netProfit >= 0 ? C.green : C.red },
    { l: 'Rata-rata Transaksi', v: fRp(avgTrx),        sub: 'per order',                   bg: C.bgBlue,  vc: C.blue },
    { l: 'HPP / COGS',          v: fRp(totalCogs),     sub: `${totalRevenue > 0 ? Math.round(totalCogs/totalRevenue*100) : 0}% dari omzet`, bg: [250,245,255] as [number,number,number], vc: C.purple },
  ];
  kpis.forEach((k, i) => kpiBox(doc, k.l, k.v, k.sub, ML + (i % 3) * (kw + 5), y + Math.floor(i / 3) * 22, kw, 19, k.bg, k.vc));
  y += 46;

  // ── SECTION 2: LABA RUGI ─────────────────────────────────────────
  np(70); secHead('LAPORAN LABA RUGI', null);
  safeAutoTable({
    startY: y,
    head: [['Keterangan', 'Jumlah', 'Porsi']],
    body: [
      ['Total Pendapatan Kotor',    fRp(totalRevenue),  '100%'],
      ['(-) HPP / Harga Pokok',  `- ${fRp(totalCogs)}`, `${totalRevenue > 0 ? Math.round(totalCogs/totalRevenue*100) : 0}%`],
      ['LABA KOTOR',             fRp(grossProfit),   `${grossMargin}%`],
      ['(-) Beban Operasional',  `- ${fRp(totalExpenses)}`, `${totalRevenue > 0 ? Math.round(totalExpenses/totalRevenue*100) : 0}%`],
      ['LABA BERSIH',            fRp(netProfit),     `${totalRevenue > 0 ? Math.round(netProfit/totalRevenue*100) : 0}%`],
      ['Rata-rata per Transaksi', fRp(avgTrx),        `(${txCount} trx)`],
    ],
    theme: 'plain',
    styles: { cellPadding: 4, fontSize: 7.5, lineColor: [241, 245, 249], lineWidth: { bottom: 0.3 } },
    headStyles: { fillColor: [248, 250, 252], textColor: [100, 116, 139], fontStyle: 'bold', fontSize: 7 },
    bodyStyles: { textColor: [51, 65, 85] },
    margin: { left: ML, right: MR, top: 25, bottom: 20 },
    columnStyles: { 
      0: { cellWidth: 90 },
      1: { halign: 'right', fontStyle: 'bold', cellWidth: 50 }, 
      2: { halign: 'right', textColor: [148, 163, 184] } 
    },
    didParseCell: (d: any) => {
      if (d.section === 'body') {
        if (d.row.index === 2) { d.cell.styles.fillColor = [248, 250, 252]; d.cell.styles.textColor = [15, 23, 42]; d.cell.styles.fontStyle = 'bold'; }
        if (d.row.index === 4) { d.cell.styles.fillColor = netProfit >= 0 ? [240, 253, 244] : [254, 242, 242]; d.cell.styles.fontStyle = 'bold'; d.cell.styles.fontSize = 8.5; d.cell.styles.textColor = netProfit >= 0 ? [22, 163, 74] : [220, 38, 38]; }
      }
    },
  });

  // ── SECTION 3: TREN PENJUALAN (LINE CHART) ───────────────────────
  if (trendData.length >= 2) {
    np(75); secHead('TREN PENJUALAN', `${trendData.length} hari terakhir`);
    const chartH = 40;
    // Background
    doc.setFillColor(248,250,252); doc.roundedRect(ML, y, CW, chartH + 12, 2, 2, 'F');
    doc.setFillColor(226,232,240); doc.setLineWidth(0.15);
    // Y-axis max label
    const maxTrend = Math.max(...trendData.map(d => d.value), 1);
    doc.setFontSize(5); doc.setTextColor(...C.gray);
    doc.text(fRp(maxTrend), ML + 2, y + 6);
    doc.text('0', ML + 2, y + chartH + 2);
    // Draw chart
    drawLineChart(doc, trendData, ML + 18, y + 4, CW - 22, chartH, C.orange);
    y += chartH + 20;
  }

  // ── SECTION 4: MENU TERLARIS ──────────────────────────────────────
  if (menuRanking.length > 0) {
    const topMenus = menuRanking.slice(0, 8);
    np(14 + (topMenus.length * 9) + 20); secHead('MENU TERLARIS', `Top ${Math.min(menuRanking.length, 10)}`);

    // Split layout: bar chart left + table right
    const barAreaH = topMenus.length * 9 + 4;

    // Left: horizontal bar chart
    doc.setFillColor(248,250,252); doc.roundedRect(ML, y, CW * 0.55, barAreaH, 2, 2, 'F');
    drawHBar(doc, topMenus.map(m => ({ label: m.label, value: m.value })),
      ML + 3, y + 4, CW * 0.55 - 6, 5, C.orange);

    // Right: pie/donut
    const pieData = topMenus.slice(0, 6).map((m, i) => ({
      label: m.label, value: m.value,
      color: ['#f97316','#3b82f6','#10b981','#8b5cf6','#ef4444','#ec4899'][i],
    }));
    const pieX = ML + CW * 0.58;
    const pieR = 18;
    const pieY = y + 24;
    drawDonut(doc, pieData, pieX + pieR + 4, pieY, pieR);
    // Mini legend beside donut
    const legData = pieData.map(d => ({ ...d, total: topMenus.reduce((s, m) => s + m.value, 0) }));
    legendRow(doc, legData, pieX, y + 4, (CW * 0.42 - 8) / 2);

    y += barAreaH + 10;

    // Full ranking table
    np(8 + topMenus.length * 8);
    safeAutoTable({
      startY: y,
      head: [['Rank', 'Nama Menu', 'Terjual', 'Omzet', 'Porsi']],
      body: topMenus.map((m, i) => {
        const totalRev = topMenus.reduce((s, x) => s + x.rev, 1);
        return [ `#${i + 1}`, m.label, `${m.value} px`, m.sub, `${Math.round(m.rev / totalRev * 100)}%` ];
      }),
      theme: 'plain',
      styles: { cellPadding: 3.5, fontSize: 7.5, lineColor: [241, 245, 249], lineWidth: { bottom: 0.2 } },
      headStyles: { fillColor: [248, 250, 252], textColor: [100, 116, 139], fontStyle: 'bold', fontSize: 7 },
      bodyStyles: { textColor: [51, 65, 85] },
      margin: { left: ML, right: MR, top: 25, bottom: 20 },
      columnStyles: { 
        0: { halign: 'center', cellWidth: 15, textColor: [148, 163, 184] }, 
        1: { fontStyle: 'bold' }, 
        2: { halign: 'center' }, 
        3: { halign: 'right', fontStyle: 'bold' }, 
        4: { halign: 'right', textColor: [148, 163, 184] } 
      },
    });
    y = (doc as any).lastAutoTable.finalY + 12;
  }

  // ── SECTION 5: METODE PEMBAYARAN ─────────────────────────────────
  if (paymentData.length > 0) {
    np(50 + paymentData.length * 9); secHead('METODE PEMBAYARAN', null);

    const totalPay = paymentData.reduce((s, d) => s + d.value, 0);
    // Donut
    drawDonut(doc, paymentData, ML + 22, y + 22, 18);
    // Legend
    paymentData.forEach((d, i) => {
      const lx = ML + 50;
      const ly = y + i * 9;
      const rgb = hexToRgb(d.color);
      doc.setFillColor(...rgb); doc.roundedRect(lx, ly + 1, 10, 5, 1, 1, 'F');
      doc.setFontSize(6); doc.setFont('helvetica','bold'); doc.setTextColor(255,255,255);
      doc.text(`${Math.round(d.value / totalPay * 100)}%`, lx + 5, ly + 4.8, { align: 'center' });
      doc.setFontSize(7); doc.setFont('helvetica','bold'); doc.setTextColor(...C.slate);
      doc.text(d.label, lx + 13, ly + 4.8);
      doc.setFontSize(6.5); doc.setFont('helvetica','normal'); doc.setTextColor(...C.gray);
      doc.text(fRp(d.value as number), ML + CW, ly + 4.8, { align: 'right' });
    });
    // Bar chart for payments
    const payBarW = CW * 0.38;
    drawVBar(doc, paymentData.map(d => ({ label: d.label, value: d.value })),
      ML + CW - payBarW, y, payBarW, 35, paymentData.map(d => hexToRgb(d.color)));
    y += 50;
  }

  // ── SECTION 6: INVENTORI ──────────────────────────────────────────
  if (stockData.length > 0) {
    const criticalStock = stockData.filter(s => s.pct <= 100);
    np(14 + Math.min(stockData.length, 15) * 8 + 10);
    secHead('STATUS INVENTORI', criticalStock.length > 0 ? `⚠ ${criticalStock.length} item stok kritis` : 'Semua stok aman');

    // Color-coded bar chart
    const barH = 4.5;
    stockData.slice(0, 12).forEach((s, i) => {
      const bw = Math.min(s.pct, 300) / 300 * (CW - 35);
      const by = y + i * (barH + 3.5);
      const col: [number,number,number] = s.pct <= 50 ? C.red : s.pct <= 100 ? C.amber : C.green;
      doc.setFontSize(5.5); doc.setFont('helvetica','normal'); doc.setTextColor(...C.gray);
      doc.text(s.label.slice(0, 20), ML, by + barH - 0.5);
      doc.setFillColor(240, 240, 240); doc.roundedRect(ML + 35, by, CW - 35, barH, 0.8, 0.8, 'F');
      if (bw > 0) { doc.setFillColor(...col); doc.roundedRect(ML + 35, by, bw, barH, 0.8, 0.8, 'F'); }
      doc.setFontSize(5.5); doc.setFont('helvetica','bold'); doc.setTextColor(...col);
      doc.text(`${s.stock} ${s.unit}`, ML + CW, by + barH - 0.5, { align: 'right' });
    });
    y += stockData.slice(0, 12).length * 8 + 8;

    if (criticalStock.length > 0) {
      np(14 + criticalStock.length * 7);
      doc.setFillColor(254, 242, 242); doc.roundedRect(ML, y, CW, criticalStock.length * 7 + 8, 2, 2, 'F');
      doc.setFontSize(7); doc.setFont('helvetica','bold'); doc.setTextColor(...C.red);
      doc.text('⚠ Daftar Item Stok Kritis — Perlu Restock Segera:', ML + 4, y + 6);
      criticalStock.forEach((s, i) => {
        doc.setFontSize(6.5); doc.setFont('helvetica','normal'); doc.setTextColor(...C.slate);
        doc.text(`• ${s.label}: ${s.stock} ${s.unit} (min ${s.min} ${s.unit}) — ${s.pct}%`, ML + 8, y + 12 + i * 6.5);
      });
      y += criticalStock.length * 7 + 14;
    }
  }

  // ── SECTION 7: PENGELUARAN OPERASIONAL ───────────────────────────
  if (expenseList.length > 0) {
    np(14 + Math.max(expensesByCategory.length * 7.5, 44) + 15); secHead('PENGELUARAN OPERASIONAL', `Total: ${fRp(totalExpenses)}`);

    // Pie by category
    if (expensesByCategory.length > 0) {
      const expColors = ['#ef4444','#f97316','#f59e0b','#8b5cf6','#3b82f6','#10b981'];
      const expPieData = expensesByCategory.map((e, i) => ({ label: e.label, value: e.value, color: expColors[i % expColors.length] }));
      const expTotal = expensesByCategory.reduce((s, e) => s + e.value, 0);
      drawDonut(doc, expPieData, ML + 20, y + 22, 16);
      expPieData.forEach((d, i) => {
        const lx = ML + 45; const ly = y + i * 7.5;
        const rgb = hexToRgb(d.color);
        doc.setFillColor(...rgb); doc.circle(lx + 1.5, ly + 2.5, 1.5, 'F');
        doc.setFontSize(6); doc.setFont('helvetica','normal'); doc.setTextColor(...C.gray);
        doc.text(d.label, lx + 5, ly + 3.5);
        doc.setFont('helvetica','bold'); doc.setTextColor(...C.slate);
        doc.text(fRp(d.value), ML + CW, ly + 3.5, { align: 'right' });
        doc.setTextColor(...C.gray);
        doc.text(`${Math.round(d.value / expTotal * 100)}%`, ML + CW - 22, ly + 3.5, { align: 'right' });
      });
      y += Math.max(expPieData.length * 7.5, 44) + 8;
    }

    const expRows = expenseList.slice(0, 20);
    np(14 + expRows.length * 7);
    safeAutoTable({
      startY: y,
      head: [['Tanggal', 'Keterangan', 'Kategori', 'Kasir', 'Nominal']],
      body: expRows.map((e: any) => [
        new Date(e.date).toLocaleDateString('id-ID', { day:'2-digit', month:'short' }),
        e.description || '-', e.category || 'Operasional', e.cashier || '-', fRp(e.amount),
      ]),
      theme: 'plain',
      styles: { cellPadding: 4, fontSize: 7.5, lineColor: [241, 245, 249], lineWidth: { bottom: 0.2 } },
      headStyles: { fillColor: [248, 250, 252], textColor: [100, 116, 139], fontStyle: 'bold', fontSize: 7 },
      bodyStyles: { textColor: [51, 65, 85] },
      margin: { left: ML, right: MR, top: 25, bottom: 20 },
      columnStyles: { 
        0: { cellWidth: 25, textColor: [100, 116, 139] },
        2: { cellWidth: 35 }, 
        3: { cellWidth: 30 }, 
        4: { halign: 'right', fontStyle: 'bold', textColor: [220, 38, 38] } 
      },
      foot: [['', '', '', 'TOTAL OPS', fRp(totalExpenses)]],
      footStyles: { fillColor: [254, 242, 242], textColor: [220, 38, 38], fontStyle: 'bold', fontSize: 8, halign: 'right' },
    });
    y = (doc as any).lastAutoTable.finalY + 12;
  }

  // ── SECTION 8: SALDO KASIR ────────────────────────────────────────
  const todayCR = cashRegister.filter(Boolean).slice(0, 20);
  if (todayCR.length > 0) {
    np(14 + todayCR.length * 8);
    secHead('SALDO KASIR AWAL', `${todayCR.length} hari`);
    safeAutoTable({
      startY: y,
      head: [['Tanggal Modal', 'Petugas Kasir', 'Catatan', 'Saldo']],
      body: todayCR.map((c: any) => [
        new Date(c.date).toLocaleDateString('id-ID', { weekday:'short', day:'2-digit', month:'short' }),
        c.opened_by || 'Staff Kasir', c.note || '-', fRp(c.amount)
      ]),
      theme: 'plain',
      styles: { cellPadding: 4, fontSize: 7.5, lineColor: [241, 245, 249], lineWidth: { bottom: 0.2 } },
      headStyles: { fillColor: [248, 250, 252], textColor: [100, 116, 139], fontStyle: 'bold', fontSize: 7 },
      bodyStyles: { textColor: [51, 65, 85] },
      margin: { left: ML, right: MR, top: 25, bottom: 20 },
      columnStyles: { 
        0: { cellWidth: 35, textColor: [100, 116, 139] },
        1: { cellWidth: 40 },
        3: { halign: 'right', fontStyle: 'bold', textColor: [15, 23, 42] } 
      },
      foot: [['', '', 'TOTAL MODAL KASIR', fRp(todayCR.reduce((s: number, c: any) => s + c.amount, 0))]],
      footStyles: { fillColor: [248, 250, 252], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 7.5, halign: 'right' },
    });
    y = (doc as any).lastAutoTable.finalY + 12;
  }

  // ── SECTION 9: AI INSIGHT ─────────────────────────────────────────
  if (aiInsight) {
    const lines = aiInsight.split('\n').filter(Boolean);
    const boxH = lines.length * 6 + (aiTips?.length ? aiTips.length * 6 + 8 : 0) + 12;
    np(14 + Math.min(boxH, 80) + 10); secHead('ANALISIS & REKOMENDASI AI', 'Powered by Google Gemini');

    doc.setFillColor(239, 246, 255); doc.roundedRect(ML, y, CW, Math.min(boxH, 80), 2, 2, 'F');
    doc.setDrawColor(...C.blue); doc.setLineWidth(0.3);
    doc.roundedRect(ML, y, CW, Math.min(boxH, 80), 2, 2, 'S');

    // AI icon
    doc.setFontSize(12); doc.text('✨', ML + 3, y + 9);
    doc.setFontSize(7.5); doc.setFont('helvetica','bold'); doc.setTextColor(...C.blue);
    doc.text('Gemini AI — Insight Bisnis', ML + 12, y + 9);

    let aiY = y + 15;
    lines.slice(0, 10).forEach(line => {
      if (aiY > y + 75) return;
      doc.setFontSize(6.5); doc.setFont('helvetica','normal'); doc.setTextColor(...C.slate);
      const wrapped = doc.splitTextToSize(line.replace(/[*_#]/g, ''), CW - 8);
      doc.text(wrapped, ML + 4, aiY);
      aiY += wrapped.length * 4.5 + 1;
    });

    y += Math.min(boxH, 80) + 8;

    // Tips box
    if (aiTips && aiTips.length > 0) {
      np(14 + aiTips.length * 8);
      doc.setFillColor(240, 253, 244); doc.roundedRect(ML, y, CW, aiTips.length * 8 + 12, 2, 2, 'F');
      doc.setFontSize(7.5); doc.setFont('helvetica','bold'); doc.setTextColor(...C.green);
      doc.text('💡 Rekomendasi Aksi:', ML + 4, y + 8);
      aiTips.forEach((tip, i) => {
        doc.setFontSize(6.5); doc.setFont('helvetica','normal'); doc.setTextColor(...C.slate);
        const wrapped = doc.splitTextToSize(`${i + 1}. ${tip}`, CW - 10);
        doc.text(wrapped, ML + 6, y + 14 + i * 7.5);
      });
      y += aiTips.length * 8 + 18;
    }
  }

  // ── Stamp footers on all pages (headers already stamped inline) ────
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    // Only stamp header if somehow missed (safety net)
    addPageHeader(i);
    drawPageFooter(i, totalPages);
  }

  // ── Save ──────────────────────────────────────────────────────────
  await downloadPDFReport(doc, `Laporan_${data.period}`, storeName);
}
