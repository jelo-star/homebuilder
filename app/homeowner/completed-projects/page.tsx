'use client';

import React from 'react';
import Link from 'next/link';
import AppLayout from '@/components/ui/AppLayout';
import { AlertCircle, Building2, CheckCircle2, ChevronRight, MapPin } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { MilestoneStatus, Project } from '@/types/database';

type CompletedProject = Pick<
  Project,
  'id' | 'title' | 'status' | 'city' | 'province' | 'floor_area_sqm' | 'floors' | 'updated_at' | 'plan_file_path'
>;

type ProjectMilestoneStatus = Pick<Project, 'id'> & {
  project_id: string;
  status: MilestoneStatus;
};

function isComplete(project: CompletedProject, milestones: ProjectMilestoneStatus[]): boolean {
  return project.status === 'completed'
    || (milestones.length > 0 && milestones.every(milestone =>
      milestone.status === 'approved' || milestone.status === 'paid'
    ));
}

export default function HomeownerCompletedProjectsPage() {
  const [projects, setProjects] = React.useState<CompletedProject[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState('');

  React.useEffect(() => {
    let active = true;

    async function loadCompletedProjects() {
      try {
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!user) throw new Error('Your session has expired. Please sign in again.');

        const { data: projectRows, error: projectsError } = await supabase
          .from('projects')
          .select('id, title, status, city, province, floor_area_sqm, floors, updated_at, plan_file_path')
          .eq('homeowner_id', user.id)
          .order('updated_at', { ascending: false });
        if (projectsError) throw projectsError;

        const ownedProjects = (projectRows || []) as CompletedProject[];
        const projectIds = ownedProjects.map(project => project.id);
        const milestonesResult = projectIds.length
          ? await supabase
            .from('milestones')
            .select('id, project_id, status')
            .in('project_id', projectIds)
          : { data: [], error: null };
        if (milestonesResult.error) throw milestonesResult.error;

        const milestonesByProjectId = new Map<string, ProjectMilestoneStatus[]>();
        for (const milestone of (milestonesResult.data || []) as ProjectMilestoneStatus[]) {
          const projectMilestones = milestonesByProjectId.get(milestone.project_id) || [];
          projectMilestones.push(milestone);
          milestonesByProjectId.set(milestone.project_id, projectMilestones);
        }

        const completedProjects = ownedProjects.filter(project =>
          isComplete(project, milestonesByProjectId.get(project.id) || [])
        );
        if (active) setProjects(completedProjects);
      } catch (error) {
        if (active) {
          setLoadError(error instanceof Error ? error.message : 'Completed projects could not be loaded.');
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadCompletedProjects();
    return () => {
      active = false;
    };
  }, []);

  return (
    <AppLayout
      userRole="homeowner"
      title="Completed Projects"
      subtitle="Review your finished projects and their details."
    >
      <div className="mx-auto w-full max-w-[1500px] space-y-6">
        <section className="flex flex-col gap-3 rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-50 to-white p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Your completed projects</h2>
            <p className="mt-1 text-sm text-slate-600">Completed work is kept here, separate from your active project dashboard.</p>
          </div>
          {!loading && <span className="text-sm font-semibold text-emerald-700">{projects.length} completed</span>}
        </section>

        {loadError && (
          <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <span>Completed projects could not be loaded: {loadError}</span>
          </div>
        )}

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map(item => <div key={item} className="h-52 animate-pulse rounded-2xl bg-slate-100" />)}
          </div>
        ) : loadError ? null : projects.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-14 text-center">
            <Building2 className="mx-auto h-10 w-10 text-slate-300" />
            <h3 className="mt-3 text-base font-bold text-slate-900">No completed projects yet</h3>
            <p className="mt-1 text-sm text-slate-500">Projects will appear here after all milestones are approved or paid.</p>
            <Link href="/homeowner/dashboard" className="mt-5 inline-flex items-center gap-1 text-sm font-bold text-blue-600 hover:text-blue-700">
              Back to Dashboard <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {projects.map(project => (
              <article key={project.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div
                  className="flex h-40 items-center justify-center bg-gradient-to-br from-blue-100 via-slate-100 to-blue-50 bg-cover bg-center"
                  style={project.plan_file_path ? { backgroundImage: `url("${project.plan_file_path}")` } : undefined}
                  aria-label={project.plan_file_path ? `${project.title} project image` : undefined}
                >
                  {!project.plan_file_path && <Building2 className="h-10 w-10 text-blue-200" />}
                </div>
                <div className="space-y-3 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-bold text-slate-900">{project.title}</h3>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">
                      <CheckCircle2 className="h-3 w-3" /> Completed
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                    {(project.city || project.province) && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {[project.city, project.province].filter(Boolean).join(', ')}
                      </span>
                    )}
                    {project.floor_area_sqm && <span>{project.floor_area_sqm} sq.m</span>}
                    {project.floors && <span>{project.floors} floor{project.floors === 1 ? '' : 's'}</span>}
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                    <span className="text-[11px] text-slate-400">Updated {new Date(project.updated_at).toLocaleDateString()}</span>
                    <Link href={`/homeowner/projects/${project.id}`} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700">
                      View Details <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
