'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import AppLayout from '@/components/ui/AppLayout';
import ContractorCostBreakdownModal from '@/components/contractor/ContractorCostBreakdownModal';
import { createClient } from '@/lib/supabase/client';
import type { Project, Quote } from '@/types/database';

export default function ContractorProposalPage() {
  return (
    <React.Suspense fallback={<div className="p-8 text-center text-slate-500">Loading proposal workspace...</div>}>
      <ContractorProposalPageContent />
    </React.Suspense>
  );
}

function ContractorProposalPageContent() {
  const params = useParams();
  const router = useRouter();
  const projectId = params?.id as string;
  const [project, setProject] = React.useState<Project | null>(null);
  const [quote, setQuote] = React.useState<Quote | null>(null);
  const [userName, setUserName] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }
      if (!user) {
        setError('Sign in to prepare a proposal.');
        setLoading(false);
        return;
      }

      const [{ data: projectData, error: projectError }, { data: quoteData, error: quoteError }, { data: profileData }] = await Promise.all([
        supabase.from('projects').select('*').eq('id', projectId).single(),
        supabase.from('quotes').select('*').eq('project_id', projectId).eq('contractor_id', user.id).maybeSingle(),
        supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
      ]);
      if (projectError) setError(projectError.message);
      else if (quoteError) setError(quoteError.message);
      else setProject(projectData as Project);
      setQuote((quoteData as Quote | null) || null);
      setUserName(profileData?.full_name || user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Contractor');
      setLoading(false);
    };
    load();
  }, [projectId]);

  if (loading) {
    return <AppLayout userRole="contractor" userName={userName} title="Proposal Workspace"><div className="p-12 text-center text-slate-500">Loading proposal workspace...</div></AppLayout>;
  }

  if (error || !project) {
    return <AppLayout userRole="contractor" userName={userName} title="Proposal Workspace"><div className="mx-auto max-w-3xl rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700"><AlertCircle className="mr-2 inline h-4 w-4" />{error || 'Project opportunity was not found.'}</div></AppLayout>;
  }

  return (
    <AppLayout
      userRole="contractor"
      userName={userName}
      title="Prepare Project Proposal"
      subtitle={`${project.title} • ${project.city}${project.province ? `, ${project.province}` : ''}`}
    >
      <ContractorCostBreakdownModal
        mode="page"
        project={project}
        existingQuote={quote}
        isOpen
        onClose={() => router.push(`/contractor/opportunities/${project.id}`)}
        onSuccess={() => router.push(`/contractor/opportunities/${project.id}`)}
      />
    </AppLayout>
  );
}
