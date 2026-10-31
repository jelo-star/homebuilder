'use client';

import React, { useState, useEffect, useMemo } from 'react';
import AppLayout from '@/components/ui/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { 
  CreditCard, 
  ShieldCheck, 
  CheckCircle2, 
  AlertCircle,
  Landmark,
  Smartphone,
  Plus,
  Edit2,
  Copy,
  Check,
  QrCode,
  Search,
  FileText,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { ConfiguredPaymentMethod } from '@/types/database';

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
    const details = 'details' in error && typeof error.details === 'string' ? error.details : '';
    const hint = 'hint' in error && typeof error.hint === 'string' ? error.hint : '';
    return [error.message, details, hint].filter(Boolean).join(' — ');
  }
  return fallback;
}

export default function AdminPaymentSettingsPage() {
  const [paymentMethods, setPaymentMethods] = useState<ConfiguredPaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [expandedInstructionsId, setExpandedInstructionsId] = useState<string | null>(null);

  // Edit / Add modal state
  const [editingMethod, setEditingMethod] = useState<ConfiguredPaymentMethod | null>(null);
  const [isNewMethod, setIsNewMethod] = useState(false);

  // Auto-dismiss top-right toast
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  useEffect(() => {
    async function loadPaymentMethods() {
      try {
        const supabase = createClient();
        const { data, error: queryError } = await supabase
          .from('payment_methods')
          .select('*')
          .order('sort_order', { ascending: true });

        if (queryError) throw queryError;
        setPaymentMethods((data || []) as ConfiguredPaymentMethod[]);
      } catch (err) {
        setPaymentMethods([]);
        setError(err instanceof Error ? err.message : 'Unable to load payment channels.');
      } finally {
        setLoading(false);
      }
    }

    loadPaymentMethods();
  }, []);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setToastMessage({ text: `Copied ${text} to clipboard!`, type: 'success' });
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleToggleActive = async (method: ConfiguredPaymentMethod) => {
    const updatedStatus = !method.is_active;
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from('payment_methods')
        .update({
          is_active: updatedStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', method.id);
      if (updateError) throw updateError;
      setPaymentMethods(current => current.map(m => m.id === method.id ? { ...m, is_active: updatedStatus } : m));
      setToastMessage({
        text: `"${method.display_name}" is now ${updatedStatus ? 'Active & visible to homeowners' : 'Disabled'}.`,
        type: 'success'
      });
    } catch (err: unknown) {
      const message = getErrorMessage(err, 'Unable to update payment channel.');
      setError(message);
      setToastMessage({ text: message, type: 'error' });
    }
  };

  const handleSaveMethod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMethod) return;

    try {
      const supabase = createClient();
      if (isNewMethod) {
        const { id: _id, created_at: _createdAt, ...record } = editingMethod;
        const code = record.code.trim() || [
          record.bank_or_provider_name,
          record.display_name,
          crypto.randomUUID().slice(0, 8),
        ]
          .join(' ')
          .normalize('NFKD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '');
        const { data, error: insertError } = await supabase.from('payment_methods').insert({
          ...record,
          code,
          updated_at: new Date().toISOString()
        }).select('*').single();
        if (insertError) throw insertError;
        if (!data) throw new Error('Supabase did not return the created payment channel.');
        setPaymentMethods(current => [...current, data as ConfiguredPaymentMethod]);
      } else {
        const { id, created_at: _createdAt, ...record } = editingMethod;
        const updatedObj = { ...record, updated_at: new Date().toISOString() };
        const { error: updateError } = await supabase
          .from('payment_methods')
          .update(updatedObj)
          .eq('id', id);
        if (updateError) throw updateError;
        setPaymentMethods(current => current.map(m => m.id === id ? { ...m, ...updatedObj } : m));
      }

      setError(null);
      setToastMessage({ text: 'Payment channel configured successfully!', type: 'success' });
      setEditingMethod(null);
    } catch (err: unknown) {
      const message = getErrorMessage(err, 'Unable to save payment channel.');
      setError(message);
      setToastMessage({ text: message, type: 'error' });
    }
  };

  // Filtered and searched methods
  const filteredMethods = useMemo(() => {
    return paymentMethods.filter(method => {
      const matchesCategory = selectedCategory === 'all' || method.category === selectedCategory;
      const term = searchTerm.toLowerCase().trim();
      const matchesSearch = !term || 
        method.display_name.toLowerCase().includes(term) ||
        method.bank_or_provider_name.toLowerCase().includes(term) ||
        method.account_number_or_id.toLowerCase().includes(term) ||
        method.account_holder_name.toLowerCase().includes(term);
      return matchesCategory && matchesSearch;
    });
  }, [paymentMethods, selectedCategory, searchTerm]);

  // Statistics counters
  const totalCount = paymentMethods.length;
  const activeCount = paymentMethods.filter(m => m.is_active).length;
  const bankCount = paymentMethods.filter(m => m.category === 'bank_transfer').length;
  const ewalletCount = paymentMethods.filter(m => m.category === 'ewallet').length;

  return (
    <AppLayout 
      userRole="admin" 
      title="Payment Channels & Recipient Configuration" 
      subtitle="Configure verified bank accounts, e-wallet QR codes, and instructions for homeowner payments"
    >
      {/* GLOBAL POPUP TOAST NOTIFICATION ON THE TOP RIGHT */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-[99999] max-w-sm w-full animate-in fade-in slide-in-from-top-2 duration-200">
          <div className={`p-3.5 rounded-2xl bg-white shadow-2xl flex items-center justify-between gap-3 text-xs font-bold border ${
            toastMessage.type === 'success' 
              ? 'border-emerald-200 text-emerald-800' 
              : 'border-red-200 text-red-800'
          }`}>
            <div className="flex items-center gap-2 min-w-0">
              {toastMessage.type === 'success'
                ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                : <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />}
              <span className="truncate">{toastMessage.text}</span>
            </div>
            <button 
              onClick={() => setToastMessage(null)} 
              className="text-slate-400 hover:text-slate-600 p-1 rounded-lg shrink-0"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* COMPACT FULL-PAGE WRAPPER DESIGNED TO FIT WITHOUT VERTICAL SCROLLBAR */}
      <div className="w-full space-y-3 pb-2">
        {/* COMPACT HEADER TOOLBAR */}
        <div className="bg-slate-900 text-white rounded-2xl px-5 py-3.5 shadow-sm border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold tracking-tight">Verified Payment Rails</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  {activeCount} Active
                </span>
              </div>
              <p className="text-slate-400 text-[11px] truncate">
                Direct bank accounts & e-wallet rails for homeowner proof verification and safekeeping.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Inline Quick Stats Chips */}
            <div className="hidden lg:flex items-center gap-1.5 text-[11px] text-slate-300 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700/60 font-mono">
              <span>{bankCount} Banks</span>
              <span className="text-slate-500">•</span>
              <span>{ewalletCount} E-Wallets</span>
              <span className="text-slate-500">•</span>
              <span className="text-emerald-400">{totalCount} Total</span>
            </div>

            <button
              onClick={() => {
                setIsNewMethod(true);
                setEditingMethod({
                  id: '',
                  code: '',
                  display_name: '',
                  category: 'bank_transfer',
                  bank_or_provider_name: '',
                  account_holder_name: '',
                  account_number_or_id: '',
                  qr_code_url: '',
                  payment_instructions: '',
                  transaction_fee_pct: 0,
                  transaction_fee_fixed: 0,
                  is_active: true,
                  requires_proof: true,
                  requires_admin_verification: true,
                  sort_order: paymentMethods.length + 1,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                });
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Channel
            </button>
          </div>
        </div>

        {/* COMPACT FILTER & SEARCH BAR */}
        <div className="bg-white px-3.5 py-2 rounded-xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
            {[
              { key: 'all', label: `All (${totalCount})` },
              { key: 'bank_transfer', label: `Banks (${bankCount})` },
              { key: 'ewallet', label: `E-Wallets (${ewalletCount})` },
              { key: 'card', label: 'Cards / OTC' },
            ].map(cat => (
              <button
                key={cat.key}
                type="button"
                onClick={() => setSelectedCategory(cat.key)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                  selectedCategory === cat.key
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search bank or account #..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* COMPACT CHANNELS GRID (FITS SCREEN WITHOUT SCROLLBAR) */}
        {error && <div role="alert" className="p-3 rounded-xl bg-red-50 text-red-700 text-xs">{error}</div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {loading ? <div className="col-span-full p-8 text-center text-xs text-slate-400">Loading payment channels...</div> : filteredMethods.length === 0 ? <div className="col-span-full p-8 text-center text-xs text-slate-400">No payment channels configured.</div> :
          filteredMethods.map((method) => {
            const isBank = method.category === 'bank_transfer';
            const isEwallet = method.category === 'ewallet';
            const isCard = method.category === 'card';
            const isExpanded = expandedInstructionsId === method.id;

            return (
              <div 
                key={method.id}
                className={`bg-white rounded-2xl border transition shadow-2xs hover:shadow-xs flex flex-col justify-between overflow-hidden ${
                  method.is_active ? 'border-slate-200' : 'border-slate-200 opacity-60 bg-slate-50/50'
                }`}
              >
                <div className="p-3.5 space-y-2.5">
                  {/* Card Header Row */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                        isEwallet ? 'bg-blue-50 text-blue-600 border border-blue-200' :
                        isBank ? 'bg-indigo-50 text-indigo-600 border border-indigo-200' :
                        isCard ? 'bg-violet-50 text-violet-600 border border-violet-200' :
                        'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}>
                        {isBank ? <Landmark className="w-4 h-4" /> :
                         isCard ? <CreditCard className="w-4 h-4" /> :
                         isEwallet ? <Smartphone className="w-4 h-4" /> :
                         <ShieldCheck className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-slate-900 text-xs truncate" title={method.display_name}>
                          {method.display_name}
                        </h4>
                        <span className="text-[10px] text-slate-400 block truncate">{method.bank_or_provider_name}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleToggleActive(method)}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border transition flex items-center gap-1 ${
                          method.is_active 
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-slate-100 text-slate-500 border-slate-200'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${method.is_active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                        {method.is_active ? 'Active' : 'Off'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsNewMethod(false);
                          setEditingMethod(method);
                        }}
                        className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
                        title="Edit channel"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Account Strip with One-Click Copy */}
                  <div className="px-2.5 py-1.5 bg-slate-50 rounded-xl border border-slate-200/70 flex items-center justify-between text-xs">
                    <div className="min-w-0 pr-1">
                      <div className="font-mono font-bold text-blue-700 text-xs tracking-wider truncate">
                        {method.account_number_or_id}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">
                        {method.account_holder_name}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(method.account_number_or_id, method.id)}
                      className="p-1 text-slate-500 hover:text-blue-600 hover:bg-white rounded-md transition shadow-2xs"
                      title="Copy account number"
                    >
                      {copiedId === method.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                    </button>
                  </div>

                  {/* Instructions Toggle */}
                  <div className="pt-0.5">
                    <button
                      type="button"
                      onClick={() => setExpandedInstructionsId(isExpanded ? null : method.id)}
                      className="text-[10px] font-semibold text-slate-500 hover:text-blue-600 flex items-center gap-1 transition"
                    >
                      <span>Instructions & Audit Rules</span>
                      {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>

                    {isExpanded && (
                      <div className="mt-1.5 p-2 bg-slate-50 rounded-lg border border-slate-200 font-mono text-[10px] text-slate-600 leading-tight whitespace-pre-line">
                        {method.payment_instructions}
                      </div>
                    )}
                  </div>
                </div>

                {/* Compact Card Footer */}
                <div className="px-3.5 py-1.5 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-400 flex items-center justify-between">
                  <span className="capitalize">{method.category.replace('_', ' ')}</span>
                  {method.transaction_fee_pct > 0 && (
                    <span className="text-emerald-700 font-bold">{method.transaction_fee_pct}% Fee</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Edit / Add Modal */}
      {editingMethod && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-5 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150 space-y-3.5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  {isNewMethod ? 'Add Payment Channel' : 'Configure Payment Channel'}
                </h3>
                <p className="text-[11px] text-slate-500">Provide official recipient details and clear payer steps</p>
              </div>
              <button
                onClick={() => setEditingMethod(null)}
                className="text-slate-400 hover:text-slate-600 text-sm p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveMethod} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Display Name</label>
                <input
                  type="text"
                  required
                  value={editingMethod.display_name}
                  onChange={(e) => setEditingMethod({ ...editingMethod, display_name: e.target.value })}
                  className="w-full p-2 rounded-xl border border-slate-300 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  placeholder="Enter payment channel name"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Category</label>
                  <select
                    value={editingMethod.category}
                    onChange={(e) => setEditingMethod({ ...editingMethod, category: e.target.value as any })}
                    className="w-full p-2 rounded-xl border border-slate-300 text-xs bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="bank_transfer">Bank Transfer / Deposit</option>
                    <option value="ewallet">E-Wallet (GCash/Maya)</option>
                    <option value="card">External Card Terminal</option>
                    <option value="cash_check">Cash / Manager's Check</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Bank / Provider</label>
                  <input
                    type="text"
                    required
                    value={editingMethod.bank_or_provider_name}
                    onChange={(e) => setEditingMethod({ ...editingMethod, bank_or_provider_name: e.target.value })}
                    className="w-full p-2 rounded-xl border border-slate-300 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    placeholder="Enter bank or provider name"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Account Holder Name</label>
                <input
                  type="text"
                  required
                  value={editingMethod.account_holder_name}
                  onChange={(e) => setEditingMethod({ ...editingMethod, account_holder_name: e.target.value })}
                  className="w-full p-2 rounded-xl border border-slate-300 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  placeholder="Enter account holder name"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Account Number / Mobile Number</label>
                <input
                  type="text"
                  required
                  value={editingMethod.account_number_or_id}
                  onChange={(e) => setEditingMethod({ ...editingMethod, account_number_or_id: e.target.value })}
                  className="w-full p-2 rounded-xl border border-slate-300 text-xs font-mono font-bold focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  placeholder="Enter account number or provider ID"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Payer Instructions (Step-by-step)</label>
                <textarea
                  rows={3}
                  required
                  value={editingMethod.payment_instructions}
                  onChange={(e) => setEditingMethod({ ...editingMethod, payment_instructions: e.target.value })}
                  className="w-full p-2 rounded-xl border border-slate-300 text-xs font-mono focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  placeholder="1. Open app...&#10;2. Transfer amount...&#10;3. Upload receipt."
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingMethod(null)}
                  className="px-3.5 py-1.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition"
                >
                  Save Configuration
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
