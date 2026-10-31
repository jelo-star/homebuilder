'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function EscrowForwardPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin/transactions');
  }, [router]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm text-center space-y-2">
        <h3 className="font-bold text-slate-800 text-sm">Opening Safekeeping & Transactions Ledger...</h3>
        <p className="text-xs text-slate-500">Redirecting to the unified safekeeping and financial management hub.</p>
      </div>
    </div>
  );
}
