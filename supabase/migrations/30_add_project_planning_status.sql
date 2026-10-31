alter type public.project_status
  add value if not exists 'project_planning' after 'awarded';
