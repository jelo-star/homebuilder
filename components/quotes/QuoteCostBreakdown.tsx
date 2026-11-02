'use client';

import React from 'react';
import type { Quote } from '@/types/database';
import { formatCurrency } from '@/lib/utils/formatters';

interface QuoteCostBreakdownProps {
  quote: Quote;
  title?: string;
  compact?: boolean;
}

type DetailItem = {
  name?: string;
  quantity?: string | number;
  unit?: string;
  unitPrice?: string | number;
  position?: string;
  workers?: string | number;
  dailyRate?: string | number;
  days?: string | number;
  rate?: string | number;
  duration?: string | number;
  fuel?: string | number;
  maintenance?: string | number;
  amount?: string | number;
  description?: string;
};

type DetailedProposal = {
  materials?: DetailItem[];
  labor?: DetailItem[];
  equipment?: DetailItem[];
  overhead?: DetailItem[];
  profit?: { amount?: number };
  contingency?: { amount?: number };
  taxes?: { amount?: number };
};

const money = (value: unknown) => formatCurrency(Number(value) || 0);

export default function QuoteCostBreakdown({ quote, title = 'Project Cost Breakdown', compact = false }: QuoteCostBreakdownProps) {
  const detailed = quote.material_quotation as DetailedProposal | null | undefined;
  const sections: [string, DetailItem[] | undefined, (item: DetailItem) => string][] = [
    ['Materials', detailed?.materials, item => `${item.name || 'Material'} — ${item.quantity || 0} ${item.unit || ''} × ${money(item.unitPrice)}`],
    ['Labor', detailed?.labor, item => `${item.position || 'Labor'} — ${item.workers || 0} workers × ${money(item.dailyRate)} × ${item.days || 0} days`],
    ['Machinery', detailed?.equipment, item => `${item.name || 'Machine'} — ${item.quantity || 0} × ${money(item.rate)} × ${item.duration || 0}`],
    ['Site management and overhead', detailed?.overhead, item => `${item.name || 'Expense'} — ${money(item.amount)}${item.description ? ` — ${item.description}` : ''}`],
  ];

  return (
    <article className={`overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm ${compact ? 'h-full' : ''}`}>
      <header className={`border-b-2 border-slate-800 bg-slate-50 ${compact ? 'px-4 py-3' : 'px-5 py-4'}`}>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Contractor proposal document</p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <h4 className={`${compact ? 'text-sm' : 'text-lg'} font-bold text-slate-900`}>{title}</h4>
          <p className={`${compact ? 'text-lg' : 'text-xl'} font-extrabold text-emerald-700`}>{money(quote.price)}</p>
        </div>
        <p className="mt-1 text-[10px] text-slate-500">Itemized cost schedule submitted for homeowner review</p>
      </header>
      <div className={compact ? 'p-3' : 'p-5'}>
        <table className="w-full border-collapse text-left text-xs">
          <thead><tr className="border-b border-slate-300 text-[9px] uppercase tracking-wide text-slate-500"><th className={compact ? 'pb-1.5' : 'pb-2'}>Cost category and details</th><th className={compact ? 'pb-1.5' : 'pb-2'}>Amount</th></tr></thead>
          <tbody>
            {sections.map(([label, items, describe]) => items?.length ? (
              <React.Fragment key={label}>
                <tr className="border-b border-slate-100 bg-slate-50"><th colSpan={2} className={`${compact ? 'px-1.5 py-1' : 'px-2 py-2'} font-bold text-slate-800`}>{label}</th></tr>
                {items.map((item, index) => <tr key={`${label}-${index}`} className="border-b border-slate-100"><td className={`${compact ? 'py-1 pr-2 text-[10px]' : 'py-2'} text-slate-700`}>{describe(item)}</td><td className={`${compact ? 'py-1 text-[10px]' : 'py-2'} text-right font-semibold text-slate-900`}>{label === 'Materials' ? money(Number(item.quantity) * Number(item.unitPrice)) : label === 'Labor' ? money(Number(item.workers) * Number(item.dailyRate) * Number(item.days)) : label === 'Machinery' ? money(Number(item.quantity) * Number(item.rate) * Number(item.duration) + Number(item.fuel || 0) + Number(item.maintenance || 0)) : money(item.amount)}</td></tr>)}
              </React.Fragment>
            ) : null)}
          </tbody>
        </table>
        <div className={`${compact ? 'mt-2 pt-2 text-[10px]' : 'mt-4 pt-3 text-xs'} grid gap-2 border-t border-slate-300 sm:grid-cols-3`}>
          <div>Profit <strong className="float-right">{money(detailed?.profit?.amount)}</strong></div>
          <div>Contingency <strong className="float-right">{money(detailed?.contingency?.amount)}</strong></div>
          <div>Taxes and charges <strong className="float-right">{money(detailed?.taxes?.amount)}</strong></div>
        </div>
        <div className={`${compact ? 'mt-2 pt-2 text-xs' : 'mt-4 pt-3 text-sm'} flex items-center justify-between border-t-2 border-slate-800 font-bold text-slate-900`}><span>Total proposed cost</span><span className={`${compact ? 'text-base' : 'text-lg'} text-emerald-700`}>{money(quote.price)}</span></div>
      </div>
    </article>
  );
}
