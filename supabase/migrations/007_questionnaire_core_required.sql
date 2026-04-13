-- Only the first five version-1 questions are required to finish onboarding.
-- Remaining items improve matching but can be skipped for now.
update public.questions
set required = true
where version = 1 and sort_order between 1 and 5;

update public.questions
set required = false
where version = 1 and sort_order > 5;
