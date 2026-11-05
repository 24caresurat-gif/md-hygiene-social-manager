export type ErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';
export type QRCode = {
  addData(data: string, mode?: 'Numeric' | 'Alphanumeric' | 'Byte' | 'Kanji'): void;
  make(): void;
  getModuleCount(): number;
  isDark(row: number, col: number): boolean;
  createSvgTag(cellSize?: number, margin?: number): string;
  createSvgTag(options?: { cellSize?: number; margin?: number; scalable?: boolean }): string;
};
export type QRCodeFactory = (typeNumber: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28 | 29 | 30 | 31 | 32 | 33 | 34 | 35 | 36 | 37 | 38 | 39 | 40, errorCorrectionLevel: ErrorCorrectionLevel) => QRCode;
declare const qrcode: QRCodeFactory;
export default qrcode;
