import { supabase } from '@/lib/supabase';

export interface CrewRole {
  id: string;
  role_key: string;
  role_name: string;
  description: string;
  responsibilities: string[];
  is_applyable: boolean;
  is_active: boolean;
  sort_order: number;
  badge_color: string;
  badge_icon: string;
}

export interface CrewApplication {
  id: string;
  user_id: string;
  role_key: string;
  status: CrewAppStatus;
  motivation: string;
  contribution: string;
  experience: string;
  previous_projects: string;
  proof_links: string[];
  proof_files: string[];
  x_username?: string;
  telegram_username?: string;
  discord_username?: string;
  timezone?: string;
  languages: string[];
  availability_hours?: string;
  work_type?: 'paid' | 'volunteer' | 'performance_based';
  price_rate?: string;
  scenario_spam?: string;
  scenario_bug?: string;
  scenario_conflict?: string;
  trust_statement?: string;
  extra_notes?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  manager_note?: string;
  user_visible_message?: string;
  trial_started_at?: string;
  trial_ends_at?: string;
  submitted_at?: string;
  created_at: string;
  updated_at: string;
  user_profiles?: {
    username?: string;
    display_name?: string;
    avatar_url?: string;
    wallet_address?: string;
    is_verified?: boolean;
    verified_basic?: boolean;
    is_premium?: boolean;
    premium_expires_at?: string;
  };
}

export type CrewAppStatus =
  | 'draft' | 'submitted' | 'under_review' | 'shortlisted'
  | 'trial' | 'accepted' | 'rejected' | 'needs_changes' | 'paused' | 'removed' | 'blacklisted';

export type CrewTaskStatus = 'not_started' | 'submitted' | 'pending_review' | 'needs_changes' | 'approved' | 'rejected';

export interface CrewApplicationTask {
  id: string;
  application_id: string;
  user_id: string;
  task_key: string;
  title: string;
  description: string;
  is_required: boolean;
  proof_required: boolean;
  proof_text?: string;
  proof_links: string[];
  admin_message?: string;
  status: CrewTaskStatus;
  reviewed_by?: string;
  reviewed_at?: string;
  created_at: string;
  updated_at: string;
  // joined
  user_profiles?: { username?: string; display_name?: string; avatar_url?: string };
  crew_applications?: { role_key?: string };
}

export interface CrewMember {
  id: string;
  user_id: string;
  role_key: string;
  status: 'trial' | 'active' | 'paused' | 'removed';
  assigned_by?: string;
  assigned_at: string;
  trial_ends_at?: string;
  public_note?: string;
  internal_note?: string;
  application_id?: string;
  created_at: string;
  updated_at: string;
  user_profiles?: {
    username?: string;
    display_name?: string;
    avatar_url?: string;
    wallet_address?: string;
    bio?: string;
    is_verified?: boolean;
    verified_basic?: boolean;
    is_premium?: boolean;
    premium_expires_at?: string;
    is_founder?: boolean;
  };
  crew_roles?: {
    role_name: string;
    badge_color: string;
    badge_icon: string;
    description: string;
  };
}

export interface UserProfileSearch {
  id: string;
  username?: string;
  display_name?: string;
  avatar_url?: string;
  wallet_address?: string;
  bio?: string;
  is_verified?: boolean;
  verified_basic?: boolean;
  is_premium?: boolean;
  is_founder?: boolean;
}

export interface CrewInternalNote {
  id: string;
  application_id: string;
  target_user_id?: string;
  note: string;
  created_by: string;
  created_at: string;
  creator?: {
    username?: string;
    display_name?: string;
    avatar_url?: string;
  };
  // joined via adminGetAllNotes
  crew_applications?: {
    role_key?: string;
    user_profiles?: { username?: string; display_name?: string; avatar_url?: string };
  };
}

// Tasks seeded per role
const ROLE_TASKS: Record<string, { task_key: string; title: string; description: string; is_required: boolean; proof_required: boolean }[]> = {
  default: [
    { task_key: 'complete_profile', title: 'Complete your DAWEN profile', description: 'Set up your username, avatar photo, and a short bio in your profile settings. A complete profile shows you are serious about joining the team.', is_required: true, proof_required: false },
    { task_key: 'test_app', title: 'Test the DAWEN beta app', description: 'Explore the app: try the trading section, social feed, gaming, DAWEN World, rewards, and settings. Tell us which features you tested and share your first impressions.', is_required: true, proof_required: true },
    { task_key: 'explain_dawen', title: 'Explain what DAWEN is in your own words', description: 'Write 3–5 sentences explaining what DAWEN is to a brand-new user who has never heard of it. Be clear, honest, and in your own words.', is_required: true, proof_required: true },
    { task_key: 'join_socials', title: 'Join / follow DAWEN on socials', description: 'Follow DAWEN on X, join the Telegram group, and join the Discord server. Submit your X username, Telegram username, and Discord username as proof. Official links are shown when you open this task.', is_required: true, proof_required: true },
    { task_key: 'signature_wall', title: 'Sign the DAWEN Signature Wall', description: 'Leave your signature on the DAWEN Signature Wall to show you are part of the early community. Tap "Go to Signature Wall" to sign, then come back and submit.', is_required: true, proof_required: false },
  ],
  raider: [
    { task_key: 'proof_promotion', title: 'Submit 1 proof of organic DAWEN promotion', description: 'Share a post, tweet, or message promoting DAWEN. No bots, no fake engagement. Submit the link or screenshot as proof.', is_required: true, proof_required: true },
  ],
  helper: [
    { task_key: 'sample_support', title: 'Answer a sample support question', description: 'How would you help a new user who says: "I opened the DAWEN app but I cannot find my wallet balance. What do I do?" Write a clear, helpful answer.', is_required: true, proof_required: true },
  ],
  content_creator: [
    { task_key: 'sample_content', title: 'Submit 1 sample content idea or piece', description: 'Create a post, meme, thread idea, or short video concept about DAWEN. Submit the content or a link to it.', is_required: true, proof_required: true },
  ],
  bug_hunter: [
    { task_key: 'bug_report', title: 'Submit 1 real bug report or test feedback', description: 'Find and report a real bug or usability issue in the DAWEN app. Include: what happened, steps to reproduce, expected behavior, and your device/browser.', is_required: true, proof_required: true },
  ],
  moderator: [],
  chiller: [],
  ambassador: [],
  event_host: [],
  world_builder: [],
  launchpad_scout: [],
};

function getTasksForRole(roleKey: string) {
  const roleTasks = ROLE_TASKS[roleKey] ?? [];
  const defaultTasks = ROLE_TASKS.default;
  const combined = [...defaultTasks, ...roleTasks];
  // Deduplicate by task_key
  const seen = new Set<string>();
  return combined.filter(t => {
    if (seen.has(t.task_key)) return false;
    seen.add(t.task_key);
    return true;
  });
}

export const CrewService = {
  // ── Roles ────────────────────────────────────────────────────────────────

  async getRoles(): Promise<CrewRole[]> {
    const { data } = await supabase
      .from('crew_roles')
      .select('*')
      .eq('is_active', true)
      .order('sort_order');
    return (data ?? []) as CrewRole[];
  },

  getApplyableRoles(roles: CrewRole[]): CrewRole[] {
    return roles.filter(r => r.is_applyable);
  },

  // ── Applications ─────────────────────────────────────────────────────────

  async getMyApplications(userId: string): Promise<CrewApplication[]> {
    const { data } = await supabase
      .from('crew_applications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    return (data ?? []) as CrewApplication[];
  },

  async getMyActiveApplication(userId: string): Promise<CrewApplication | null> {
    const { data } = await supabase
      .from('crew_applications')
      .select('*')
      .eq('user_id', userId)
      .not('status', 'in', '("removed","blacklisted")')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data as CrewApplication | null;
  },

  async createApplication(
    userId: string,
    roleKey: string,
    answers: Partial<CrewApplication>
  ): Promise<{ data: CrewApplication | null; error: string | null }> {
    // Check no active application for same role
    const { data: existing } = await supabase
      .from('crew_applications')
      .select('id, status')
      .eq('user_id', userId)
      .eq('role_key', roleKey)
      .not('status', 'in', '("removed","rejected","blacklisted")')
      .maybeSingle();

    if (existing) {
      return { data: null, error: 'You already have an active application for this role.' };
    }

    const { data, error } = await supabase
      .from('crew_applications')
      .insert({
        user_id: userId,
        role_key: roleKey,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        ...answers,
      })
      .select()
      .single();

    if (error || !data) {
      return { data: null, error: error?.message ?? 'Failed to submit application.' };
    }

    // Seed tasks for this application
    const tasks = getTasksForRole(roleKey).map(t => ({
      application_id: data.id,
      user_id: userId,
      ...t,
    }));
    if (tasks.length > 0) {
      await supabase.from('crew_application_tasks').insert(tasks);
    }

    return { data: data as CrewApplication, error: null };
  },

  async updateApplication(
    applicationId: string,
    updates: Partial<CrewApplication>
  ): Promise<{ error: string | null }> {
    const { error } = await supabase
      .from('crew_applications')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', applicationId);
    return { error: error?.message ?? null };
  },

  // ── Tasks ─────────────────────────────────────────────────────────────────

  async getApplicationTasks(applicationId: string): Promise<CrewApplicationTask[]> {
    const { data } = await supabase
      .from('crew_application_tasks')
      .select('*')
      .eq('application_id', applicationId)
      .order('created_at');
    return (data ?? []) as CrewApplicationTask[];
  },

  async updateTask(
    taskId: string,
    updates: { proof_text?: string; proof_links?: string[]; status?: string }
  ): Promise<{ error: string | null }> {
    const { error } = await supabase
      .from('crew_application_tasks')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', taskId);
    return { error: error?.message ?? null };
  },

  // ── Crew Members (public) ─────────────────────────────────────────────────

  async getCrewMembers(): Promise<CrewMember[]> {
    const { data } = await supabase
      .from('crew_members')
      .select(`
        *,
        user_profiles (
          username, display_name, avatar_url, wallet_address, bio,
          is_verified, verified_basic, is_premium, premium_expires_at, is_founder
        ),
        crew_roles (role_name, badge_color, badge_icon, description)
      `)
      .in('status', ['active', 'trial'])
      .order('assigned_at');
    return (data ?? []) as CrewMember[];
  },

  async getFounderProfile(): Promise<UserProfileSearch | null> {
    const { data } = await supabase
      .from('user_profiles')
      .select('id, username, display_name, avatar_url, wallet_address, bio, is_verified, verified_basic, is_premium, is_founder')
      .eq('is_founder', true)
      .maybeSingle();
    return data as UserProfileSearch | null;
  },

  // ── User search (admin) ───────────────────────────────────────────────────

  async searchUsers(query: string): Promise<UserProfileSearch[]> {
    if (!query.trim()) return [];
    const q = query.trim().toLowerCase();
    const { data } = await supabase
      .from('user_profiles')
      .select('id, username, display_name, avatar_url, wallet_address, bio, is_verified, verified_basic, is_premium, is_founder')
      .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
      .limit(20);
    return (data ?? []) as UserProfileSearch[];
  },

  async getUserMemberships(userId: string): Promise<CrewMember[]> {
    const { data } = await supabase
      .from('crew_members')
      .select(`
        *,
        crew_roles (role_name, badge_color, badge_icon, description)
      `)
      .eq('user_id', userId)
      .neq('status', 'removed')
      .order('assigned_at');
    return (data ?? []) as CrewMember[];
  },

  async adminRemoveMember(memberId: string): Promise<{ error: string | null }> {
    const { error } = await supabase
      .from('crew_members')
      .update({ status: 'removed', updated_at: new Date().toISOString() })
      .eq('id', memberId);
    return { error: error?.message ?? null };
  },

  // ── Admin: Applications ───────────────────────────────────────────────────

  async adminGetApplications(filters?: {
    status?: string;
    role_key?: string;
    search?: string;
  }): Promise<CrewApplication[]> {
    let query = supabase
      .from('crew_applications')
      .select(`
        *,
        user_profiles (
          username, display_name, avatar_url, wallet_address,
          is_verified, verified_basic, is_premium, premium_expires_at
        )
      `)
      .order('created_at', { ascending: false });

    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.role_key) query = query.eq('role_key', filters.role_key);

    const { data } = await query;
    let result = (data ?? []) as CrewApplication[];

    if (filters?.search) {
      const s = filters.search.toLowerCase();
      result = result.filter(a =>
        a.user_profiles?.username?.toLowerCase().includes(s) ||
        a.user_profiles?.display_name?.toLowerCase().includes(s)
      );
    }

    return result;
  },

  async adminGetApplicationWithTasks(applicationId: string): Promise<{
    application: CrewApplication | null;
    tasks: CrewApplicationTask[];
    notes: CrewInternalNote[];
  }> {
    const [appRes, tasksRes, notesRes] = await Promise.all([
      supabase
        .from('crew_applications')
        .select(`
          *,
          user_profiles (
            username, display_name, avatar_url, wallet_address,
            is_verified, verified_basic, is_premium, premium_expires_at
          )
        `)
        .eq('id', applicationId)
        .maybeSingle(),
      supabase
        .from('crew_application_tasks')
        .select('*')
        .eq('application_id', applicationId)
        .order('created_at'),
      supabase
        .from('crew_internal_notes')
        .select(`*, creator:created_by(username, display_name, avatar_url)`)
        .eq('application_id', applicationId)
        .order('created_at', { ascending: false }),
    ]);

    return {
      application: appRes.data as CrewApplication | null,
      tasks: (tasksRes.data ?? []) as CrewApplicationTask[],
      notes: (notesRes.data ?? []) as CrewInternalNote[],
    };
  },

  async adminUpdateApplicationStatus(
    applicationId: string,
    status: CrewAppStatus,
    reviewerId: string,
    userVisibleMessage?: string,
    managerNote?: string,
    trialDays?: number
  ): Promise<{ error: string | null }> {
    const updates: Record<string, unknown> = {
      status,
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (userVisibleMessage) updates.user_visible_message = userVisibleMessage;
    if (managerNote) updates.manager_note = managerNote;
    if (status === 'trial' && trialDays) {
      updates.trial_started_at = new Date().toISOString();
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + trialDays);
      updates.trial_ends_at = trialEnd.toISOString();
    }

    const { error } = await supabase
      .from('crew_applications')
      .update(updates)
      .eq('id', applicationId);
    return { error: error?.message ?? null };
  },

  async adminAssignMember(
    userId: string,
    roleKey: string,
    assignedById: string,
    applicationId?: string,
    isTrial = false,
    trialDays = 7
  ): Promise<{ error: string | null }> {
    const status = isTrial ? 'trial' : 'active';
    const memberData: Record<string, unknown> = {
      user_id: userId,
      role_key: roleKey,
      status,
      assigned_by: assignedById,
      assigned_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (applicationId) memberData.application_id = applicationId;
    if (isTrial && trialDays) {
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + trialDays);
      memberData.trial_ends_at = trialEnd.toISOString();
    }

    // Try insert first; if conflict on (user_id, role_key), update with new status
    const { error: insertErr } = await supabase
      .from('crew_members')
      .insert(memberData);

    if (insertErr) {
      // Row already exists — update it (do not use upsert which may reset status unexpectedly)
      const updatePayload: Record<string, unknown> = {
        status,
        assigned_by: assignedById,
        assigned_at: memberData.assigned_at,
        updated_at: memberData.updated_at,
      };
      if (applicationId) updatePayload.application_id = applicationId;
      if (isTrial && memberData.trial_ends_at) updatePayload.trial_ends_at = memberData.trial_ends_at;

      const { error: updateErr } = await supabase
        .from('crew_members')
        .update(updatePayload)
        .eq('user_id', userId)
        .eq('role_key', roleKey);
      return { error: updateErr?.message ?? null };
    }

    return { error: null };
  },

  async adminUpdateMemberStatus(
    memberId: string,
    status: 'trial' | 'active' | 'paused' | 'removed'
  ): Promise<{ error: string | null }> {
    const { error } = await supabase
      .from('crew_members')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', memberId);
    return { error: error?.message ?? null };
  },

  async adminAddNote(
    applicationId: string,
    createdById: string,
    note: string,
    targetUserId?: string
  ): Promise<{ error: string | null }> {
    const { error } = await supabase.from('crew_internal_notes').insert({
      application_id: applicationId,
      created_by: createdById,
      note,
      target_user_id: targetUserId ?? null,
    });
    return { error: error?.message ?? null };
  },

  async adminReviewTask(
    taskId: string,
    status: 'approved' | 'rejected' | 'needs_changes',
    reviewerId: string,
    adminMessage?: string
  ): Promise<{ error: string | null }> {
    const updates: Record<string, unknown> = {
      status,
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (adminMessage) updates.admin_message = adminMessage;
    const { error } = await supabase
      .from('crew_application_tasks')
      .update(updates)
      .eq('id', taskId);
    return { error: error?.message ?? null };
  },

  // ── Admin: Tasks grouped by applicant ────────────────────────────────────

  async adminGetTasksGroupedByApplicant(): Promise<Array<{
    application: CrewApplication;
    tasks: CrewApplicationTask[];
    pendingCount: number;
    approvedCount: number;
    rejectedCount: number;
    totalCount: number;
    lastSubmitted?: string;
  }>> {
    const [appsRes, tasksRes] = await Promise.all([
      supabase
        .from('crew_applications')
        .select(`
          *,
          user_profiles (
            username, display_name, avatar_url, wallet_address,
            is_verified, verified_basic, is_premium, premium_expires_at
          )
        `)
        .in('status', ['submitted', 'under_review', 'shortlisted', 'trial', 'needs_changes'])
        .order('submitted_at', { ascending: false }),
      supabase
        .from('crew_application_tasks')
        .select('*')
        .order('updated_at', { ascending: false }),
    ]);

    const apps = (appsRes.data ?? []) as CrewApplication[];
    const allTasks = (tasksRes.data ?? []) as CrewApplicationTask[];

    return apps.map(app => {
      const tasks = allTasks.filter(t => t.application_id === app.id);
      const pendingCount = tasks.filter(t => t.status === 'pending_review' || t.status === 'submitted').length;
      const approvedCount = tasks.filter(t => t.status === 'approved').length;
      const rejectedCount = tasks.filter(t => t.status === 'rejected' || t.status === 'needs_changes').length;
      const submitted = tasks
        .filter(t => t.status !== 'not_started')
        .map(t => t.updated_at)
        .sort()
        .at(-1);
      return { application: app, tasks, pendingCount, approvedCount, rejectedCount, totalCount: tasks.length, lastSubmitted: submitted };
    }).filter(g => g.tasks.length > 0);
  },

  // ── Admin: Fetch all notes with applicant context ─────────────────────────

  async adminGetAllNotes(limit = 100): Promise<CrewInternalNote[]> {
    const { data } = await supabase
      .from('crew_internal_notes')
      .select(`
        *,
        creator:created_by(username, display_name, avatar_url),
        crew_applications(role_key, user_profiles(username, display_name, avatar_url))
      `)
      .order('created_at', { ascending: false })
      .limit(limit);
    return (data ?? []) as CrewInternalNote[];
  },

  // ── Admin: Fetch all tasks for review ─────────────────────────────────────

  async adminGetAllTasksForReview(statusFilter?: string): Promise<CrewApplicationTask[]> {
    let q = supabase
      .from('crew_application_tasks')
      .select(`
        *,
        user_profiles:user_id(username, display_name, avatar_url),
        crew_applications:application_id(role_key)
      `)
      .order('updated_at', { ascending: false })
      .limit(300);
    if (statusFilter && statusFilter !== '') {
      q = q.eq('status', statusFilter);
    }
    const { data } = await q;
    return (data ?? []) as CrewApplicationTask[];
  },

  // ── Admin: Get task counts for a set of application IDs ──────────────────

  async adminGetTaskCounts(applicationIds: string[]): Promise<Record<string, { total: number; done: number }>> {
    if (!applicationIds.length) return {};
    const { data } = await supabase
      .from('crew_application_tasks')
      .select('application_id, status')
      .in('application_id', applicationIds);
    const counts: Record<string, { total: number; done: number }> = {};
    for (const t of (data ?? [])) {
      if (!counts[t.application_id]) counts[t.application_id] = { total: 0, done: 0 };
      counts[t.application_id].total++;
      if (t.status === 'approved') counts[t.application_id].done++;
    }
    return counts;
  },

  getTaskStatusLabel(status: CrewTaskStatus): string {
    const map: Record<CrewTaskStatus, string> = {
      not_started: 'Not Started',
      submitted: 'Submitted',
      pending_review: 'Pending Review',
      needs_changes: 'Needs Changes',
      approved: 'Approved',
      rejected: 'Rejected',
    };
    return map[status] ?? status;
  },

  getTaskStatusColor(status: CrewTaskStatus): string {
    const map: Record<CrewTaskStatus, string> = {
      not_started: '#6B7280',
      submitted: '#3B82F6',
      pending_review: '#F59E0B',
      needs_changes: '#F97316',
      approved: '#10B981',
      rejected: '#EF4444',
    };
    return map[status] ?? '#6B7280';
  },

  // ── Notifications ─────────────────────────────────────────────────────────

  async notifyAdmins(
    applicantUserId: string,
    roleKey: string,
    roleName: string
  ): Promise<void> {
    // Notify crew members with founder/community_manager role
    const { data: admins } = await supabase
      .from('crew_members')
      .select('user_id')
      .in('role_key', ['founder', 'community_manager'])
      .eq('status', 'active');

    if (!admins?.length) return;

    const rows = admins
      .filter(a => a.user_id !== applicantUserId)
      .map(a => ({
        user_id: a.user_id,
        actor_id: applicantUserId,
        type: 'mention',
        post_id: null,
        message: `New DAWEN Crew application received for ${roleName}.`,
      }));

    if (rows.length > 0) {
      await supabase.from('notifications').insert(rows);
    }
  },

  async notifyApplicant(
    userId: string,
    actorId: string,
    message: string
  ): Promise<void> {
    await supabase.from('notifications').insert({
      user_id: userId,
      actor_id: actorId,
      type: 'mention',
      post_id: null,
      message,
    });
  },

  // ── Helpers ───────────────────────────────────────────────────────────────

  getStatusLabel(status: CrewAppStatus): string {
    const map: Record<CrewAppStatus, string> = {
      draft: 'Draft',
      submitted: 'Submitted',
      under_review: 'Under Review',
      shortlisted: 'Shortlisted',
      trial: 'Trial',
      accepted: 'Accepted',
      rejected: 'Rejected',
      needs_changes: 'Needs Changes',
      paused: 'Paused',
      removed: 'Removed',
      blacklisted: 'Blacklisted',
    };
    return map[status] ?? status;
  },

  getStatusColor(status: CrewAppStatus): string {
    const map: Record<CrewAppStatus, string> = {
      draft: '#6B7280',
      submitted: '#3B82F6',
      under_review: '#F59E0B',
      shortlisted: '#8B5CF6',
      trial: '#06B6D4',
      accepted: '#10B981',
      rejected: '#EF4444',
      needs_changes: '#F97316',
      paused: '#9CA3AF',
      removed: '#EF4444',
      blacklisted: '#DC2626',
    };
    return map[status] ?? '#6B7280';
  },

  isAdminRole(roleKey: string): boolean {
    return roleKey === 'founder' || roleKey === 'community_manager';
  },

  isFounderRole(roleKey: string): boolean {
    return roleKey === 'founder';
  },

  canManageFounderRole(myRoleKeys: string[], isFounder: boolean): boolean {
    return isFounder;
  },

  canAssignRole(targetRoleKey: string, myRoleKeys: string[], isFounder: boolean): boolean {
    if (isFounder) return true;
    if (myRoleKeys.includes('community_manager')) {
      // Community Manager cannot assign founder or community_manager
      return targetRoleKey !== 'founder' && targetRoleKey !== 'community_manager';
    }
    return false;
  },
};
