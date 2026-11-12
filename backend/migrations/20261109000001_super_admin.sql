-- M31: one super admin above the admins, who manages the team. A migration of its own, since
-- Postgres can't use a new enum value in the transaction that adds it.
alter type user_role add value 'super_admin' after 'admin';
