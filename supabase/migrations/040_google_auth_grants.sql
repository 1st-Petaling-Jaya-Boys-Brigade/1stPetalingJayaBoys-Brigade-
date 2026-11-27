-- Ensure service_role can issue and clean up member-backed admin sign-ins during verified Google Sign-In.
grant select, insert, delete on public.bb_admin_member_signins to service_role;
