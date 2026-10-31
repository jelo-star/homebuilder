import { ContractorProfile, Project } from '@/types/database';

export interface MatchScoreResult {
  score: number;
  reasons: {
    specialty_score: number;
    rating_score: number;
    experience_score: number;
    city_score: number;
    summary: string;
  };
}

export function calculateMatchScore(project: Project, contractor: ContractorProfile): MatchScoreResult {
  // Exclude unapproved or inactive contractors
  if (contractor.verification_status !== 'approved' || !contractor.is_active) {
    return {
      score: 0,
      reasons: {
        specialty_score: 0,
        rating_score: 0,
        experience_score: 0,
        city_score: 0,
        summary: 'Contractor is not approved or inactive',
      },
    };
  }

  // 1. Specialty score (max 35)
  // Fit of house_type, finish_level, and work_type
  let specialtyMatches = 0;
  if (contractor.specialties?.includes(project.house_type)) specialtyMatches++;
  if (contractor.finish_levels?.includes(project.finish_level)) specialtyMatches++;
  if (contractor.work_types?.includes(project.work_type)) specialtyMatches++;

  const specialty_score = Math.round((specialtyMatches / 3) * 35);

  // 2. Rating score (max 25)
  // Scaled by rating_avg (0 to 5) and rating_count (minimum 3 for full weight)
  const minReviews = 3;
  const confidence = Math.min(1, (contractor.rating_count || 0) / minReviews);
  const normalizedRating = (contractor.rating_avg || 0) / 5;
  const rating_score = Math.round(normalizedRating * confidence * 25);

  // 3. Experience score (max 20)
  // Based on years_experience (capped at 10) and completed projects
  const expYears = Math.min(10, contractor.years_experience || 0);
  const expProjects = Math.min(10, contractor.projects_completed || 0);
  const experience_score = Math.round(((expYears * 0.5 + expProjects * 0.5) / 10) * 20);

  // 4. City match score (max 20)
  const normalizedProjectCity = project.city?.trim().toLowerCase();
  const cityMatch = contractor.service_cities?.some(
    (c) => c.trim().toLowerCase() === normalizedProjectCity
  );
  const city_score = cityMatch ? 20 : 0;

  const totalScore = Math.min(100, specialty_score + rating_score + experience_score + city_score);

  const highlights: string[] = [];
  if (cityMatch) highlights.push(`Operates directly in ${project.city}`);
  if (specialtyMatches === 3) highlights.push(`Direct match for ${project.house_type.replace('_', ' ')} ${project.work_type.replace('_', ' ')}`);
  if (contractor.years_experience >= 5) highlights.push(`${contractor.years_experience} years building experience`);
  if (contractor.rating_avg >= 4.5 && contractor.rating_count > 0) highlights.push(`High satisfaction (${contractor.rating_avg.toFixed(1)} ★)`);

  const summary = highlights.length > 0 ? highlights.join(' • ') : 'Compatible contractor';

  return {
    score: totalScore,
    reasons: {
      specialty_score,
      rating_score,
      experience_score,
      city_score,
      summary,
    },
  };
}
