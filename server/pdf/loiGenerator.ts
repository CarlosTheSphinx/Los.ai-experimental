import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from 'pdf-lib';
import type { QuotePdfData } from './quoteGenerator';
import { sanitizeForPdf } from './quoteGenerator';
import type { LoiDefaults } from '@shared/schema';

function normalizeKey(key: string): string {
  return key.replace(/[-_\s]/g, '').toLowerCase();
}

function resolveField(data: Record<string, any> | null | undefined, ...aliases: string[]): any {
  if (!data) return undefined;
  for (const alias of aliases) {
    if (data[alias] !== undefined && data[alias] !== '' && data[alias] !== null) return data[alias];
  }
  const normalized = aliases.map(normalizeKey);
  for (const key of Object.keys(data)) {
    const nk = normalizeKey(key);
    if (normalized.includes(nk) && data[key] !== undefined && data[key] !== '' && data[key] !== null) {
      return data[key];
    }
  }
  return undefined;
}

function safeNumber(value: any): number {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const cleaned = String(value).replace(/[$,%\s]/g, '');
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
}

function formatCurrency(value: any): string {
  const num = safeNumber(value);
  if (num === 0 && (value === undefined || value === null || value === '')) return '';
  return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fv(value: any): string {
  if (value === undefined || value === null || value === '') return '';
  return sanitizeForPdf(String(value));
}

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  boldItalic: PDFFont;
}

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 72;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BLACK = rgb(0, 0, 0);
const DARK_GRAY = rgb(0.2, 0.2, 0.2);
const GRAY = rgb(0.4, 0.4, 0.4);
const LIGHT_GRAY = rgb(0.75, 0.75, 0.75);
const TABLE_BG = rgb(0.96, 0.96, 0.97);
const TABLE_HEADER_BG = rgb(0.88, 0.88, 0.9);

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) > maxWidth) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawWrappedText(page: PDFPage, text: string, x: number, y: number, font: PDFFont, size: number, maxWidth: number, lineHeight: number, color = DARK_GRAY): number {
  const lines = wrapText(sanitizeForPdf(text), font, size, maxWidth);
  let cy = y;
  for (const line of lines) {
    page.drawText(line, { x, y: cy, size, font, color });
    cy -= lineHeight;
  }
  return cy;
}

function drawPageHeader(page: PDFPage, fonts: Fonts): number {
  const title = sanitizeForPdf('Letter of Intent – BPL Term Loan');
  page.drawText(title, {
    x: MARGIN,
    y: PAGE_H - 50,
    size: 14,
    font: fonts.bold,
    color: BLACK,
  });

  page.drawLine({
    start: { x: MARGIN, y: PAGE_H - 56 },
    end: { x: PAGE_W - MARGIN, y: PAGE_H - 56 },
    thickness: 1.5,
    color: BLACK,
  });

  return PAGE_H - 72;
}

function drawBlankLine(page: PDFPage, x: number, y: number, width: number): void {
  page.drawLine({
    start: { x, y: y - 2 },
    end: { x: x + width, y: y - 2 },
    thickness: 0.5,
    color: LIGHT_GRAY,
  });
}

function drawTableRow(
  page: PDFPage,
  y: number,
  leftLabel: string,
  leftValue: string,
  rightLabel: string,
  rightValue: string,
  fonts: Fonts,
  rowHeight: number = 18,
  isHeader: boolean = false
): number {
  const halfW = CONTENT_W / 2;
  const labelSize = 7.5;
  const valueSize = 8.5;
  const labelW = 100;

  page.drawRectangle({
    x: MARGIN,
    y: y - rowHeight,
    width: CONTENT_W,
    height: rowHeight,
    color: isHeader ? TABLE_HEADER_BG : TABLE_BG,
    borderColor: LIGHT_GRAY,
    borderWidth: 0.5,
  });

  page.drawLine({
    start: { x: MARGIN + halfW, y },
    end: { x: MARGIN + halfW, y: y - rowHeight },
    thickness: 0.5,
    color: LIGHT_GRAY,
  });

  const textY = y - rowHeight + 5;

  page.drawText(sanitizeForPdf(leftLabel), {
    x: MARGIN + 4,
    y: textY,
    size: labelSize,
    font: fonts.bold,
    color: DARK_GRAY,
  });

  if (leftValue) {
    page.drawText(sanitizeForPdf(leftValue), {
      x: MARGIN + labelW + 4,
      y: textY,
      size: valueSize,
      font: fonts.regular,
      color: BLACK,
    });
  } else {
    drawBlankLine(page, MARGIN + labelW + 4, textY, halfW - labelW - 12);
  }

  page.drawText(sanitizeForPdf(rightLabel), {
    x: MARGIN + halfW + 4,
    y: textY,
    size: labelSize,
    font: fonts.bold,
    color: DARK_GRAY,
  });

  if (rightValue) {
    page.drawText(sanitizeForPdf(rightValue), {
      x: MARGIN + halfW + labelW + 4,
      y: textY,
      size: valueSize,
      font: fonts.regular,
      color: BLACK,
    });
  } else {
    drawBlankLine(page, MARGIN + halfW + labelW + 4, textY, halfW - labelW - 12);
  }

  return y - rowHeight;
}

const DEFAULT_LOI_INTRO = 'Thank you for providing Sphinx Capital ("Originator") information regarding your request for business purpose real estate financing. Based on our preliminary and limited review of the information provided, we are pleased to inform you of our interest in pursuing this opportunity further, subject to the terms and conditions set forth below. If the below terms are acceptable, please sign this preliminary approval letter and return it to us no later than one business day. If accepted within this time frame, the terms outlined herein shall expire 45 calendar days from the date of this Letter.';

const DEFAULT_LOI_RATE_LOCK_NOTE = '*The Interest Rate will be locked following the execution date of this Letter of Intent or after all appraisals have been received (indicated based on the box checked above), and the rate lock will be for 45 calendar days. Your Loan Interest Rate is based on loan credit parameters, represented by you (and stated in this Letter), and may be changed if differences are found in underwriting, at Originator\'s sole discretion.';

const DEFAULT_LOI_DISCLAIMER = 'The proposed Loan Interest Rate and terms may be unilaterally withdrawn or adjusted by Originator in its sole discretion at any time in the event, during the underwriting process, certain loan parameters are determined to be materially and adversely different compared to those presented at the time this Letter was issued.';

const DEFAULT_LOI_DISCLAIMER2 = 'Please note this Preliminary Approval Letter serves to outline the terms of the proposed financing of the referenced transaction. This Preliminary Approval Letter is merely a general proposal and is neither a binding offer nor a contract. Borrower understands and agrees that Originator is not obligated to enter into the transaction contemplated by this Preliminary Approval Letter, on the terms set forth herein, or on any other terms, unless and until Originator obtains internal committee approval, which committee approval shall be predicated on multiple factors including but not limited to satisfactory appraisal, environmental screening report (documenting no environmental risks), specific historical and current operating expense explanations, satisfactory credit review of the borrowing entity and Key Principals, and satisfactory review of the property\'s market and submarket, and Originator or its capital partner executes and delivers to Borrower final definitive loan documents, the terms of which shall supersede in their entirety the terms set forth herein. No party shall have any legal rights or obligations with respect to the other unless and until a formal application for the potential loan is signed by both Originator and Borrower.';

const DEFAULT_LOI_VENDOR_TEXT = 'We have a Title/Escrow vendor with whom we have a strong relationship, and we believe using this vendor is the cheapest and most efficient option. However, if you have a strong preference to use another vendor, please let us know.';

const DEFAULT_LOI_CLOSING = 'I appreciate the opportunity to present this proposal and look forward to the possibility of discussing the details of this structure at your convenience. To accept this proposal, please sign the acknowledgment on the following page.';

const DEFAULT_LOI_APPRAISAL_NOTE = 'Costs can vary based on several factors including geographic region, the service provider and the type of report ordered. Costs are controlled by independent third parties, subject to change without notice. Borrower to pay appraiser directly.';

const DEFAULT_LOI_FEES_FOOTNOTE = '^ The above estimates do not include title fees, borrower\'s legal fees, or any other third-party costs incurred while closing the loan.';

export const LOI_DEFAULT_VALUES: Required<LoiDefaults> = {
  loanProgram: 'BPL Term',
  loanTerm: '360 Months',
  loanType: '30 Year Fixed, P&I',
  escrowAccount: 'Yes (Taxes and Insurance)',
  amortizationTerm: '360 Months (P&I Loan)',
  rateBuydown: '0 % of the Loan Amount',
  underwritingFee: '$1,500',
  legalDocFee: '$750',
  introText: DEFAULT_LOI_INTRO,
  disclaimerText: DEFAULT_LOI_DISCLAIMER,
  disclaimerText2: DEFAULT_LOI_DISCLAIMER2,
  closingText: DEFAULT_LOI_CLOSING,
  vendorText: DEFAULT_LOI_VENDOR_TEXT,
  rateLockNote: DEFAULT_LOI_RATE_LOCK_NOTE,
  appraisalNote: DEFAULT_LOI_APPRAISAL_NOTE,
  feesFootnote: DEFAULT_LOI_FEES_FOOTNOTE,
};

export async function generateLoiPdf(data: QuotePdfData, loiDefaults?: LoiDefaults): Promise<{ pdfBytes: Uint8Array; signingFields: LoiSigningField[] }> {
  const d = { ...LOI_DEFAULT_VALUES, ...loiDefaults };
  const pdfDoc = await PDFDocument.create();

  const fonts: Fonts = {
    regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
    italic: await pdfDoc.embedFont(StandardFonts.HelveticaOblique),
    boldItalic: await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique),
  };

  const allData: Record<string, any> = {
    ...data.loanData,
    customerName: [data.customerFirstName, data.customerLastName].filter(Boolean).join(' ') || undefined,
    customerCompanyName: data.customerCompanyName || data.loanData?.entityName,
    propertyAddress: data.propertyAddress || data.loanData?.propertyAddress,
    interestRate: data.interestRate,
    pointsCharged: data.pointsCharged,
  };

  const loanAmount = resolveField(allData, 'loanAmount', 'requestedLoanAmount', 'loan_amount');
  const interestRate = fv(data.interestRate);
  const propertyValue = resolveField(allData, 'propertyValue', 'estValuePurchasePrice', 'estimatedValue', 'purchasePrice', 'property_value');
  const ficoScore = fv(resolveField(allData, 'ficoScore', 'statedFicoScore', 'creditScore', 'fico_score', 'fico'));
  const propertyType = fv(resolveField(allData, 'propertyType', 'property_type'));
  const loanPurpose = fv(resolveField(allData, 'loanPurpose', 'loan_purpose', 'purpose'));
  const prepaymentPenalty = fv(resolveField(allData, 'prepaymentPenalty', 'prepayment_penalty', 'prepayPenalty'));
  let dscr = fv(resolveField(allData, 'calculatedDscr', 'dscr', 'dscrRatio', 'estimatedDscr'));
  if (!dscr) {
    const rent = safeNumber(resolveField(allData, 'grossMonthlyRent', 'gross_monthly_rent', 'monthlyRent'));
    const annTaxes = safeNumber(resolveField(allData, 'annualTaxes', 'annual_taxes'));
    const annInsurance = safeNumber(resolveField(allData, 'annualInsurance', 'annual_insurance'));
    const annHOA = safeNumber(resolveField(allData, 'annualHOA', 'annual_hoa'));
    const mTaxes = annTaxes > 0 ? annTaxes / 12 : safeNumber(resolveField(allData, 'monthlyTaxes', 'monthly_taxes'));
    const mInsurance = annInsurance > 0 ? annInsurance / 12 : safeNumber(resolveField(allData, 'monthlyInsurance', 'monthly_insurance'));
    const mHOA = annHOA > 0 ? annHOA / 12 : safeNumber(resolveField(allData, 'monthlyHOA', 'monthly_hoa'));
    const la = safeNumber(loanAmount);
    const rateStr = String(data.interestRate || resolveField(allData, 'interestRate', 'interest_rate') || '');
    const annualRate = safeNumber(rateStr) / 100;
    let termMonths = 360;
    const termStr = String(resolveField(allData, 'loanTerm', 'loan_term', 'amortizationTerm') || resolveField(allData, 'loanType', 'loan_type') || '');
    const moMatch = termStr.match(/(\d+)\s*months?/i);
    const yrMatch = termStr.match(/(\d+)\s*(?:yr|year)/i);
    if (moMatch) termMonths = parseInt(moMatch[1]);
    else if (yrMatch) termMonths = parseInt(yrMatch[1]) * 12;

    if (rent > 0 && la > 0 && annualRate > 0) {
      const mr = annualRate / 12;
      const monthlyPI = la * mr / (1 - Math.pow(1 + mr, -termMonths));
      const totalMonthly = monthlyPI + mTaxes + mInsurance + mHOA;
      if (totalMonthly > 0) {
        dscr = (rent / totalMonthly).toFixed(2);
      }
    }
  }
  const entityName = fv(resolveField(allData, 'customerCompanyName', 'entityName', 'borrowingEntity', 'companyName'));
  const borrowerName = fv(resolveField(allData, 'customerName', 'borrowerName'));
  const address = fv(data.propertyAddress || resolveField(allData, 'propertyAddress', 'property_address'));
  const quoteDate = data.quoteDate || '';
  const quoteNumber = data.quoteNumber || '';
  const originationFee = data.pointsCharged != null ? `${data.pointsCharged.toFixed(2)}` : '';

  const ltvVal = resolveField(allData, 'ltv', 'ltvRatio', 'ltv_ratio', 'requestedLTV');
  let ltv = fv(ltvVal);
  if (!ltv && safeNumber(loanAmount) > 0 && safeNumber(propertyValue) > 0) {
    ltv = ((safeNumber(loanAmount) / safeNumber(propertyValue)) * 100).toFixed(1) + '%';
  }

  // ==================== PAGE 1 ====================
  const page1 = pdfDoc.addPage([PAGE_W, PAGE_H]);
  let y = drawPageHeader(page1, fonts);

  page1.drawText('Date:', { x: MARGIN, y, size: 9, font: fonts.bold, color: DARK_GRAY });
  if (quoteDate) {
    page1.drawText(sanitizeForPdf(quoteDate), { x: MARGIN + 32, y, size: 9, font: fonts.regular, color: BLACK });
  } else {
    drawBlankLine(page1, MARGIN + 32, y, 120);
  }
  y -= 20;

  page1.drawText('Re:', { x: MARGIN, y, size: 9, font: fonts.bold, color: DARK_GRAY });
  page1.drawText('Loan #', { x: MARGIN + 40, y, size: 9, font: fonts.regular, color: DARK_GRAY });
  if (quoteNumber) {
    page1.drawText(sanitizeForPdf(quoteNumber), { x: MARGIN + 80, y, size: 9, font: fonts.regular, color: BLACK });
  } else {
    drawBlankLine(page1, MARGIN + 80, y, 100);
  }
  y -= 14;
  page1.drawText(sanitizeForPdf('Property Addresses – See Exhibit A'), { x: MARGIN + 40, y, size: 9, font: fonts.regular, color: DARK_GRAY });
  y -= 20;

  page1.drawText('Dear', { x: MARGIN, y, size: 9, font: fonts.regular, color: DARK_GRAY });
  if (borrowerName) {
    page1.drawText(sanitizeForPdf(borrowerName) + ',', { x: MARGIN + 28, y, size: 9, font: fonts.regular, color: BLACK });
  } else {
    drawBlankLine(page1, MARGIN + 28, y, 150);
  }
  y -= 18;

  y = drawWrappedText(page1, d.introText, MARGIN, y, fonts.regular, 8, CONTENT_W, 11, DARK_GRAY);
  y -= 14;

  const sectionTitleSize = 10;
  const sectionTitle = 'Preliminary Transaction Details';
  const titleW = fonts.bold.widthOfTextAtSize(sectionTitle, sectionTitleSize);
  page1.drawText(sectionTitle, {
    x: MARGIN + (CONTENT_W - titleW) / 2,
    y,
    size: sectionTitleSize,
    font: fonts.bold,
    color: BLACK,
  });
  y -= 8;

  y = drawTableRow(page1, y, 'Loan Amount', loanAmount ? formatCurrency(loanAmount) : '', 'Sponsor FICO', ficoScore, fonts);
  y = drawTableRow(page1, y, 'Interest Rate*', interestRate, 'Estimated Property Value', propertyValue ? formatCurrency(propertyValue) : '', fonts);
  y = drawTableRow(page1, y, 'Loan Program', d.loanProgram, 'Loan-to-Value Ratio (LTV)', ltv, fonts);
  y = drawTableRow(page1, y, 'Property Type', propertyType, 'Prepayment Penalty', prepaymentPenalty, fonts);
  y = drawTableRow(page1, y, 'Loan Term', d.loanTerm, 'Estimated DSCR', dscr, fonts);
  y = drawTableRow(page1, y, 'Loan Purpose', loanPurpose, 'Escrow Account', d.escrowAccount, fonts);
  y = drawTableRow(page1, y, 'Loan Type', d.loanType, 'Amortization Term', d.amortizationTerm, fonts);
  y = drawTableRow(page1, y, 'Borrowing Entity', entityName, 'Rate Lock Preference', 'Signed LOI', fonts);
  y = drawTableRow(page1, y, 'Personal Guaranty', borrowerName ? `Full from ${borrowerName}` : '', '', '', fonts);

  y -= 6;
  y = drawWrappedText(page1, d.rateLockNote, MARGIN, y, fonts.italic, 6.5, CONTENT_W, 9, GRAY);
  y -= 14;

  const feesTitle = 'Estimated Fees & Other Details*';
  const feesTitleW = fonts.bold.widthOfTextAtSize(feesTitle, sectionTitleSize);
  page1.drawText(feesTitle, {
    x: MARGIN + (CONTENT_W - feesTitleW) / 2,
    y,
    size: sectionTitleSize,
    font: fonts.bold,
    color: BLACK,
  });
  y -= 8;

  const feeRows: Array<[string, string]> = [
    ['Rate Buydown:', d.rateBuydown],
    ['Origination Fee:', originationFee ? `${originationFee} % of the Loan Amount` : '__ % of the Loan Amount'],
    ['Underwriting Fee:', d.underwritingFee],
    ['Legal/Doc Fee:', d.legalDocFee],
  ];

  for (const [label, value] of feeRows) {
    const rowH = 16;
    page1.drawRectangle({
      x: MARGIN,
      y: y - rowH,
      width: CONTENT_W,
      height: rowH,
      color: TABLE_BG,
      borderColor: LIGHT_GRAY,
      borderWidth: 0.5,
    });
    page1.drawText(label, {
      x: MARGIN + 4,
      y: y - rowH + 4,
      size: 8,
      font: fonts.bold,
      color: DARK_GRAY,
    });
    page1.drawText(sanitizeForPdf(value), {
      x: MARGIN + 120,
      y: y - rowH + 4,
      size: 8,
      font: fonts.regular,
      color: BLACK,
    });
    y -= rowH;
  }

  const appraisalLines = wrapText(sanitizeForPdf(d.appraisalNote), fonts.italic, 6.5, CONTENT_W - 124);
  const appraisalH = Math.max(28, appraisalLines.length * 8 + 8);
  page1.drawRectangle({
    x: MARGIN,
    y: y - appraisalH,
    width: CONTENT_W,
    height: appraisalH,
    color: TABLE_BG,
    borderColor: LIGHT_GRAY,
    borderWidth: 0.5,
  });
  page1.drawText('Appraisals:', {
    x: MARGIN + 4,
    y: y - 10,
    size: 8,
    font: fonts.bold,
    color: DARK_GRAY,
  });
  let apY = y - 8;
  for (const line of appraisalLines) {
    page1.drawText(line, { x: MARGIN + 120, y: apY, size: 6.5, font: fonts.italic, color: GRAY });
    apY -= 8;
  }
  y -= appraisalH;

  y -= 6;
  y = drawWrappedText(page1, d.feesFootnote, MARGIN, y, fonts.italic, 6.5, CONTENT_W, 9, GRAY);
  y -= 10;

  y = drawWrappedText(page1, d.vendorText, MARGIN, y, fonts.regular, 8, CONTENT_W, 11, DARK_GRAY);
  y -= 10;

  y = drawWrappedText(page1, d.closingText, MARGIN, y, fonts.regular, 8, CONTENT_W, 11, DARK_GRAY);

  // ==================== PAGE 2 ====================
  const page2 = pdfDoc.addPage([PAGE_W, PAGE_H]);
  y = drawPageHeader(page2, fonts);

  page2.drawText('Date:', { x: MARGIN, y, size: 9, font: fonts.bold, color: DARK_GRAY });
  if (quoteDate) {
    page2.drawText(sanitizeForPdf(quoteDate), { x: MARGIN + 32, y, size: 9, font: fonts.regular, color: BLACK });
  } else {
    drawBlankLine(page2, MARGIN + 32, y, 120);
  }
  y -= 22;

  page2.drawText('Re:', { x: MARGIN, y, size: 9, font: fonts.bold, color: DARK_GRAY });
  page2.drawText('Loan #:', { x: MARGIN + 40, y, size: 9, font: fonts.regular, color: DARK_GRAY });
  if (quoteNumber) {
    page2.drawText(sanitizeForPdf(quoteNumber), { x: MARGIN + 82, y, size: 9, font: fonts.regular, color: BLACK });
  } else {
    drawBlankLine(page2, MARGIN + 82, y, 100);
  }
  y -= 14;
  page2.drawText(sanitizeForPdf('Property Addresses – See Exhibit A'), { x: MARGIN + 40, y, size: 9, font: fonts.regular, color: DARK_GRAY });
  y -= 22;

  page2.drawText('Disclaimer', {
    x: MARGIN,
    y,
    size: 11,
    font: fonts.bold,
    color: BLACK,
  });
  y -= 14;

  y = drawWrappedText(page2, d.disclaimerText, MARGIN, y, fonts.regular, 8, CONTENT_W, 11, DARK_GRAY);
  y -= 10;

  y = drawWrappedText(page2, d.disclaimerText2, MARGIN, y, fonts.regular, 8, CONTENT_W, 11, DARK_GRAY);
  y -= 30;

  const acceptTitle = 'Borrower Acceptance';
  const acceptTitleW = fonts.bold.widthOfTextAtSize(acceptTitle, 12);
  page2.drawText(acceptTitle, {
    x: MARGIN + (CONTENT_W - acceptTitleW) / 2,
    y,
    size: 12,
    font: fonts.bold,
    color: BLACK,
  });
  y -= 25;

  page2.drawText('Name:', { x: MARGIN, y, size: 9, font: fonts.bold, color: DARK_GRAY });
  if (borrowerName) {
    page2.drawText(sanitizeForPdf(borrowerName), { x: MARGIN + 50, y, size: 9, font: fonts.regular, color: BLACK });
  }
  drawBlankLine(page2, MARGIN + 50, y, 200);
  y -= 30;

  const sigFieldY_pdflib = y;
  page2.drawText('Signature:', { x: MARGIN, y, size: 9, font: fonts.bold, color: DARK_GRAY });
  drawBlankLine(page2, MARGIN + 60, y, 200);
  y -= 30;

  const dateFieldY_pdflib = y;
  page2.drawText('Date:', { x: MARGIN, y, size: 9, font: fonts.bold, color: DARK_GRAY });
  drawBlankLine(page2, MARGIN + 35, y, 120);

  const sigFieldHeight = 25;
  const dateFieldHeight = 20;
  const computedSigningFields: LoiSigningField[] = [
    { fieldType: 'signature', pageNumber: 2, x: MARGIN + 60, y: PAGE_H - sigFieldY_pdflib - sigFieldHeight, width: 200, height: sigFieldHeight },
    { fieldType: 'date', pageNumber: 2, x: MARGIN + 35, y: PAGE_H - dateFieldY_pdflib - dateFieldHeight, width: 120, height: dateFieldHeight },
  ];
  _lastSigningFields = computedSigningFields;

  // ==================== PAGE 3 ====================
  const page3 = pdfDoc.addPage([PAGE_W, PAGE_H]);
  y = drawPageHeader(page3, fonts);

  const exhibitTitle = sanitizeForPdf('Exhibit A – Property Address');
  const exhibitTitleW = fonts.bold.widthOfTextAtSize(exhibitTitle, 12);
  page3.drawText(exhibitTitle, {
    x: MARGIN + (CONTENT_W - exhibitTitleW) / 2,
    y,
    size: 12,
    font: fonts.bold,
    color: BLACK,
  });
  y -= 26;

  page3.drawText('Addresses:', { x: MARGIN, y, size: 9, font: fonts.bold, color: DARK_GRAY });
  y -= 16;

  if (address) {
    y = drawWrappedText(page3, address, MARGIN + 10, y, fonts.regular, 9, CONTENT_W - 20, 14, BLACK);
  } else {
    for (let i = 0; i < 5; i++) {
      drawBlankLine(page3, MARGIN + 10, y, CONTENT_W - 20);
      y -= 22;
    }
  }

  return { pdfBytes: await pdfDoc.save(), signingFields: computedSigningFields };
}

export interface LoiSigningField {
  fieldType: string;
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

let _lastSigningFields: LoiSigningField[] = [];

export function getLastLoiSigningFields(): LoiSigningField[] {
  return [..._lastSigningFields];
}

export async function generateLoiPdfWithFields(data: QuotePdfData, loiDefaults?: LoiDefaults): Promise<{ pdfBytes: Uint8Array; signingFields: LoiSigningField[] }> {
  const result = await generateLoiPdf(data, loiDefaults);
  return { pdfBytes: new Uint8Array(result.pdfBytes), signingFields: result.signingFields };
}
