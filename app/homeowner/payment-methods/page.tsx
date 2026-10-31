'use client';

import React, { useState, useEffect } from 'react';
import AppLayout from '@/components/ui/AppLayout';
import { 
  CreditCard, 
  Building2, 
  ShieldCheck, 
  Plus, 
  Smartphone,
  CheckCircle2,
  Trash2,
  Check,
  AlertCircle
} from 'lucide-react';
import { formatDate } from '@/lib/utils/formatters';
import { createClient } from '@/lib/supabase/client';

interface SavedHomeownerAccount {
  id: string;
  category: 'bank_transfer' | 'gcash' | 'maya' | 'card';
  provider_name: string;
  account_name: string;
  account_number_mask: string;
  is_primary: boolean;
  created_at: string;
}

export default function HomeownerPaymentMethodsPage() {
  const [savedAccounts, setSavedAccounts] = useState<SavedHomeownerAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  // Form states
  const [accountType, setAccountType] = useState<'bank_transfer' | 'ecash'>('bank_transfer');
  const [bankName, setBankName] = useState('BDO Unibank');
  const [ecashProvider, setEcashProvider] = useState('GCash');
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    async function loadAccounts() {
      try {
        const supabase = createClient();
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) throw error;
        const accounts = user?.user_metadata?.homeowner_payment_accounts;
        setSavedAccounts(Array.isArray(accounts) ? accounts : []);
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : 'Payment accounts could not be loaded.');
      } finally {
        setLoading(false);
      }
    }

    loadAccounts();
  }, []);

  const saveAccounts = async (accounts: SavedHomeownerAccount[]) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Sign in to manage payment accounts.');
    const { error } = await supabase.auth.updateUser({
      data: {
        ...user.user_metadata,
        homeowner_payment_accounts: accounts,
      },
    });
    if (error) throw error;
    setSavedAccounts(accounts);
  };

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountName.trim() || !accountNumber.trim()) {
      setToastMessage({ text: 'Please fill in both Account Name and Account / Mobile Number', type: 'error' });
      return;
    }

    const cleanNum = accountNumber.replace(/\s+/g, '');
    const masked = cleanNum.length > 4 ? `•••• •••• ${cleanNum.slice(-4)}` : cleanNum;

    const resolvedCategory: 'bank_transfer' | 'gcash' | 'maya' = 
      accountType === 'bank_transfer' 
        ? 'bank_transfer' 
        : ecashProvider.toLowerCase().includes('maya') 
        ? 'maya' 
        : 'gcash';

    const providerTitle = accountType === 'bank_transfer' ? bankName : ecashProvider;

    const newAcc: SavedHomeownerAccount = {
      id: crypto.randomUUID(),
      category: resolvedCategory,
      provider_name: providerTitle,
      account_name: accountName.trim(),
      account_number_mask: masked,
      is_primary: isPrimary || savedAccounts.length === 0,
      created_at: new Date().toISOString()
    };

    let updatedList = [...savedAccounts];
    if (newAcc.is_primary) {
      updatedList = updatedList.map(a => ({ ...a, is_primary: false }));
    }
    updatedList.unshift(newAcc);

    try {
      await saveAccounts(updatedList);
      setShowAddModal(false);
      setAccountNumber('');
      setToastMessage({ text: 'Payment method successfully added.', type: 'success' });
      setTimeout(() => setToastMessage(null), 4000);
    } catch (error) {
      setToastMessage({ text: error instanceof Error ? error.message : 'Failed to save payment account.', type: 'error' });
    }
  };

  const handleSetPrimary = async (id: string) => {
    const updated = savedAccounts.map(a => ({
      ...a,
      is_primary: a.id === id
    }));
    try {
      await saveAccounts(updated);
      setToastMessage({ text: 'Primary payment account updated.', type: 'success' });
      setTimeout(() => setToastMessage(null), 3000);
    } catch (error) {
      setToastMessage({ text: error instanceof Error ? error.message : 'Failed to update primary account.', type: 'error' });
    }
  };

  const handleDeleteAccount = async (id: string) => {
    const updated = savedAccounts.filter(a => a.id !== id);
    if (updated.length > 0 && !updated.some(a => a.is_primary)) {
      updated[0].is_primary = true;
    }
    try {
      await saveAccounts(updated);
      setToastMessage({ text: 'Payment account removed.', type: 'success' });
      setTimeout(() => setToastMessage(null), 3000);
    } catch (error) {
      setToastMessage({ text: error instanceof Error ? error.message : 'Failed to remove payment account.', type: 'error' });
    }
  };

  return (
    <AppLayout
      userRole="homeowner"
      title="Payment Methods"
      subtitle="Manage your registered bank and e-wallet accounts for milestone payments and refunds"
      backHref="/homeowner/dashboard"
    >
      <div className="w-full space-y-6">
        {loadError && (
          <div className="p-4 rounded-xl bg-white border border-red-200 text-red-700 text-xs font-semibold">
            Payment accounts could not be loaded: {loadError}
          </div>
        )}
        {toastMessage && (
          <div className="fixed top-5 right-5 z-50 max-w-sm w-full animate-in fade-in slide-in-from-top-2 duration-200">
            <div className={`p-4 rounded-xl border shadow-xl flex items-start gap-3 text-xs ${
              toastMessage.type === 'success' 
                ? 'bg-white border-emerald-200 text-emerald-800' 
                : 'bg-white border-red-200 text-red-800'
            }`}>
              {toastMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-[#136F48] shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              )}
              <div className="font-semibold leading-relaxed flex-1">{toastMessage.text}</div>
              <button
                type="button"
                onClick={() => setToastMessage(null)}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Homeowner Saved Payment Accounts */}
        <div className="bg-white p-6 sm:p-7 rounded-2xl border border-slate-200 shadow-2xs space-y-5">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900">Your Registered Payment Accounts</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Saved Philippine bank and e-wallet accounts for sending milestone payments and receiving escrow refunds
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#136F48] hover:bg-[#0f5738] text-white text-xs font-bold transition shadow-2xs cursor-pointer hover:scale-102"
            >
              <Plus className="w-4 h-4" />
              <span>Add Payment Account</span>
            </button>
          </div>

          {loading ? (
            <div className="p-8 text-center text-xs text-slate-400">Loading payment accounts...</div>
          ) : savedAccounts.length === 0 ? (
            <div className="p-12 text-center text-xs bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-[#136F48] flex items-center justify-center mx-auto">
                <CreditCard className="w-6 h-6" />
              </div>
              <div className="font-bold text-slate-700 text-sm">No payment accounts registered yet</div>
              <p className="text-slate-500 max-w-sm mx-auto leading-relaxed">
                Link your bank account or GCash/Maya wallet to streamline milestone payments and safe escrow disbursements.
              </p>
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="px-4 py-2 rounded-xl bg-[#136F48] hover:bg-[#0f5738] text-white text-xs font-bold inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Your First Account</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {savedAccounts.map((acc) => {
                const isEwallet = acc.category === 'gcash' || acc.category === 'maya';
                return (
                  <div
                    key={acc.id}
                    className={`p-4 rounded-2xl border transition-all space-y-3 relative ${
                      acc.is_primary ? 'bg-emerald-50/40 border-emerald-300 shadow-2xs' : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          acc.is_primary ? 'bg-emerald-100 text-[#136F48]' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {isEwallet ? <Smartphone className="w-5 h-5" /> : <Building2 className="w-5 h-5" />}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 text-xs sm:text-sm">{acc.provider_name}</div>
                          <div className="text-[11px] text-slate-500 font-medium">{acc.account_name}</div>
                        </div>
                      </div>

                      {acc.is_primary && (
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-[#136F48] border border-emerald-200 text-[10px] font-extrabold uppercase tracking-wider">
                          Primary
                        </span>
                      )}
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                      <span className="font-mono font-bold text-slate-800 text-xs tracking-wider">
                        {acc.account_number_mask}
                      </span>
                      <div className="flex items-center gap-2">
                        {!acc.is_primary && (
                          <button
                            type="button"
                            onClick={() => handleSetPrimary(acc.id)}
                            className="text-[11px] font-semibold text-[#136F48] hover:underline transition"
                          >
                            Set Primary
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteAccount(acc.id)}
                          className="p-1 rounded text-slate-400 hover:text-red-600 transition"
                          title="Remove account"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Escrow Safekeeping Guarantees */}
        <div className="p-5 rounded-2xl bg-emerald-50/50 border border-emerald-200/80 space-y-3 text-xs text-slate-600">
          <div className="flex items-center gap-2 text-slate-900 font-bold">
            <ShieldCheck className="w-4 h-4 text-[#136F48]" />
            <span>Escrow Payment Protection Guarantee</span>
          </div>
          <ol className="list-decimal pl-5 space-y-1.5 text-slate-600 leading-relaxed">
            <li><strong>Protected Escrow Safekeeping:</strong> When paying for a milestone stage, your funds are securely held in platform escrow until work is delivered.</li>
            <li><strong>Verified Site Milestones:</strong> Your contractor executes construction according to the approved schedule and uploads comprehensive photo and engineering evidence.</li>
            <li><strong>You Inspect & Approve:</strong> Funds are only released to the contractor when you review and confirm the inspection sign-off.</li>
          </ol>
        </div>
      </div>

      {/* Add Payment Account Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <h3 className="font-bold text-slate-900 text-sm">Add New Payment Account</h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddAccount} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Account Category</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAccountType('bank_transfer')}
                    className={`py-2 px-3 rounded-xl border text-center font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      accountType === 'bank_transfer'
                        ? 'bg-emerald-50 border-[#136F48] text-[#136F48] ring-1 ring-[#136F48]'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Building2 className="w-4 h-4 text-[#136F48]" />
                    <span>Bank Transfer</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAccountType('ecash')}
                    className={`py-2 px-3 rounded-xl border text-center font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      accountType === 'ecash'
                        ? 'bg-emerald-50 border-[#136F48] text-[#136F48] ring-1 ring-[#136F48]'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <CreditCard className="w-4 h-4 text-[#136F48]" />
                    <span>E-Cash / E-Wallet</span>
                  </button>
                </div>
              </div>

              {accountType === 'bank_transfer' ? (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Select Bank</label>
                  <select
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-900 font-semibold focus:ring-1 focus:ring-[#136F48] focus:outline-none"
                  >
                    <option value="BDO Unibank">BDO Unibank</option>
                    <option value="BPI (Bank of the Philippine Islands)">BPI (Bank of the Philippine Islands)</option>
                    <option value="Metrobank">Metrobank</option>
                    <option value="UnionBank of the Philippines">UnionBank of the Philippines</option>
                    <option value="Security Bank">Security Bank</option>
                    <option value="RCBC (Rizal Commercial Banking Corp)">RCBC (Rizal Commercial Banking Corp)</option>
                    <option value="Philippine National Bank (PNB)">Philippine National Bank (PNB)</option>
                    <option value="Landbank">Landbank</option>
                    <option value="Chinabank">Chinabank</option>
                    <option value="EastWest Bank">EastWest Bank</option>
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Select E-Cash / Digital Wallet Provider</label>
                  <select
                    value={ecashProvider}
                    onChange={(e) => setEcashProvider(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-900 font-semibold focus:ring-1 focus:ring-[#136F48] focus:outline-none"
                  >
                    <option value="GCash">GCash</option>
                    <option value="Maya Wallet">Maya Wallet</option>
                    <option value="GrabPay">GrabPay</option>
                    <option value="ShopeePay">ShopeePay</option>
                    <option value="Coins.ph">Coins.ph</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Account Holder Full Name</label>
                <input
                  type="text"
                  required
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  placeholder="e.g. Juan Dela Cruz"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-900 font-semibold focus:ring-1 focus:ring-[#136F48] focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {accountType === 'bank_transfer' ? 'Bank Account Number' : 'Registered Mobile Number'}
                </label>
                <input
                  type="text"
                  required
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder={accountType === 'bank_transfer' ? 'e.g. 0045 8021 9921' : 'e.g. 0917 123 4567'}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-900 font-mono font-bold focus:ring-1 focus:ring-[#136F48] focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="primary-check"
                  checked={isPrimary}
                  onChange={(e) => setIsPrimary(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-[#136F48] focus:ring-[#136F48] accent-[#136F48] cursor-pointer"
                />
                <label htmlFor="primary-check" className="text-slate-700 font-medium cursor-pointer">
                  Set as my primary payment account
                </label>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-bold hover:bg-slate-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#136F48] hover:bg-[#0f5738] text-white font-bold transition shadow-2xs"
                >
                  Save Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
