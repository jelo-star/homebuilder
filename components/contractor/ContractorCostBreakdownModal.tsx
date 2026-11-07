'use client';

import React from 'react';
import { AlertCircle, ArrowLeft, ClipboardList, HardHat, Plus, Send, Tractor, Users, Wrench, Trash2, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { Project, Quote } from '@/types/database';
import { formatCurrency, formatNumberInput, parseNumberInput } from '@/lib/utils/formatters';

type Material = { name: string; quantity: string; unit: string; unitPrice: string };
type Labor = { position: string; workers: string; dailyRate: string; days: string };
type Equipment = { name: string; quantity: string; rate: string; duration: string; fuel: string; maintenance: string };
type Expense = { name: string; description: string; amount: string };
type DetailedProposal = { materials?: Material[]; labor?: Labor[]; equipment?: Equipment[]; overhead?: Expense[]; profit?: { amount?: number }; contingency?: { amount?: number }; taxes?: { amount?: number } };
type ProposalTab = 'overview' | 'materials' | 'labor' | 'machinery' | 'costs';

const blankMaterial = (): Material => ({ name: '', quantity: '', unit: '', unitPrice: '' });
const blankLabor = (): Labor => ({ position: '', workers: '', dailyRate: '', days: '' });
const blankEquipment = (): Equipment => ({ name: '', quantity: '', rate: '', duration: '', fuel: '', maintenance: '' });
const blankExpense = (): Expense => ({ name: '', description: '', amount: '' });
const money = (value: string | number) => Math.round((typeof value === 'string' ? parseNumberInput(value) : Number(value) || 0) * 100) / 100;
const sum = (values: number[]) => money(values.reduce((total, value) => total + value, 0));

interface ContractorCostBreakdownModalProps {
  project: Project;
  existingQuote?: Quote | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (quote: Quote) => void;
  mode?: 'modal' | 'page';
}

export default function ContractorCostBreakdownModal({ project, existingQuote, isOpen, onClose, onSuccess, mode = 'modal' }: ContractorCostBreakdownModalProps) {
  const saved = existingQuote?.material_quotation as DetailedProposal | null | undefined;
  const [materials, setMaterials] = React.useState(() => (saved?.materials || [blankMaterial()]).map(item => ({ ...item, unitPrice: formatNumberInput(item.unitPrice) })));
  const [labor, setLabor] = React.useState(() => (saved?.labor || [blankLabor()]).map(item => ({ ...item, dailyRate: formatNumberInput(item.dailyRate) })));
  const [equipment, setEquipment] = React.useState(() => (saved?.equipment || [blankEquipment()]).map(item => ({
    name: item.name,
    quantity: item.quantity,
    duration: item.duration,
    rate: formatNumberInput(item.rate),
    fuel: formatNumberInput(item.fuel),
    maintenance: formatNumberInput(item.maintenance),
  })));
  const [overhead, setOverhead] = React.useState(() => (saved?.overhead || [blankExpense()]).map(item => ({ ...item, amount: formatNumberInput(item.amount) })));
  const [profit, setProfit] = React.useState(saved?.profit?.amount == null ? '' : formatNumberInput(String(saved.profit.amount)));
  const [contingency, setContingency] = React.useState(saved?.contingency?.amount == null ? '' : formatNumberInput(String(saved.contingency.amount)));
  const [taxes, setTaxes] = React.useState(saved?.taxes?.amount == null ? '' : formatNumberInput(String(saved.taxes.amount)));
  const [duration, setDuration] = React.useState(existingQuote?.duration_months ? String(existingQuote.duration_months) : '');
  const [proposedStartDate, setProposedStartDate] = React.useState(existingQuote?.proposed_start_date || '');
  const [declaration, setDeclaration] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<ProposalTab>('overview');

  const materialTotal = sum(materials.map(item => money(item.quantity) * money(item.unitPrice)));
  const laborTotal = sum(labor.map(item => money(item.workers) * money(item.dailyRate) * money(item.days)));
  const equipmentTotal = sum(equipment.map(item => money(item.quantity) * money(item.rate) * money(item.duration) + money(item.fuel) + money(item.maintenance)));
  const overheadTotal = sum(overhead.map(item => money(item.amount)));
  const totalAmount = sum([materialTotal, laborTotal, equipmentTotal, overheadTotal, money(profit), money(contingency), money(taxes)]);

  const update = <T,>(setter: React.Dispatch<React.SetStateAction<T[]>>, index: number, patch: Partial<T>) => setter(items => items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const add = <T,>(setter: React.Dispatch<React.SetStateAction<T[]>>, item: T) => setter(items => [...items, item]);
  const remove = <T,>(setter: React.Dispatch<React.SetStateAction<T[]>>, index: number) => setter(items => items.length === 1 ? items : items.filter((_, itemIndex) => itemIndex !== index));
  const validate = () => {
    const required = (value: string) => value.trim() !== '' && Number.isFinite(parseNumberInput(value)) && parseNumberInput(value) >= 0;
    const enteredMaterials = materials.filter(item => item.name || item.quantity || item.unit || item.unitPrice);
    const enteredLabor = labor.filter(item => item.position || item.workers || item.dailyRate || item.days);
    const enteredEquipment = equipment.filter(item => item.name || item.quantity || item.rate || item.duration || item.fuel || item.maintenance);
    const enteredOverhead = overhead.filter(item => item.name || item.description || item.amount);
    if (!required(duration) || !Number.isInteger(Number(duration)) || Number(duration) <= 0) {
      return 'Enter the estimated construction duration as a whole number of months.';
    }
    if (!enteredMaterials.every(item => item.name.trim() && required(item.quantity) && parseNumberInput(item.quantity) > 0 && required(item.unitPrice))) return 'Complete each material row you started, or clear it.';
    if (!enteredLabor.every(item => item.position.trim() && required(item.workers) && parseNumberInput(item.workers) > 0 && required(item.dailyRate) && required(item.days) && parseNumberInput(item.days) > 0)) return 'Complete each labor row you started, or clear it.';
    if (!enteredEquipment.every(item => item.name.trim() && required(item.quantity) && parseNumberInput(item.quantity) > 0 && required(item.rate) && required(item.duration) && parseNumberInput(item.duration) > 0)) return 'Complete each machinery row you started, or clear it.';
    if (!enteredOverhead.every(item => item.name.trim() && required(item.amount))) return 'Complete each other-cost row you started, or clear it.';
    if ([profit, contingency, taxes].some(value => value && !required(value))) return 'Enter valid amounts for profit, contingency, and taxes.';
    if (!declaration) return 'Accept the contractor declaration before submitting.';
    if (totalAmount <= 0) return 'The calculated proposal total must be greater than ₱0.';
    return '';
  };
  const submitProposal = async (event: React.FormEvent) => {
    event.preventDefault();
    if (existingQuote?.status === 'accepted') {
      setErrorMessage('Accepted proposals cannot be edited.');
      return;
    }
    const validationError = validate();
    if (validationError) {
      setErrorMessage(validationError);
      if (validationError.includes('material')) setActiveTab('materials');
      else if (validationError.includes('labor')) setActiveTab('labor');
      else if (validationError.includes('machine')) setActiveTab('machinery');
      else if (validationError.includes('overhead') || validationError.includes('declaration')) setActiveTab('costs');
      else setActiveTab('overview');
      return;
    }
    setSubmitting(true); setErrorMessage('');
    try {
      const supabase = createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) throw new Error('Sign in before submitting a project proposal.');
      const now = new Date().toISOString();
      const detailed = {
        materials: materials
          .filter(item => item.name || item.quantity || item.unit || item.unitPrice)
          .map(item => ({ ...item, unitPrice: String(money(item.unitPrice)) })),
        labor: labor
          .filter(item => item.position || item.workers || item.dailyRate || item.days)
          .map(item => ({ ...item, dailyRate: String(money(item.dailyRate)) })),
        equipment: equipment
          .filter(item => item.name || item.quantity || item.rate || item.duration || item.fuel || item.maintenance)
          .map(item => ({
            name: item.name,
            quantity: item.quantity,
            rate: String(money(item.rate)),
            duration: item.duration,
            fuel: String(money(item.fuel)),
            maintenance: String(money(item.maintenance)),
          })),
        overhead: overhead
          .filter(item => item.name || item.description || item.amount)
          .map(item => ({ ...item, amount: String(money(item.amount)) })),
        profit: { amount: money(profit) },
        contingency: { amount: money(contingency) },
        taxes: { amount: money(taxes) },
        calculated_total: totalAmount,
        declaration_accepted_at: now,
      };
      const { data, error } = await supabase.from('quotes').upsert({
        project_id: project.id, contractor_id: user.id, materials_subtotal: materialTotal, labor_cost: laborTotal, equipment_cost: equipmentTotal, logistics_cost: 0,
        overhead_profit_cost: sum([overheadTotal, money(profit)]), other_charges: 0, taxes_cost: money(taxes), total_materials_quotation: materialTotal, delivery_charges: 0,
        price: totalAmount, duration_months: Number.parseInt(duration, 10), proposed_start_date: proposedStartDate || null,
        payment_terms: existingQuote?.payment_terms ?? null,
        work_methodology: existingQuote?.work_methodology ?? null,
        scope_of_work: existingQuote?.scope_of_work ?? null,
        notes: existingQuote?.notes ?? null, quotation_arrangement: 'itemized', material_quotation: detailed,
        breakdown: [{ item: 'Materials', amount: materialTotal }, { item: 'Labor', amount: laborTotal }, { item: 'Machinery', amount: equipmentTotal }, { item: 'Site management and overhead', amount: overheadTotal }, { item: 'Contractor profit', amount: money(profit) }, { item: 'Contingency', amount: money(contingency) }, { item: 'Taxes and charges', amount: money(taxes) }],
        valid_until: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), status: 'submitted', submitted_at: now, revision_number: (existingQuote?.revision_number ?? 0) + 1,
      }, { onConflict: 'project_id,contractor_id' }).select('*').single();
      if (error) throw error;
      if (!data) throw new Error('The calculated proposal was not returned after saving.');
      onSuccess(data as Quote);
    } catch (error: unknown) {
      const message = error instanceof Error
        ? error.message
        : typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string'
          ? error.message
          : 'Could not submit the detailed proposal.';
      setErrorMessage(message);
    } finally { setSubmitting(false); }
  };
  if (!isOpen && mode === 'modal') return null;
  if (existingQuote?.status === 'accepted') {
    return (
      <div className={mode === 'page' ? '' : 'fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-3 sm:p-6'}>
        <section className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
          <h2 className="text-lg font-bold text-slate-900">Proposal accepted</h2>
          <p className="mt-2 text-sm text-slate-600">This proposal was accepted by the homeowner and can no longer be edited.</p>
          <button type="button" onClick={onClose} className="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
            Back
          </button>
        </section>
      </div>
    );
  }
  const input = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    numeric = false,
    type: 'text' | 'date' = 'text',
    numericOptions: { min?: string; step?: string; formatThousands?: boolean; required?: boolean } = {},
  ) => (
    <label className="block text-xs font-semibold leading-5 text-slate-700">
      {label}
      <input
        required={numericOptions.required}
        type={numeric && !numericOptions.formatThousands ? 'number' : type}
        inputMode={numericOptions.formatThousands ? 'decimal' : undefined}
        min={numeric && !numericOptions.formatThousands ? numericOptions.min ?? '0' : undefined}
        step={numeric && !numericOptions.formatThousands ? numericOptions.step ?? '0.01' : undefined}
        value={value}
        onChange={event => onChange(numericOptions.formatThousands ? formatNumberInput(event.target.value) : event.target.value)}
        className="mt-1 block min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      />
    </label>
  );
  const sections = {
    materials: (
      <div className="space-y-3">
        {materials.map((item, index) => (
          <div key={index} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="grid gap-3 sm:grid-cols-4">
              {input('Material name', item.name, value => update(setMaterials, index, { name: value }))}
              {input('Quantity', item.quantity, value => update(setMaterials, index, { quantity: value }), true)}
              {input('Unit', item.unit, value => update(setMaterials, index, { unit: value }))}
              {input('Unit price', item.unitPrice, value => update(setMaterials, index, { unitPrice: value }), true, 'text', { formatThousands: true })}
            </div>
            <div className="mt-2 flex items-center justify-between text-xs">
              <b>Subtotal: {formatCurrency(money(item.quantity) * money(item.unitPrice))}</b>
              {materials.length > 1 && <button type="button" aria-label="Remove material" onClick={() => remove(setMaterials, index)}><Trash2 className="h-4 w-4 text-rose-600" /></button>}
            </div>
          </div>
        ))}
        <button type="button" onClick={() => add(setMaterials, blankMaterial())} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700"><Plus className="h-3.5 w-3.5" /> Add material</button>
      </div>
    ),
    labor: (
      <div className="space-y-3">
        {labor.map((item, index) => (
          <div key={index} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="grid gap-3 sm:grid-cols-4">
              {input('Position', item.position, value => update(setLabor, index, { position: value }))}
              {input('Workers', item.workers, value => update(setLabor, index, { workers: value }), true)}
              {input('Daily wage', item.dailyRate, value => update(setLabor, index, { dailyRate: value }), true, 'text', { formatThousands: true })}
              {input('Working days', item.days, value => update(setLabor, index, { days: value }), true)}
            </div>
            <div className="mt-2 text-xs"><b>Subtotal: {formatCurrency(money(item.workers) * money(item.dailyRate) * money(item.days))}</b></div>
          </div>
        ))}
        <button type="button" onClick={() => add(setLabor, blankLabor())} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700"><Plus className="h-3.5 w-3.5" /> Add labor position</button>
      </div>
    ),
    machinery: (
      <div className="space-y-3">
        {equipment.map((item, index) => (
          <div key={index} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="grid gap-3 sm:grid-cols-4">
              {input('Machine name', item.name, value => update(setEquipment, index, { name: value }))}
              {input('Quantity', item.quantity, value => update(setEquipment, index, { quantity: value }), true)}
              {input('Rate / price', item.rate, value => update(setEquipment, index, { rate: value }), true, 'text', { formatThousands: true })}
              {input('Duration', item.duration, value => update(setEquipment, index, { duration: value }), true)}
              {input('Fuel / operating cost', item.fuel, value => update(setEquipment, index, { fuel: value }), true, 'text', { formatThousands: true })}
              {input('Maintenance / mobilization', item.maintenance, value => update(setEquipment, index, { maintenance: value }), true, 'text', { formatThousands: true })}
            </div>
            <div className="mt-2 text-xs"><b>Subtotal: {formatCurrency(money(item.quantity) * money(item.rate) * money(item.duration) + money(item.fuel) + money(item.maintenance))}</b></div>
          </div>
        ))}
        <button type="button" onClick={() => add(setEquipment, blankEquipment())} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700"><Plus className="h-3.5 w-3.5" /> Add machine</button>
      </div>
    ),
    costs: (
      <div className="space-y-3">
        {overhead.map((item, index) => (
          <div key={index} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-3">
            {input('Expense', item.name, value => update(setOverhead, index, { name: value }))}
            {input('Amount', item.amount, value => update(setOverhead, index, { amount: value }), true, 'text', { formatThousands: true })}
            {input('Description', item.description, value => update(setOverhead, index, { description: value }))}
          </div>
        ))}
        <button type="button" onClick={() => add(setOverhead, blankExpense())} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700"><Plus className="h-3.5 w-3.5" /> Add overhead expense</button>
        <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-3">
          {input("Contractor's profit", profit, setProfit, true, 'text', { formatThousands: true })}
          {input('Contingency allowance', contingency, setContingency, true, 'text', { formatThousands: true })}
          {input('Taxes and charges', taxes, setTaxes, true, 'text', { formatThousands: true })}
        </div>
        <label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900">
          <input type="checkbox" checked={declaration} onChange={event => setDeclaration(event.target.checked)} className="mt-0.5" />
          I certify that the quantities, prices, computations, and descriptions in this proposal are accurate.
        </label>
      </div>
    ),
  };
  const tabs: { id: ProposalTab; label: string; icon: typeof ClipboardList; total?: number }[] = [
    { id: 'overview', label: 'Schedule', icon: ClipboardList },
    { id: 'materials', label: 'Materials', icon: HardHat, total: materialTotal },
    { id: 'labor', label: 'Labor', icon: Users, total: laborTotal },
    { id: 'machinery', label: 'Machinery', icon: Tractor, total: equipmentTotal },
    { id: 'costs', label: 'Other costs', icon: Wrench, total: sum([overheadTotal, money(profit), money(contingency), money(taxes)]) },
  ];
  const pageMode = mode === 'page';
  return (
    <div className={pageMode ? '' : 'fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-3 sm:p-6'}>
      <section
        role={mode === 'modal' ? 'dialog' : undefined}
        className={pageMode
          ? 'flex h-[calc(100dvh-6.5rem)] min-h-0 w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-sm lg:h-[calc(100dvh-8rem)]'
          : 'flex max-h-[96dvh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-slate-50 shadow-2xl'}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 bg-slate-900 px-4 py-2.5 text-white sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            {pageMode && (
              <button type="button" onClick={onClose} aria-label="Back to opportunity" className="shrink-0 rounded-lg p-2 text-slate-300 transition hover:bg-white/10 hover:text-white">
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div className="min-w-0">
              <p className="truncate text-[10px] text-slate-300">{project.city}{project.province ? `, ${project.province}` : ''} · {project.floor_area_sqm} sq.m · {project.floors} {project.floors === 1 ? 'floor' : 'floors'}</p>
              <h2 className="truncate text-sm font-bold sm:text-base">{project.title}</h2>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <div className="text-right">
              <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-300">Proposal total</p>
              <p className="text-sm font-extrabold text-emerald-300">{formatCurrency(totalAmount)}</p>
            </div>
            {!pageMode && <button type="button" onClick={onClose} aria-label="Close proposal" className="rounded-lg p-2 text-slate-300 hover:bg-white/10"><X className="h-4 w-4" /></button>}
          </div>
        </header>

        <form onSubmit={submitProposal} className="flex min-h-0 flex-1 flex-col">
          <nav role="tablist" aria-label="Proposal sections" className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-200 bg-white px-2 sm:px-4">
            {tabs.map(({ id, label, icon: Icon, total }) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`proposal-tab-${id}`}
                aria-controls="proposal-tab-panel"
                aria-selected={activeTab === id}
                onClick={() => setActiveTab(id)}
                className={`flex min-h-11 shrink-0 items-center gap-1.5 border-b-2 px-3 text-xs font-semibold transition ${
                  activeTab === id ? 'border-emerald-600 text-emerald-800' : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
                {total !== undefined && <span className="hidden text-[10px] font-medium text-slate-400 sm:inline">{formatCurrency(total)}</span>}
              </button>
            ))}
          </nav>

          <div
            role="tabpanel"
            id="proposal-tab-panel"
            aria-labelledby={`proposal-tab-${activeTab}`}
            tabIndex={0}
            className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3 outline-none sm:p-4"
          >
            {errorMessage && <div role="alert" className="mb-3 flex shrink-0 items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800"><AlertCircle className="h-4 w-4 shrink-0" />{errorMessage}</div>}
            {activeTab === 'overview' ? (
              <section className="grid flex-1 content-start gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
                <div>{input('Estimated construction duration (months)', duration, setDuration, true, 'text', { min: '1', step: '1', required: true })}</div>
                <div>{input('Proposed start date', proposedStartDate, setProposedStartDate, false, 'date')}</div>
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 sm:col-span-2">
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-blue-700">Calculated proposal total</span>
                  <strong className="mt-1 block text-lg">{formatCurrency(totalAmount)}</strong>
                </div>
              </section>
            ) : (
              <section className="flex-1 space-y-3 rounded-xl border border-slate-200 bg-slate-100/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-bold text-slate-950">{tabs.find(tab => tab.id === activeTab)?.label}</h3>
                  <span className="text-xs font-bold text-emerald-700">{formatCurrency(tabs.find(tab => tab.id === activeTab)?.total ?? 0)}</span>
                </div>
                {sections[activeTab]}
              </section>
            )}
          </div>

          <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-white px-3 py-2.5 sm:px-4">
            <p className="hidden text-xs text-slate-500 sm:block">Calculated total <strong className="ml-1 text-sm text-emerald-700">{formatCurrency(totalAmount)}</strong></p>
            <div className="ml-auto flex gap-2">
              {!pageMode && <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700">Cancel</button>}
              <button type="submit" disabled={submitting} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
                <Send className="h-3.5 w-3.5" />{submitting ? 'Submitting…' : 'Submit proposal'}
              </button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  );
}
