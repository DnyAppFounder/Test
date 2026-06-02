import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || "";
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";

// Types
export type PageStatus = "draft" | "published" | "unlisted" | "archived";
export type PageType =
  | "token"
  | "project"
  | "personal"
  | "link-in-bio"
  | "whitelist"
  | "claim"
  | "countdown"
  | "general";

export type BlockType =
  | "hero"
  | "text"
  | "button"
  | "social_links"
  | "token_info"
  | "live_chart"
  | "buy_widget"
  | "roadmap"
  | "tokenomics"
  | "team"
  | "faq"
  | "gallery"
  | "video"
  | "countdown"
  | "whitelist_form"
  | "claim"
  | "media_kit"
  | "announcement"
  | "embed"
  | "qr_code"
  | "footer"
  | "custom_section";

export interface Page {
  id: string;
  owner_user_id?: string;
  owner_wallet: string;
  title: string;
  slug: string;
  type: PageType;
  status: PageStatus;
  theme: string;
  global_settings: Record<string, any>;
  token_mint?: string;
  token_name?: string;
  token_symbol?: string;
  token_logo_url?: string;
  description?: string;
  og_image_url?: string;
  preview_token?: string;
  is_preview_enabled: boolean;
  is_created_on_dawen_visible: boolean;
  view_count: number;
  created_at: string;
  updated_at: string;
  published_at?: string;
  archived_at?: string;
}

export interface PageBlock {
  id: string;
  page_id: string;
  block_type: BlockType;
  sort_order: number;
  content_json: Record<string, any>;
  style_json: Record<string, any>;
  animation_json: Record<string, any>;
  is_hidden: boolean;
  created_at: string;
  updated_at: string;
}

export interface AnalyticsData {
  total_views: number;
  events_by_type: Record<string, number>;
  top_buttons: Record<string, number>;
  recent_days: Record<string, number>;
  form_submissions: number;
  button_clicks: number;
}

// Helper function to make edge function calls
async function callEdgeFunction(
  action: string,
  payload: any
): Promise<any> {
  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/page-studio?action=${action}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ANON_KEY}`,
        Apikey: ANON_KEY,
      },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error || `Edge function error: ${response.statusText}`
    );
  }

  return response.json();
}

// Utility function to generate slug from title
export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// Create a new page
export async function createPage(
  walletAddress: string,
  params: {
    title: string;
    slug?: string;
    type: PageType;
    theme: string;
    global_settings?: Record<string, any>;
    token_mint?: string;
    token_name?: string;
    token_symbol?: string;
    token_logo_url?: string;
    description?: string;
  }
): Promise<Page> {
  const result = await callEdgeFunction("create_page", {
    wallet_address: walletAddress,
    ...params,
  });
  return result;
}

// Update an existing page
export async function updatePage(
  walletAddress: string,
  pageId: string,
  params: {
    title?: string;
    slug?: string;
    type?: PageType;
    theme?: string;
    global_settings?: Record<string, any>;
    description?: string;
    og_image_url?: string;
    is_preview_enabled?: boolean;
    is_created_on_dawen_visible?: boolean;
    token_mint?: string;
    token_name?: string;
    token_symbol?: string;
    token_logo_url?: string;
  }
): Promise<Page> {
  const result = await callEdgeFunction("update_page", {
    wallet_address: walletAddress,
    page_id: pageId,
    ...params,
  });
  return result;
}

// Publish, unpublish, archive a page
export async function publishPage(
  walletAddress: string,
  pageId: string,
  status: PageStatus
): Promise<Page> {
  const result = await callEdgeFunction("publish_page", {
    wallet_address: walletAddress,
    page_id: pageId,
    status,
  });
  return result;
}

// Delete a page
export async function deletePage(
  walletAddress: string,
  pageId: string
): Promise<void> {
  await callEdgeFunction("delete_page", {
    wallet_address: walletAddress,
    page_id: pageId,
  });
}

// Duplicate a page with all blocks
export async function duplicatePage(
  walletAddress: string,
  pageId: string,
  newTitle?: string
): Promise<{ page: Page; blocks: PageBlock[] }> {
  const result = await callEdgeFunction("duplicate_page", {
    wallet_address: walletAddress,
    page_id: pageId,
    new_title: newTitle,
  });
  return result;
}

// Save all blocks for a page (replaces existing)
export async function saveBlocks(
  walletAddress: string,
  pageId: string,
  blocks: Array<{
    id?: string;
    block_type: BlockType;
    sort_order: number;
    content_json: Record<string, any>;
    style_json: Record<string, any>;
    animation_json: Record<string, any>;
    is_hidden?: boolean;
  }>
): Promise<PageBlock[]> {
  const result = await callEdgeFunction("save_blocks", {
    wallet_address: walletAddress,
    page_id: pageId,
    blocks,
  });
  return result;
}

// Get all pages owned by wallet
export async function getMyPages(walletAddress: string): Promise<Page[]> {
  const result = await callEdgeFunction("get_my_pages", {
    wallet_address: walletAddress,
  });
  return result;
}

// Get page and blocks for editing
export async function getPageEditor(
  walletAddress: string,
  pageId: string
): Promise<{ page: Page; blocks: PageBlock[] }> {
  const result = await callEdgeFunction("get_page_editor", {
    wallet_address: walletAddress,
    page_id: pageId,
  });
  return result;
}

// Get published/unlisted page by slug (public)
export async function getPageBySlug(
  slug: string
): Promise<{ page: Page; blocks: PageBlock[] }> {
  const result = await callEdgeFunction("get_page_by_slug", {
    slug,
  });
  return result;
}

// Get page by preview token
export async function getPageByPreviewToken(
  previewToken: string
): Promise<{ page: Page; blocks: PageBlock[] }> {
  const result = await callEdgeFunction("get_page_by_preview_token", {
    preview_token: previewToken,
  });
  return result;
}

// Get analytics for a page
export async function getAnalytics(
  walletAddress: string,
  pageId: string
): Promise<AnalyticsData> {
  const result = await callEdgeFunction("get_analytics", {
    wallet_address: walletAddress,
    page_id: pageId,
  });
  return result;
}

// Submit form on a page
export async function submitForm(params: {
  page_id: string;
  block_id: string;
  wallet_address?: string;
  x_handle?: string;
  telegram?: string;
  email?: string;
  note?: string;
}): Promise<void> {
  await callEdgeFunction("submit_form", params);
}

// Track analytics event (fire and forget)
export async function trackEvent(params: {
  page_id: string;
  event_type: string;
  block_id?: string;
  visitor_id?: string;
  session_id?: string;
  referrer?: string;
  device_type?: string;
  metadata_json?: Record<string, any>;
}): Promise<void> {
  callEdgeFunction("track_event", params).catch(() => {
    // Silently ignore errors for tracking
  });
}

// Check if slug is available
export async function checkSlug(
  slug: string,
  excludePageId?: string
): Promise<{ available: boolean; suggestion?: string }> {
  const result = await callEdgeFunction("check_slug", {
    slug,
    exclude_page_id: excludePageId,
  });
  return result;
}
