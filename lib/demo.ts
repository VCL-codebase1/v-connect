import type { DashboardData } from './types';
export const demoData: DashboardData = {
  demo: true, user: { email: 'alex@example.com' },
  workspaces: [{ id: 'demo-main', name: 'VCGL Engineering', role: 'owner' }, { id: 'demo-studio', name: 'Design studio', role: 'admin' }],
  numbers: [
    { id: 'demo-1', workspace_id: 'demo-main', label: 'Customer support', instance_name: 'demo-support', created_at: '2026-09-01', state: 'open', phone: '+234 800 000 0101' },
    { id: 'demo-2', workspace_id: 'demo-main', label: 'Sales enquiries', instance_name: 'demo-sales', created_at: '2026-09-02', state: 'open', phone: '+234 800 000 0102' },
    { id: 'demo-3', workspace_id: 'demo-main', label: 'Project updates', instance_name: 'demo-projects', created_at: '2026-09-03', state: 'close' },
  ],
  members: [{ user_id: 'demo-user', email: 'alex@example.com', role: 'owner', joined_at: '2026-09-01' }, { user_id: 'demo-teammate', email: 'sam@example.com', role: 'member', joined_at: '2026-09-02' }],
};
