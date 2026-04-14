import { supabase } from '@/lib/supabase';

export interface MysteryBox {
  id: string;
  name: string;
  price_usd: number;
  image_url: string | null;
  rewards: BoxReward[];
  is_active: boolean;
  order_index: number;
}

export interface BoxReward {
  tier: 'common' | 'rare' | 'epic' | 'legendary';
  probability: number;
  min_value: number;
  max_value: number;
}

export interface BoxPurchase {
  id: string;
  user_id: string;
  box_id: string;
  reward_tier: string;
  reward_value: number;
  created_at: string;
}

export interface TeamGame {
  id: string;
  name: string;
  entry_fee: number;
  prize_pool: number;
  status: 'waiting' | 'in_progress' | 'completed' | 'cancelled';
  max_teams: number;
  winning_team_id: string | null;
  created_at: string;
  completed_at: string | null;
  teams?: Team[];
}

export interface Team {
  id: string;
  game_id: string;
  name: string;
  score: number;
  members?: TeamMember[];
}

export interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  has_paid: boolean;
  payout_amount: number;
  profile?: { username: string | null; avatar_url: string | null; wallet_address: string };
}

const TIER_COLORS: Record<string, string> = {
  common: '#9ca3af',
  rare: '#3b82f6',
  epic: '#a855f7',
  legendary: '#f59e0b',
};

export class GamingService {
  static getTierColor(tier: string): string {
    return TIER_COLORS[tier] || '#9ca3af';
  }

  static async getMysteryBoxes(): Promise<MysteryBox[]> {
    const { data } = await supabase
      .from('mystery_boxes')
      .select('*')
      .eq('is_active', true)
      .order('order_index');
    return (data || []).map((b: MysteryBox) => ({
      ...b,
      rewards: typeof b.rewards === 'string' ? JSON.parse(b.rewards) : b.rewards,
    }));
  }

  static rollBox(rewards: BoxReward[]): { tier: string; value: number } {
    const roll = Math.random();
    let cumulative = 0;

    for (const reward of rewards) {
      cumulative += reward.probability;
      if (roll <= cumulative) {
        const value =
          reward.min_value +
          Math.random() * (reward.max_value - reward.min_value);
        return { tier: reward.tier, value: Math.round(value * 100) / 100 };
      }
    }

    const last = rewards[rewards.length - 1];
    return {
      tier: last.tier,
      value: Math.round((last.min_value + Math.random() * (last.max_value - last.min_value)) * 100) / 100,
    };
  }

  static async recordPurchase(
    userId: string,
    boxId: string,
    rewardTier: string,
    rewardValue: number
  ): Promise<BoxPurchase | null> {
    const { data } = await supabase
      .from('box_purchases')
      .insert({ user_id: userId, box_id: boxId, reward_tier: rewardTier, reward_value: rewardValue })
      .select()
      .maybeSingle();
    return data;
  }

  static async getUserPurchases(userId: string): Promise<BoxPurchase[]> {
    const { data } = await supabase
      .from('box_purchases')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    return data || [];
  }

  static async getActiveGames(): Promise<TeamGame[]> {
    const { data: games } = await supabase
      .from('team_games')
      .select('*')
      .in('status', ['waiting', 'in_progress'])
      .order('created_at', { ascending: false });

    if (!games || games.length === 0) return [];

    const gameIds = games.map((g: TeamGame) => g.id);
    const { data: teams } = await supabase
      .from('teams')
      .select('*')
      .in('game_id', gameIds);

    if (!teams) return games;

    const teamIds = teams.map((t: Team) => t.id);
    const { data: members } = await supabase
      .from('team_members')
      .select('*')
      .in('team_id', teamIds);

    let memberProfiles: { id: string; username: string | null; avatar_url: string | null; wallet_address: string }[] = [];
    if (members && members.length > 0) {
      const userIds = [...new Set(members.map((m: TeamMember) => m.user_id))];
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, username, avatar_url, wallet_address')
        .in('id', userIds);
      memberProfiles = profiles || [];
    }

    const profileMap = new Map(memberProfiles.map((p) => [p.id, p]));

    const teamsWithMembers = teams.map((t: Team) => ({
      ...t,
      members: (members || [])
        .filter((m: TeamMember) => m.team_id === t.id)
        .map((m: TeamMember) => ({ ...m, profile: profileMap.get(m.user_id) })),
    }));

    const teamMap = new Map<string, Team[]>();
    for (const t of teamsWithMembers) {
      const arr = teamMap.get(t.game_id) || [];
      arr.push(t);
      teamMap.set(t.game_id, arr);
    }

    return games.map((g: TeamGame) => ({ ...g, teams: teamMap.get(g.id) || [] }));
  }

  static async createGame(name: string, entryFee: number, maxTeams = 2): Promise<TeamGame | null> {
    const prizePool = entryFee * 3 * maxTeams;
    const { data } = await supabase
      .from('team_games')
      .insert({ name, entry_fee: entryFee, prize_pool: prizePool, max_teams: maxTeams })
      .select()
      .maybeSingle();
    return data;
  }

  static async createTeam(gameId: string, teamName: string, userId: string): Promise<Team | null> {
    const { data: team } = await supabase
      .from('teams')
      .insert({ game_id: gameId, name: teamName })
      .select()
      .maybeSingle();

    if (!team) return null;

    await supabase
      .from('team_members')
      .insert({ team_id: team.id, user_id: userId, has_paid: true });

    return team;
  }

  static async joinTeam(teamId: string, userId: string): Promise<boolean> {
    const { error } = await supabase
      .from('team_members')
      .insert({ team_id: teamId, user_id: userId, has_paid: true });
    return !error;
  }

  static async getCompletedGames(limit = 10): Promise<TeamGame[]> {
    const { data } = await supabase
      .from('team_games')
      .select('*')
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(limit);
    return data || [];
  }
}
