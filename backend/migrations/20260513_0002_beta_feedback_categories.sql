alter table public.beta_feedback
  drop constraint if exists beta_feedback_category_check;

update public.beta_feedback
set category = 'Saran'
where category = 'Saran Fitur';

alter table public.beta_feedback
  add constraint beta_feedback_category_check
  check (category in ('Bug', 'Saran', 'Fitur Baru', 'Lainnya'));
