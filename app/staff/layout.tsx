import { requireUser } from '@/lib/auth/session';
import { StaffShell } from '@/components/layout/staff-shell';

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <StaffShell fullName={user.fullName} role={user.role}>
      {children}
    </StaffShell>
  );
}
