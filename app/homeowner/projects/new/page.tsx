import { redirect } from 'next/navigation';

export default function NewProjectRedirectPage() {
  // Automatically redirect any requests to the unified Cost Calculator & Estimator
  redirect('/homeowner/cost-calculator');
}
