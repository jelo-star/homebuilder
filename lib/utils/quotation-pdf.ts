import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Project, Quote } from '@/types/database';
import { formatDate } from '@/lib/utils/formatters';

type QuotationRow = {
  category: string;
  description: string;
  specifications: string;
  quantity: string | number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
};

type DetailedProposal = {
  materials?: Array<{ name: string; quantity: string | number; unit: string; unitPrice: string | number }>;
  labor?: Array<{ position: string; workers: string | number; dailyRate: string | number; days: string | number }>;
  equipment?: Array<{ name: string; quantity: string | number; rate: string | number; duration: string | number; fuel?: string | number; maintenance?: string | number }>;
  overhead?: Array<{ name: string; description: string; amount: string | number }>;
  items?: Array<{
    item_name: string;
    brand_spec?: string;
    division?: string;
    quantity: string | number;
    unit: string;
    unit_price: number;
    delivery_cost?: number;
    line_total?: number;
  }>;
  labor_cost?: number;
  equipment_cost?: number;
  logistics_cost?: number;
  taxes_cost?: number;
  exclusions?: string;
  assumptions?: string;
  payment_terms?: string;
  profit?: { amount?: number };
  contingency?: { amount?: number };
  taxes?: { amount?: number };
};

export interface QuotationPdfInput {
  project: Project;
  quote: Quote;
  contractorName: string;
}

const numberValue = (value: string | number | null | undefined) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const currency = (value: number) => `PHP ${value.toLocaleString('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

const safeText = (value: string | number | null | undefined) =>
  String(value ?? '').replace(/[^\x20-\x7E]/g, ' ');

const getRows = (quote: Quote): QuotationRow[] => {
  const proposal = (quote.material_quotation as (DetailedProposal & {
    materials_subtotal?: number;
  }) | null) ?? {};

  if (proposal.materials || proposal.labor || proposal.equipment || proposal.overhead) {
    return [
      ...(proposal.materials || []).map(item => ({
        category: 'Material',
        description: item.name,
        specifications: item.unit,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: numberValue(item.unitPrice),
        lineTotal: numberValue(item.quantity) * numberValue(item.unitPrice),
      })),
      ...(proposal.labor || []).map(item => ({
        category: 'Labor',
        description: item.position,
        specifications: `${item.workers} worker(s) x ${item.days} day(s)`,
        quantity: item.workers,
        unit: 'worker(s)',
        unitPrice: numberValue(item.dailyRate),
        lineTotal: numberValue(item.workers) * numberValue(item.dailyRate) * numberValue(item.days),
      })),
      ...(proposal.equipment || []).map(item => ({
        category: 'Machinery',
        description: item.name,
        specifications: `${item.duration} period(s)`,
        quantity: item.quantity,
        unit: 'unit(s)',
        unitPrice: numberValue(item.rate),
        lineTotal: numberValue(item.quantity) * numberValue(item.rate) * numberValue(item.duration)
          + numberValue(item.fuel) + numberValue(item.maintenance),
      })),
      ...(proposal.overhead || []).map(item => ({
        category: 'Overhead',
        description: item.name,
        specifications: item.description,
        quantity: 1,
        unit: '',
        unitPrice: numberValue(item.amount),
        lineTotal: numberValue(item.amount),
      })),
      ...(['profit', 'contingency', 'taxes'] as const).flatMap(key => {
        const amount = numberValue(proposal[key]?.amount);
        if (amount <= 0) return [];
        return [{
          category: 'Additional cost',
          description: key === 'profit' ? "Contractor's profit" : key === 'contingency' ? 'Contingency allowance' : 'Taxes and charges',
          specifications: 'Included in proposal total',
          quantity: 1,
          unit: '',
          unitPrice: amount,
          lineTotal: amount,
        }];
      }),
    ];
  }

  if (proposal.items?.length) {
    return [
      ...proposal.items.map(item => ({
        category: 'Material',
        description: item.item_name,
        specifications: item.brand_spec || item.division || '',
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: numberValue(item.unit_price),
        lineTotal: item.line_total ?? numberValue(item.quantity) * numberValue(item.unit_price) + numberValue(item.delivery_cost),
      })),
      ...([
        ['Labor', 'Skilled Labor & Construction Crew', 'Contractor labor and construction crew', proposal.labor_cost],
        ['Machinery', 'Construction Equipment & Scaffolding', 'Construction equipment and site tools', proposal.equipment_cost],
        ['Logistics', 'Hauling & Site Logistics', 'Material delivery and site logistics', proposal.logistics_cost],
        ['Taxes', 'Taxes and Charges', 'Applicable taxes and charges', proposal.taxes_cost],
      ] as const).flatMap(([category, description, specifications, amount]) => {
        const total = numberValue(amount);
        return total > 0 ? [{
          category,
          description,
          specifications,
          quantity: 1,
          unit: '',
          unitPrice: total,
          lineTotal: total,
        }] : [];
      }),
    ];
  }

  if (quote.breakdown?.length) {
    return quote.breakdown.map(item => ({
      category: 'Cost item',
      description: item.item,
      specifications: item.description || '',
      quantity: 1,
      unit: '',
      unitPrice: numberValue(item.amount),
      lineTotal: numberValue(item.amount),
    }));
  }

  return [];
};

export function createQuotationPdf({ project, quote, contractorName }: QuotationPdfInput): Blob {
  const pdf = new jsPDF({ orientation: 'landscape', format: 'a4', unit: 'mm' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  const rows = getRows(quote);
  let y = 18;

  pdf.setProperties({
    title: 'Contractor Quotation',
    subject: `Quotation for ${project.title}`,
    author: contractorName,
  });

  pdf.setFillColor(19, 111, 72);
  pdf.rect(margin, y, 3, 21, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  pdf.setTextColor(15, 23, 42);
  pdf.text('CONTRACTOR QUOTATION', margin + 7, y + 7);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(71, 85, 105);
  pdf.text('Quotation & Itemized Cost Schedule', margin + 7, y + 13);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(71, 85, 105);
  pdf.text(`Date: ${safeText(formatDate(quote.submitted_at || quote.created_at))}`, pageWidth - margin, y + 12, { align: 'right' });
  y += 30;

  pdf.setDrawColor(203, 213, 225);
  pdf.line(margin, y, pageWidth - margin, y);
  y += 7;

  const metadata = [
    ['PROJECT', project.title || 'Construction project'],
    ['CONTRACTOR', contractorName || 'Contractor'],
    ['LOCATION', [project.city, project.province].filter(Boolean).join(', ') || 'Not specified'],
    ['DURATION', quote.duration_months ? `${quote.duration_months} months` : 'Not specified'],
  ];
  const halfWidth = contentWidth / 2;
  metadata.forEach(([label, value], index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = margin + column * halfWidth;
    const top = y + row * 14;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.setTextColor(100, 116, 139);
    pdf.text(label, x, top);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(30, 41, 59);
    const lines = pdf.splitTextToSize(safeText(value), halfWidth - 8);
    pdf.text(lines.slice(0, 2), x, top + 5);
  });
  y += 34;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.setTextColor(15, 23, 42);
  pdf.text('ITEMIZED QUOTATION', margin, y);
  y += 3;

  autoTable(pdf, {
    startY: y,
    margin: { left: margin, right: margin, bottom: 17 },
    head: [['Category', 'Description', 'Specifications / Scope', 'Qty', 'Unit', 'Unit Price', 'Line Total']],
    body: rows.map(row => [
      safeText(row.category),
      safeText(row.description),
      safeText(row.specifications || '-'),
      safeText(row.quantity),
      safeText(row.unit),
      currency(row.unitPrice),
      currency(row.lineTotal),
    ]),
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 7,
      cellPadding: 1.2,
      overflow: 'linebreak',
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.15,
    },
    headStyles: {
      fillColor: [19, 111, 72],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7,
    },
    columnStyles: {
      3: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right', fontStyle: 'bold' },
    },
  });

  const tableEndY = (pdf as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 12;
  let summaryY = tableEndY + 10;
  if (summaryY + 18 > pageHeight - margin) {
    pdf.addPage();
    summaryY = margin + 5;
  }
  pdf.setDrawColor(15, 23, 42);
  pdf.setLineWidth(0.5);
  pdf.line(margin, summaryY, pageWidth - margin, summaryY);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.setTextColor(15, 23, 42);
  pdf.text('TOTAL QUOTED AMOUNT', margin, summaryY + 8);
  pdf.setFontSize(14);
  pdf.setTextColor(19, 111, 72);
  pdf.text(currency(numberValue(quote.price)), pageWidth - margin, summaryY + 8, { align: 'right' });
  summaryY += 17;

  const proposal = quote.material_quotation as DetailedProposal | null;
  const terms = [
    ['Scope of work', quote.scope_of_work],
    ['Inclusions', quote.inclusions],
    ['Exclusions', quote.exclusions || proposal?.exclusions],
    ['Assumptions', quote.assumptions || proposal?.assumptions],
    ['Payment terms', quote.payment_terms || proposal?.payment_terms],
    ['Warranty', quote.warranty_terms],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]?.trim()));

  if (terms.length) {
    if (summaryY + 16 > pageHeight - margin) {
      pdf.addPage();
      summaryY = margin + 5;
    }
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(15, 23, 42);
    pdf.text('TERMS AND DETAILS', margin, summaryY + 3);
    summaryY += 9;
    for (const [label, value] of terms) {
      const descriptionLines = pdf.splitTextToSize(safeText(value), contentWidth - 35);
      const lineCount = Math.max(1, descriptionLines.length);
      const blockHeight = lineCount * 4 + 3;
      if (summaryY + blockHeight > pageHeight - margin - 10) {
        pdf.addPage();
        summaryY = margin + 5;
      }
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.setTextColor(71, 85, 105);
      pdf.text(`${label}:`, margin, summaryY + 3);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(30, 41, 59);
      pdf.text(descriptionLines, margin + 35, summaryY + 3);
      summaryY += blockHeight;
    }
  }

  const pageCount = pdf.getNumberOfPages();
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    pdf.setPage(pageNumber);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(100, 116, 139);
    pdf.text(`Page ${pageNumber} of ${pageCount}`, pageWidth - margin, pageHeight - 8, { align: 'right' });
  }

  return pdf.output('blob');
}
