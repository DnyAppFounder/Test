import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

function sanitizeSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function generateUniqueSlug(baseSlug: string, existingSlugs: string[]): string {
  let slug = baseSlug;
  let counter = 1;
  while (existingSlugs.includes(slug)) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }
  return slug;
}

async function checkSlugExists(
  supabase: any,
  slug: string,
  excludePageId?: string
): Promise<boolean> {
  const query = supabase
    .from("pages")
    .select("id", { count: "exact", head: true })
    .eq("slug", slug);

  if (excludePageId) {
    query.neq("id", excludePageId);
  }

  const { count } = await query;
  return count !== null && count > 0;
}

async function verifyOwnership(
  supabase: any,
  pageId: string,
  walletAddress: string
): Promise<boolean> {
  const { data } = await supabase
    .from("pages")
    .select("owner_wallet")
    .eq("id", pageId)
    .single();

  return data?.owner_wallet === walletAddress;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");
    const body = req.method === "POST" ? await req.json() : {};

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // CREATE_PAGE
    if (action === "create_page") {
      const {
        wallet_address,
        title,
        slug: inputSlug,
        type,
        theme,
        global_settings,
        token_mint,
        token_name,
        token_symbol,
        token_logo_url,
        description,
      } = body;

      if (!wallet_address || !title || !type || !theme) {
        return json({ error: "Missing required fields" }, 400);
      }

      let baseSlug = inputSlug
        ? sanitizeSlug(inputSlug)
        : sanitizeSlug(title);

      if (!baseSlug) {
        baseSlug = "page";
      }

      const { data: existingPages } = await supabase
        .from("pages")
        .select("slug");
      const existingSlugs = (existingPages || []).map(
        (p: any) => p.slug
      );
      const finalSlug = generateUniqueSlug(baseSlug, existingSlugs);

      const { data: newPage, error } = await supabase
        .from("pages")
        .insert({
          owner_wallet: wallet_address,
          title,
          slug: finalSlug,
          type,
          status: "draft",
          theme,
          global_settings: global_settings || {},
          token_mint,
          token_name,
          token_symbol,
          token_logo_url,
          description,
          is_preview_enabled: false,
          is_created_on_dawen_visible: false,
          view_count: 0,
        })
        .select()
        .single();

      if (error) {
        return json({ error: error.message }, 400);
      }

      return json(newPage);
    }

    // UPDATE_PAGE
    if (action === "update_page") {
      const { wallet_address, page_id, ...updateFields } = body;

      if (!wallet_address || !page_id) {
        return json({ error: "Missing required fields" }, 400);
      }

      const isOwner = await verifyOwnership(
        supabase,
        page_id,
        wallet_address
      );
      if (!isOwner) {
        return json({ error: "Not authorized" }, 403);
      }

      let updateData: any = {};

      if (updateFields.title !== undefined) updateData.title = updateFields.title;
      if (updateFields.slug !== undefined) {
        const newSlug = sanitizeSlug(updateFields.slug);
        const slugExists = await checkSlugExists(
          supabase,
          newSlug,
          page_id
        );
        if (slugExists) {
          return json(
            { error: "Slug already exists" },
            400
          );
        }
        updateData.slug = newSlug;
      }
      if (updateFields.type !== undefined) updateData.type = updateFields.type;
      if (updateFields.theme !== undefined)
        updateData.theme = updateFields.theme;
      if (updateFields.global_settings !== undefined)
        updateData.global_settings = updateFields.global_settings;
      if (updateFields.description !== undefined)
        updateData.description = updateFields.description;
      if (updateFields.og_image_url !== undefined)
        updateData.og_image_url = updateFields.og_image_url;
      if (updateFields.is_preview_enabled !== undefined)
        updateData.is_preview_enabled = updateFields.is_preview_enabled;
      if (updateFields.is_created_on_dawen_visible !== undefined)
        updateData.is_created_on_dawen_visible =
          updateFields.is_created_on_dawen_visible;
      if (updateFields.token_mint !== undefined)
        updateData.token_mint = updateFields.token_mint;
      if (updateFields.token_name !== undefined)
        updateData.token_name = updateFields.token_name;
      if (updateFields.token_symbol !== undefined)
        updateData.token_symbol = updateFields.token_symbol;
      if (updateFields.token_logo_url !== undefined)
        updateData.token_logo_url = updateFields.token_logo_url;

      const { data: updatedPage, error } = await supabase
        .from("pages")
        .update(updateData)
        .eq("id", page_id)
        .select()
        .single();

      if (error) {
        return json({ error: error.message }, 400);
      }

      return json(updatedPage);
    }

    // PUBLISH_PAGE
    if (action === "publish_page") {
      const { wallet_address, page_id, status } = body;

      if (!wallet_address || !page_id || !status) {
        return json({ error: "Missing required fields" }, 400);
      }

      if (!["published", "draft", "unlisted", "archived"].includes(status)) {
        return json({ error: "Invalid status" }, 400);
      }

      const isOwner = await verifyOwnership(
        supabase,
        page_id,
        wallet_address
      );
      if (!isOwner) {
        return json({ error: "Not authorized" }, 403);
      }

      const updateData: any = { status };

      if (status === "published") {
        updateData.published_at = new Date().toISOString();
      }
      if (status === "archived") {
        updateData.archived_at = new Date().toISOString();
      }

      const { data: updatedPage, error } = await supabase
        .from("pages")
        .update(updateData)
        .eq("id", page_id)
        .select()
        .single();

      if (error) {
        return json({ error: error.message }, 400);
      }

      return json(updatedPage);
    }

    // DELETE_PAGE
    if (action === "delete_page") {
      const { wallet_address, page_id } = body;

      if (!wallet_address || !page_id) {
        return json({ error: "Missing required fields" }, 400);
      }

      const isOwner = await verifyOwnership(
        supabase,
        page_id,
        wallet_address
      );
      if (!isOwner) {
        return json({ error: "Not authorized" }, 403);
      }

      const { error } = await supabase
        .from("pages")
        .delete()
        .eq("id", page_id);

      if (error) {
        return json({ error: error.message }, 400);
      }

      return json({ success: true });
    }

    // DUPLICATE_PAGE
    if (action === "duplicate_page") {
      const { wallet_address, page_id, new_title } = body;

      if (!wallet_address || !page_id) {
        return json({ error: "Missing required fields" }, 400);
      }

      const isOwner = await verifyOwnership(
        supabase,
        page_id,
        wallet_address
      );
      if (!isOwner) {
        return json({ error: "Not authorized" }, 403);
      }

      const { data: originalPage, error: pageError } = await supabase
        .from("pages")
        .select("*")
        .eq("id", page_id)
        .single();

      if (pageError || !originalPage) {
        return json({ error: "Page not found" }, 404);
      }

      const { data: originalBlocks } = await supabase
        .from("page_blocks")
        .select("*")
        .eq("page_id", page_id);

      let baseSlug = sanitizeSlug(new_title || originalPage.title);
      if (!baseSlug) baseSlug = "page";

      const { data: existingPages } = await supabase
        .from("pages")
        .select("slug");
      const existingSlugs = (existingPages || []).map(
        (p: any) => p.slug
      );
      const newSlug = generateUniqueSlug(baseSlug, existingSlugs);

      const { data: newPage, error: insertError } = await supabase
        .from("pages")
        .insert({
          owner_wallet: originalPage.owner_wallet,
          title: new_title || `${originalPage.title} (Copy)`,
          slug: newSlug,
          type: originalPage.type,
          status: "draft",
          theme: originalPage.theme,
          global_settings: originalPage.global_settings,
          token_mint: originalPage.token_mint,
          token_name: originalPage.token_name,
          token_symbol: originalPage.token_symbol,
          token_logo_url: originalPage.token_logo_url,
          description: originalPage.description,
          is_preview_enabled: false,
          is_created_on_dawen_visible: false,
          view_count: 0,
        })
        .select()
        .single();

      if (insertError || !newPage) {
        return json({ error: insertError?.message || "Failed to create page" }, 400);
      }

      const newBlocks = (originalBlocks || []).map((block: any) => ({
        page_id: newPage.id,
        block_type: block.block_type,
        sort_order: block.sort_order,
        content_json: block.content_json,
        style_json: block.style_json,
        animation_json: block.animation_json,
        is_hidden: block.is_hidden,
      }));

      let insertedBlocks: any[] = [];
      if (newBlocks.length > 0) {
        const { data, error: blocksError } = await supabase
          .from("page_blocks")
          .insert(newBlocks)
          .select();

        if (!blocksError && data) {
          insertedBlocks = data;
        }
      }

      return json({
        page: newPage,
        blocks: insertedBlocks,
      });
    }

    // SAVE_BLOCKS
    if (action === "save_blocks") {
      const { wallet_address, page_id, blocks } = body;

      if (!wallet_address || !page_id || !blocks || !Array.isArray(blocks)) {
        return json({ error: "Missing required fields" }, 400);
      }

      const isOwner = await verifyOwnership(
        supabase,
        page_id,
        wallet_address
      );
      if (!isOwner) {
        return json({ error: "Not authorized" }, 403);
      }

      const { data: existingBlocks } = await supabase
        .from("page_blocks")
        .select("id")
        .eq("page_id", page_id);

      const existingBlockIds = new Set(
        (existingBlocks || []).map((b: any) => b.id)
      );
      const incomingBlockIds = new Set(
        blocks.filter((b: any) => b.id).map((b: any) => b.id)
      );
      const blocksToDelete = Array.from(existingBlockIds).filter(
        (id) => !incomingBlockIds.has(id)
      );

      if (blocksToDelete.length > 0) {
        await supabase
          .from("page_blocks")
          .delete()
          .in("id", blocksToDelete);
      }

      const upsertBlocks = blocks.map((block: any) => ({
        ...block,
        page_id,
        is_hidden: block.is_hidden ?? false,
      }));

      let savedBlocks: any[] = [];

      for (const block of upsertBlocks) {
        if (block.id) {
          const { data, error } = await supabase
            .from("page_blocks")
            .update({
              block_type: block.block_type,
              sort_order: block.sort_order,
              content_json: block.content_json,
              style_json: block.style_json,
              animation_json: block.animation_json,
              is_hidden: block.is_hidden,
            })
            .eq("id", block.id)
            .select()
            .single();

          if (!error && data) {
            savedBlocks.push(data);
          }
        } else {
          const { data, error } = await supabase
            .from("page_blocks")
            .insert({
              page_id: block.page_id,
              block_type: block.block_type,
              sort_order: block.sort_order,
              content_json: block.content_json,
              style_json: block.style_json,
              animation_json: block.animation_json,
              is_hidden: block.is_hidden,
            })
            .select()
            .single();

          if (!error && data) {
            savedBlocks.push(data);
          }
        }
      }

      return json(savedBlocks);
    }

    // GET_MY_PAGES
    if (action === "get_my_pages") {
      const { wallet_address } = body;

      if (!wallet_address) {
        return json({ error: "Missing wallet_address" }, 400);
      }

      const { data: pages, error } = await supabase
        .from("pages")
        .select("*")
        .eq("owner_wallet", wallet_address)
        .order("created_at", { ascending: false });

      if (error) {
        return json({ error: error.message }, 400);
      }

      return json(pages || []);
    }

    // GET_PAGE_EDITOR
    if (action === "get_page_editor") {
      const { wallet_address, page_id } = body;

      if (!wallet_address || !page_id) {
        return json({ error: "Missing required fields" }, 400);
      }

      const isOwner = await verifyOwnership(
        supabase,
        page_id,
        wallet_address
      );
      if (!isOwner) {
        return json({ error: "Not authorized" }, 403);
      }

      const { data: page, error: pageError } = await supabase
        .from("pages")
        .select("*")
        .eq("id", page_id)
        .single();

      if (pageError || !page) {
        return json({ error: "Page not found" }, 404);
      }

      const { data: blocks } = await supabase
        .from("page_blocks")
        .select("*")
        .eq("page_id", page_id)
        .order("sort_order", { ascending: true });

      return json({
        page,
        blocks: blocks || [],
      });
    }

    // GET_PAGE_BY_SLUG
    if (action === "get_page_by_slug") {
      const { slug } = body;

      if (!slug) {
        return json({ error: "Missing slug" }, 400);
      }

      const { data: page, error: pageError } = await supabase
        .from("pages")
        .select("*")
        .eq("slug", slug)
        .in("status", ["published", "unlisted"])
        .single();

      if (pageError || !page) {
        return json({ error: "Page not found" }, 404);
      }

      await supabase
        .from("pages")
        .update({ view_count: (page.view_count || 0) + 1 })
        .eq("id", page.id);

      const { data: blocks } = await supabase
        .from("page_blocks")
        .select("*")
        .eq("page_id", page.id)
        .order("sort_order", { ascending: true });

      return json({
        page,
        blocks: blocks || [],
      });
    }

    // GET_PAGE_BY_PREVIEW_TOKEN
    if (action === "get_page_by_preview_token") {
      const { preview_token } = body;

      if (!preview_token) {
        return json({ error: "Missing preview_token" }, 400);
      }

      const { data: page, error: pageError } = await supabase
        .from("pages")
        .select("*")
        .eq("preview_token", preview_token)
        .single();

      if (pageError || !page) {
        return json({ error: "Invalid preview token" }, 404);
      }

      const { data: blocks } = await supabase
        .from("page_blocks")
        .select("*")
        .eq("page_id", page.id)
        .order("sort_order", { ascending: true });

      return json({
        page,
        blocks: blocks || [],
      });
    }

    // GET_ANALYTICS
    if (action === "get_analytics") {
      const { wallet_address, page_id } = body;

      if (!wallet_address || !page_id) {
        return json({ error: "Missing required fields" }, 400);
      }

      const isOwner = await verifyOwnership(
        supabase,
        page_id,
        wallet_address
      );
      if (!isOwner) {
        return json({ error: "Not authorized" }, 403);
      }

      const { data: page } = await supabase
        .from("pages")
        .select("view_count")
        .eq("id", page_id)
        .single();

      const { data: events } = await supabase
        .from("page_analytics_events")
        .select("*")
        .eq("page_id", page_id);

      const { data: submissions } = await supabase
        .from("page_form_submissions")
        .select("*")
        .eq("page_id", page_id);

      const eventsByType: Record<string, number> = {};
      const topButtons: Record<string, number> = {};
      const recentDays: Record<string, number> = {};

      for (let i = 0; i < 7; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateKey = date.toISOString().split("T")[0];
        recentDays[dateKey] = 0;
      }

      (events || []).forEach((event: any) => {
        eventsByType[event.event_type] =
          (eventsByType[event.event_type] || 0) + 1;

        if (event.event_type === "button_click" && event.block_id) {
          topButtons[event.block_id] = (topButtons[event.block_id] || 0) + 1;
        }

        const eventDate = event.created_at?.split("T")[0];
        if (eventDate && eventDate in recentDays) {
          recentDays[eventDate]++;
        }
      });

      const buttonClicks = Object.values(topButtons).reduce(
        (sum: number, count: number) => sum + count,
        0
      );

      return json({
        total_views: page?.view_count || 0,
        events_by_type: eventsByType,
        top_buttons: topButtons,
        recent_days: recentDays,
        form_submissions: submissions?.length || 0,
        button_clicks: buttonClicks,
      });
    }

    // SUBMIT_FORM
    if (action === "submit_form") {
      const {
        page_id,
        block_id,
        wallet_address,
        x_handle,
        telegram,
        email,
        note,
      } = body;

      if (!page_id || !block_id) {
        return json({ error: "Missing required fields" }, 400);
      }

      const { error } = await supabase
        .from("page_form_submissions")
        .insert({
          page_id,
          block_id,
          wallet_address,
          x_handle,
          telegram,
          email,
          note,
        });

      if (error) {
        return json({ error: error.message }, 400);
      }

      return json({ success: true });
    }

    // TRACK_EVENT
    if (action === "track_event") {
      const {
        page_id,
        event_type,
        block_id,
        visitor_id,
        session_id,
        referrer,
        device_type,
        metadata_json,
      } = body;

      if (!page_id || !event_type) {
        return json({ error: "Missing required fields" }, 400);
      }

      const { error } = await supabase
        .from("page_analytics_events")
        .insert({
          page_id,
          event_type,
          block_id,
          visitor_id,
          session_id,
          referrer,
          device_type,
          metadata_json,
        });

      if (error) {
        console.error("Failed to track event:", error);
      }

      return json({ success: true });
    }

    // CHECK_SLUG
    if (action === "check_slug") {
      const { slug, exclude_page_id } = body;

      if (!slug) {
        return json({ error: "Missing slug" }, 400);
      }

      const sanitized = sanitizeSlug(slug);
      const exists = await checkSlugExists(
        supabase,
        sanitized,
        exclude_page_id
      );

      if (exists) {
        const { data: existingPages } = await supabase
          .from("pages")
          .select("slug")
          .like("slug", `${sanitized}%`);

        const existingSlugs = (existingPages || []).map(
          (p: any) => p.slug
        );
        const suggestion = generateUniqueSlug(sanitized, existingSlugs);

        return json({
          available: false,
          suggestion,
        });
      }

      return json({ available: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error("Error:", error);
    return json(
      {
        error:
          error instanceof Error ? error.message : "Internal server error",
      },
      500
    );
  }
});
