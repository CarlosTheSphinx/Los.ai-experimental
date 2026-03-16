import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from 'pdf-lib';
import type { QuotePdfTemplateConfig, QuotePdfSection } from '@shared/schema';

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

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.substring(0, 2), 16) / 255,
    g: parseInt(clean.substring(2, 4), 16) / 255,
    b: parseInt(clean.substring(4, 6), 16) / 255,
  };
}

function formatCurrency(value: any): string {
  const num = safeNumber(value);
  if (num === 0 && (value === undefined || value === null || value === '')) return '—';
  return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatValue(value: any): string {
  if (value === undefined || value === null || value === '') return '—';
  return String(value);
}

export const DEFAULT_TEMPLATE_CONFIG: QuotePdfTemplateConfig = {
  companyName: 'LENDRY AI',
  tagline: 'Lending Intelligence',
  logoUrl: '',
  primaryColor: '#0F1729',
  accentColor: '#C9A84C',
  headerText: 'Loan Quote',
  footerDisclaimer: 'This rate is an estimate based on the information provided. Final approval is subject to full underwriting and verification of all documents. Rates are subject to change without notice.',
  sections: [
    {
      key: 'loan_summary',
      label: 'Loan Summary',
      enabled: true,
      fields: [
        { key: 'loanAmount', label: 'Loan Amount', aliases: ['requestedLoanAmount', 'loan_amount'] },
        { key: 'propertyValue', label: 'Property Value', aliases: ['estValuePurchasePrice', 'estimatedValue', 'purchasePrice', 'property_value'] },
        { key: 'ltv', label: 'LTV', aliases: ['ltvRatio', 'ltv_ratio', 'requestedLTV'] },
        { key: 'ficoScore', label: 'FICO Score', aliases: ['statedFicoScore', 'creditScore', 'fico_score', 'fico'] },
        { key: 'loanType', label: 'Program', aliases: ['programName', 'program', 'loan_type'] },
        { key: 'propertyType', label: 'Property Type', aliases: ['property_type'] },
      ],
    },
    {
      key: 'borrower_info',
      label: 'Borrower Information',
      enabled: true,
      fields: [
        { key: 'customerName', label: 'Borrower Name' },
        { key: 'propertyAddress', label: 'Property Address' },
        { key: 'customerCompanyName', label: 'Entity Name', aliases: ['entityName', 'companyName'] },
      ],
    },
    {
      key: 'pricing',
      label: 'Rate & Pricing',
      enabled: true,
      fields: [
        { key: 'interestRate', label: 'Interest Rate' },
        { key: 'pointsCharged', label: 'Total Points' },
        { key: 'pointsAmount', label: 'Points Amount' },
      ],
    },
  ],
  showYsp: false,
  showPoints: true,
  showCommission: false,
};

export interface QuotePdfData {
  quoteNumber?: string;
  quoteDate?: string;
  customerFirstName?: string;
  customerLastName?: string;
  customerCompanyName?: string;
  propertyAddress?: string;
  interestRate?: string;
  pointsCharged?: number;
  pointsAmount?: number;
  yspAmount?: number;
  yspDollarAmount?: number;
  commission?: number;
  loanData?: Record<string, any>;
}

export async function generateQuotePdf(
  data: QuotePdfData,
  templateConfig?: QuotePdfTemplateConfig | null
): Promise<Uint8Array> {
  const config = templateConfig || DEFAULT_TEMPLATE_CONFIG;
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([612, 792]);

  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const primary = hexToRgb(config.primaryColor);
  const accent = hexToRgb(config.accentColor);
  const primaryRgb = rgb(primary.r, primary.g, primary.b);
  const accentRgb = rgb(accent.r, accent.g, accent.b);
  const grayRgb = rgb(0.45, 0.45, 0.45);
  const darkRgb = rgb(0.12, 0.12, 0.12);
  const lightBgRgb = rgb(0.96, 0.96, 0.96);
  const borderRgb = rgb(0.85, 0.85, 0.85);

  const pageWidth = 612;
  const margin = 50;
  const contentWidth = pageWidth - margin * 2;

  let y = 742;

  page.drawRectangle({
    x: 0,
    y: 742,
    width: pageWidth,
    height: 50,
    color: primaryRgb,
  });

  page.drawText(config.companyName, {
    x: margin,
    y: 758,
    size: 18,
    font: helveticaBold,
    color: rgb(1, 1, 1),
  });

  if (config.tagline) {
    const companyWidth = helveticaBold.widthOfTextAtSize(config.companyName, 18);
    page.drawText(config.tagline, {
      x: margin + companyWidth + 12,
      y: 760,
      size: 9,
      font: helvetica,
      color: accentRgb,
    });
  }

  if (data.quoteNumber || data.quoteDate) {
    const dateText = data.quoteDate || new Date().toLocaleDateString('en-US');
    const quoteText = data.quoteNumber ? `Quote #${data.quoteNumber}` : '';
    const rightText = [quoteText, dateText].filter(Boolean).join('  |  ');
    const rightWidth = helvetica.widthOfTextAtSize(rightText, 9);
    page.drawText(rightText, {
      x: pageWidth - margin - rightWidth,
      y: 760,
      size: 9,
      font: helvetica,
      color: rgb(0.8, 0.8, 0.8),
    });
  }

  y = 720;

  page.drawLine({
    start: { x: margin, y },
    end: { x: pageWidth - margin, y },
    thickness: 2,
    color: accentRgb,
  });

  y -= 10;

  const headerTextWidth = helveticaBold.widthOfTextAtSize(config.headerText, 22);
  page.drawText(config.headerText, {
    x: margin + (contentWidth - headerTextWidth) / 2,
    y: y - 10,
    size: 22,
    font: helveticaBold,
    color: primaryRgb,
  });
  y -= 35;

  const allData: Record<string, any> = {
    ...data.loanData,
    customerName: [data.customerFirstName, data.customerLastName].filter(Boolean).join(' ') || undefined,
    customerCompanyName: data.customerCompanyName || data.loanData?.entityName,
    propertyAddress: data.propertyAddress || data.loanData?.propertyAddress,
    interestRate: data.interestRate,
    pointsCharged: data.pointsCharged,
    pointsAmount: data.pointsAmount != null ? formatCurrency(data.pointsAmount) : undefined,
  };

  const loanAmount = safeNumber(resolveField(allData, 'loanAmount', 'requestedLoanAmount', 'loan_amount'));
  const propertyValue = safeNumber(resolveField(allData, 'propertyValue', 'estValuePurchasePrice', 'estimatedValue', 'purchasePrice'));
  if (loanAmount && !allData.ltv && propertyValue > 0) {
    allData.ltv = ((loanAmount / propertyValue) * 100).toFixed(1) + '%';
  }

  const enabledSections = config.sections.filter(s => s.enabled);

  for (const section of enabledSections) {
    if (section.key === 'pricing' && !config.showPoints) continue;

    if (y < 120) {
      page = pdfDoc.addPage([612, 792]);
      y = 742;
    }

    page.drawRectangle({
      x: margin,
      y: y - 18,
      width: contentWidth,
      height: 22,
      color: lightBgRgb,
    });

    const sectionLabelWidth = helveticaBold.widthOfTextAtSize(section.label, 11);
    page.drawText(section.label, {
      x: margin + (contentWidth - sectionLabelWidth) / 2,
      y: y - 14,
      size: 11,
      font: helveticaBold,
      color: primaryRgb,
    });

    y -= 28;

    page.drawLine({
      start: { x: margin, y },
      end: { x: pageWidth - margin, y },
      thickness: 0.5,
      color: borderRgb,
    });

    y -= 6;

    const colWidth = contentWidth / 2;
    let fieldIdx = 0;

    for (const field of section.fields) {
      const aliases = [field.key, ...(field.aliases || [])];
      let rawValue = resolveField(allData, ...aliases);

      let displayValue: string;
      const isCurrency = ['loanAmount', 'propertyValue', 'pointsAmount', 'purchasePrice', 'estimatedValue'].some(
        k => normalizeKey(k) === normalizeKey(field.key)
      );
      if (isCurrency && rawValue !== undefined) {
        displayValue = formatCurrency(rawValue);
      } else {
        displayValue = formatValue(rawValue);
      }

      const col = fieldIdx % 2;
      const xPos = margin + 8 + col * colWidth;

      if (col === 0 && fieldIdx > 0) {
        y -= 22;
      }

      if (y < 80) break;

      page.drawText(field.label, {
        x: xPos,
        y: y - 6,
        size: 8,
        font: helvetica,
        color: grayRgb,
      });

      page.drawText(displayValue, {
        x: xPos,
        y: y - 18,
        size: 10,
        font: helveticaBold,
        color: darkRgb,
      });

      fieldIdx++;
    }

    if (fieldIdx % 2 !== 0) {
      y -= 22;
    }
    y -= 15;
  }

  if (data.interestRate) {
    y -= 5;

    page.drawRectangle({
      x: margin,
      y: y - 50,
      width: contentWidth,
      height: 55,
      color: primaryRgb,
      borderColor: accentRgb,
      borderWidth: 1,
    });

    const rateLabel = 'Qualified Rate';
    page.drawText(rateLabel, {
      x: margin + 15,
      y: y - 18,
      size: 10,
      font: helvetica,
      color: accentRgb,
    });

    const rateStr = String(data.interestRate);
    page.drawText(rateStr, {
      x: margin + 15,
      y: y - 40,
      size: 24,
      font: helveticaBold,
      color: rgb(1, 1, 1),
    });

    if (data.pointsCharged != null && config.showPoints) {
      const ptsText = `${data.pointsCharged.toFixed(2)} pts`;
      const ptsLabelX = margin + contentWidth / 2;
      page.drawText('Points', {
        x: ptsLabelX,
        y: y - 18,
        size: 10,
        font: helvetica,
        color: accentRgb,
      });
      page.drawText(ptsText, {
        x: ptsLabelX,
        y: y - 40,
        size: 24,
        font: helveticaBold,
        color: rgb(1, 1, 1),
      });
    }

    y -= 65;
  }

  if (config.showYsp && data.yspAmount) {
    y -= 5;
    page.drawText('YSP', {
      x: margin + 8,
      y: y - 6,
      size: 8,
      font: helvetica,
      color: grayRgb,
    });
    page.drawText(`${data.yspAmount.toFixed(3)}% (${formatCurrency(data.yspDollarAmount)})`, {
      x: margin + 8,
      y: y - 18,
      size: 10,
      font: helveticaBold,
      color: darkRgb,
    });
    y -= 28;
  }

  if (config.showCommission && data.commission) {
    page.drawText('Broker Commission', {
      x: margin + 8 + contentWidth / 2,
      y: y + 22,
      size: 8,
      font: helvetica,
      color: grayRgb,
    });
    page.drawText(formatCurrency(data.commission), {
      x: margin + 8 + contentWidth / 2,
      y: y + 10,
      size: 10,
      font: helveticaBold,
      color: darkRgb,
    });
  }

  if (config.footerDisclaimer) {
    const disclaimerY = 45;
    page.drawLine({
      start: { x: margin, y: disclaimerY + 10 },
      end: { x: pageWidth - margin, y: disclaimerY + 10 },
      thickness: 0.5,
      color: borderRgb,
    });

    const maxWidth = contentWidth;
    const words = config.footerDisclaimer.split(' ');
    let lines: string[] = [];
    let currentLine = '';
    for (const word of words) {
      const test = currentLine ? `${currentLine} ${word}` : word;
      if (helvetica.widthOfTextAtSize(test, 7) > maxWidth) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = test;
      }
    }
    if (currentLine) lines.push(currentLine);

    let lineY = disclaimerY;
    for (let i = lines.length - 1; i >= 0; i--) {
      page.drawText(lines[i], {
        x: margin,
        y: lineY,
        size: 7,
        font: helvetica,
        color: grayRgb,
      });
      lineY += 10;
    }
  }

  return pdfDoc.save();
}
