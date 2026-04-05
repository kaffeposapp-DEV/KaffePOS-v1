 
 
 
 
 
 
// src/utils/escpos.ts — ESC/POS Command Builder untuk Thermal Printer
// Mendukung printer 58mm (32 char) dan 80mm (48 char)

export interface ReceiptData {
  cafeName:    string;
  address:     string;
  phone:       string;
  orderNumber: string;
  cashierName: string;
  customerName?: string | null;
  datetime:    string;
  items:       Array<{ name: string; qty: number; price: number; subtotal: number }>;
  subtotal:    number;
  discount:    number;
  tax:         number;
  total:       number;
  paid:        number;
  change:      number;
  method:      string;
  note?:       string | null;
  qrData?:     string;
}

function fRp(n: number): string {
  return `Rp${n.toLocaleString('id-ID')}`;
}

function padLine(left: string, right: string, width: number): string {
  const space = width - left.length - right.length;
  return left + ' '.repeat(Math.max(1, space)) + right;
}

export class EscPos {
  private buffer: number[] = [];

  init(): this { this.buffer.push(0x1B, 0x40); return this; }

  setCodepage(page: number = 0x00): this {
    this.buffer.push(0x1B, 0x74, page); return this;
  }

  alignLeft():   this { this.buffer.push(0x1B, 0x61, 0x00); return this; }
  alignCenter(): this { this.buffer.push(0x1B, 0x61, 0x01); return this; }
  alignRight():  this { this.buffer.push(0x1B, 0x61, 0x02); return this; }

  boldOn():  this { this.buffer.push(0x1B, 0x45, 0x01); return this; }
  boldOff(): this { this.buffer.push(0x1B, 0x45, 0x00); return this; }

  sizeNormal():       this { this.buffer.push(0x1D, 0x21, 0x00); return this; }
  sizeDoubleWidth():  this { this.buffer.push(0x1D, 0x21, 0x10); return this; }
  sizeDoubleHeight(): this { this.buffer.push(0x1D, 0x21, 0x01); return this; }
  sizeDouble():       this { this.buffer.push(0x1D, 0x21, 0x11); return this; }

  text(str: string): this {
    for (let i = 0; i < str.length; i++) {
      this.buffer.push(str.charCodeAt(i) & 0xFF);
    }
    return this;
  }

  newline(count: number = 1): this {
    for (let i = 0; i < count; i++) this.buffer.push(0x0A);
    return this;
  }

  divider(width: number = 32): this {
    return this.text('-'.repeat(width)).newline();
  }

  feed(lines: number = 3): this {
    this.buffer.push(0x1B, 0x64, lines); return this;
  }

  cutPartial(): this {
    this.buffer.push(0x1D, 0x56, 0x42, 0x00); return this;
  }

  qrCode(data: string, size: number = 6): this {
    const storeCmd: number[] = [0x1D, 0x28, 0x6B, 4, 0, 0x31, 0x41, 0x32, 0x00];
    const sizeCmd:  number[] = [0x1D, 0x28, 0x6B, 3, 0, 0x31, 0x43, size];
    const errCmd:   number[] = [0x1D, 0x28, 0x6B, 3, 0, 0x31, 0x45, 0x30];
    const dataLen = data.length + 3;
    const storeData: number[] = [
      0x1D, 0x28, 0x6B, dataLen & 0xFF, (dataLen >> 8) & 0xFF,
      0x31, 0x50, 0x30, ...Array.from(data).map(c => c.charCodeAt(0))
    ];
    const printCmd: number[] = [0x1D, 0x28, 0x6B, 3, 0, 0x31, 0x51, 0x30];
    this.buffer.push(...storeCmd, ...sizeCmd, ...errCmd, ...storeData, ...printCmd);
    return this;
  }

  build(): number[] { return [...this.buffer]; }
}

export function buildReceipt(order: ReceiptData, paperWidth: 58 | 80 = 58): number[] {
  const width = paperWidth === 58 ? 32 : 48;
  const esc = new EscPos();

  esc.init().setCodepage(0x00);

  // ── Header ──────────────────────────────────────────────────────
  esc.alignCenter()
    .boldOn().sizeDouble()
    .text(order.cafeName.substring(0, Math.floor(width / 2))).newline()
    .sizeNormal().boldOff()
    .text(order.address.substring(0, width)).newline()
    .text(order.phone.substring(0, width)).newline()
    .divider(width);

  // ── Info order ──────────────────────────────────────────────────
  esc.alignLeft()
    .text(`No    : ${order.orderNumber}`).newline()
    .text(`Kasir : ${order.cashierName}`).newline();

  if (order.customerName) {
    esc.boldOn().text(`Pelanggan: ${order.customerName}`).newline().boldOff();
  }

  esc.text(`Waktu : ${order.datetime}`).newline()
    .text(`Bayar : ${order.method}`).newline()
    .divider(width);

  // ── Items ────────────────────────────────────────────────────────
  for (const item of order.items) {
    const maxName = width - 12;
    const name  = item.name.substring(0, maxName);
    const price = fRp(item.subtotal);
    esc.text(`${name} x${item.qty}`).newline()
      .text(padLine('', price, width)).newline();
  }

  esc.divider(width);

  // ── Totals ───────────────────────────────────────────────────────
  esc.alignRight()
    .text(padLine('Subtotal', fRp(order.subtotal), width)).newline();

  if (order.discount > 0) {
    esc.text(padLine('Diskon', `-${fRp(order.discount)}`, width)).newline();
  }
  if (order.tax > 0) {
    esc.text(padLine('Pajak', fRp(order.tax), width)).newline();
  }

  esc.boldOn()
    .text(padLine('TOTAL', fRp(order.total), width)).newline()
    .boldOff()
    .text(padLine('Bayar', fRp(order.paid), width)).newline()
    .text(padLine('Kembalian', fRp(order.change), width)).newline()
    .divider(width);

  // ── Note ─────────────────────────────────────────────────────────
  if (order.note) {
    esc.alignLeft().text(`Catatan: ${order.note}`).newline().divider(width);
  }

  // ── Footer ───────────────────────────────────────────────────────
  esc.alignCenter()
    .text('Terima kasih sudah mampir!').newline()
    .text('Sampai jumpa lagi :)').newline();

  if (order.qrData) {
    esc.newline().qrCode(order.qrData, 5);
  }

  esc.feed(3).cutPartial();

  return esc.build();
}
