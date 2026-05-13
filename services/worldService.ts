import { supabase } from '@/lib/supabase';
import { payToTreasury } from './treasuryService';

// ─── Constants ────────────────────────────────────────────────────────────────
export const PLAZA_ROOM_ID = '00000000-0000-0000-0000-000000000001';
export const DAWEN_TOKEN_MINT = '43m6D8gCagyJ4K6NjETr3wjSUUSAAwaFznKbCUECpump';
export const GRID_W = 10;
export const GRID_H = 8;

// ─── Types ────────────────────────────────────────────────────────────────────
export interface AvatarConfig {
  bodyColor: string;
  outfitColor: string;
  hairStyle: number;
  auraColor: string | null;
}

export const DEFAULT_AVATAR: AvatarConfig = {
  bodyColor: '#8B5CF6',
  outfitColor: '#EC4899',
  hairStyle: 0,
  auraColor: null,
};

export interface WorldRoom {
  id: string;
  owner_wallet: string | null;
  name: string;
  type: 'official' | 'personal' | 'user_created';
  visibility: 'public' | 'private' | 'invite_only';
  theme: string;
  is_default_personal_room: boolean;
  size_tier?: 'standard' | 'large' | 'mega';
  room_width?: number;
  room_height?: number;
  max_players?: number;
  online_count?: number;
}

export type SizeTier = 'standard' | 'large' | 'mega';

export const SIZE_TIER_CONFIG: Record<SizeTier, {
  label: string; emoji: string; width: number; height: number;
  maxPlayers: number; solPrice: number; description: string;
}> = {
  standard: { label: 'Standard',   emoji: '🏠', width: 10, height: 8,  maxPlayers: 20, solPrice: 0,    description: 'Free — 10×8 grid, up to 20 players' },
  large:    { label: 'Large Room', emoji: '🏢', width: 14, height: 10, maxPlayers: 40, solPrice: 0.05, description: '14×10 grid, up to 40 players' },
  mega:     { label: 'Mega Room',  emoji: '🏰', width: 20, height: 14, maxPlayers: 80, solPrice: 0.15, description: '20×14 grid, up to 80 players' },
};

export interface WorldPresence {
  id: string;
  wallet_address: string;
  room_id: string;
  x: number;
  y: number;
  username: string;
  avatar_config: AvatarConfig | null;
  is_premium: boolean;
  is_online: boolean;
  last_seen: string;
}

export interface WorldMessage {
  id: string;
  room_id: string;
  wallet_address: string;
  username: string;
  message_text: string;
  avatar_config: AvatarConfig | null;
  created_at: string;
}

export interface WorldCatalogItem {
  id: string;
  item_name: string;
  category: string;
  item_type: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  icon_emoji: string;
  color_hex: string;
  price_sol: number | null;
  price_dawen: number | null;
  is_starter: boolean;
  is_premium_only: boolean;
  is_nft_backed: boolean;
  sort_order: number;
}

export interface WorldInventoryItem {
  id: string;
  wallet_address: string;
  item_id: string;
  quantity: number;
  source: 'starter' | 'purchased_sol' | 'purchased_dawen' | 'nft';
  catalog_item: WorldCatalogItem;
}

export interface WorldRoomItem {
  id: string;
  room_id: string;
  owner_wallet: string;
  inventory_item_id: string | null;
  item_id: string;
  x: number;
  y: number;
  rotation: number;
  catalog_item: WorldCatalogItem;
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
export async function getWorldAvatar(walletAddress: string): Promise<AvatarConfig | null> {
  const { data } = await supabase
    .from('world_avatar_profiles')
    .select('avatar_config')
    .eq('wallet_address', walletAddress)
    .maybeSingle();
  return (data?.avatar_config as AvatarConfig) ?? null;
}

export async function saveWorldAvatar(walletAddress: string, config: AvatarConfig): Promise<void> {
  await supabase
    .from('world_avatar_profiles')
    .upsert({ wallet_address: walletAddress, avatar_config: config, updated_at: new Date().toISOString() },
      { onConflict: 'wallet_address' });
}

// ─── Rooms ────────────────────────────────────────────────────────────────────
export async function getPlazaRoom(): Promise<WorldRoom | null> {
  const { data } = await supabase
    .from('world_rooms')
    .select('*')
    .eq('id', PLAZA_ROOM_ID)
    .maybeSingle();
  return data as WorldRoom | null;
}

export async function getOrCreateMyRoom(walletAddress: string, username: string): Promise<WorldRoom> {
  const { data: existing } = await supabase
    .from('world_rooms')
    .select('*')
    .eq('owner_wallet', walletAddress)
    .eq('is_default_personal_room', true)
    .maybeSingle();
  if (existing) return existing as WorldRoom;

  const { data, error } = await supabase
    .from('world_rooms')
    .insert({
      owner_wallet: walletAddress,
      name: `${username || 'My'}'s Room`,
      type: 'personal',
      visibility: 'public',
      theme: 'Purple Lounge',
      is_default_personal_room: true,
    })
    .select()
    .single();
  if (error) throw error;
  return data as WorldRoom;
}

export async function getPublicRooms(): Promise<WorldRoom[]> {
  const { data } = await supabase
    .from('world_rooms')
    .select('*')
    .eq('visibility', 'public')
    .order('updated_at', { ascending: false })
    .limit(50);
  return (data ?? []) as WorldRoom[];
}

export async function getMyRooms(walletAddress: string): Promise<WorldRoom[]> {
  const { data } = await supabase
    .from('world_rooms')
    .select('*')
    .eq('owner_wallet', walletAddress)
    .order('created_at', { ascending: false });
  return (data ?? []) as WorldRoom[];
}

export async function createRoom(params: {
  walletAddress: string;
  name: string;
  theme: string;
  visibility: 'public' | 'private' | 'invite_only';
}): Promise<WorldRoom> {
  const { data, error } = await supabase
    .from('world_rooms')
    .insert({
      owner_wallet: params.walletAddress,
      name: params.name,
      type: 'user_created',
      visibility: params.visibility,
      theme: params.theme,
      is_default_personal_room: false,
    })
    .select()
    .single();
  if (error) throw error;
  return data as WorldRoom;
}

export async function updateRoom(roomId: string, params: Partial<Pick<WorldRoom, 'name' | 'visibility' | 'theme'>>): Promise<void> {
  await supabase.from('world_rooms').update({ ...params, updated_at: new Date().toISOString() }).eq('id', roomId);
}

export async function deleteRoom(roomId: string): Promise<void> {
  await supabase.from('world_rooms').delete().eq('id', roomId).neq('id', PLAZA_ROOM_ID);
}

export async function upgradeRoom(
  roomId: string,
  walletAddress: string,
  tier: SizeTier,
  txSignature: string,
  solPaid: number,
): Promise<void> {
  const cfg = SIZE_TIER_CONFIG[tier];
  await supabase.from('world_rooms').update({
    size_tier: tier,
    room_width: cfg.width,
    room_height: cfg.height,
    max_players: cfg.maxPlayers,
    updated_at: new Date().toISOString(),
  }).eq('id', roomId);
  await supabase.from('world_room_upgrades').insert({
    room_id: roomId,
    wallet_address: walletAddress,
    tier,
    sol_paid: solPaid,
    tx_signature: txSignature,
  });
}

// ─── Presence ─────────────────────────────────────────────────────────────────
export async function upsertPresence(params: {
  walletAddress: string;
  roomId: string;
  x: number;
  y: number;
  username: string;
  avatarConfig: AvatarConfig;
  isPremium: boolean;
}): Promise<void> {
  await supabase.from('world_presence').upsert({
    wallet_address: params.walletAddress,
    room_id: params.roomId,
    x: params.x,
    y: params.y,
    username: params.username,
    avatar_config: params.avatarConfig,
    is_premium: params.isPremium,
    is_online: true,
    last_seen: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'wallet_address,room_id' });
}

export async function leaveRoom(walletAddress: string, roomId: string): Promise<void> {
  await supabase.from('world_presence')
    .update({ is_online: false, updated_at: new Date().toISOString() })
    .eq('wallet_address', walletAddress)
    .eq('room_id', roomId);
}

export async function getRoomPresence(roomId: string): Promise<WorldPresence[]> {
  const cutoff = new Date(Date.now() - 30_000).toISOString();
  const { data } = await supabase
    .from('world_presence')
    .select('*')
    .eq('room_id', roomId)
    .eq('is_online', true)
    .gte('last_seen', cutoff);
  return (data ?? []) as WorldPresence[];
}

// ─── Messages ─────────────────────────────────────────────────────────────────
export async function sendMessage(params: {
  roomId: string;
  walletAddress: string;
  username: string;
  text: string;
  avatarConfig: AvatarConfig | null;
}): Promise<WorldMessage | null> {
  const { data, error } = await supabase
    .from('world_messages')
    .insert({
      room_id: params.roomId,
      wallet_address: params.walletAddress,
      username: params.username || 'Anonymous',
      message_text: params.text.slice(0, 200),
      avatar_config: params.avatarConfig,
    })
    .select()
    .single();
  if (error) return null;
  return data as WorldMessage;
}

export async function getMessages(roomId: string, limit = 40): Promise<WorldMessage[]> {
  const { data } = await supabase
    .from('world_messages')
    .select('*')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return ((data ?? []) as WorldMessage[]).reverse();
}

// ─── Catalog ─────────────────────────────────────────────────────────────────
export async function getCatalog(): Promise<WorldCatalogItem[]> {
  const { data } = await supabase
    .from('world_item_catalog')
    .select('*')
    .order('sort_order', { ascending: true });
  return (data ?? []) as WorldCatalogItem[];
}

// ─── Inventory ────────────────────────────────────────────────────────────────
export async function getInventory(walletAddress: string): Promise<WorldInventoryItem[]> {
  const { data } = await supabase
    .from('world_inventory')
    .select('*, catalog_item:world_item_catalog(*)')
    .eq('wallet_address', walletAddress)
    .gt('quantity', 0);
  return (data ?? []) as WorldInventoryItem[];
}

export async function grantStarterItems(walletAddress: string): Promise<void> {
  const { data: starters } = await supabase
    .from('world_item_catalog')
    .select('id')
    .eq('is_starter', true);
  if (!starters?.length) return;

  const { data: existing } = await supabase
    .from('world_inventory')
    .select('item_id')
    .eq('wallet_address', walletAddress)
    .eq('source', 'starter');

  const existingIds = new Set((existing ?? []).map((e: any) => e.item_id));
  const toGrant = starters.filter((s: any) => !existingIds.has(s.id));
  if (!toGrant.length) return;

  await supabase.from('world_inventory').insert(
    toGrant.map((s: any) => ({
      wallet_address: walletAddress,
      item_id: s.id,
      quantity: 1,
      source: 'starter',
    }))
  );
}

// ─── Purchase ─────────────────────────────────────────────────────────────────
export async function purchaseWorldItem(params: {
  walletAddress: string;
  item: WorldCatalogItem;
  currency: 'SOL' | 'DAWEN';
  connectedWalletId?: string | null;
  internalAccountIndex?: number;
  onStatus?: (s: string) => void;
}): Promise<{ success: boolean; error?: string }> {
  const { walletAddress, item, currency, connectedWalletId, internalAccountIndex, onStatus } = params;

  const amountSol  = currency === 'SOL' ? (item.price_sol ?? 0) : undefined;
  const amountDawen = currency === 'DAWEN' ? (item.price_dawen ?? 0) : undefined;

  if (!amountSol && !amountDawen) return { success: false, error: 'Item has no price configured' };

  // Create pending purchase record
  const { data: purchase, error: pErr } = await supabase
    .from('world_purchases')
    .insert({
      wallet_address: walletAddress,
      item_id: item.id,
      quantity: 1,
      currency,
      amount_paid: amountSol ?? amountDawen ?? 0,
      status: 'pending',
    })
    .select()
    .single();
  if (pErr) return { success: false, error: 'Failed to create purchase record' };

  // Execute payment
  const result = await payToTreasury({
    fromAddress: walletAddress,
    amountSol: amountSol,
    amountToken: amountDawen ? Number(amountDawen) : undefined,
    tokenMint: amountDawen ? DAWEN_TOKEN_MINT : undefined,
    connectedWalletId: connectedWalletId ?? null,
    internalAccountIndex,
    onStatus,
  });

  if (!result.success) {
    await supabase.from('world_purchases').update({ status: 'failed' }).eq('id', purchase.id);
    return { success: false, error: result.error ?? 'Transaction failed' };
  }

  // Confirm purchase + grant item
  await supabase.from('world_purchases').update({
    status: 'confirmed',
    tx_signature: result.signature,
    confirmed_at: new Date().toISOString(),
  }).eq('id', purchase.id);

  // Add to inventory (upsert quantity)
  const source = currency === 'SOL' ? 'purchased_sol' : 'purchased_dawen';
  const { data: inv } = await supabase
    .from('world_inventory')
    .select('id, quantity')
    .eq('wallet_address', walletAddress)
    .eq('item_id', item.id)
    .eq('source', source)
    .maybeSingle();

  if (inv) {
    await supabase.from('world_inventory').update({ quantity: inv.quantity + 1, updated_at: new Date().toISOString() }).eq('id', inv.id);
  } else {
    await supabase.from('world_inventory').insert({
      wallet_address: walletAddress,
      item_id: item.id,
      quantity: 1,
      source,
      purchase_tx_signature: result.signature,
    });
  }

  return { success: true };
}

// ─── Room Items ───────────────────────────────────────────────────────────────
export async function getRoomItems(roomId: string): Promise<WorldRoomItem[]> {
  const { data } = await supabase
    .from('world_room_items')
    .select('*, catalog_item:world_item_catalog(*)')
    .eq('room_id', roomId);
  return (data ?? []) as WorldRoomItem[];
}

export async function placeRoomItem(params: {
  roomId: string;
  walletAddress: string;
  inventoryItemId: string;
  itemId: string;
  x: number;
  y: number;
  rotation: number;
}): Promise<WorldRoomItem | null> {
  const { data, error } = await supabase
    .from('world_room_items')
    .insert({
      room_id: params.roomId,
      owner_wallet: params.walletAddress,
      inventory_item_id: params.inventoryItemId,
      item_id: params.itemId,
      x: params.x,
      y: params.y,
      rotation: params.rotation,
    })
    .select('*, catalog_item:world_item_catalog(*)')
    .single();
  if (error) return null;
  return data as WorldRoomItem;
}

export async function removeRoomItem(roomItemId: string): Promise<void> {
  await supabase.from('world_room_items').delete().eq('id', roomItemId);
}

export async function moveRoomItem(roomItemId: string, x: number, y: number, rotation: number): Promise<void> {
  await supabase.from('world_room_items').update({ x, y, rotation, updated_at: new Date().toISOString() }).eq('id', roomItemId);
}

// ─── Realtime helpers ─────────────────────────────────────────────────────────
export function subscribeToRoomMessages(roomId: string, onMessage: (msg: WorldMessage) => void) {
  return supabase
    .channel(`world_chat_${roomId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'world_messages',
      filter: `room_id=eq.${roomId}`,
    }, (payload) => {
      if (payload.new) onMessage(payload.new as WorldMessage);
    })
    .subscribe();
}

export function subscribeToRoomPresence(roomId: string, onUpdate: () => void) {
  return supabase
    .channel(`world_presence_${roomId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'world_presence',
      filter: `room_id=eq.${roomId}`,
    }, () => onUpdate())
    .subscribe();
}

export function subscribeToRoomItems(roomId: string, onUpdate: () => void) {
  return supabase
    .channel(`world_items_${roomId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'world_room_items',
      filter: `room_id=eq.${roomId}`,
    }, () => onUpdate())
    .subscribe();
}

// ─── Realtime broadcast for immediate position updates ────────────────────────

export interface PositionBroadcast {
  walletAddress: string;
  x: number;
  y: number;
  username: string;
  avatarConfig: AvatarConfig;
  isPremium: boolean;
}

export function createPositionChannel(roomId: string) {
  return supabase.channel(`world_pos_${roomId}`);
}

export function broadcastPosition(
  channel: ReturnType<typeof createPositionChannel>,
  data: PositionBroadcast
) {
  channel.send({ type: 'broadcast', event: 'move', payload: data }).catch(() => {});
}

// Creates a subscribed channel that both RECEIVES position broadcasts from other players
// and can be used to SEND this player's position via broadcastPosition().
export function subscribeToPositionBroadcasts(
  roomId: string,
  onMove: (data: PositionBroadcast) => void
) {
  return supabase
    .channel(`world_pos_${roomId}`)
    .on('broadcast', { event: 'move' }, (event) => {
      if (event.payload) onMove(event.payload as PositionBroadcast);
    })
    .subscribe();
}

// ─── Room online count helper ─────────────────────────────────────────────────
export async function getRoomsWithCounts(rooms: WorldRoom[]): Promise<WorldRoom[]> {
  if (!rooms.length) return rooms;
  const cutoff = new Date(Date.now() - 30_000).toISOString();
  const ids = rooms.map(r => r.id);
  const { data } = await supabase
    .from('world_presence')
    .select('room_id')
    .in('room_id', ids)
    .eq('is_online', true)
    .gte('last_seen', cutoff);

  const counts: Record<string, number> = {};
  (data ?? []).forEach((p: any) => { counts[p.room_id] = (counts[p.room_id] ?? 0) + 1; });
  return rooms.map(r => ({ ...r, online_count: counts[r.id] ?? 0 }));
}
