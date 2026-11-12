'use client';

import React, { useState, useEffect } from 'react';
import AppLayout from '@/components/ui/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { 
  CreditCard, 
  AlertCircle, 
  CheckCircle2, 
  Plus, 
  Smartphone,
  Landmark,
  Trash2,
  Pencil
} from 'lucide-react';
import { ContractorPayoutAccount } from '@/types/database';

function getPayoutAccountErrorMessage(error: unknown): string {
  if (typeof error !== 'object' || error === null) {
    return 'Could not register payout account. Please try again.';
  }

  const message = 'message' in error && typeof error.message === 'string'
    ? error.message
    : 'Could not register payout account. Please try again.';
  const code = 'code' in error && typeof error.code === 'string' ? error.code : '';
  const details = 'details' in error && typeof error.details === 'string' ? error.details : '';
  const hint = 'hint' in error && typeof error.hint === 'string' ? error.hint : '';

  if (
    code === 'PGRST202' ||
    (message.includes('register_contractor_payout_account') && /schema cache|function/i.test(message))
  ) {
    return 'Payout registration is not installed in Supabase yet. Apply supabase/migrations/104_repair_contractor_payout_registration.sql, then refresh and try again.';
  }
  if (code === '42501' || /row-level security|permission denied/i.test(message)) {
    return 'Supabase denied payout registration. Confirm migration 104 has been applied and that you are signed in as a contractor.';
  }

  return [message, details, hint].filter(Boolean).join(' — ');
}

export default function ContractorPaymentMethodsPage() {
  const [payoutAccounts, setPayoutAccounts] = useState<ContractorPayoutAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [contractorId, setContractorId] = useState<string | null>(null);
  const [deletingAccountId, setDeletingAccountId] = useState<string | null>(null);
  
  // Modal / Form state
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<ContractorPayoutAccount | null>(null);
  const [channelCategory, setChannelCategory] = useState<'bank_transfer' | 'ecash'>('bank_transfer');
  const [bankName, setBankName] = useState('');
  const [ecashProvider, setEcashProvider] = useState('GCash');
  const [accountHolderName, setAccountHolderName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    async function loadAccounts() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setContractorId(user.id);
          const { data, error } = await supabase
          .from('contractor_payout_accounts')
          .select('*')
          .eq('contractor_id', user.id);
          if (error) throw error;
          setPayoutAccounts((data || []) as ContractorPayoutAccount[]);
        } else {
          setPayoutAccounts([]);
        }
      } catch (err) {
        setPayoutAccounts([]);
        setMessage({
          text: err instanceof Error ? err.message : 'Could not load payout accounts.',
          type: 'error',
        });
      } finally {
        setLoading(false);
      }
    }

    loadAccounts();
  }, []);

  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => setMessage(null), 4500);
    return () => window.clearTimeout(timeout);
  }, [message]);

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountHolderName || !accountNumber) {
      setMessage({ text: 'Please complete all required fields.', type: 'error' });
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    if (!contractorId) {
      setMessage({ text: 'Sign in to register a payout account.', type: 'error' });
      setIsSubmitting(false);
      return;
    }

    const cleanNum = accountNumber.replace(/\s+/g, '');
    const masked = cleanNum.length > 4 ? `•••• •••• ${cleanNum.slice(-4)}` : cleanNum;

    const resolvedMethod: 'bank_transfer' | 'gcash' | 'maya' = 
      channelCategory === 'bank_transfer'
        ? 'bank_transfer'
        : ecashProvider.toLowerCase().includes('maya')
        ? 'maya'
        : 'gcash';

    const resolvedProviderName = 
      channelCategory === 'bank_transfer' 
        ? bankName 
        : ecashProvider;

    try {
      const supabase = createClient();
      if (editingAccount) {
        const { data, error } = await supabase
          .from('contractor_payout_accounts')
          .update({
            payout_method: resolvedMethod,
            bank_name: resolvedProviderName,
            account_name: accountHolderName.trim(),
            account_number_mask: masked,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingAccount.id)
          .eq('contractor_id', contractorId)
          .select()
          .single();
        if (error) throw error;
        setPayoutAccounts(prev => prev.map(account => account.id === editingAccount.id ? data as ContractorPayoutAccount : account));
        setMessage({ text: 'Payout account updated successfully.', type: 'success' });
      } else {
        const { data, error } = await supabase.rpc('register_contractor_payout_account', {
          p_payout_method: resolvedMethod,
          p_bank_name: resolvedProviderName,
          p_account_name: accountHolderName.trim(),
          p_account_number_mask: masked,
        });
        if (error) throw error;
        const insertedAccount = Array.isArray(data) ? data[0] : data;
        if (!insertedAccount) throw new Error('Supabase did not return the registered payout account.');
        setPayoutAccounts(prev => [insertedAccount as ContractorPayoutAccount, ...prev]);
        setMessage({ text: 'Payout account added successfully.', type: 'success' });
      }

      setShowAddModal(false);
      setEditingAccount(null);
      setAccountHolderName('');
      setAccountNumber('');
    } catch (err: unknown) {
      console.error('Could not register contractor payout account:', {
        message: err instanceof Error ? err.message : getPayoutAccountErrorMessage(err),
        code: typeof err === 'object' && err !== null && 'code' in err ? err.code : undefined,
        details: typeof err === 'object' && err !== null && 'details' in err ? err.details : undefined,
        hint: typeof err === 'object' && err !== null && 'hint' in err ? err.hint : undefined,
      });
      setMessage({ text: getPayoutAccountErrorMessage(err), type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditModal = (account: ContractorPayoutAccount) => {
    setEditingAccount(account);
    setChannelCategory(account.payout_method === 'bank_transfer' ? 'bank_transfer' : 'ecash');
    setBankName(account.payout_method === 'bank_transfer' ? account.bank_name || '' : '');
    setEcashProvider(account.payout_method === 'maya' ? 'Maya' : 'GCash');
    setAccountHolderName(account.account_name);
    setAccountNumber(account.account_number_mask);
    setShowAddModal(true);
  };

  const handleDeleteAccount = async (account: ContractorPayoutAccount) => {
    if (!contractorId || !window.confirm(`Delete the payout account ending ${account.account_number_mask.slice(-4)}?`)) return;

    setDeletingAccountId(account.id);
    setMessage(null);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('contractor_payout_accounts')
        .delete()
        .eq('id', account.id)
        .eq('contractor_id', contractorId);
      if (error) {
        if (error.code === '23503') {
          throw new Error('This payout account is linked to payment history and cannot be deleted.');
        }
        throw error;
      }

      setPayoutAccounts(current => current.filter(item => item.id !== account.id));
      setMessage({ text: 'Payout account deleted.', type: 'success' });
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : 'Could not delete the payout account.',
        type: 'error',
      });
    } finally {
      setDeletingAccountId(null);
    }
  };

  return (
    <AppLayout 
      userRole="contractor" 
      title="Payout Methods" 
      subtitle="Manage your registered bank and e-wallet accounts for milestone payouts"
    >
      <div className="w-full space-y-6 pb-12">
        {/* Payout Information */}
        <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white rounded-2xl p-6 shadow-md relative overflow-hidden">
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-200 bg-white/10 px-2.5 py-1 rounded-md">
                <CreditCard className="w-4 h-4 text-emerald-400" />
                Payout Account
              </div>
              <h2 className="text-xl font-bold">Direct Milestone Disbursements</h2>
              <p className="text-blue-100 text-sm max-w-2xl leading-relaxed">
                When a homeowner approves a milestone, released funds are automatically transferred to your registered payout account.
              </p>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-white text-blue-900 font-semibold text-sm hover:bg-blue-50 transition-all shadow-sm shrink-0"
            >
              <Plus className="w-4 h-4" />
              Add Payout Account
            </button>
          </div>
          <div className="absolute -right-8 -bottom-8 w-48 h-48 bg-white/5 rounded-full blur-2xl pointer-events-none" />
        </div>

        {message && (
          <div
            role={message.type === 'error' ? 'alert' : 'status'}
            aria-live={message.type === 'error' ? 'assertive' : 'polite'}
            className={`fixed right-5 top-5 z-[100] flex w-[calc(100%-2.5rem)] max-w-md items-start gap-3 rounded-xl border p-4 text-sm shadow-xl ${
              message.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-red-200 bg-red-50 text-red-800'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            )}
            <div className="flex-1">{message.text}</div>
            <button
              type="button"
              onClick={() => setMessage(null)}
              aria-label="Dismiss notification"
              className="shrink-0 rounded p-0.5 text-current opacity-70 hover:opacity-100"
            >
              ×
            </button>
          </div>
        )}

        {/* Existing Payout Accounts Grid */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Registered Payout Channels</h3>
              <p className="text-xs text-slate-500 mt-0.5">Funds are sent to your registered payout account</p>
            </div>
            <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md">
              {payoutAccounts.length} Registered
            </span>
          </div>

          {loading ? (
            <div className="p-12 text-center text-slate-400">Loading payout records...</div>
          ) : payoutAccounts.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <div className="w-14 h-14 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto">
                <CreditCard className="w-7 h-7" />
              </div>
              <h4 className="font-semibold text-slate-800">No payout method registered yet</h4>
              <p className="text-sm text-slate-500 max-w-md mx-auto">
                Please register a Philippine bank account or digital wallet (GCash/Maya) so you can receive released milestone payments.
              </p>
              <button
                onClick={() => setShowAddModal(true)}
                className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white font-medium text-sm hover:bg-blue-700 transition"
              >
                <Plus className="w-4 h-4" />
                Add Your First Account
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {payoutAccounts.map((account) => {
                const isBank = account.payout_method === 'bank_transfer';
                const isGcash = account.payout_method === 'gcash';

                return (
                  <div key={account.id} className="p-5 hover:bg-slate-50/60 transition flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                        isGcash 
                          ? 'bg-blue-50 text-blue-600 border border-blue-200' 
                          : account.payout_method === 'maya' 
                          ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                          : 'bg-indigo-50 text-indigo-600 border border-indigo-200'
                      }`}>
                        {isBank ? <Landmark className="w-6 h-6" /> : <Smartphone className="w-6 h-6" />}
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-bold text-slate-900 text-base">{account.bank_name || 'Account'}</h4>
                        </div>

                        <div className="text-sm font-mono text-slate-700 tracking-wider">
                          {account.account_number_mask}
                        </div>

                        <div className="text-xs text-slate-500 flex items-center gap-3 pt-0.5">
                          <span>Account Holder: <strong className="text-slate-700">{account.account_name}</strong></span>
                          <span>•</span>
                          <span>Last updated: {new Date(account.updated_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end md:self-center">
                      <button
                        type="button"
                        onClick={() => openEditModal(account)}
                        aria-label={`Edit ${account.bank_name || 'payout'} account`}
                        title="Edit payout account"
                        className="rounded-lg border border-blue-200 p-2 text-blue-700 hover:bg-blue-50"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteAccount(account)}
                        disabled={deletingAccountId === account.id}
                        aria-label={`Delete ${account.bank_name || 'payout'} account ending ${account.account_number_mask.slice(-4)}`}
                        title="Delete payout account"
                        className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

      {/* Add Payout Account Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-lg">{editingAccount ? 'Edit Payout Account' : 'Add Payout Account'}</h3>
                <p className="text-xs text-slate-500">Provide payout details for milestone disbursements</p>
              </div>
              <button 
                onClick={() => {
                  setShowAddModal(false);
                  setEditingAccount(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddAccount} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Payout Channel Category</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setChannelCategory('bank_transfer');
                      setBankName('BDO Unibank');
                    }}
                    className={`p-3 rounded-xl border text-center text-xs font-medium transition cursor-pointer flex flex-col items-center justify-center gap-1 ${
                      channelCategory === 'bank_transfer'
                        ? 'border-blue-600 bg-blue-50 text-blue-700 font-bold ring-1 ring-blue-500 shadow-2xs'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Landmark className="w-5 h-5 mx-auto text-blue-600" />
                    <span>Bank Transfer</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setChannelCategory('ecash');
                      setEcashProvider('GCash');
                    }}
                    className={`p-3 rounded-xl border text-center text-xs font-medium transition cursor-pointer flex flex-col items-center justify-center gap-1 ${
                      channelCategory === 'ecash'
                        ? 'border-blue-600 bg-blue-50 text-blue-700 font-bold ring-1 ring-blue-500 shadow-2xs'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Smartphone className="w-5 h-5 mx-auto text-emerald-600" />
                    <span>E-Cash / E-Wallet</span>
                  </button>
                </div>
              </div>

              {channelCategory === 'bank_transfer' ? (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Select Bank</label>
                  <select
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white font-medium"
                  >
                    <option value="BDO Unibank">BDO Unibank</option>
                    <option value="Bank of the Philippine Islands (BPI)">Bank of the Philippine Islands (BPI)</option>
                    <option value="Metrobank">Metrobank</option>
                    <option value="UnionBank of the Philippines">UnionBank of the Philippines</option>
                    <option value="Security Bank">Security Bank</option>
                    <option value="RCBC (Rizal Commercial Banking Corp)">RCBC (Rizal Commercial Banking Corp)</option>
                    <option value="Philippine National Bank (PNB)">Philippine National Bank (PNB)</option>
                    <option value="Land Bank of the Philippines">Land Bank of the Philippines</option>
                    <option value="Chinabank">Chinabank</option>
                    <option value="EastWest Bank">EastWest Bank</option>
                    <option value="Asia United Bank (AUB)">Asia United Bank (AUB)</option>
                    <option value="Development Bank of the Philippines (DBP)">Development Bank of the Philippines (DBP)</option>
                  </select>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Select E-Cash / Digital Wallet Provider</label>
                  <select
                    value={ecashProvider}
                    onChange={(e) => setEcashProvider(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white font-medium"
                  >
                    <option value="GCash">GCash</option>
                    <option value="Maya Wallet">Maya Wallet</option>
                    <option value="GrabPay">GrabPay</option>
                    <option value="ShopeePay">ShopeePay</option>
                    <option value="Coins.ph">Coins.ph</option>
                  </select>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Account Holder Name</label>
                <input
                  type="text"
                  placeholder="Enter account holder or registered business name"
                  value={accountHolderName}
                  onChange={(e) => setAccountHolderName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                <p className="text-[11px] text-slate-400">Use the name registered on the payout account.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  {channelCategory === 'bank_transfer' ? 'Bank Account Number' : `${ecashProvider} Registered Mobile / Account Number`}
                </label>
                <input
                  type="text"
                  placeholder="Enter account number"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  required
                />
                <p className="text-[11px] text-slate-400">
                  For your safety, only masked digits (•••• 1234) will be stored in viewable records.
                </p>
              </div>

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : editingAccount ? 'Save Changes' : 'Add Payout Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
