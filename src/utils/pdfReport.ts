/* eslint-disable @typescript-eslint/no-explicit-any */
import type { jsPDF } from 'jspdf';
import { downloadPDFReport, sharePDFReport, type DownloadResult } from './downloadFile';

const C = {
  orange: [249, 115, 22] as [number, number, number],
  orangeDark: [154, 52, 18] as [number, number, number],
  dark: [15, 23, 42] as [number, number, number],
  slate: [30, 41, 59] as [number, number, number],
  gray: [100, 116, 139] as [number, number, number],
  muted: [148, 163, 184] as [number, number, number],
  light: [248, 250, 252] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  green: [22, 163, 74] as [number, number, number],
  red: [220, 38, 38] as [number, number, number],
  blue: [37, 99, 235] as [number, number, number],
  amber: [217, 119, 6] as [number, number, number],
  purple: [124, 58, 237] as [number, number, number],
  border: [226, 232, 240] as [number, number, number],
  bgOrange: [255, 247, 237] as [number, number, number],
  bgBlue: [239, 246, 255] as [number, number, number],
  bgGreen: [240, 253, 244] as [number, number, number],
  bgRed: [254, 242, 242] as [number, number, number],
  bgSlate: [241, 245, 249] as [number, number, number],
  bgPurple: [245, 243, 255] as [number, number, number],
};

const CHART_COLORS = ['#f97316', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444', '#ec4899', '#f59e0b', '#06b6d4'];

const fRp = (n: number) => `Rp ${new Intl.NumberFormat('id-ID').format(Math.round(n || 0))}`;
const fNum = (n: number) => new Intl.NumberFormat('id-ID').format(Math.round(n || 0));
const pct = (value: number, total: number) => (total > 0 ? Math.round((value / total) * 100) : 0);
const clamp = (num: number, min: number, max: number) => Math.max(min, Math.min(max, num));
const cleanText = (value?: string | null) => (value || '').replace(/[*_#`]/g, '').trim();

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function dateLabel(value: any): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function dateShortLabel(value: any): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
}

function drawHBar(
  doc: jsPDF,
  data: { label: string; value: number; meta?: string }[],
  x: number,
  y: number,
  w: number,
  barH: number,
  color: [number, number, number],
) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const gap = barH + 5;
  data.forEach((item, index) => {
    const rowY = y + index * gap;
    const bw = (item.value / max) * (w - 52);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.slate);
    doc.text(item.label.slice(0, 22), x, rowY + 2.8);
    if (item.meta) {
      doc.setFontSize(5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...C.gray);
      doc.text(item.meta.slice(0, 28), x, rowY + barH);
    }
    doc.setFillColor(...C.bgSlate);
    doc.roundedRect(x + 33, rowY, w - 52, barH, 0.9, 0.9, 'F');
    if (bw > 0) {
      doc.setFillColor(...color);
      doc.roundedRect(x + 33, rowY, bw, barH, 0.9, 0.9, 'F');
    }
    doc.setFontSize(5.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.slate);
    doc.text(fNum(item.value), x + w - 1, rowY + barH - 0.3, { align: 'right' });
  });
}

function drawLineChart(
  doc: jsPDF,
  data: { label: string; value: number }[],
  x: number,
  y: number,
  w: number,
  h: number,
  color: [number, number, number],
) {
  if (data.length < 2) return;
  const max = Math.max(...data.map((d) => d.value), 1);
  const pts = data.map((d, i) => ({
    px: x + (i / (data.length - 1)) * w,
    py: y + h - (d.value / max) * h,
  }));

  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.15);
  [0.25, 0.5, 0.75, 1].forEach((f) => doc.line(x, y + h * f, x + w, y + h * f));

  const areaPoints: number[][] = [];
  pts.forEach((p) => areaPoints.push([p.px, p.py]));
  areaPoints.push([pts[pts.length - 1].px, y + h]);
  areaPoints.push([pts[0].px, y + h]);
  doc.setFillColor(color[0], color[1], color[2]);
  try {
    (doc as any).polygon(areaPoints, 'F');
  } catch {
    // ignore polygon availability issues
  }

  doc.setDrawColor(...color);
  doc.setLineWidth(0.8);
  for (let i = 1; i < pts.length; i += 1) {
    doc.line(pts[i - 1].px, pts[i - 1].py, pts[i].px, pts[i].py);
  }

  pts.forEach((p) => {
    doc.setFillColor(...C.white);
    doc.circle(p.px, p.py, 0.9, 'F');
    doc.setFillColor(...color);
    doc.circle(p.px, p.py, 0.55, 'F');
  });

  doc.setFontSize(4.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.gray);
  data.forEach((d, i) => {
    doc.text(d.label, pts[i].px, y + h + 3.5, { align: 'center' });
  });
}

function drawDonut(
  doc: jsPDF,
  data: { label: string; value: number; color: string }[],
  cx: number,
  cy: number,
  r: number,
  centerLines?: [string, string],
) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  if (!total) return;
  let angle = -Math.PI / 2;
  data.forEach((item) => {
    const sweep = (item.value / total) * 2 * Math.PI;
    const rgb = hexToRgb(item.color);
    doc.setFillColor(...rgb);
    const steps = Math.max(20, Math.round(sweep * 12));
    const pts: number[][] = [[cx, cy]];
    for (let i = 0; i <= steps; i += 1) {
      const a = angle + (i / steps) * sweep;
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    try {
      (doc as any).polygon(pts, 'F');
    } catch {
      // ignore polygon availability issues
    }
    angle += sweep;
  });
  doc.setFillColor(...C.white);
  doc.circle(cx, cy, r * 0.52, 'F');
  doc.setFontSize(5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.gray);
  doc.text(centerLines?.[0] || 'Total', cx, cy - 1.5, { align: 'center' });
  doc.setFontSize(6.8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.slate);
  doc.text(centerLines?.[1] || fNum(total), cx, cy + 3.5, { align: 'center' });
}

function drawVBar(
  doc: jsPDF,
  data: { label: string; value: number }[],
  x: number,
  y: number,
  w: number,
  h: number,
  colors: [number, number, number][],
) {
  if (!data.length) return;
  const max = Math.max(...data.map((d) => d.value), 1);
  const bw = (w - (data.length - 1) * 2) / data.length;
  data.forEach((item, i) => {
    const bh = (item.value / max) * h;
    const bx = x + i * (bw + 2);
    const by = y + h - bh;
    const color = colors[i % colors.length];
    if (bh > 0) {
      doc.setFillColor(...color);
      doc.roundedRect(bx, by, bw, bh, 0.7, 0.7, 'F');
    }
    doc.setFontSize(4.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.gray);
    doc.text(item.label.slice(0, 7), bx + bw / 2, y + h + 3.2, { align: 'center' });
  });
}

function kpiBox(
  doc: jsPDF,
  label: string,
  value: string,
  sub: string | null,
  x: number,
  y: number,
  w: number,
  h: number,
  bg: [number, number, number],
  valueColor: [number, number, number],
) {
  doc.setFillColor(...bg);
  doc.roundedRect(x, y, w, h, 2, 2, 'F');
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.18);
  doc.roundedRect(x, y, w, h, 2, 2, 'S');
  doc.setFontSize(5.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.gray);
  doc.text(label, x + 4, y + 6);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...valueColor);
  doc.text(value, x + 4, y + 12.5);
  if (sub) {
    doc.setFontSize(5.4);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.gray);
    doc.text(sub, x + 4, y + h - 3);
  }
}

function sectionHead(
  doc: jsPDF,
  title: string,
  sub: string | null,
  x: number,
  y: number,
  w: number,
) {
  doc.setFillColor(...C.orange);
  doc.roundedRect(x, y, 3, 8, 0.7, 0.7, 'F');
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.dark);
  doc.text(title, x + 6, y + 6.2);
  if (sub) {
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.gray);
    doc.text(sub, x + 6 + doc.getTextWidth(title) + 3, y + 6.2);
  }
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.25);
  const usedWidth = 6 + doc.getTextWidth(title) + (sub ? doc.getTextWidth(sub) + 3 : 0) + 6;
  doc.line(x + usedWidth, y + 4.2, x + w, y + 4.2);
  return y + 13;
}

function drawLegendBlock(
  doc: jsPDF,
  items: { label: string; value: number; color: string; suffix?: string }[],
  x: number,
  y: number,
  w: number,
) {
  items.forEach((item, index) => {
    const rowY = y + index * 7;
    const rgb = hexToRgb(item.color);
    doc.setFillColor(...rgb);
    doc.circle(x + 2, rowY + 1.7, 1.6, 'F');
    doc.setFontSize(5.8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.slate);
    doc.text(item.label.slice(0, 24), x + 6, rowY + 2.6);
    doc.setFont('helvetica', 'bold');
    doc.text(item.suffix || fNum(item.value), x + w, rowY + 2.6, { align: 'right' });
  });
}

function drawBulletList(doc: jsPDF, items: string[], x: number, y: number, width: number, lineGap = 5.1) {
  let cursor = y;
  items.forEach((item) => {
    const text = cleanText(item);
    if (!text) return;
    doc.setFillColor(...C.orange);
    doc.circle(x + 1.4, cursor - 1.4, 0.7, 'F');
    doc.setFontSize(6.2);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.slate);
    const wrapped = doc.splitTextToSize(text, width - 6);
    doc.text(wrapped, x + 4.5, cursor);
    cursor += wrapped.length * 3.9 + (lineGap - 3.9);
  });
  return cursor;
}

function drawInfoPanel(
  doc: jsPDF,
  opts: {
    title: string;
    lines: string[];
    x: number;
    y: number;
    w: number;
    bg: [number, number, number];
    titleColor: [number, number, number];
  },
) {
  const lineHeights = opts.lines.map((line) => doc.splitTextToSize(cleanText(line), opts.w - 8).length);
  const height = 10 + lineHeights.reduce((sum, count) => sum + count * 4.2, 0) + 4;
  doc.setFillColor(...opts.bg);
  doc.roundedRect(opts.x, opts.y, opts.w, height, 2, 2, 'F');
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.18);
  doc.roundedRect(opts.x, opts.y, opts.w, height, 2, 2, 'S');
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...opts.titleColor);
  doc.text(opts.title, opts.x + 4, opts.y + 6.5);
  let cursor = opts.y + 12;
  opts.lines.forEach((line) => {
    const wrapped = doc.splitTextToSize(cleanText(line), opts.w - 8);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.slate);
    doc.text(wrapped, opts.x + 4, cursor);
    cursor += wrapped.length * 4.2;
  });
  return height;
}

export interface ReportData {
  storeName: string;
  tagline?: string;
  address?: string;
  phone?: string;
  logoData?: string;
  period: string;
  periodLabel: string;
  reportTitle?: string;
  fileBaseName?: string;
  nowStr: string;
  totalRevenue: number;
  totalCogs: number;
  grossProfit: number;
  totalExpenses: number;
  netProfit: number;
  grossMargin: number;
  avgTrx: number;
  txCount: number;
  trendData: { label: string; value: number }[];
  menuRanking: { label: string; value: number; sub: string; rev: number }[];
  paymentData: { label: string; value: number; color: string }[];
  stockData: { label: string; stock: number; unit: string; min: number; pct: number }[];
  categorySales?: { label: string; qty: number; revenue: number }[];
  staffPerformance?: { name: string; transactions: number; revenue: number; points: number }[];
  kopiScore?: { score: number; label: string };
  recentTransactions?: any[];
  expensesByCategory: { label: string; value: number }[];
  expenseList: any[];
  cashRegister: any[];
  aiInsight?: string | null;
  aiTips?: string[];
}

export async function generateProfessionalPDF(data: ReportData): Promise<void> {
  await buildProfessionalPDF(data, 'download');
}

export async function shareProfessionalPDF(data: ReportData, text?: string): Promise<DownloadResult> {
  return buildProfessionalPDF(data, 'share', text);
}

async function buildProfessionalPDF(
  data: ReportData,
  mode: 'download' | 'share',
  shareText?: string,
): Promise<any> {
  const autoTable = (await import('jspdf-autotable')).default;
  const { jsPDF } = await import('jspdf');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const PH = doc.internal.pageSize.getHeight();
  const ML = 14;
  const MR = 14;
  const CW = W - ML - MR;
  let y = 0;

  const {
    storeName,
    tagline,
    address,
    phone,
    logoData,
    periodLabel,
    reportTitle,
    nowStr,
    totalRevenue,
    totalCogs,
    grossProfit,
    totalExpenses,
    netProfit,
    grossMargin,
    avgTrx,
    txCount,
    trendData,
    menuRanking,
    paymentData,
    stockData,
    categorySales = [],
    staffPerformance = [],
    kopiScore,
    recentTransactions = [],
    expensesByCategory,
    expenseList,
    cashRegister,
    aiInsight,
    aiTips,
  } = data;

  const reportProfile = [
    `Periode laporan: ${periodLabel}`,
    `Tanggal pembuatan: ${nowStr}`,
    `Jumlah transaksi: ${fNum(txCount)} transaksi`,
    `Status dokumen: siap digunakan sebagai ringkasan manajerial dan operasional`,
  ];

  const avgDailyRevenue = trendData.length ? Math.round(trendData.reduce((sum, item) => sum + item.value, 0) / trendData.length) : 0;
  const peakTrend = trendData.reduce<{ label: string; value: number } | null>((best, item) => (!best || item.value > best.value ? item : best), null);
  const lowTrend = trendData.reduce<{ label: string; value: number } | null>((best, item) => (!best || item.value < best.value ? item : best), null);
  const expenseRatio = pct(totalExpenses, totalRevenue);
  const cogsRatio = pct(totalCogs, totalRevenue);
  const netMargin = pct(netProfit, totalRevenue);
  const totalCashRegister = cashRegister.reduce((sum: number, item: any) => sum + (item.amount || 0), 0);
  const criticalStock = stockData.filter((item) => item.pct <= 100);
  const topMenu = menuRanking[0];
  const paymentLeader = paymentData.reduce<{ label: string; value: number; color: string } | null>((best, item) => (!best || item.value > best.value ? item : best), null);
  const expenseLeader = expensesByCategory.reduce<{ label: string; value: number } | null>((best, item) => (!best || item.value > best.value ? item : best), null);
  const totalMenuRevenue = menuRanking.reduce((sum, item) => sum + (item.rev || 0), 0);
  const summaryBullets = [
    `Pendapatan tercatat ${fRp(totalRevenue)} dengan laba bersih ${fRp(netProfit)} dan margin bersih ${netMargin}%.`,
    topMenu ? `Menu paling kuat adalah ${topMenu.label} dengan penjualan ${fNum(topMenu.value)} porsi dan omzet ${fRp(topMenu.rev)}.` : 'Belum ada menu dominan yang bisa dijadikan fokus promosi.',
    paymentLeader ? `Metode pembayaran terbesar adalah ${paymentLeader.label} dengan porsi ${pct(paymentLeader.value, totalRevenue)}% dari total penerimaan.` : 'Belum ada data komposisi pembayaran.',
    criticalStock.length > 0 ? `${criticalStock.length} item inventori berada pada level kritis dan perlu prioritas restock.` : 'Inventori utama berada pada level aman untuk operasional saat ini.',
    expenseLeader ? `Pos beban operasional terbesar adalah ${expenseLeader.label} sebesar ${fRp(expenseLeader.value)}.` : 'Belum ada beban operasional yang tercatat pada periode ini.',
  ];

  const pagedHeaders = new Set<number>();

  const drawPageFooter = (pageNum: number, totalPages: number) => {
    doc.setFillColor(...C.dark);
    doc.rect(0, PH - 8, W, 8, 'F');
    doc.setFontSize(5.6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.white);
    doc.text(`Terima kasih | Powered by KaffePOS`, ML, PH - 2.6);
    doc.text(`Halaman ${pageNum}/${totalPages}  |  Export ${nowStr}`, W - MR, PH - 2.6, { align: 'right' });
  };

  const addPageHeader = (pageNum?: number) => {
    const page = pageNum ?? (doc as any).getCurrentPageInfo().pageNumber;
    if (pagedHeaders.has(page)) return 22;
    pagedHeaders.add(page);
    const currentPage = (doc as any).getCurrentPageInfo().pageNumber;
    if (page !== currentPage) doc.setPage(page);
    doc.setFillColor(...C.white);
    doc.rect(0, 0, W, 18, 'F');
    doc.setFillColor(...C.orange);
    doc.rect(0, 0, W, 1.4, 'F');
    if (logoData && logoData.length > 50) {
      try {
        const fmt = logoData.startsWith('data:image/png') ? 'PNG' : 'JPEG';
        doc.addImage(logoData, fmt, W - MR - 12, 3, 12, 12);
      } catch {
        // ignore image errors
      }
    }
    doc.setFontSize(8.2);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.orange);
    doc.text(storeName, ML, 9.5);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.gray);
    doc.text(`Laporan ${periodLabel} | ${fNum(txCount)} transaksi | dibuat ${nowStr}`, ML, 15);
    if (page !== currentPage) doc.setPage(currentPage);
    return 22;
  };

  const np = (need: number) => {
    if (y + need > PH - 18) {
      doc.addPage();
      y = addPageHeader();
    }
  };

  const safeAutoTable = (opts: any) => {
    const originalDidDrawPage = opts.didDrawPage;
    opts.didDrawPage = (hookData: any) => {
      addPageHeader(hookData.pageNumber);
      if (originalDidDrawPage) originalDidDrawPage(hookData);
    };
    autoTable(doc, opts);
    const lastPage = doc.getNumberOfPages();
    doc.setPage(lastPage);
    y = (doc as any).lastAutoTable.finalY + 10;
  };

  const secHead = (title: string, sub: string | null = null) => {
    np(18);
    y = sectionHead(doc, title, sub, ML, y, CW);
  };

  // Cover
  doc.setFillColor(...C.dark);
  doc.rect(0, 0, W, 136, 'F');
  doc.setFillColor(...C.slate);
  doc.rect(0, 105, W, 31, 'F');
  doc.setFillColor(...C.orange);
  doc.rect(0, 136, W, 3.2, 'F');

  let logoPlaced = false;
  if (logoData && logoData.length > 50) {
    try {
      const fmt = logoData.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      doc.addImage(logoData, fmt, ML, 18, 22, 22);
      logoPlaced = true;
    } catch {
      // ignore image errors
    }
  }

  doc.setFontSize(25);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.white);
  doc.text(storeName, logoPlaced ? ML + 28 : ML, 29);
  if (tagline) {
    doc.setFontSize(9.2);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(253, 186, 116);
    doc.text(cleanText(tagline), logoPlaced ? ML + 28 : ML, 37);
  }

  const infoLine = [address, phone].filter(Boolean).map((item) => cleanText(item)).join('  |  ');
  if (infoLine) {
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.muted);
    doc.text(infoLine, ML, 53);
  }

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.white);
  doc.text((reportTitle || 'LAPORAN PENJUALAN').toUpperCase(), ML, 80);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.muted);
  doc.text(`Periode ${periodLabel} | Dokumen analisis profesional siap arsip`, ML, 88);

  doc.setDrawColor(...C.orange);
  doc.setLineWidth(0.45);
  doc.line(ML, 94, ML + 42, 94);
  doc.setDrawColor(...C.muted);
  doc.setLineWidth(0.2);
  doc.line(ML + 45, 94, W - MR, 94);

  const coverMetrics = [
    { label: 'Pendapatan', value: fRp(totalRevenue), bg: C.bgOrange, color: C.orangeDark, sub: `${fNum(txCount)} transaksi` },
    { label: 'Laba Bersih', value: fRp(netProfit), bg: netProfit >= 0 ? C.bgGreen : C.bgRed, color: netProfit >= 0 ? C.green : C.red, sub: `${netMargin}% margin bersih` },
    { label: 'Margin Kotor', value: `${grossMargin}%`, bg: C.bgBlue, color: C.blue, sub: `${cogsRatio}% HPP` },
    { label: 'Kopi Score', value: kopiScore ? String(kopiScore.score) : '-', bg: C.bgPurple, color: C.purple, sub: kopiScore?.label || 'belum tersedia' },
  ];
  const coverCardW = (CW - 9) / 4;
  coverMetrics.forEach((item, index) => {
    kpiBox(doc, item.label, item.value, item.sub, ML + index * (coverCardW + 3), 104, coverCardW, 20, item.bg, item.color);
  });

  y = 149;
  doc.setFontSize(8.2);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.slate);
  doc.text('PROFIL DOKUMEN', ML, y);
  y += 7;
  y = drawBulletList(doc, reportProfile, ML, y, 84, 5.4);

  const reportScope = [
    'Ringkasan eksekutif dan indikator kinerja utama',
    'Laporan laba rugi, tren penjualan, dan performa menu',
    'Komposisi pembayaran, inventori, pengeluaran, dan saldo kas',
    aiInsight ? 'Analisis AI dan rekomendasi tindakan prioritas' : 'Area rekomendasi tindakan manajerial',
  ];
  const panelHeight = drawInfoPanel(doc, {
    title: 'CAKUPAN LAPORAN',
    lines: reportScope,
    x: ML + 96,
    y: 148,
    w: CW - 96,
    bg: C.bgSlate,
    titleColor: C.dark,
  });
  y = Math.max(y, 148 + panelHeight + 4);

  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.gray);
  doc.text('Dokumen ini dihasilkan otomatis oleh KaffePOS dan dirancang untuk kebutuhan review operasional internal.', W / 2, PH - 17, { align: 'center' });
  doc.setFillColor(...C.orange);
  doc.rect(0, PH - 8, W, 8, 'F');
  doc.setFontSize(6);
  doc.setTextColor(...C.white);
  doc.text(`${storeName}  |  Laporan ${periodLabel}`, W / 2, PH - 2.5, { align: 'center' });

  // Content pages
  doc.addPage();
  y = addPageHeader();

  secHead('RINGKASAN EKSEKUTIF', `Periode ${periodLabel}`);
  const topRowW = (CW - 10) / 3;
  const summaryKpis = [
    { label: 'Total Pendapatan', value: fRp(totalRevenue), sub: `${fNum(txCount)} transaksi`, bg: C.bgOrange, color: C.orangeDark },
    { label: 'Total Transaksi', value: fNum(txCount), sub: 'order valid', bg: C.bgSlate, color: C.dark },
    { label: 'Laba Kotor', value: fRp(grossProfit), sub: `${grossMargin}% margin kotor`, bg: grossProfit >= 0 ? C.bgGreen : C.bgRed, color: grossProfit >= 0 ? C.green : C.red },
    { label: 'Rata-rata Transaksi', value: fRp(avgTrx), sub: 'nilai per transaksi', bg: C.bgBlue, color: C.blue },
    { label: 'Beban Operasional', value: fRp(totalExpenses), sub: `${expenseList.length} catatan`, bg: C.bgRed, color: C.red },
    { label: 'Kopi Score', value: kopiScore ? String(kopiScore.score) : '-', sub: kopiScore?.label || 'belum tersedia', bg: C.bgPurple, color: C.purple },
  ];
  summaryKpis.forEach((item, index) => {
    kpiBox(
      doc,
      item.label,
      item.value,
      item.sub,
      ML + (index % 3) * (topRowW + 5),
      y + Math.floor(index / 3) * 24,
      topRowW,
      20,
      item.bg,
      item.color,
    );
  });
  y += 51;

  const leftSummaryH = drawInfoPanel(doc, {
    title: 'SOROTAN KINERJA',
    lines: summaryBullets,
    x: ML,
    y,
    w: CW * 0.58,
    bg: C.bgSlate,
    titleColor: C.dark,
  });
  const rightSummaryLines = [
    `Rasio HPP terhadap omzet sebesar ${cogsRatio}%.`,
    `Beban operasional menyerap ${expenseRatio}% dari pendapatan.`,
    peakTrend ? `Puncak penjualan tercatat pada ${peakTrend.label} sebesar ${fRp(peakTrend.value)}.` : 'Belum ada tren penjualan yang dapat dihitung.',
    lowTrend ? `Titik penjualan terendah berada pada ${lowTrend.label} sebesar ${fRp(lowTrend.value)}.` : 'Belum ada pembanding penjualan terendah.',
  ];
  const rightSummaryH = drawInfoPanel(doc, {
    title: 'CATATAN MANAJERIAL',
    lines: rightSummaryLines,
    x: ML + CW * 0.6,
    y,
    w: CW * 0.4,
    bg: C.bgBlue,
    titleColor: C.blue,
  });
  y += Math.max(leftSummaryH, rightSummaryH) + 10;

  secHead('LAPORAN LABA RUGI', 'Struktur pendapatan dan profitabilitas');
  const profitCardW = (CW - 6) / 2;
  const profitAnalysisLines = [
    `Pendapatan bersih periode ini ${fRp(totalRevenue)}.`,
    `HPP tercatat ${fRp(totalCogs)} atau ${cogsRatio}% dari omzet.`,
    `Laba bersih ${fRp(netProfit)} dengan margin ${netMargin}%.`,
  ];
  const opsAnalysisLines = [
    `Beban operasional ${fRp(totalExpenses)} atau ${expenseRatio}% dari omzet.`,
    `Rata-rata transaksi berada di level ${fRp(avgTrx)} per transaksi.`,
    netProfit >= 0 ? 'Operasional masih menghasilkan profit positif.' : 'Perlu pengetatan biaya agar posisi rugi dapat dikoreksi.',
  ];
  const profitPanelH = drawInfoPanel(doc, {
    title: 'ANALISIS PROFIT',
    lines: profitAnalysisLines,
    x: ML,
    y,
    w: profitCardW,
    bg: C.bgGreen,
    titleColor: C.green,
  });
  const opsPanelH = drawInfoPanel(doc, {
    title: 'ANALISIS OPERASIONAL',
    lines: opsAnalysisLines,
    x: ML + profitCardW + 6,
    y,
    w: profitCardW,
    bg: C.bgBlue,
    titleColor: C.blue,
  });
  y += Math.max(profitPanelH, opsPanelH) + 6;

  safeAutoTable({
    startY: y,
    head: [['Komponen', 'Nominal', 'Proporsi', 'Catatan']],
    body: [
      ['Pendapatan Kotor', fRp(totalRevenue), '100%', 'Basis seluruh analisis penjualan'],
      ['HPP / COGS', `- ${fRp(totalCogs)}`, `${cogsRatio}%`, 'Biaya bahan dan komponen langsung'],
      ['Laba Kotor', fRp(grossProfit), `${grossMargin}%`, 'Hasil setelah HPP dikurangi'],
      ['Beban Operasional', `- ${fRp(totalExpenses)}`, `${expenseRatio}%`, 'Pengeluaran operasional periode ini'],
      ['Laba Bersih', fRp(netProfit), `${netMargin}%`, netProfit >= 0 ? 'Posisi masih positif' : 'Masih membutuhkan efisiensi'],
      ['Rata-rata per Transaksi', fRp(avgTrx), `${fNum(txCount)} trx`, 'Nilai rata-rata setiap order'],
    ],
    theme: 'plain',
    styles: { cellPadding: 4, fontSize: 7.4, lineColor: [241, 245, 249], lineWidth: { bottom: 0.22 } },
    headStyles: { fillColor: [248, 250, 252], textColor: [100, 116, 139], fontStyle: 'bold', fontSize: 7.1 },
    bodyStyles: { textColor: [51, 65, 85] },
    margin: { left: ML, right: MR, top: 25, bottom: 20 },
    columnStyles: {
      0: { cellWidth: 48, fontStyle: 'bold' },
      1: { cellWidth: 42, halign: 'right', fontStyle: 'bold' },
      2: { cellWidth: 22, halign: 'right', textColor: [148, 163, 184] },
      3: { cellWidth: 'auto' },
    },
    didParseCell: (hookData: any) => {
      if (hookData.section !== 'body') return;
      if (hookData.row.index === 2) {
        hookData.cell.styles.fillColor = [248, 250, 252];
        hookData.cell.styles.textColor = [15, 23, 42];
      }
      if (hookData.row.index === 4) {
        hookData.cell.styles.fillColor = netProfit >= 0 ? [240, 253, 244] : [254, 242, 242];
        hookData.cell.styles.textColor = netProfit >= 0 ? [22, 163, 74] : [220, 38, 38];
        hookData.cell.styles.fontStyle = 'bold';
      }
    },
  });

  if (trendData.length >= 2) {
    secHead('TREN PENJUALAN', `${trendData.length} titik observasi`);
    const trendCardW = (CW - 9) / 4;
    const momentum = trendData.length >= 2 ? pct(trendData[trendData.length - 1].value - trendData[trendData.length - 2].value, Math.max(trendData[trendData.length - 2].value, 1)) : 0;
    const trendMetrics = [
      { label: 'Rata-rata Harian', value: fRp(avgDailyRevenue), sub: 'berdasarkan grafik', bg: C.bgBlue, color: C.blue },
      { label: 'Puncak Penjualan', value: peakTrend ? fRp(peakTrend.value) : '-', sub: peakTrend?.label || '-', bg: C.bgOrange, color: C.orangeDark },
      { label: 'Titik Terendah', value: lowTrend ? fRp(lowTrend.value) : '-', sub: lowTrend?.label || '-', bg: C.bgRed, color: C.red },
      { label: 'Perubahan Akhir', value: `${momentum >= 0 ? '+' : ''}${momentum}%`, sub: 'dibanding titik sebelumnya', bg: C.bgGreen, color: momentum >= 0 ? C.green : C.red },
    ];
    trendMetrics.forEach((item, index) => {
      kpiBox(doc, item.label, item.value, item.sub, ML + index * (trendCardW + 3), y, trendCardW, 18, item.bg, item.color);
    });
    y += 24;

    np(68);
    doc.setFillColor(...C.bgSlate);
    doc.roundedRect(ML, y, CW, 53, 2, 2, 'F');
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.18);
    doc.roundedRect(ML, y, CW, 53, 2, 2, 'S');
    doc.setFontSize(5.2);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.gray);
    doc.text(fRp(Math.max(...trendData.map((item) => item.value), 0)), ML + 3, y + 8);
    doc.text('0', ML + 3, y + 42.5);
    drawLineChart(doc, trendData, ML + 16, y + 5, CW - 22, 34, C.orange);
    const trendLines = [
      `Konsistensi penjualan harian membantu membaca ritme operasional dan kebutuhan stok.`,
      peakTrend ? `Periode terkuat ada di ${peakTrend.label}; ini cocok dijadikan acuan promosi ulang.` : 'Belum ada puncak penjualan yang menonjol.',
    ];
    drawBulletList(doc, trendLines, ML + 4, y + 47, CW - 8, 4.8);
    y += 60;

    np(48);
    doc.setFillColor(...C.white);
    doc.roundedRect(ML, y, CW, 42, 2, 2, 'F');
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.18);
    doc.roundedRect(ML, y, CW, 42, 2, 2, 'S');
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.dark);
    doc.text('Bar Chart Penjualan per Hari', ML + 4, y + 6.5);
    drawVBar(doc, trendData, ML + 8, y + 11, CW - 16, 22, [C.orange, C.blue, C.green, C.amber]);
    y += 50;
  }

  if (menuRanking.length > 0) {
    secHead('PERFORMA MENU', `Top ${Math.min(menuRanking.length, 8)} menu berdasarkan kuantitas`);
    const topMenus = menuRanking.slice(0, 8);
    const leftW = CW * 0.56;
    const rightX = ML + leftW + 6;
    const rightW = CW - leftW - 6;
    const panelHeight = 14 + topMenus.length * 7.4;
    np(panelHeight + 12);

    doc.setFillColor(...C.bgSlate);
    doc.roundedRect(ML, y, leftW, panelHeight, 2, 2, 'F');
    doc.roundedRect(rightX, y, rightW, panelHeight, 2, 2, 'F');
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.18);
    doc.roundedRect(ML, y, leftW, panelHeight, 2, 2, 'S');
    doc.roundedRect(rightX, y, rightW, panelHeight, 2, 2, 'S');
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.dark);
    doc.text('Volume Penjualan Menu', ML + 4, y + 6.5);
    drawHBar(
      doc,
      topMenus.map((item) => ({ label: item.label, value: item.value, meta: item.sub })),
      ML + 4,
      y + 11,
      leftW - 8,
      4.6,
      C.orange,
    );

    const donutData = topMenus.slice(0, 6).map((item, index) => ({
      label: item.label,
      value: item.value,
      color: CHART_COLORS[index % CHART_COLORS.length],
    }));
    drawDonut(doc, donutData, rightX + 20, y + 19, 15.5, ['Top Menu', fNum(donutData.reduce((sum, item) => sum + item.value, 0))]);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.dark);
    doc.text('Kontribusi Menu Utama', rightX + 40, y + 6.5);
    drawLegendBlock(
      doc,
      donutData.map((item) => ({
        ...item,
        suffix: `${pct(item.value, donutData.reduce((sum, value) => sum + value.value, 0))}%`,
      })),
      rightX + 40,
      y + 11,
      rightW - 44,
    );
    y += panelHeight + 8;

    safeAutoTable({
      startY: y,
      head: [['Peringkat', 'Nama Menu', 'Qty Terjual', 'Omzet', 'Kontribusi Omzet']],
      body: topMenus.map((item, index) => [
        `#${index + 1}`,
        item.label,
        `${fNum(item.value)} porsi`,
        fRp(item.rev),
        `${pct(item.rev, totalMenuRevenue)}%`,
      ]),
      theme: 'plain',
      styles: { cellPadding: 3.6, fontSize: 7.3, lineColor: [241, 245, 249], lineWidth: { bottom: 0.22 } },
      headStyles: { fillColor: [248, 250, 252], textColor: [100, 116, 139], fontStyle: 'bold', fontSize: 7 },
      bodyStyles: { textColor: [51, 65, 85] },
      margin: { left: ML, right: MR, top: 25, bottom: 20 },
      columnStyles: {
        0: { cellWidth: 18, halign: 'center', textColor: [148, 163, 184] },
        1: { cellWidth: 60, fontStyle: 'bold' },
        2: { cellWidth: 28, halign: 'center' },
        3: { cellWidth: 36, halign: 'right', fontStyle: 'bold' },
        4: { halign: 'right', textColor: [148, 163, 184] },
      },
    });
  }

  if (categorySales.length > 0) {
    secHead('RINGKASAN PENJUALAN PER KATEGORI', `${categorySales.length} kategori aktif`);
    const totalCategoryRevenue = categorySales.reduce((sum, item) => sum + item.revenue, 0);
    safeAutoTable({
      startY: y,
      head: [['Kategori', 'Qty Terjual', 'Revenue', 'Kontribusi']],
      body: categorySales.map((item) => [
        item.label,
        `${fNum(item.qty)} item`,
        fRp(item.revenue),
        `${pct(item.revenue, totalCategoryRevenue)}%`,
      ]),
      theme: 'plain',
      styles: { cellPadding: 3.7, fontSize: 7.3, lineColor: [241, 245, 249], lineWidth: { bottom: 0.22 } },
      headStyles: { fillColor: [255, 247, 237], textColor: [154, 52, 18], fontStyle: 'bold', fontSize: 7 },
      bodyStyles: { textColor: [51, 65, 85] },
      margin: { left: ML, right: MR, top: 25, bottom: 20 },
      columnStyles: {
        0: { cellWidth: 70, fontStyle: 'bold' },
        1: { cellWidth: 32, halign: 'right' },
        2: { cellWidth: 42, halign: 'right', fontStyle: 'bold' },
        3: { halign: 'right', textColor: [148, 163, 184] },
      },
      foot: [['TOTAL', `${fNum(categorySales.reduce((sum, item) => sum + item.qty, 0))} item`, fRp(totalCategoryRevenue), '100%']],
      footStyles: { fillColor: [255, 247, 237], textColor: [154, 52, 18], fontStyle: 'bold', fontSize: 7.8, halign: 'right' },
    });
  }

  if (paymentData.length > 0) {
    secHead('KOMPOSISI PEMBAYARAN', 'Distribusi penerimaan berdasarkan metode bayar');
    const totalPayment = paymentData.reduce((sum, item) => sum + item.value, 0);
    np(62);
    doc.setFillColor(...C.bgSlate);
    doc.roundedRect(ML, y, CW, 52, 2, 2, 'F');
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.18);
    doc.roundedRect(ML, y, CW, 52, 2, 2, 'S');
    drawDonut(doc, paymentData, ML + 24, y + 25, 17, ['Penerimaan', fRp(totalPayment)]);
    drawLegendBlock(
      doc,
      paymentData.map((item) => ({
        ...item,
        suffix: `${pct(item.value, totalPayment)}%`,
      })),
      ML + 50,
      y + 9,
      52,
    );
    drawVBar(
      doc,
      paymentData.map((item) => ({ label: item.label, value: item.value })),
      ML + CW - 55,
      y + 8,
      48,
      28,
      paymentData.map((item) => hexToRgb(item.color)),
    );
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.gray);
    doc.text('Grafik batang menunjukkan nominal penerimaan, donut menampilkan komposisi proporsi.', ML + 4, y + 47);
    y += 60;
  }

  if (stockData.length > 0) {
    secHead('STATUS INVENTORI', criticalStock.length > 0 ? `${criticalStock.length} item perlu perhatian` : 'Stok utama berada pada level aman');
    const visibleStock = stockData.slice(0, 12);
    np(visibleStock.length * 8 + 22);
    doc.setFillColor(...C.bgSlate);
    doc.roundedRect(ML, y, CW, visibleStock.length * 7.8 + 14, 2, 2, 'F');
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.18);
    doc.roundedRect(ML, y, CW, visibleStock.length * 7.8 + 14, 2, 2, 'S');
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.dark);
    doc.text('Monitoring Stok dan Ambang Minimum', ML + 4, y + 6.5);
    visibleStock.forEach((item, index) => {
      const rowY = y + 11 + index * 7.8;
      const ratio = clamp(item.pct, 0, 300);
      const barWidth = (ratio / 300) * (CW - 58);
      const barColor: [number, number, number] = item.pct <= 50 ? C.red : item.pct <= 100 ? C.amber : C.green;
      doc.setFontSize(5.8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...C.slate);
      doc.text(item.label.slice(0, 28), ML + 4, rowY + 2.8);
      doc.setFillColor(...C.white);
      doc.roundedRect(ML + 44, rowY, CW - 58, 4.2, 0.8, 0.8, 'F');
      doc.setFillColor(...barColor);
      doc.roundedRect(ML + 44, rowY, barWidth, 4.2, 0.8, 0.8, 'F');
      doc.setFontSize(5.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...C.gray);
      doc.text(`Min ${item.min} ${item.unit}`, ML + CW - 27, rowY + 2.8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...barColor);
      doc.text(`${item.stock} ${item.unit}`, ML + CW - 3, rowY + 2.8, { align: 'right' });
    });
    y += visibleStock.length * 7.8 + 20;

    if (criticalStock.length > 0) {
      np(criticalStock.length * 6.5 + 20);
      const panelH = criticalStock.length * 6.2 + 12;
      doc.setFillColor(...C.bgRed);
      doc.roundedRect(ML, y, CW, panelH, 2, 2, 'F');
      doc.setDrawColor(...C.red);
      doc.setLineWidth(0.18);
      doc.roundedRect(ML, y, CW, panelH, 2, 2, 'S');
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...C.red);
      doc.text('Prioritas Restock', ML + 4, y + 6.5);
      criticalStock.forEach((item, index) => {
        doc.setFontSize(6);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...C.slate);
        doc.text(`- ${item.label}: ${item.stock} ${item.unit} tersedia dari batas minimum ${item.min} ${item.unit} (${item.pct}%)`, ML + 4, y + 12 + index * 6.2);
      });
      y += panelH + 8;
    }
  }

  if (expenseList.length > 0) {
    secHead('PENGELUARAN OPERASIONAL', `Total beban operasional ${fRp(totalExpenses)}`);
    if (expensesByCategory.length > 0) {
      np(58);
      doc.setFillColor(...C.bgSlate);
      doc.roundedRect(ML, y, CW, 48, 2, 2, 'F');
      doc.setDrawColor(...C.border);
      doc.setLineWidth(0.18);
      doc.roundedRect(ML, y, CW, 48, 2, 2, 'S');
      const expenseColors = ['#ef4444', '#f97316', '#f59e0b', '#8b5cf6', '#3b82f6', '#10b981'];
      const expensePieData = expensesByCategory.map((item, index) => ({
        label: item.label,
        value: item.value,
        color: expenseColors[index % expenseColors.length],
      }));
      drawDonut(doc, expensePieData, ML + 22, y + 23, 15, ['Total', fRp(totalExpenses)]);
      drawLegendBlock(
        doc,
        expensePieData.map((item) => ({
          ...item,
          suffix: `${pct(item.value, totalExpenses)}%`,
        })),
        ML + 45,
        y + 9,
        55,
      );
      doc.setFontSize(6);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...C.gray);
      doc.text('Kategori dengan porsi terbesar perlu dimonitor agar tidak menggerus margin.', ML + CW - 70, y + 42);
      y += 56;
    }

    safeAutoTable({
      startY: y,
      head: [['Tanggal', 'Deskripsi', 'Kategori', 'Petugas', 'Nominal']],
      body: expenseList.slice(0, 30).map((item: any) => [
        dateShortLabel(item.date),
        cleanText(item.description) || '-',
        cleanText(item.category) || 'Operasional',
        cleanText(item.cashier) || '-',
        fRp(item.amount || 0),
      ]),
      theme: 'plain',
      styles: { cellPadding: 3.7, fontSize: 7.2, lineColor: [241, 245, 249], lineWidth: { bottom: 0.22 } },
      headStyles: { fillColor: [248, 250, 252], textColor: [100, 116, 139], fontStyle: 'bold', fontSize: 7 },
      bodyStyles: { textColor: [51, 65, 85] },
      margin: { left: ML, right: MR, top: 25, bottom: 20 },
      columnStyles: {
        0: { cellWidth: 23, textColor: [100, 116, 139] },
        2: { cellWidth: 34 },
        3: { cellWidth: 28 },
        4: { cellWidth: 30, halign: 'right', fontStyle: 'bold', textColor: [220, 38, 38] },
      },
      foot: [['', '', '', 'TOTAL PENGELUARAN', fRp(totalExpenses)]],
      footStyles: { fillColor: [254, 242, 242], textColor: [220, 38, 38], fontStyle: 'bold', fontSize: 7.8, halign: 'right' },
    });
  }

  if (cashRegister.length > 0) {
    secHead('SALDO KAS OPERASIONAL', `Modal kas tercatat ${fRp(totalCashRegister)}`);
    const cashNotes = [
      `Total pembukaan kas yang tercatat pada periode laporan adalah ${fRp(totalCashRegister)}.`,
      `Jumlah catatan pembukaan kas: ${fNum(cashRegister.length)} hari/batch.`,
      'Gunakan tabel berikut untuk mencocokkan modal awal kas dengan pengeluaran dan arus operasional harian.',
    ];
    const cashPanelH = drawInfoPanel(doc, {
      title: 'RINGKASAN KAS',
      lines: cashNotes,
      x: ML,
      y,
      w: CW,
      bg: C.bgBlue,
      titleColor: C.blue,
    });
    y += cashPanelH + 8;

    safeAutoTable({
      startY: y,
      head: [['Tanggal Modal', 'Petugas', 'Catatan', 'Saldo Awal']],
      body: cashRegister.slice(0, 30).map((item: any) => [
        dateLabel(item.date),
        cleanText(item.opened_by) || 'Staff Kasir',
        cleanText(item.note) || '-',
        fRp(item.amount || 0),
      ]),
      theme: 'plain',
      styles: { cellPadding: 3.8, fontSize: 7.2, lineColor: [241, 245, 249], lineWidth: { bottom: 0.22 } },
      headStyles: { fillColor: [248, 250, 252], textColor: [100, 116, 139], fontStyle: 'bold', fontSize: 7 },
      bodyStyles: { textColor: [51, 65, 85] },
      margin: { left: ML, right: MR, top: 25, bottom: 20 },
      columnStyles: {
        0: { cellWidth: 34, textColor: [100, 116, 139] },
        1: { cellWidth: 38 },
        3: { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
      },
      foot: [['', '', 'TOTAL MODAL KAS', fRp(totalCashRegister)]],
      footStyles: { fillColor: [239, 246, 255], textColor: [37, 99, 235], fontStyle: 'bold', fontSize: 7.8, halign: 'right' },
    });
  }

  if (staffPerformance.length > 0) {
    secHead('TOP PERFORMING STAFF', 'Poin gamification dihitung dari transaksi valid, basket, dan QRIS');
    safeAutoTable({
      startY: y,
      head: [['Rank', 'Staff', 'Transaksi', 'Revenue', 'Poin']],
      body: staffPerformance.map((item, index) => [
        `#${index + 1}`,
        item.name,
        fNum(item.transactions),
        fRp(item.revenue),
        fNum(item.points),
      ]),
      theme: 'plain',
      styles: { cellPadding: 3.7, fontSize: 7.3, lineColor: [241, 245, 249], lineWidth: { bottom: 0.22 } },
      headStyles: { fillColor: [248, 250, 252], textColor: [100, 116, 139], fontStyle: 'bold', fontSize: 7 },
      bodyStyles: { textColor: [51, 65, 85] },
      margin: { left: ML, right: MR, top: 25, bottom: 20 },
      columnStyles: {
        0: { cellWidth: 18, halign: 'center', textColor: [249, 115, 22], fontStyle: 'bold' },
        1: { cellWidth: 62, fontStyle: 'bold' },
        2: { cellWidth: 28, halign: 'right' },
        3: { cellWidth: 42, halign: 'right', fontStyle: 'bold' },
        4: { halign: 'right', textColor: [249, 115, 22], fontStyle: 'bold' },
      },
    });
  }

  if (aiInsight || (aiTips && aiTips.length > 0)) {
    secHead('ANALISIS DAN REKOMENDASI AI', 'Bahan acuan tindakan operasional');
    const aiSummaryLines = aiInsight
      ? doc.splitTextToSize(cleanText(aiInsight), CW - 8).slice(0, 9)
      : ['Tidak ada ringkasan AI untuk periode ini.'];
    const tipLines = (aiTips || []).map((item) => cleanText(item)).filter(Boolean);
    const summaryPanelH = 12 + aiSummaryLines.length * 4.2;
    np(summaryPanelH + Math.max(22, tipLines.length * 6.2 + 14));

    doc.setFillColor(...C.bgBlue);
    doc.roundedRect(ML, y, CW, summaryPanelH, 2, 2, 'F');
    doc.setDrawColor(...C.blue);
    doc.setLineWidth(0.18);
    doc.roundedRect(ML, y, CW, summaryPanelH, 2, 2, 'S');
    doc.setFontSize(7.2);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.blue);
    doc.text('Ringkasan AI', ML + 4, y + 6.5);
    doc.setFontSize(6.2);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.slate);
    doc.text(aiSummaryLines, ML + 4, y + 12);
    y += summaryPanelH + 8;

    if (tipLines.length > 0) {
      const tipsPanelH = 12 + tipLines.length * 6.1;
      doc.setFillColor(...C.bgGreen);
      doc.roundedRect(ML, y, CW, tipsPanelH, 2, 2, 'F');
      doc.setDrawColor(...C.green);
      doc.setLineWidth(0.18);
      doc.roundedRect(ML, y, CW, tipsPanelH, 2, 2, 'S');
      doc.setFontSize(7.2);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...C.green);
      doc.text('Rekomendasi Tindakan', ML + 4, y + 6.5);
      drawBulletList(doc, tipLines, ML + 2, y + 12, CW - 4, 5.4);
      y += tipsPanelH + 8;
    }
  }

  if (recentTransactions.length > 0) {
    secHead('DAFTAR TRANSAKSI TERBARU', `Maksimal ${Math.min(recentTransactions.length, 30)} transaksi terbaru`);
    safeAutoTable({
      startY: y,
      head: [['Tanggal', 'ID', 'Pelanggan', 'Kasir', 'Metode', 'Total']],
      body: recentTransactions.slice(0, 30).map((tx: any) => [
        dateShortLabel(tx.date),
        cleanText(tx.id) || '-',
        cleanText(tx.customer_name) || 'Walk-in',
        cleanText(tx.cashier) || '-',
        cleanText(tx.method) || '-',
        fRp(tx.total || 0),
      ]),
      theme: 'plain',
      styles: { cellPadding: 3.3, fontSize: 6.9, lineColor: [241, 245, 249], lineWidth: { bottom: 0.22 }, overflow: 'linebreak' },
      headStyles: { fillColor: [248, 250, 252], textColor: [100, 116, 139], fontStyle: 'bold', fontSize: 6.8 },
      bodyStyles: { textColor: [51, 65, 85] },
      margin: { left: ML, right: MR, top: 25, bottom: 20 },
      columnStyles: {
        0: { cellWidth: 22, textColor: [100, 116, 139] },
        1: { cellWidth: 43, fontStyle: 'bold' },
        2: { cellWidth: 34 },
        3: { cellWidth: 28 },
        4: { cellWidth: 22, halign: 'center' },
        5: { cellWidth: 32, halign: 'right', fontStyle: 'bold', textColor: [154, 52, 18] },
      },
    });
  }

  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    addPageHeader(page);
    drawPageFooter(page, totalPages);
  }

  if (mode === 'share') {
    return sharePDFReport(doc, data.fileBaseName || `Laporan Penjualan ${periodLabel}`, storeName, shareText);
  }

  return downloadPDFReport(doc, data.fileBaseName || `Laporan Penjualan ${periodLabel}`, storeName);
}
