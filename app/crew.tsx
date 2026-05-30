import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, ActivityIndicator, Modal, Image, Platform,
  RefreshControl, KeyboardAvoidingView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Shield, Users, Star, Zap, Circle as HelpCircle, Video, Globe, Bug, Calendar, Hop as Home, Rocket, Crown, ChevronRight, ChevronDown, ChevronUp, Check, X, Send, Clock, TriangleAlert as AlertTriangle, CircleCheck as CheckCircle, FileText, Trash2, Play } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, fontSize, borderRadius, fontWeight } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useWallet } from '@/contexts/WalletContext';
import { CrewService, CrewRole, CrewApplication, CrewApplicationTask, CrewMember, CrewAppStatus, CrewInternalNote } from '@/services/crewService';
import { VerificationService } from '@/services/verificationService';

// ── Tab types ─────────────────────────────────────────────────────────────────

type UserTab = 'overview' | 'roles' | 'apply' | 'my_application' | 'hierarchy' | 'members';
type AdminTab = 'overview' | 'applications' | 'trial' | 'members' | 'task_review' | 'permissions' | 'badges' | 'notes';

// ── Icon map ──────────────────────────────────────────────────────────────────

function RoleIcon({ icon, size = 16, color }: { icon: string; size?: number; color: string }) {
  const props = { size, color, strokeWidth: 2 };
  switch (icon) {
    case 'crown': return <Crown {...props} />;
    case 'users': return <Users {...props} />;
    case 'shield': return <Shield {...props} />;
    case 'smile': return <Star {...props} />;
    case 'zap': return <Zap {...props} />;
    case 'help-circle': return <HelpCircle {...props} />;
    case 'video': return <Video {...props} />;
    case 'globe': return <Globe {...props} />;
    case 'bug': return <Bug {...props} />;
    case 'calendar': return <Calendar {...props} />;
    case 'home': return <Home {...props} />;
    case 'rocket': return <Rocket {...props} />;
    default: return <Shield {...props} />;
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function RoleBadge({ roleKey, roleName, color, icon, small = false }: {
  roleKey: string; roleName: string; color: string; icon: string; small?: boolean;
}) {
  return (
    <View style={[styles.roleBadge, { backgroundColor: color + '22', borderColor: color + '55' }, small && styles.roleBadgeSmall]}>
      <RoleIcon icon={icon} size={small ? 10 : 12} color={color} />
      <Text style={[styles.roleBadgeText, { color }, small && styles.roleBadgeTextSmall]}>{roleName}</Text>
    </View>
  );
}

function StatusChip({ status }: { status: CrewAppStatus | 'trial' | 'active' | 'paused' }) {
  const color = CrewService.getStatusColor(status as CrewAppStatus);
  const label = status === 'active' ? 'Active' : status === 'trial' ? 'Trial' : status === 'paused' ? 'Paused' : CrewService.getStatusLabel(status as CrewAppStatus);
  return (
    <View style={[styles.statusChip, { backgroundColor: color + '22', borderColor: color + '44' }]}>
      <View style={[styles.statusDot, { backgroundColor: color }]} />
      <Text style={[styles.statusChipText, { color }]}>{label}</Text>
    </View>
  );
}

function MemberCard({ member, roles }: { member: CrewMember; roles: CrewRole[] }) {
  const p = member.user_profiles;
  const role = roles.find(r => r.role_key === member.role_key);
  const isPremium = p ? VerificationService.isPremiumActive(p as any) : false;
  const isVerified = p?.is_verified || p?.verified_basic;
  const displayName = p?.display_name || p?.username || 'Unknown';
  const username = p?.username ? `@${p.username}` : '';

  return (
    <View style={styles.memberCard}>
      <View style={styles.memberCardAvatar}>
        {p?.avatar_url ? (
          <Image source={{ uri: p.avatar_url }} style={styles.memberAvatar} />
        ) : (
          <LinearGradient colors={[role?.badge_color + '66' ?? '#8B5CF666', role?.badge_color + '33' ?? '#8B5CF633']} style={styles.memberAvatarPlaceholder}>
            <Text style={[styles.memberAvatarInitial, { color: role?.badge_color ?? '#8B5CF6' }]}>
              {displayName[0]?.toUpperCase() ?? '?'}
            </Text>
          </LinearGradient>
        )}
        <View style={styles.memberCardBadges}>
          {isPremium && <View style={styles.premiumDot} />}
          {isVerified && !isPremium && <View style={styles.verifiedDot} />}
        </View>
      </View>
      <View style={styles.memberCardInfo}>
        <Text style={styles.memberCardName} numberOfLines={1}>{displayName}</Text>
        {username ? <Text style={styles.memberCardUsername} numberOfLines={1}>{username}</Text> : null}
        {role ? (
          <RoleBadge roleKey={role.role_key} roleName={role.role_name} color={role.badge_color} icon={role.badge_icon} small />
        ) : null}
      </View>
      <View style={styles.memberCardRight}>
        <StatusChip status={member.status as any} />
      </View>
    </View>
  );
}

function ApplicationCard({ app, roles, onPress }: { app: CrewApplication; roles: CrewRole[]; onPress: () => void }) {
  const p = app.user_profiles;
  const role = roles.find(r => r.role_key === app.role_key);
  const displayName = p?.display_name || p?.username || 'Unknown';
  const isPremium = p ? VerificationService.isPremiumActive(p as any) : false;
  const isVerified = p?.is_verified || p?.verified_basic;
  const date = app.submitted_at ? new Date(app.submitted_at).toLocaleDateString() : '';

  return (
    <TouchableOpacity style={styles.appCard} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.appCardHeader}>
        <View style={styles.appCardAvatarWrap}>
          {p?.avatar_url ? (
            <Image source={{ uri: p.avatar_url }} style={styles.appCardAvatar} />
          ) : (
            <LinearGradient colors={['#8B5CF633', '#8B5CF611']} style={styles.appCardAvatarPlaceholder}>
              <Text style={styles.appCardAvatarInitial}>{displayName[0]?.toUpperCase() ?? '?'}</Text>
            </LinearGradient>
          )}
          {isPremium && <View style={[styles.miniDot, { backgroundColor: '#A855F7' }]} />}
          {isVerified && !isPremium && <View style={[styles.miniDot, { backgroundColor: '#3B82F6' }]} />}
        </View>
        <View style={styles.appCardInfo}>
          <Text style={styles.appCardName} numberOfLines={1}>{displayName}</Text>
          {p?.username && <Text style={styles.appCardUsername}>@{p.username}</Text>}
        </View>
        <StatusChip status={app.status as CrewAppStatus} />
      </View>
      {role && (
        <View style={styles.appCardRole}>
          <RoleBadge roleKey={role.role_key} roleName={role.role_name} color={role.badge_color} icon={role.badge_icon} />
          {date ? <Text style={styles.appCardDate}>{date}</Text> : null}
        </View>
      )}
      <ChevronRight size={14} color={colors.textMuted} strokeWidth={2} style={styles.appCardChevron} />
    </TouchableOpacity>
  );
}

function RoleCard({ role, onApply, canApply }: { role: CrewRole; onApply: () => void; canApply: boolean }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={[styles.roleCard, { borderColor: role.badge_color + '33' }]}>
      <TouchableOpacity style={styles.roleCardHeader} onPress={() => setExpanded(v => !v)} activeOpacity={0.8}>
        <View style={[styles.roleIconCircle, { backgroundColor: role.badge_color + '22', borderColor: role.badge_color + '44' }]}>
          <RoleIcon icon={role.badge_icon} size={20} color={role.badge_color} />
        </View>
        <View style={styles.roleCardMeta}>
          <Text style={styles.roleCardName}>{role.role_name}</Text>
          <Text style={styles.roleCardDesc} numberOfLines={2}>{role.description}</Text>
        </View>
        {expanded ? <ChevronUp size={16} color={colors.textMuted} /> : <ChevronDown size={16} color={colors.textMuted} />}
      </TouchableOpacity>
      {expanded && (
        <View style={styles.roleCardExpanded}>
          <Text style={styles.roleCardResponsTitle}>Responsibilities</Text>
          {(role.responsibilities ?? []).map((r, i) => (
            <View key={i} style={styles.responsiRow}>
              <View style={[styles.responsiDot, { backgroundColor: role.badge_color }]} />
              <Text style={styles.responsiText}>{r}</Text>
            </View>
          ))}
          {canApply && (
            <TouchableOpacity
              style={[styles.applyBtn, { borderColor: role.badge_color + '55', backgroundColor: role.badge_color + '11' }]}
              onPress={onApply}
              activeOpacity={0.8}
            >
              <Text style={[styles.applyBtnText, { color: role.badge_color }]}>Apply for this Role</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

// ── Application Form ──────────────────────────────────────────────────────────

interface AppFormProps {
  roles: CrewRole[];
  userId: string;
  onSubmit: () => void;
  preselectedRole?: string;
}

function ApplicationForm({ roles, userId, onSubmit, preselectedRole }: AppFormProps) {
  const applyableRoles = roles.filter(r => r.is_applyable);
  const [roleKey, setRoleKey] = useState(preselectedRole ?? '');
  const [form, setForm] = useState({
    motivation: '', contribution: '', experience: '',
    previous_projects: '', proof_links_text: '',
    x_username: '', telegram_username: '', discord_username: '',
    timezone: '', languages_text: '', availability_hours: '',
    work_type: 'volunteer' as 'paid' | 'volunteer' | 'performance_based',
    price_rate: '', scenario_spam: '', scenario_bug: '',
    scenario_conflict: '', trust_statement: '', extra_notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showRolePicker, setShowRolePicker] = useState(false);

  const selectedRole = applyableRoles.find(r => r.role_key === roleKey);

  const set = (key: keyof typeof form) => (val: string) => setForm(f => ({ ...f, [key]: val }));

  const handleSubmit = async () => {
    if (!roleKey) { setError('Please select a role.'); return; }
    if (!form.motivation.trim()) { setError('Please explain your motivation.'); return; }
    if (!form.experience.trim() && !form.contribution.trim()) { setError('Please describe your experience or what you can contribute.'); return; }
    if (!form.availability_hours.trim()) { setError('Please provide your availability.'); return; }

    setSubmitting(true);
    setError('');

    const proofLinks = form.proof_links_text
      .split('\n').map(l => l.trim()).filter(Boolean);
    const languages = form.languages_text
      .split(',').map(l => l.trim()).filter(Boolean);

    const { data, error: err } = await CrewService.createApplication(userId, roleKey, {
      motivation: form.motivation,
      contribution: form.contribution,
      experience: form.experience,
      previous_projects: form.previous_projects,
      proof_links: proofLinks,
      x_username: form.x_username || undefined,
      telegram_username: form.telegram_username || undefined,
      discord_username: form.discord_username || undefined,
      timezone: form.timezone || undefined,
      languages,
      availability_hours: form.availability_hours,
      work_type: form.work_type,
      price_rate: form.price_rate || undefined,
      scenario_spam: form.scenario_spam,
      scenario_bug: form.scenario_bug,
      scenario_conflict: form.scenario_conflict,
      trust_statement: form.trust_statement,
      extra_notes: form.extra_notes,
    });

    if (err || !data) {
      setError(err ?? 'Failed to submit. Please try again.');
      setSubmitting(false);
      return;
    }

    // Notify admins
    await CrewService.notifyAdmins(userId, roleKey, selectedRole?.role_name ?? roleKey);
    setSubmitting(false);
    onSubmit();
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Text style={styles.formSectionTitle}>Select Role</Text>
      <TouchableOpacity style={styles.rolePicker} onPress={() => setShowRolePicker(v => !v)} activeOpacity={0.8}>
        {selectedRole ? (
          <View style={styles.rolePickerSelected}>
            <RoleIcon icon={selectedRole.badge_icon} size={16} color={selectedRole.badge_color} />
            <Text style={[styles.rolePickerText, { color: selectedRole.badge_color }]}>{selectedRole.role_name}</Text>
          </View>
        ) : (
          <Text style={styles.rolePickerPlaceholder}>Choose a role...</Text>
        )}
        <ChevronDown size={16} color={colors.textMuted} />
      </TouchableOpacity>

      {showRolePicker && (
        <View style={styles.rolePickerDropdown}>
          {applyableRoles.map(r => (
            <TouchableOpacity
              key={r.role_key}
              style={[styles.rolePickerItem, roleKey === r.role_key && styles.rolePickerItemActive]}
              onPress={() => { setRoleKey(r.role_key); setShowRolePicker(false); }}
              activeOpacity={0.8}
            >
              <RoleIcon icon={r.badge_icon} size={14} color={r.badge_color} />
              <Text style={[styles.rolePickerItemText, { color: r.badge_color }]}>{r.role_name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <Text style={styles.formSectionTitle}>Your Motivation</Text>
      <FormField
        label="Why do you want this role? *"
        value={form.motivation}
        onChange={set('motivation')}
        multiline placeholder="Tell us why you want to join the DAWEN Crew..."
      />
      <FormField
        label="What can you bring to DAWEN? *"
        value={form.contribution}
        onChange={set('contribution')}
        multiline placeholder="Your unique skills, ideas, and what makes you stand out..."
      />
      <FormField
        label="Previous experience"
        value={form.experience}
        onChange={set('experience')}
        multiline placeholder="Communities or projects you have helped before..."
      />
      <FormField
        label="Communities / projects you helped before"
        value={form.previous_projects}
        onChange={set('previous_projects')}
        multiline placeholder="List any relevant communities, DAOs, or projects..."
      />
      <FormField
        label="Proof / links of previous work"
        value={form.proof_links_text}
        onChange={set('proof_links_text')}
        multiline placeholder="Paste links one per line (Twitter, Discord, GitHub, etc.)"
      />

      <Text style={styles.formSectionTitle}>Contact Info</Text>
      <FormField label="X (Twitter) username" value={form.x_username} onChange={set('x_username')} placeholder="@yourhandle" />
      <FormField label="Telegram username" value={form.telegram_username} onChange={set('telegram_username')} placeholder="@yourhandle" />
      <FormField label="Discord username" value={form.discord_username} onChange={set('discord_username')} placeholder="username#0000" />

      <Text style={styles.formSectionTitle}>Availability</Text>
      <FormField label="Timezone" value={form.timezone} onChange={set('timezone')} placeholder="e.g. UTC+2, EST, GMT" />
      <FormField label="Languages spoken" value={form.languages_text} onChange={set('languages_text')} placeholder="English, Spanish, French..." />
      <FormField label="Hours available per day/week *" value={form.availability_hours} onChange={set('availability_hours')} placeholder="e.g. 2h/day, 10h/week" />

      <Text style={styles.formSectionTitle}>Work Arrangement</Text>
      <View style={styles.workTypeRow}>
        {(['volunteer', 'performance_based', 'paid'] as const).map(wt => (
          <TouchableOpacity
            key={wt}
            style={[styles.workTypeBtn, form.work_type === wt && styles.workTypeBtnActive]}
            onPress={() => setForm(f => ({ ...f, work_type: wt }))}
            activeOpacity={0.8}
          >
            <Text style={[styles.workTypeBtnText, form.work_type === wt && styles.workTypeBtnTextActive]}>
              {wt === 'performance_based' ? 'Performance' : wt.charAt(0).toUpperCase() + wt.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {form.work_type === 'paid' && (
        <FormField label="Rate / price" value={form.price_rate} onChange={set('price_rate')} placeholder="e.g. $50/month, 500 USDC/month" />
      )}

      <Text style={styles.formSectionTitle}>Situational Questions</Text>
      <FormField
        label="What would you do if someone spams or scams in the group?"
        value={form.scenario_spam} onChange={set('scenario_spam')} multiline
        placeholder="Describe your response..."
      />
      <FormField
        label="What would you do if users complain about a bug?"
        value={form.scenario_bug} onChange={set('scenario_bug')} multiline
        placeholder="Describe your response..."
      />
      <FormField
        label="What would you do if people start fighting in chat?"
        value={form.scenario_conflict} onChange={set('scenario_conflict')} multiline
        placeholder="Describe your response..."
      />

      <Text style={styles.formSectionTitle}>Trust & Final Notes</Text>
      <FormField
        label="Why should we trust you?"
        value={form.trust_statement} onChange={set('trust_statement')} multiline
        placeholder="What makes you reliable and trustworthy..."
      />
      <FormField
        label="Anything else we should know?"
        value={form.extra_notes} onChange={set('extra_notes')} multiline
        placeholder="Any other information you want to add..."
      />

      {error ? (
        <View style={styles.formError}>
          <AlertTriangle size={13} color="#EF4444" strokeWidth={2} />
          <Text style={styles.formErrorText}>{error}</Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={[styles.submitBtn, submitting && styles.btnDisabled]}
        onPress={handleSubmit}
        activeOpacity={0.8}
        disabled={submitting}
      >
        {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Send size={16} color="#fff" strokeWidth={2} />}
        <Text style={styles.submitBtnText}>Submit Application</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

function FormField({ label, value, onChange, multiline, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; multiline?: boolean; placeholder?: string;
}) {
  return (
    <View style={styles.formField}>
      <Text style={styles.formFieldLabel}>{label}</Text>
      <TextInput
        style={[styles.formInput, multiline && styles.formInputMulti]}
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
    </View>
  );
}

// ── Hierarchy display ─────────────────────────────────────────────────────────

function HierarchyView({ roles, members }: { roles: CrewRole[]; members: CrewMember[] }) {
  const roleOrder = ['founder', 'community_manager', 'moderator', 'chiller', 'raider', 'helper', 'content_creator', 'ambassador', 'bug_hunter', 'event_host', 'world_builder', 'launchpad_scout'];

  return (
    <View style={styles.hierarchyWrap}>
      <Text style={styles.sectionTitle}>DAWEN Crew Hierarchy</Text>
      {roleOrder.map((rk, idx) => {
        const role = roles.find(r => r.role_key === rk);
        if (!role) return null;
        const roleMembers = members.filter(m => m.role_key === rk);
        const isTop = idx === 0;
        const isManager = idx === 1;

        return (
          <View key={rk} style={styles.hierarchyLevel}>
            {idx > 0 && <View style={[styles.hierarchyConnector, idx === 1 && styles.hierarchyConnectorTop]} />}
            <View style={[
              styles.hierarchyRoleBlock,
              isTop && styles.hierarchyRoleBlockTop,
              isManager && styles.hierarchyRoleBlockManager,
            ]}>
              <View style={[styles.hierarchyRoleIcon, { backgroundColor: role.badge_color + '22', borderColor: role.badge_color + '44' }]}>
                <RoleIcon icon={role.badge_icon} size={isTop ? 22 : isManager ? 18 : 15} color={role.badge_color} />
              </View>
              <View style={styles.hierarchyRoleMeta}>
                <Text style={[styles.hierarchyRoleName, { color: role.badge_color }, isTop && styles.hierarchyRoleNameTop]}>
                  {role.role_name}
                </Text>
                <Text style={styles.hierarchyRoleDesc} numberOfLines={2}>{role.description}</Text>
                {roleMembers.length > 0 && (
                  <Text style={[styles.hierarchyMemberCount, { color: role.badge_color }]}>
                    {roleMembers.length} member{roleMembers.length !== 1 ? 's' : ''}
                  </Text>
                )}
              </View>
              {!role.is_applyable && (
                <View style={styles.noApplyBadge}>
                  <Text style={styles.noApplyText}>Assigned only</Text>
                </View>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ── Admin: Application Detail ─────────────────────────────────────────────────

function AdminApplicationDetail({
  app, tasks, notes, roles, reviewerId,
  onClose, onRefresh,
}: {
  app: CrewApplication;
  tasks: CrewApplicationTask[];
  notes: CrewInternalNote[];
  roles: CrewRole[];
  reviewerId: string;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [msgText, setMsgText] = useState('');
  const [trialDays, setTrialDays] = useState('7');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const role = roles.find(r => r.role_key === app.role_key);
  const p = app.user_profiles;
  const displayName = p?.display_name || p?.username || 'Unknown';

  const action = async (
    status: CrewAppStatus,
    isTrial = false,
    assignMember = false
  ) => {
    setLoading(true);
    setError('');

    const { error: err } = await CrewService.adminUpdateApplicationStatus(
      app.id, status, reviewerId,
      msgText.trim() || undefined,
      undefined,
      isTrial ? parseInt(trialDays, 10) : undefined
    );

    if (err) { setError(err); setLoading(false); return; }

    if (assignMember && app.user_id) {
      await CrewService.adminAssignMember(
        app.user_id, app.role_key, reviewerId, app.id, isTrial, parseInt(trialDays, 10)
      );
    }

    const notifMsg = {
      under_review: 'Your DAWEN Crew application is now under review.',
      shortlisted: 'Your DAWEN Crew application has been shortlisted.',
      trial: `You have been moved to trial for ${role?.role_name ?? app.role_key}.`,
      accepted: 'Your DAWEN Crew application has been accepted!',
      rejected: 'Your DAWEN Crew application was not accepted at this time.',
      paused: 'Your DAWEN Crew application has been paused.',
    }[status];

    if (notifMsg && app.user_id) {
      await CrewService.notifyApplicant(app.user_id, reviewerId, notifMsg);
    }

    setSuccess(`Status updated to: ${CrewService.getStatusLabel(status)}`);
    setTimeout(() => { setSuccess(''); onRefresh(); }, 1500);
    setLoading(false);
  };

  const addNote = async () => {
    if (!noteText.trim()) return;
    setLoading(true);
    await CrewService.adminAddNote(app.id, reviewerId, noteText.trim(), app.user_id);
    setNoteText('');
    onRefresh();
    setLoading(false);
  };

  const reviewTask = async (taskId: string, st: 'approved' | 'rejected') => {
    await CrewService.adminReviewTask(taskId, st, reviewerId);
    onRefresh();
  };

  return (
    <ScrollView style={styles.detailScroll} showsVerticalScrollIndicator={false}>
      <View style={styles.detailHeader}>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <ArrowLeft size={20} color={colors.textPrimary} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={styles.detailTitle}>Application Review</Text>
        <StatusChip status={app.status as CrewAppStatus} />
      </View>

      {/* Applicant card */}
      <View style={styles.applicantCard}>
        {p?.avatar_url ? (
          <Image source={{ uri: p.avatar_url }} style={styles.applicantAvatar} />
        ) : (
          <View style={styles.applicantAvatarPlaceholder}>
            <Text style={styles.applicantAvatarInitial}>{displayName[0]?.toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.applicantInfo}>
          <Text style={styles.applicantName}>{displayName}</Text>
          {p?.username && <Text style={styles.applicantUsername}>@{p.username}</Text>}
          {role && <RoleBadge roleKey={role.role_key} roleName={role.role_name} color={role.badge_color} icon={role.badge_icon} />}
        </View>
      </View>

      {/* Quick actions */}
      {success ? (
        <View style={styles.successRow}>
          <CheckCircle size={14} color="#10B981" strokeWidth={2} />
          <Text style={styles.successRowText}>{success}</Text>
        </View>
      ) : null}
      {error ? (
        <View style={styles.errorRow}>
          <AlertTriangle size={14} color="#EF4444" strokeWidth={2} />
          <Text style={styles.errorRowText}>{error}</Text>
        </View>
      ) : null}

      <Text style={styles.detailSectionLabel}>User message (optional)</Text>
      <TextInput
        style={styles.msgInput}
        value={msgText}
        onChangeText={setMsgText}
        placeholder="Message visible to the applicant..."
        placeholderTextColor={colors.textMuted}
        multiline
      />

      <View style={styles.actionGrid}>
        <ActionBtn label="Under Review" color="#F59E0B" onPress={() => action('under_review')} loading={loading} />
        <ActionBtn label="Shortlist" color="#8B5CF6" onPress={() => action('shortlisted')} loading={loading} />
        <ActionBtn label="Accept" color="#10B981" onPress={() => action('accepted', false, true)} loading={loading} />
        <ActionBtn label="Reject" color="#EF4444" onPress={() => action('rejected')} loading={loading} />
        <ActionBtn label="Pause" color="#9CA3AF" onPress={() => action('paused')} loading={loading} />
      </View>

      <View style={styles.trialSection}>
        <Text style={styles.detailSectionLabel}>Move to Trial</Text>
        <View style={styles.trialRow}>
          <TextInput
            style={styles.trialInput}
            value={trialDays}
            onChangeText={setTrialDays}
            keyboardType="number-pad"
            placeholder="7"
            placeholderTextColor={colors.textMuted}
          />
          <Text style={styles.trialDaysLabel}>days</Text>
          <TouchableOpacity style={styles.trialBtn} onPress={() => action('trial', true, true)} activeOpacity={0.8} disabled={loading}>
            <Play size={14} color="#06B6D4" strokeWidth={2} />
            <Text style={styles.trialBtnText}>Start Trial</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Application answers */}
      <Text style={styles.detailSectionLabel}>Application Answers</Text>
      {[
        ['Motivation', app.motivation],
        ['Contribution', app.contribution],
        ['Experience', app.experience],
        ['Previous Projects', app.previous_projects],
        ['Spam Scenario', app.scenario_spam],
        ['Bug Scenario', app.scenario_bug],
        ['Conflict Scenario', app.scenario_conflict],
        ['Trust Statement', app.trust_statement],
        ['Extra Notes', app.extra_notes],
      ].filter(([, v]) => v).map(([label, val]) => (
        <View key={label as string} style={styles.answerBlock}>
          <Text style={styles.answerLabel}>{label}</Text>
          <Text style={styles.answerText}>{val}</Text>
        </View>
      ))}

      {/* Contact */}
      {(app.x_username || app.telegram_username || app.discord_username) && (
        <>
          <Text style={styles.detailSectionLabel}>Contact</Text>
          {app.x_username && <Text style={styles.contactItem}>X: @{app.x_username}</Text>}
          {app.telegram_username && <Text style={styles.contactItem}>Telegram: @{app.telegram_username}</Text>}
          {app.discord_username && <Text style={styles.contactItem}>Discord: {app.discord_username}</Text>}
          {app.timezone && <Text style={styles.contactItem}>Timezone: {app.timezone}</Text>}
          {app.availability_hours && <Text style={styles.contactItem}>Available: {app.availability_hours}</Text>}
          {app.work_type && <Text style={styles.contactItem}>Work type: {app.work_type}</Text>}
        </>
      )}

      {/* Proof links */}
      {(app.proof_links?.length ?? 0) > 0 && (
        <>
          <Text style={styles.detailSectionLabel}>Proof / Links</Text>
          {app.proof_links.map((link, i) => (
            <Text key={i} style={styles.proofLink}>{link}</Text>
          ))}
        </>
      )}

      {/* Tasks */}
      {tasks.length > 0 && (
        <>
          <Text style={styles.detailSectionLabel}>Tasks ({tasks.filter(t => t.status === 'submitted' || t.status === 'approved').length}/{tasks.length} submitted)</Text>
          {tasks.map(task => (
            <View key={task.id} style={styles.taskReviewCard}>
              <View style={styles.taskReviewHeader}>
                <Text style={styles.taskReviewTitle}>{task.title}</Text>
                <StatusChip status={task.status as any} />
              </View>
              {task.proof_text && <Text style={styles.taskReviewProof}>{task.proof_text}</Text>}
              {task.proof_links?.length > 0 && task.proof_links.map((l, i) => (
                <Text key={i} style={styles.proofLink}>{l}</Text>
              ))}
              <View style={styles.taskReviewActions}>
                <TouchableOpacity style={styles.taskApproveBtn} onPress={() => reviewTask(task.id, 'approved')} activeOpacity={0.8}>
                  <Check size={12} color="#10B981" strokeWidth={2} />
                  <Text style={styles.taskApproveBtnText}>Approve</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.taskRejectBtn} onPress={() => reviewTask(task.id, 'rejected')} activeOpacity={0.8}>
                  <X size={12} color="#EF4444" strokeWidth={2} />
                  <Text style={styles.taskRejectBtnText}>Reject</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </>
      )}

      {/* Internal notes */}
      <Text style={styles.detailSectionLabel}>Internal Notes</Text>
      <View style={styles.noteInputRow}>
        <TextInput
          style={styles.noteInput}
          value={noteText}
          onChangeText={setNoteText}
          placeholder="Add a private note..."
          placeholderTextColor={colors.textMuted}
          multiline
        />
        <TouchableOpacity style={styles.noteSubmitBtn} onPress={addNote} activeOpacity={0.8} disabled={!noteText.trim()}>
          <Send size={14} color={noteText.trim() ? colors.primary : colors.textMuted} strokeWidth={2} />
        </TouchableOpacity>
      </View>
      {notes.map(n => (
        <View key={n.id} style={styles.noteCard}>
          <Text style={styles.noteCardText}>{n.note}</Text>
          <Text style={styles.noteCardMeta}>
            {n.creator?.display_name || n.creator?.username || 'Admin'} · {new Date(n.created_at).toLocaleDateString()}
          </Text>
        </View>
      ))}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function ActionBtn({ label, color, onPress, loading }: { label: string; color: string; onPress: () => void; loading: boolean }) {
  return (
    <TouchableOpacity
      style={[styles.actionGridBtn, { borderColor: color + '44', backgroundColor: color + '11' }]}
      onPress={onPress}
      activeOpacity={0.8}
      disabled={loading}
    >
      <Text style={[styles.actionGridBtnText, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── My Application view ───────────────────────────────────────────────────────

function MyApplicationView({ app, tasks, roles }: { app: CrewApplication; tasks: CrewApplicationTask[]; roles: CrewRole[] }) {
  const role = roles.find(r => r.role_key === app.role_key);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [proofText, setProofText] = useState('');
  const [proofLink, setProofLink] = useState('');
  const [saving, setSaving] = useState(false);

  const submitTask = async () => {
    if (!taskId) return;
    setSaving(true);
    const links = proofLink.trim() ? [proofLink.trim()] : [];
    await CrewService.updateTask(taskId, {
      proof_text: proofText.trim() || undefined,
      proof_links: links,
      status: 'submitted',
    });
    setTaskId(null);
    setProofText('');
    setProofLink('');
    setSaving(false);
  };

  return (
    <View>
      <View style={styles.myAppCard}>
        {role && <RoleBadge roleKey={role.role_key} roleName={role.role_name} color={role.badge_color} icon={role.badge_icon} />}
        <StatusChip status={app.status as CrewAppStatus} />
        {app.submitted_at && (
          <Text style={styles.myAppDate}>Submitted {new Date(app.submitted_at).toLocaleDateString()}</Text>
        )}
      </View>

      {app.user_visible_message && (
        <View style={styles.adminMsgCard}>
          <FileText size={14} color={colors.primary} strokeWidth={2} />
          <Text style={styles.adminMsgText}>{app.user_visible_message}</Text>
        </View>
      )}

      {tasks.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Starter Tasks</Text>
          <Text style={styles.sectionHint}>Complete these tasks to strengthen your application.</Text>
          {tasks.map(task => (
            <View key={task.id} style={styles.taskCard}>
              <View style={styles.taskCardHeader}>
                <View style={styles.taskCardLeft}>
                  {task.status === 'approved' ? (
                    <CheckCircle size={16} color="#10B981" strokeWidth={2} />
                  ) : task.status === 'rejected' ? (
                    <X size={16} color="#EF4444" strokeWidth={2} />
                  ) : task.status === 'submitted' ? (
                    <Clock size={16} color="#F59E0B" strokeWidth={2} />
                  ) : (
                    <View style={styles.taskCircle} />
                  )}
                  <View>
                    <Text style={styles.taskTitle}>{task.title}</Text>
                    {task.is_required && <Text style={styles.taskRequired}>Required</Text>}
                  </View>
                </View>
                {task.status === 'not_started' && (
                  <TouchableOpacity
                    style={styles.taskSubmitBtn}
                    onPress={() => setTaskId(taskId === task.id ? null : task.id)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.taskSubmitBtnText}>{taskId === task.id ? 'Cancel' : 'Submit'}</Text>
                  </TouchableOpacity>
                )}
              </View>
              <Text style={styles.taskDesc}>{task.description}</Text>

              {taskId === task.id && (
                <View style={styles.taskProofWrap}>
                  {task.proof_required && (
                    <>
                      <TextInput
                        style={styles.taskProofInput}
                        value={proofText}
                        onChangeText={setProofText}
                        placeholder="Describe your proof..."
                        placeholderTextColor={colors.textMuted}
                        multiline
                      />
                      <TextInput
                        style={[styles.taskProofInput, { marginTop: 6 }]}
                        value={proofLink}
                        onChangeText={setProofLink}
                        placeholder="Proof link (optional)"
                        placeholderTextColor={colors.textMuted}
                      />
                    </>
                  )}
                  <TouchableOpacity
                    style={[styles.taskConfirmBtn, saving && styles.btnDisabled]}
                    onPress={submitTask}
                    activeOpacity={0.8}
                    disabled={saving}
                  >
                    {saving ? <ActivityIndicator size="small" color="#fff" /> : <Check size={14} color="#fff" strokeWidth={2} />}
                    <Text style={styles.taskConfirmBtnText}>Mark as Submitted</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))}
        </>
      )}
    </View>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CrewPage() {
  const router = useRouter();
  const { activeAddress } = useWallet();

  const [roles, setRoles] = useState<CrewRole[]>([]);
  const [members, setMembers] = useState<CrewMember[]>([]);
  const [myApp, setMyApp] = useState<CrewApplication | null>(null);
  const [myTasks, setMyTasks] = useState<CrewApplicationTask[]>([]);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myRoleKeys, setMyRoleKeys] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);

  // Admin state
  const [adminApps, setAdminApps] = useState<CrewApplication[]>([]);
  const [adminStatusFilter, setAdminStatusFilter] = useState<string>('submitted');
  const [adminRoleFilter, setAdminRoleFilter] = useState<string>('');
  const [adminSearch, setAdminSearch] = useState('');
  const [selectedApp, setSelectedApp] = useState<CrewApplication | null>(null);
  const [selectedAppTasks, setSelectedAppTasks] = useState<CrewApplicationTask[]>([]);
  const [selectedAppNotes, setSelectedAppNotes] = useState<CrewInternalNote[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<UserTab | AdminTab>('overview');
  const [applyRole, setApplyRole] = useState('');
  const [appSubmitted, setAppSubmitted] = useState(false);

  const loadData = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [rolesData, membersData] = await Promise.all([
        CrewService.getRoles(),
        CrewService.getCrewMembers(),
      ]);
      setRoles(rolesData);
      setMembers(membersData);

      if (activeAddress) {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('id')
          .eq('wallet_address', activeAddress)
          .maybeSingle();

        if (profile) {
          setMyUserId(profile.id);

          // Check if user is crew member
          const { data: myMemberships } = await supabase
            .from('crew_members')
            .select('role_key, status')
            .eq('user_id', profile.id)
            .in('status', ['active', 'trial']);

          const keys = (myMemberships ?? []).map((m: any) => m.role_key);
          setMyRoleKeys(keys);

          const isAdminUser = keys.some(k => CrewService.isAdminRole(k));
          setIsAdmin(isAdminUser);

          // Load my application
          const app = await CrewService.getMyActiveApplication(profile.id);
          setMyApp(app);
          if (app) {
            const tasks = await CrewService.getApplicationTasks(app.id);
            setMyTasks(tasks);
          }

          // Load admin apps if admin
          if (isAdminUser) {
            const apps = await CrewService.adminGetApplications({
              status: adminStatusFilter,
              role_key: adminRoleFilter || undefined,
              search: adminSearch || undefined,
            });
            setAdminApps(apps);
          }
        }
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeAddress, adminStatusFilter, adminRoleFilter, adminSearch]);

  useEffect(() => { loadData(); }, [loadData]);

  const loadSelectedApp = async (app: CrewApplication) => {
    setSelectedApp(app);
    const { tasks, notes } = await CrewService.adminGetApplicationWithTasks(app.id);
    setSelectedAppTasks(tasks);
    setSelectedAppNotes(notes);
  };

  const reloadAdminApps = async () => {
    if (!myUserId) return;
    const apps = await CrewService.adminGetApplications({
      status: adminStatusFilter,
      role_key: adminRoleFilter || undefined,
      search: adminSearch || undefined,
    });
    setAdminApps(apps);
    if (selectedApp) {
      const { application, tasks, notes } = await CrewService.adminGetApplicationWithTasks(selectedApp.id);
      if (application) setSelectedApp(application);
      setSelectedAppTasks(tasks);
      setSelectedAppNotes(notes);
    }
  };

  const userTabs: { key: UserTab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'roles', label: 'Roles' },
    { key: 'apply', label: 'Apply' },
    { key: 'my_application', label: 'My App' },
    { key: 'hierarchy', label: 'Hierarchy' },
    { key: 'members', label: 'Members' },
  ];

  const adminTabs: { key: AdminTab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'applications', label: 'Applications' },
    { key: 'trial', label: 'Trial' },
    { key: 'members', label: 'Members' },
    { key: 'task_review', label: 'Tasks' },
    { key: 'notes', label: 'Notes' },
  ];

  const tabs = isAdmin ? adminTabs : userTabs;

  const renderContent = () => {
    if (loading) return <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />;

    // Admin: application detail view
    if (isAdmin && selectedApp && activeTab === 'applications') {
      return (
        <AdminApplicationDetail
          app={selectedApp}
          tasks={selectedAppTasks}
          notes={selectedAppNotes}
          roles={roles}
          reviewerId={myUserId ?? ''}
          onClose={() => setSelectedApp(null)}
          onRefresh={reloadAdminApps}
        />
      );
    }

    switch (activeTab as string) {
      // ── Overview ──────────────────────────────────────────────────────────
      case 'overview':
        return (
          <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} tintColor={colors.primary} />}>
            <LinearGradient colors={['#1A0B2E', '#12121A']} style={styles.overviewBanner}>
              <Crown size={32} color="#F59E0B" strokeWidth={1.5} />
              <Text style={styles.overviewTitle}>DAWEN Crew</Text>
              <Text style={styles.overviewSubtitle}>
                Join the team building DAWEN. Apply for a role, contribute, and grow with the community.
              </Text>
              {myRoleKeys.length > 0 ? (
                <View style={styles.myRolesRow}>
                  {myRoleKeys.map(key => {
                    const r = roles.find(x => x.role_key === key);
                    if (!r) return null;
                    return <RoleBadge key={key} roleKey={r.role_key} roleName={r.role_name} color={r.badge_color} icon={r.badge_icon} />;
                  })}
                </View>
              ) : (
                !myApp ? (
                  <TouchableOpacity style={styles.overviewApplyBtn} onPress={() => setActiveTab('apply')} activeOpacity={0.8}>
                    <Text style={styles.overviewApplyBtnText}>Apply Now</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.overviewAppStatus}>
                    <Text style={styles.overviewAppStatusLabel}>Your Application:</Text>
                    <StatusChip status={myApp.status as CrewAppStatus} />
                  </View>
                )
              )}
            </LinearGradient>

            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statNum}>{members.filter(m => m.status === 'active').length}</Text>
                <Text style={styles.statLabel}>Active</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statNum}>{members.filter(m => m.status === 'trial').length}</Text>
                <Text style={styles.statLabel}>In Trial</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statNum}>{roles.filter(r => r.is_applyable).length}</Text>
                <Text style={styles.statLabel}>Open Roles</Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Available Roles</Text>
            {roles.filter(r => r.is_applyable).slice(0, 4).map(r => (
              <RoleBadge key={r.role_key} roleKey={r.role_key} roleName={r.role_name} color={r.badge_color} icon={r.badge_icon} />
            ))}
            <TouchableOpacity style={styles.seeAllBtn} onPress={() => setActiveTab('roles')} activeOpacity={0.8}>
              <Text style={styles.seeAllBtnText}>See All Roles</Text>
              <ChevronRight size={14} color={colors.primary} strokeWidth={2} />
            </TouchableOpacity>

            {isAdmin && (
              <>
                <Text style={styles.sectionTitle}>Applications Pending</Text>
                <Text style={styles.statNum}>{adminApps.filter(a => a.status === 'submitted').length}</Text>
                <TouchableOpacity style={styles.seeAllBtn} onPress={() => setActiveTab('applications' as AdminTab)} activeOpacity={0.8}>
                  <Text style={styles.seeAllBtnText}>Review Applications</Text>
                  <ChevronRight size={14} color={colors.primary} strokeWidth={2} />
                </TouchableOpacity>
              </>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
        );

      // ── Available Roles ───────────────────────────────────────────────────
      case 'roles':
        return (
          <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} tintColor={colors.primary} />}>
            <Text style={styles.sectionTitle}>Available Roles</Text>
            <Text style={styles.sectionHint}>Tap a role to see its responsibilities. Community Manager is assigned by Founders only.</Text>
            {roles.filter(r => r.is_applyable).map(r => (
              <RoleCard
                key={r.role_key}
                role={r}
                canApply={!myApp || myApp.status === 'rejected' || myApp.status === 'removed'}
                onApply={() => { setApplyRole(r.role_key); setActiveTab('apply'); }}
              />
            ))}
            <View style={[styles.roleCard, { borderColor: '#A855F733', opacity: 0.7 }]}>
              <View style={styles.roleCardHeader}>
                <View style={[styles.roleIconCircle, { backgroundColor: '#A855F722', borderColor: '#A855F744' }]}>
                  <Users size={20} color="#A855F7" strokeWidth={2} />
                </View>
                <View style={styles.roleCardMeta}>
                  <Text style={styles.roleCardName}>Community Manager</Text>
                  <Text style={styles.roleCardDesc}>Oversees the DAWEN community. Assignable by Founder only.</Text>
                </View>
                <View style={styles.noApplyBadge}>
                  <Text style={styles.noApplyText}>Not applyable</Text>
                </View>
              </View>
            </View>
            <View style={{ height: 40 }} />
          </ScrollView>
        );

      // ── Apply ─────────────────────────────────────────────────────────────
      case 'apply':
        if (myApp && myApp.status !== 'rejected' && myApp.status !== 'removed') {
          return (
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.alreadyAppCard}>
                <CheckCircle size={20} color="#10B981" strokeWidth={2} />
                <Text style={styles.alreadyAppText}>You already have an active application.</Text>
                <TouchableOpacity onPress={() => setActiveTab('my_application' as UserTab)} activeOpacity={0.8}>
                  <Text style={styles.alreadyAppLink}>View it here</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          );
        }
        if (appSubmitted) {
          return (
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.successScreen}>
                <CheckCircle size={48} color="#10B981" strokeWidth={1.5} />
                <Text style={styles.successScreenTitle}>Application Submitted!</Text>
                <Text style={styles.successScreenText}>
                  Your application has been sent to the DAWEN team. You will be notified when there is an update.
                </Text>
                <TouchableOpacity style={styles.successScreenBtn} onPress={() => { setAppSubmitted(false); setActiveTab('my_application' as UserTab); loadData(); }} activeOpacity={0.8}>
                  <Text style={styles.successScreenBtnText}>View My Application</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          );
        }
        return (
          <ScrollView showsVerticalScrollIndicator={false}>
            {myUserId ? (
              <ApplicationForm
                roles={roles}
                userId={myUserId}
                preselectedRole={applyRole}
                onSubmit={() => setAppSubmitted(true)}
              />
            ) : (
              <Text style={styles.sectionHint}>Please connect your wallet to apply.</Text>
            )}
            <View style={{ height: 40 }} />
          </ScrollView>
        );

      // ── My Application ────────────────────────────────────────────────────
      case 'my_application':
        if (!myApp) {
          return (
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.emptyState}>
                <FileText size={36} color={colors.textMuted} strokeWidth={1.5} />
                <Text style={styles.emptyStateText}>You have not applied yet.</Text>
                <TouchableOpacity style={styles.emptyStateBtn} onPress={() => setActiveTab('apply' as UserTab)} activeOpacity={0.8}>
                  <Text style={styles.emptyStateBtnText}>Apply Now</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          );
        }
        return (
          <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} tintColor={colors.primary} />}>
            <MyApplicationView app={myApp} tasks={myTasks} roles={roles} />
            <View style={{ height: 40 }} />
          </ScrollView>
        );

      // ── Hierarchy ─────────────────────────────────────────────────────────
      case 'hierarchy':
        return (
          <ScrollView showsVerticalScrollIndicator={false}>
            <HierarchyView roles={roles} members={members} />
            <View style={{ height: 40 }} />
          </ScrollView>
        );

      // ── Members ───────────────────────────────────────────────────────────
      case 'members':
        return (
          <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} tintColor={colors.primary} />}>
            <Text style={styles.sectionTitle}>Active Crew Members</Text>
            {roles.map(role => {
              const roleMembers = members.filter(m => m.role_key === role.role_key);
              if (!roleMembers.length) return null;
              return (
                <View key={role.role_key} style={styles.memberGroup}>
                  <View style={styles.memberGroupHeader}>
                    <RoleIcon icon={role.badge_icon} size={14} color={role.badge_color} />
                    <Text style={[styles.memberGroupTitle, { color: role.badge_color }]}>{role.role_name}</Text>
                    <Text style={styles.memberGroupCount}>{roleMembers.length}</Text>
                  </View>
                  {roleMembers.map(m => <MemberCard key={m.id} member={m} roles={roles} />)}
                </View>
              );
            })}
            {members.length === 0 && (
              <View style={styles.emptyState}>
                <Users size={36} color={colors.textMuted} strokeWidth={1.5} />
                <Text style={styles.emptyStateText}>No crew members yet.</Text>
              </View>
            )}
            <View style={{ height: 40 }} />
          </ScrollView>
        );

      // ── Admin: Applications ───────────────────────────────────────────────
      case 'applications':
        return (
          <View style={{ flex: 1 }}>
            <View style={styles.adminFilters}>
              <TextInput
                style={styles.adminSearch}
                value={adminSearch}
                onChangeText={setAdminSearch}
                placeholder="Search..."
                placeholderTextColor={colors.textMuted}
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
                {['', 'submitted', 'under_review', 'shortlisted', 'trial', 'accepted', 'rejected'].map(s => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.filterChip, adminStatusFilter === s && styles.filterChipActive]}
                    onPress={() => setAdminStatusFilter(s)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.filterChipText, adminStatusFilter === s && styles.filterChipTextActive]}>
                      {s ? CrewService.getStatusLabel(s as CrewAppStatus) : 'All'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {adminApps.length === 0 ? (
                <View style={styles.emptyState}>
                  <FileText size={36} color={colors.textMuted} strokeWidth={1.5} />
                  <Text style={styles.emptyStateText}>No applications found.</Text>
                </View>
              ) : (
                adminApps.map(app => (
                  <ApplicationCard key={app.id} app={app} roles={roles} onPress={() => loadSelectedApp(app)} />
                ))
              )}
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        );

      // ── Admin: Trial ──────────────────────────────────────────────────────
      case 'trial': {
        const trialMembers = members.filter(m => m.status === 'trial');
        return (
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.sectionTitle}>Trial Members</Text>
            {trialMembers.length === 0 ? (
              <View style={styles.emptyState}>
                <Clock size={36} color={colors.textMuted} strokeWidth={1.5} />
                <Text style={styles.emptyStateText}>No members in trial.</Text>
              </View>
            ) : (
              trialMembers.map(m => <MemberCard key={m.id} member={m} roles={roles} />)
            )}
            <View style={{ height: 40 }} />
          </ScrollView>
        );
      }

      // ── Admin: Task Review ─────────────────────────────────────────────────
      case 'task_review':
        return (
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.sectionTitle}>Task Review</Text>
            <Text style={styles.sectionHint}>Review task submissions from applicants via their application detail.</Text>
            <TouchableOpacity style={styles.seeAllBtn} onPress={() => setActiveTab('applications' as AdminTab)} activeOpacity={0.8}>
              <Text style={styles.seeAllBtnText}>Go to Applications</Text>
              <ChevronRight size={14} color={colors.primary} strokeWidth={2} />
            </TouchableOpacity>
            <View style={{ height: 40 }} />
          </ScrollView>
        );

      // ── Admin: Notes ───────────────────────────────────────────────────────
      case 'notes':
        return (
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.sectionTitle}>Internal Notes</Text>
            <Text style={styles.sectionHint}>Notes are visible here per application. Open an application to add or view notes.</Text>
            <TouchableOpacity style={styles.seeAllBtn} onPress={() => setActiveTab('applications' as AdminTab)} activeOpacity={0.8}>
              <Text style={styles.seeAllBtnText}>Go to Applications</Text>
              <ChevronRight size={14} color={colors.primary} strokeWidth={2} />
            </TouchableOpacity>
            <View style={{ height: 40 }} />
          </ScrollView>
        );

      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <LinearGradient colors={['#1A1A28', '#12121A']} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <ArrowLeft size={22} color={colors.textPrimary} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>DAWEN Crew</Text>
        <View style={{ width: 22 }} />
      </LinearGradient>

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar} contentContainerStyle={styles.tabBarContent}>
        {tabs.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => { setActiveTab(tab.key); setSelectedApp(null); }}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.content}>
        {renderContent()}
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 56, paddingBottom: 16, paddingHorizontal: spacing.xl,
  },
  headerTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary },
  tabBar: { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)', maxHeight: 48, flexGrow: 0 },
  tabBarContent: { paddingHorizontal: spacing.lg, gap: 4, alignItems: 'center' },
  tab: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20 },
  tabActive: { backgroundColor: 'rgba(139,92,246,0.15)' },
  tabText: { fontSize: 13, fontWeight: '500', color: colors.textMuted },
  tabTextActive: { color: colors.primary, fontWeight: '700' },
  content: { flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.lg },

  // Overview
  overviewBanner: {
    borderRadius: 20, padding: 24, alignItems: 'center', gap: 10, marginBottom: 20,
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.2)',
  },
  overviewTitle: { fontSize: 24, fontWeight: '900', color: colors.textPrimary, letterSpacing: 1 },
  overviewSubtitle: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  myRolesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  overviewApplyBtn: {
    backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 10, marginTop: 6,
  },
  overviewApplyBtnText: { fontSize: 14, fontWeight: '800', color: '#fff' },
  overviewAppStatus: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  overviewAppStatusLabel: { fontSize: 13, color: colors.textMuted },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  statCard: {
    flex: 1, backgroundColor: colors.surface, borderRadius: 14, padding: 14,
    alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  statNum: { fontSize: 22, fontWeight: '900', color: colors.textPrimary },
  statLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  seeAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8, marginTop: 6 },
  seeAllBtnText: { fontSize: 13, fontWeight: '600', color: colors.primary },

  // Role badge
  roleBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1, alignSelf: 'flex-start', marginRight: 6, marginBottom: 6,
  },
  roleBadgeSmall: { paddingHorizontal: 7, paddingVertical: 3 },
  roleBadgeText: { fontSize: 12, fontWeight: '700' },
  roleBadgeTextSmall: { fontSize: 10 },

  // Status chip
  statusChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusChipText: { fontSize: 11, fontWeight: '700' },

  // Section
  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 20, marginBottom: 10 },
  sectionHint: { fontSize: 13, color: colors.textMuted, lineHeight: 20, marginBottom: 12 },

  // Role cards
  roleCard: {
    backgroundColor: colors.surface, borderRadius: 16, marginBottom: 10,
    borderWidth: 1, overflow: 'hidden',
  },
  roleCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  roleIconCircle: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center', borderWidth: 1,
  },
  roleCardMeta: { flex: 1 },
  roleCardName: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: 2 },
  roleCardDesc: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  roleCardExpanded: { paddingHorizontal: 14, paddingBottom: 14, gap: 6 },
  roleCardResponsTitle: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 },
  responsiRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  responsiDot: { width: 5, height: 5, borderRadius: 3, marginTop: 6, flexShrink: 0 },
  responsiText: { fontSize: 13, color: colors.textSecondary, lineHeight: 19, flex: 1 },
  applyBtn: { borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14, borderWidth: 1, alignSelf: 'flex-start', marginTop: 8 },
  applyBtnText: { fontSize: 13, fontWeight: '700' },
  noApplyBadge: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  noApplyText: { fontSize: 10, fontWeight: '600', color: colors.textMuted },

  // Member card
  memberCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.surface, borderRadius: 14, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  memberCardAvatar: { position: 'relative' },
  memberAvatar: { width: 44, height: 44, borderRadius: 22 },
  memberAvatarPlaceholder: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  memberAvatarInitial: { fontSize: 18, fontWeight: '800' },
  memberCardBadges: { position: 'absolute', bottom: 0, right: 0 },
  premiumDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#A855F7', borderWidth: 2, borderColor: colors.surface },
  verifiedDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#3B82F6', borderWidth: 2, borderColor: colors.surface },
  memberCardInfo: { flex: 1, gap: 3 },
  memberCardName: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  memberCardUsername: { fontSize: 12, color: colors.textMuted },
  memberCardRight: {},

  // Application card
  appCard: {
    backgroundColor: colors.surface, borderRadius: 16, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  appCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  appCardAvatarWrap: { position: 'relative' },
  appCardAvatar: { width: 40, height: 40, borderRadius: 20 },
  appCardAvatarPlaceholder: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  appCardAvatarInitial: { fontSize: 16, fontWeight: '800', color: colors.primary },
  miniDot: { position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: colors.surface },
  appCardInfo: { flex: 1 },
  appCardName: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  appCardUsername: { fontSize: 12, color: colors.textMuted },
  appCardRole: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  appCardDate: { fontSize: 11, color: colors.textMuted },
  appCardChevron: { position: 'absolute', right: 0, top: '50%' },

  // Hierarchy
  hierarchyWrap: { gap: 0 },
  hierarchyLevel: { alignItems: 'center' },
  hierarchyConnector: { width: 2, height: 16, backgroundColor: 'rgba(139,92,246,0.3)' },
  hierarchyConnectorTop: { height: 20 },
  hierarchyRoleBlock: {
    width: '100%', flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.surface, borderRadius: 14, padding: 12, marginBottom: 4,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  hierarchyRoleBlockTop: {
    borderColor: '#F59E0B44', backgroundColor: '#F59E0B11',
  },
  hierarchyRoleBlockManager: {
    borderColor: '#A855F744', backgroundColor: '#A855F711',
  },
  hierarchyRoleIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  hierarchyRoleMeta: { flex: 1 },
  hierarchyRoleName: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  hierarchyRoleNameTop: { fontSize: 16, fontWeight: '900' },
  hierarchyRoleDesc: { fontSize: 11, color: colors.textMuted, lineHeight: 16 },
  hierarchyMemberCount: { fontSize: 10, fontWeight: '700', marginTop: 2 },

  // Application form
  formSectionTitle: { fontSize: 11, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 20, marginBottom: 10 },
  rolePicker: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.surface, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 6,
  },
  rolePickerSelected: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rolePickerText: { fontSize: 14, fontWeight: '700' },
  rolePickerPlaceholder: { fontSize: 14, color: colors.textMuted },
  rolePickerDropdown: {
    backgroundColor: colors.surfaceElevated, borderRadius: 12, marginBottom: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', overflow: 'hidden',
  },
  rolePickerItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  rolePickerItemActive: { backgroundColor: 'rgba(139,92,246,0.1)' },
  rolePickerItemText: { fontSize: 13, fontWeight: '600' },
  formField: { marginBottom: 12 },
  formFieldLabel: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginBottom: 5 },
  formInput: {
    backgroundColor: colors.surface, borderRadius: 12, padding: 12,
    color: colors.textPrimary, fontSize: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },
  formInputMulti: { minHeight: 80, textAlignVertical: 'top' },
  workTypeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  workTypeBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)', alignItems: 'center',
  },
  workTypeBtnActive: { backgroundColor: 'rgba(139,92,246,0.15)', borderColor: colors.primary },
  workTypeBtnText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  workTypeBtnTextActive: { color: colors.primary },
  formError: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: 10, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)' },
  formErrorText: { fontSize: 13, color: '#EF4444', flex: 1 },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 15, marginTop: 12 },
  submitBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  btnDisabled: { opacity: 0.4 },

  // My application
  myAppCard: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  myAppDate: { fontSize: 12, color: colors.textMuted },
  adminMsgCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: 'rgba(139,92,246,0.08)', borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(139,92,246,0.2)' },
  adminMsgText: { flex: 1, fontSize: 13, color: colors.textSecondary, lineHeight: 19 },

  // Tasks
  taskCard: { backgroundColor: colors.surface, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  taskCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  taskCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  taskCircle: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)', flexShrink: 0 },
  taskTitle: { fontSize: 13, fontWeight: '700', color: colors.textPrimary, flex: 1 },
  taskRequired: { fontSize: 10, fontWeight: '600', color: '#F59E0B' },
  taskDesc: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  taskSubmitBtn: { backgroundColor: 'rgba(139,92,246,0.12)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)' },
  taskSubmitBtnText: { fontSize: 11, fontWeight: '700', color: colors.primary },
  taskProofWrap: { marginTop: 10, gap: 6 },
  taskProofInput: { backgroundColor: colors.surfaceElevated, borderRadius: 10, padding: 10, color: colors.textPrimary, fontSize: 13, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', minHeight: 60, textAlignVertical: 'top' },
  taskConfirmBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#10B981', borderRadius: 10, paddingVertical: 9 },
  taskConfirmBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  // Member group
  memberGroup: { marginBottom: 16 },
  memberGroupHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  memberGroupTitle: { fontSize: 12, fontWeight: '700', flex: 1 },
  memberGroupCount: { fontSize: 11, color: colors.textMuted, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },

  // Admin
  adminFilters: { paddingBottom: 10, gap: 8 },
  adminSearch: { backgroundColor: colors.surface, borderRadius: 12, padding: 10, color: colors.textPrimary, fontSize: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  filterScroll: { maxHeight: 40 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginRight: 6 },
  filterChipActive: { backgroundColor: 'rgba(139,92,246,0.15)', borderColor: colors.primary },
  filterChipText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  filterChipTextActive: { color: colors.primary },

  // Admin detail
  detailScroll: { flex: 1 },
  detailHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  detailTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  applicantCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  applicantAvatar: { width: 52, height: 52, borderRadius: 26 },
  applicantAvatarPlaceholder: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(139,92,246,0.15)', justifyContent: 'center', alignItems: 'center' },
  applicantAvatarInitial: { fontSize: 20, fontWeight: '800', color: colors.primary },
  applicantInfo: { flex: 1, gap: 4 },
  applicantName: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  applicantUsername: { fontSize: 12, color: colors.textMuted },
  detailSectionLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.7, marginTop: 16, marginBottom: 8 },
  msgInput: { backgroundColor: colors.surface, borderRadius: 12, padding: 12, color: colors.textPrimary, fontSize: 13, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', minHeight: 60, textAlignVertical: 'top', marginBottom: 10 },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  actionGridBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  actionGridBtnText: { fontSize: 12, fontWeight: '700' },
  trialSection: { marginBottom: 4 },
  trialRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  trialInput: { width: 56, backgroundColor: colors.surface, borderRadius: 10, padding: 10, color: colors.textPrimary, fontSize: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', textAlign: 'center' },
  trialDaysLabel: { fontSize: 13, color: colors.textMuted },
  trialBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(6,182,212,0.1)', borderRadius: 10, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(6,182,212,0.3)' },
  trialBtnText: { fontSize: 13, fontWeight: '700', color: '#06B6D4' },
  answerBlock: { backgroundColor: colors.surface, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  answerLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  answerText: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  contactItem: { fontSize: 13, color: colors.textSecondary, marginBottom: 4 },
  proofLink: { fontSize: 12, color: colors.primary, marginBottom: 4 },
  taskReviewCard: { backgroundColor: colors.surface, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  taskReviewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  taskReviewTitle: { fontSize: 13, fontWeight: '700', color: colors.textPrimary, flex: 1, marginRight: 8 },
  taskReviewProof: { fontSize: 12, color: colors.textSecondary, lineHeight: 17, marginBottom: 4 },
  taskReviewActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  taskApproveBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: 'rgba(16,185,129,0.1)', borderRadius: 8, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(16,185,129,0.25)' },
  taskApproveBtnText: { fontSize: 12, fontWeight: '700', color: '#10B981' },
  taskRejectBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: 8, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)' },
  taskRejectBtnText: { fontSize: 12, fontWeight: '700', color: '#EF4444' },
  noteInputRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  noteInput: { flex: 1, backgroundColor: colors.surface, borderRadius: 12, padding: 10, color: colors.textPrimary, fontSize: 13, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', minHeight: 44, textAlignVertical: 'top' },
  noteSubmitBtn: { width: 40, height: 44, justifyContent: 'center', alignItems: 'center' },
  noteCard: { backgroundColor: colors.surface, borderRadius: 10, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  noteCardText: { fontSize: 13, color: colors.textSecondary, lineHeight: 18, marginBottom: 4 },
  noteCardMeta: { fontSize: 11, color: colors.textMuted },
  successRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(16,185,129,0.08)', borderRadius: 10, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(16,185,129,0.2)' },
  successRowText: { fontSize: 13, color: '#10B981', fontWeight: '600' },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: 10, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)' },
  errorRowText: { fontSize: 13, color: '#EF4444', flex: 1 },

  // Empty / success states
  emptyState: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  emptyStateText: { fontSize: 14, color: colors.textMuted },
  emptyStateBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10, marginTop: 4 },
  emptyStateBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  successScreen: { alignItems: 'center', paddingVertical: 48, gap: 16, paddingHorizontal: 24 },
  successScreenTitle: { fontSize: 22, fontWeight: '900', color: colors.textPrimary },
  successScreenText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 21 },
  successScreenBtn: { backgroundColor: colors.primary, borderRadius: 14, paddingHorizontal: 24, paddingVertical: 12 },
  successScreenBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  alreadyAppCard: { backgroundColor: 'rgba(16,185,129,0.08)', borderRadius: 14, padding: 16, alignItems: 'center', gap: 10, borderWidth: 1, borderColor: 'rgba(16,185,129,0.2)' },
  alreadyAppText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
  alreadyAppLink: { fontSize: 14, fontWeight: '700', color: colors.primary },
});
