export function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount)) return '₱0';
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatNumberInput(value: string): string {
  const cleaned = value.replace(/,/g, '').replace(/[^\d.]/g, '');
  const decimalIndex = cleaned.indexOf('.');
  const integer = decimalIndex === -1 ? cleaned : cleaned.slice(0, decimalIndex);
  const decimals = decimalIndex === -1 ? '' : cleaned.slice(decimalIndex + 1).replace(/\./g, '');
  const groupedInteger = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  return decimalIndex === -1 ? groupedInteger : `${groupedInteger}.${decimals}`;
}

export function parseNumberInput(value: string): number {
  const parsed = Number(value.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '—';
  try {
    return new Date(dateString).toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateString;
  }
}

export function formatDateTime(dateString: string | null | undefined): string {
  if (!dateString) return '—';
  try {
    return new Date(dateString).toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateString;
  }
}

export function capitalize(str: string): string {
  if (!str) return '';
  return str.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function removeUnderscore(val: string | null | undefined): string {
  if (!val) return '';
  return val.replace(/_/g, ' ').trim();
}

export function cleanMilestoneTitle(name: string | null | undefined): string {
  if (!name) return '';
  return name
    .replace(/^(Payment|Stage|Milestone)\s*\d+\s*:\s*/i, '')
    .replace(/\s*\(\s*\d+%\s*(of\s*contract)?\s*\)/i, '')
    .trim();
}
