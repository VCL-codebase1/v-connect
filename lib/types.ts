export type Role = 'owner' | 'admin' | 'member';
export type Workspace = { id: string; name: string; role: Role };
export type WhatsAppNumber = { id: string; workspace_id: string; label: string; instance_name: string; created_at: string; state?: string; phone?: string; error?: string };
export type Member = { user_id: string; email: string; role: Role; joined_at: string };
export type DashboardData = { demo: boolean; user: { email: string }; workspaces: Workspace[]; numbers: WhatsAppNumber[]; members: Member[]; error?: string };
