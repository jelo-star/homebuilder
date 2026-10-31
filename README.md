# Smart Contractor Matching

Connecting homeowners with vetted general contractors in the Philippines through transparent cost estimation, algorithmic contractor matching, quotation comparison, milestone-based construction progress tracking, and simulated cashless escrow.

## 1. Overview & Architecture

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, Lucide Icons.
- **Backend & Database:** Supabase PostgreSQL with 21 core tables, Row Level Security (RLS), and database enums.
- **Authentication & Security:** Supabase Auth with cookie-based SSR session management and protected route middleware (`middleware.ts`).
- **Payments & Escrow:** Database-backed simulation mode with idempotent append-only escrow ledger entries. *(SIMULATION / NO REAL MONEY TRANSFERRED)*.

Runtime user, contractor, project, quotation, payment, and settings records are loaded from Supabase. The application does not use local mock records as a fallback when a query returns no data. Empty database results are shown as empty states, and construction estimates require an active row in `construction_benchmarks`.

Apply migrations through `68_fix_milestone_image_project_scope.sql` before using signup, the public contractor directory, or project features. Migration 66 ensures homeowners can read contractor milestone proof records for their own projects. Migrations 67 and 68 allow homeowners to create signed URLs for contractor-uploaded milestone images in their own project, including projects where the milestone quote is the authoritative relationship. The migrations in this repository must be applied to the Supabase project separately.

---

## 2. Core Modules & Directories

- [`app/page.tsx`](file:///app/page.tsx): Modern landing page with interactive real-time cost estimation calculator.
- [`app/login/page.tsx`](file:///app/login/page.tsx) & [`app/register/page.tsx`](file:///app/register/page.tsx): Secure auth registration and role-based redirect routing.
- [`app/homeowner/dashboard/page.tsx`](file:///app/homeowner/dashboard/page.tsx): Homeowner control center with project status counters and project list.
- [`app/homeowner/projects/new/page.tsx`](file:///app/homeowner/projects/new/page.tsx): Construction project specification intake and automated contractor matching.
- [`app/homeowner/projects/[id]/page.tsx`](file:///app/homeowner/projects/[id]/page.tsx): Quotation review, quotation acceptance, simulated escrow funding, milestone approval, and dispute reporting.
- [`app/contractor/dashboard/page.tsx`](file:///app/contractor/dashboard/page.tsx): Contractor dashboard with vetting status alert, opportunities feed, and active contracts.
- [`app/contractor/opportunities/page.tsx`](file:///app/contractor/opportunities/page.tsx): Project leads browser with proposal submission modal.
- [`app/contractor/verification/page.tsx`](file:///app/contractor/verification/page.tsx): PCAB license and ID verification document upload center.
- [`app/contractor/projects/[id]/page.tsx`](file:///app/contractor/projects/[id]/page.tsx): Milestone progress tracker and site inspection proof upload.
- [`app/admin/dashboard/page.tsx`](file:///app/admin/dashboard/page.tsx): Administrative control center for vetting approvals and milestone dispute settlements.
- [`lib/utils/estimator.ts`](file:///lib/utils/estimator.ts): Formula-based cost estimator with 4-phase milestone breakdowns.
- [`lib/utils/matching.ts`](file:///lib/utils/matching.ts): Normalized matching algorithm (0–100 score) excluding unverified builders.

---

## 3. Database Schema

All SQL migrations are organized in [`supabase/migrations`](file:///supabase/migrations):
- `01_extensions_and_enums.sql`
- `02_tables_and_constraints.sql`
- `03_indexes.sql`
- `04_helper_functions_and_triggers.sql`
- `05_business_functions.sql`
- `06_rls_policies.sql`
- `07_storage_buckets_and_policies.sql`
- `08_cron_jobs.sql`
- `09_seed_data.sql`
- `10_test_queries.sql`

---

## 4. Environment Configuration

Create a `.env.local` file in the project root with the following keys:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
# or NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

*Note: Never place service-role keys or secret API credentials in client-accessible environment variables.*

---

## 5. Development & Build Commands

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Run production build and type check
npm run build
```
