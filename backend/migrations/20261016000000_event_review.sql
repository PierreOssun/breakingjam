-- M14: a jam waits for an admin's approval before going public.
alter type event_status add value 'in_review' after 'draft';

-- Why an admin sent the jam back to draft; cleared by the next status change.
alter table events add column review_note text;
