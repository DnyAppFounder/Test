const BASE = '/assets/dawen-world';
const F = `${BASE}/furniture`;
const R = `${BASE}/rooms`;
const P = `${BASE}/pets`;

export interface WorldAsset {
  defaultUrl: string;
  leftUrl?: string;
  rightUrl?: string;
  topLeftUrl?: string;
  topRightUrl?: string;
  animatedUrl?: string;
  width?: number;
  height?: number;
}

// Full asset catalog — keyed by filename stem for direct access
export const DAWEN_ASSETS = {
  // ─── BEDS ───────────────────────────────────────────────────────────────────
  sleeper1_grey_blue: {
    defaultUrl: `${F}/beds/1_sleeper_right_grey_blue.png`,
    leftUrl: `${F}/beds/1_sleeper_top_left_grey_blue.png`,
    rightUrl: `${F}/beds/1_sleeper_right_grey_blue.png`,
    topLeftUrl: `${F}/beds/1_sleeper_top_left_grey_blue.png`,
    topRightUrl: `${F}/beds/1_sleeper_top_right_grey_blue.png`,
  },
  sleeper2_red: {
    defaultUrl: `${F}/beds/2_sleeper_right_red.png`,
    leftUrl: `${F}/beds/2_sleeper_left_red.png`,
    rightUrl: `${F}/beds/2_sleeper_right_red.png`,
    topLeftUrl: `${F}/beds/2_sleeper_top_left_redt.png`,
  },
  sleeper3_white: {
    defaultUrl: `${F}/beds/3_sleeper_right_white.png`,
    leftUrl: `${F}/beds/3_sleeper_left_white.png`,
    rightUrl: `${F}/beds/3_sleeper_right_white.png`,
    topLeftUrl: `${F}/beds/3_sleeper_top_left_white.png`,
    topRightUrl: `${F}/beds/3_sleeper_top_right_white.png`,
  },
  modern_double_bed_blue_grey: {
    defaultUrl: `${F}/beds/modern_double_bed_blue_grey_right.png`,
    leftUrl: `${F}/beds/modern_double_bed_blue_grey_left.png`,
    rightUrl: `${F}/beds/modern_double_bed_blue_grey_right.png`,
  },
  modern_double_bed_blue: {
    defaultUrl: `${F}/beds/modern_double_bed_blue_right.png`,
    rightUrl: `${F}/beds/modern_double_bed_blue_right.png`,
  },
  modern_double_bed_red: {
    defaultUrl: `${F}/beds/modern_double_bed_red_right.png`,
    leftUrl: `${F}/beds/modern_double_bed_red_left.png`,
    rightUrl: `${F}/beds/modern_double_bed_red_right.png`,
  },
  modern_double_bed_space: {
    defaultUrl: `${F}/beds/modern_double_bed_space_right.png`,
    leftUrl: `${F}/beds/modern_double_bed_space_left.png`,
    rightUrl: `${F}/beds/modern_double_bed_space_right.png`,
  },
  modern_single_bed_blue: {
    defaultUrl: `${F}/beds/modern_single_bed_blue_right.png`,
    leftUrl: `${F}/beds/modern_single_bed_blue_left.png`,
    rightUrl: `${F}/beds/modern_single_bed_blue_right.png`,
  },
  modern_single_bed_grey_blue: {
    defaultUrl: `${F}/beds/modern_single_bed_grey_blue_right.png`,
    leftUrl: `${F}/beds/modern_single_bed_grey_blue_left.png`,
    rightUrl: `${F}/beds/modern_single_bed_grey_blue_right.png`,
  },
  modern_single_bed_red: {
    defaultUrl: `${F}/beds/modern_single_bed_red_right.png`,
    leftUrl: `${F}/beds/modern_single_bed_red_left.png`,
    rightUrl: `${F}/beds/modern_single_bed_red_right.png`,
  },
  modern_single_bed_space: {
    defaultUrl: `${F}/beds/modern_single_bed_space_right.png`,
    leftUrl: `${F}/beds/modern_single_bed_space_left.png`,
    rightUrl: `${F}/beds/modern_single_bed_space_right.png`,
  },
  wood_double_bed_blue_grey: {
    defaultUrl: `${F}/beds/wood_double_bed_blue_grey_right.png`,
    leftUrl: `${F}/beds/wood_double_bed_blue_grey_left.png`,
    rightUrl: `${F}/beds/wood_double_bed_blue_grey_right.png`,
  },
  wood_double_bed_blue: {
    defaultUrl: `${F}/beds/wood_double_bed_blue_right.png`,
    leftUrl: `${F}/beds/wood_double_bed_blue_left.png`,
    rightUrl: `${F}/beds/wood_double_bed_blue_right.png`,
  },
  wood_double_bed_red: {
    defaultUrl: `${F}/beds/wood_double_bed_red_right.png`,
    leftUrl: `${F}/beds/wood_double_bed_red_left.png`,
    rightUrl: `${F}/beds/wood_double_bed_red_right.png`,
  },
  wood_double_bed_space: {
    defaultUrl: `${F}/beds/wood_double_bed_space_right.png`,
    leftUrl: `${F}/beds/wood_double_bed_space_left.png`,
    rightUrl: `${F}/beds/wood_double_bed_space_right.png`,
  },
  wood_single_bed_blue: {
    defaultUrl: `${F}/beds/wood_single_bed_blue_right.png`,
    leftUrl: `${F}/beds/wood_single_bed_blue_left.png`,
    rightUrl: `${F}/beds/wood_single_bed_blue_right.png`,
  },
  wood_single_bed_grey_blue: {
    defaultUrl: `${F}/beds/wood_single_bed_grey_blue_right.png`,
    leftUrl: `${F}/beds/wood_single_bed_grey_blue_left.png`,
    rightUrl: `${F}/beds/wood_single_bed_grey_blue_right.png`,
  },
  wood_single_bed_red: {
    defaultUrl: `${F}/beds/wood_single_bed_red_right.png`,
    leftUrl: `${F}/beds/wood_single_bed_red_left.png`,
    rightUrl: `${F}/beds/wood_single_bed_red_right.png`,
  },
  wood_single_bed_space: {
    defaultUrl: `${F}/beds/wood_single_bed_space_right.png`,
    leftUrl: `${F}/beds/wood_single_bed_space_left.png`,
    rightUrl: `${F}/beds/wood_single_bed_space_right.png`,
  },
  bedside_table: {
    defaultUrl: `${F}/beds/bedside_table_right.png`,
    leftUrl: `${F}/beds/bedside_table_left.png`,
    rightUrl: `${F}/beds/bedside_table_right.png`,
  },
  large_bedside_table_blue: {
    defaultUrl: `${F}/beds/large_bedside_table_blue_left.png`,
    leftUrl: `${F}/beds/large_bedside_table_blue_left.png`,
  },

  // ─── CHAIRS ─────────────────────────────────────────────────────────────────
  chair_blue: {
    defaultUrl: `${F}/chairs/chair_blue_right.png`,
    leftUrl: `${F}/chairs/chair_blue_left.png`,
    rightUrl: `${F}/chairs/chair_blue_right.png`,
    topLeftUrl: `${F}/chairs/chair_blue_top_left.png`,
    topRightUrl: `${F}/chairs/chair_blue_top_right.png`,
  },
  chair_red: {
    defaultUrl: `${F}/chairs/chair_red_right.png`,
    leftUrl: `${F}/chairs/chair_red_left.png`,
    rightUrl: `${F}/chairs/chair_red_right.png`,
    topRightUrl: `${F}/chairs/chair_red_top_right.png`,
  },
  chair_white: {
    defaultUrl: `${F}/chairs/chair_white_right.png`,
    leftUrl: `${F}/chairs/chair_white_left.png`,
    rightUrl: `${F}/chairs/chair_white_right.png`,
    topLeftUrl: `${F}/chairs/chair_white_top_left.png`,
  },
  chair_wood: {
    defaultUrl: `${F}/chairs/Chair_wood_right.png`,
    leftUrl: `${F}/chairs/Chair_wood_left.png`,
    rightUrl: `${F}/chairs/Chair_wood_right.png`,
    topLeftUrl: `${F}/chairs/chair_wood_top_left.png`,
    topRightUrl: `${F}/chairs/chair_wood_top_right.png`,
  },
  cushion: {
    defaultUrl: `${F}/chairs/cushion_right.png`,
    leftUrl: `${F}/chairs/cushion_left.png`,
    rightUrl: `${F}/chairs/cushion_right.png`,
  },

  // ─── TABLES ─────────────────────────────────────────────────────────────────
  table_glass: {
    defaultUrl: `${F}/tables/table_glass_right.png`,
    leftUrl: `${F}/tables/table_glass_left.png`,
    rightUrl: `${F}/tables/table_glass_right.png`,
  },
  table_white: {
    defaultUrl: `${F}/tables/table_white_right.png`,
    rightUrl: `${F}/tables/table_white_right.png`,
  },
  table_wood: {
    defaultUrl: `${F}/tables/table_wood_right.png`,
    leftUrl: `${F}/tables/table_wood_left.png`,
    rightUrl: `${F}/tables/table_wood_right.png`,
  },
  books_table: {
    defaultUrl: `${F}/tables/books_table_right.png`,
    leftUrl: `${F}/tables/books_table_left.png`,
    rightUrl: `${F}/tables/books_table_right.png`,
  },
  small_table_glass: {
    defaultUrl: `${F}/tables/small_table_glass_right.png`,
    rightUrl: `${F}/tables/small_table_glass_right.png`,
  },
  small_table_white: {
    defaultUrl: `${F}/tables/small_table_white_right.png`,
    rightUrl: `${F}/tables/small_table_white_right.png`,
  },
  small_table_wood: {
    defaultUrl: `${F}/tables/small_table_wood_leftt.png`,
    leftUrl: `${F}/tables/small_table_wood_leftt.png`,
  },

  // ─── SHELVES ────────────────────────────────────────────────────────────────
  books_shelf: {
    defaultUrl: `${F}/shelves/books_shelf_right.png`,
    leftUrl: `${F}/shelves/books_shelf_left.png`,
    rightUrl: `${F}/shelves/books_shelf_right.png`,
  },
  simple_bookshelf_blue: {
    defaultUrl: `${F}/shelves/simple_bookshelf_blue_right.png`,
    leftUrl: `${F}/shelves/simple_bookshelf_blue_left.png`,
    rightUrl: `${F}/shelves/simple_bookshelf_blue_right.png`,
  },
  tall_blue_bookshelf: {
    defaultUrl: `${F}/shelves/tall_blue_bookshelf_with_closet_rightt.png`,
    leftUrl: `${F}/shelves/tall_blue_bookshelf_with_closet_left.png`,
    rightUrl: `${F}/shelves/tall_blue_bookshelf_with_closet_rightt.png`,
  },
  tall_bookshelf_closet: {
    defaultUrl: `${F}/shelves/tall_bookshelf_and_closet_right.png`,
    leftUrl: `${F}/shelves/tall_bookshelf_and_closet_left.png`,
    rightUrl: `${F}/shelves/tall_bookshelf_and_closet_right.png`,
  },
  wall_bookshelf: {
    defaultUrl: `${F}/shelves/wall_bookshelf_right.png`,
    leftUrl: `${F}/shelves/wall_bookshelf_left.png`,
    rightUrl: `${F}/shelves/wall_bookshelf_right.png`,
  },

  // ─── STORAGE ────────────────────────────────────────────────────────────────
  blue_drawer: {
    defaultUrl: `${F}/storage/blue_drawer_right.png`,
    leftUrl: `${F}/storage/blue_drawer_left.png`,
    rightUrl: `${F}/storage/blue_drawer_right.png`,
  },
  wooden_closet: {
    defaultUrl: `${F}/storage/wooden_closet_right.png`,
    leftUrl: `${F}/storage/wooden_closet_left.png`,
    rightUrl: `${F}/storage/wooden_closet_right.png`,
  },
  coathanger: {
    defaultUrl: `${F}/storage/coathanger_right.png`,
    leftUrl: `${F}/storage/coathanger_left.png`,
    rightUrl: `${F}/storage/coathanger_right.png`,
  },
  amazon_box: {
    defaultUrl: `${F}/storage/amazon_box_right.png`,
    rightUrl: `${F}/storage/amazon_box_right.png`,
  },
  box: {
    defaultUrl: `${F}/storage/box_right.png`,
    leftUrl: `${F}/storage/box_left.png`,
    rightUrl: `${F}/storage/box_right.png`,
  },

  // ─── LAMPS ──────────────────────────────────────────────────────────────────
  lamp_2: {
    defaultUrl: `${F}/lamps/lamp_2_right.png`,
    leftUrl: `${F}/lamps/lamp_2_left.png`,
    rightUrl: `${F}/lamps/lamp_2_right.png`,
  },
  small_lamp: {
    defaultUrl: `${F}/lamps/small_lamp.png`,
  },

  // ─── CARPETS ────────────────────────────────────────────────────────────────
  carpet_blue_white_rect: {
    defaultUrl: `${F}/carpets/blue_and_white_rectangle_carpet_left.png`,
    leftUrl: `${F}/carpets/blue_and_white_rectangle_carpet_left.png`,
  },
  carpet_blue_grey_round: {
    defaultUrl: `${F}/carpets/blue_grey_round_carpet_left.png`,
    leftUrl: `${F}/carpets/blue_grey_round_carpet_left.png`,
  },
  carpet_blue_round: {
    defaultUrl: `${F}/carpets/blue_round_carpet_left.png`,
    leftUrl: `${F}/carpets/blue_round_carpet_left.png`,
  },
  carpet_plain_rect: {
    defaultUrl: `${F}/carpets/plain_rectangle_carpet_right.png`,
    leftUrl: `${F}/carpets/plain_rectangle_carpet_left.png`,
    rightUrl: `${F}/carpets/plain_rectangle_carpet_right.png`,
  },

  // ─── PLANTS ─────────────────────────────────────────────────────────────────
  cactus: {
    defaultUrl: `${F}/plants/cactus.png`,
  },
  cactus2: {
    defaultUrl: `${F}/plants/cactus2.png`,
  },
  plant1: {
    defaultUrl: `${F}/plants/plant1.png`,
  },
  plant1_2: {
    defaultUrl: `${F}/plants/plant1-2.png`,
  },
  plant2: {
    defaultUrl: `${F}/plants/plant2-1.png`,
  },
  cat_tower: {
    defaultUrl: `${F}/plants/cat_tower_right.png`,
    leftUrl: `${F}/plants/cat_tower_left.png`,
    rightUrl: `${F}/plants/cat_tower_right.png`,
    topLeftUrl: `${F}/plants/cat_tower_top_left.png`,
    topRightUrl: `${F}/plants/cat_tower_top_right.png`,
  },

  // ─── WALL ITEMS ─────────────────────────────────────────────────────────────
  painting_people: {
    defaultUrl: `${F}/wall-items/painting_people_right.png`,
    leftUrl: `${F}/wall-items/painting_people_left.png`,
    rightUrl: `${F}/wall-items/painting_people_right.png`,
  },
  painting_planet: {
    defaultUrl: `${F}/wall-items/painting_planet_right.png`,
    leftUrl: `${F}/wall-items/painting_planet_left.png`,
    rightUrl: `${F}/wall-items/painting_planet_right.png`,
  },
  painting_ready_player: {
    defaultUrl: `${F}/wall-items/painting_ready_player_right.png`,
    leftUrl: `${F}/wall-items/painting_ready_player_left.png`,
    rightUrl: `${F}/wall-items/painting_ready_player_right.png`,
  },
  painting_scenery: {
    defaultUrl: `${F}/wall-items/painting_scenery_right.png`,
    leftUrl: `${F}/wall-items/painting_scenery_left.png`,
    rightUrl: `${F}/wall-items/painting_scenery_right.png`,
  },

  // ─── MIRRORS ────────────────────────────────────────────────────────────────
  modern_mirror: {
    defaultUrl: `${F}/mirrors/modern_mirror_facing_right.png`,
    leftUrl: `${F}/mirrors/modern_mirror_facing_left.png`,
    rightUrl: `${F}/mirrors/modern_mirror_facing_right.png`,
  },
  wood_mirror: {
    defaultUrl: `${F}/mirrors/wood_mirror_facing_left.png`,
    leftUrl: `${F}/mirrors/wood_mirror_facing_left.png`,
  },

  // ─── TECH ───────────────────────────────────────────────────────────────────
  big_screen_tv: {
    defaultUrl: `${F}/tech/big_screen_tv_with_feets_right.png`,
    rightUrl: `${F}/tech/big_screen_tv_with_feets_right.png`,
    animatedUrl: `${F}/tech/big_TV_Harry_potter_animation.gif`,
  },
  big_tv_wall: {
    defaultUrl: `${F}/tech/big_TV_wall_right.png`,
    leftUrl: `${F}/tech/big_TV_wall_left.png`,
    rightUrl: `${F}/tech/big_TV_wall_right.png`,
  },
  tv_stand: {
    defaultUrl: `${F}/tech/TV_stand_low_right.png`,
    leftUrl: `${F}/tech/TV_stand_low_left.png`,
    rightUrl: `${F}/tech/TV_stand_low_right.png`,
  },
  tv: {
    defaultUrl: `${F}/tech/TV_right.png`,
    rightUrl: `${F}/tech/TV_right.png`,
  },
  laptop: {
    defaultUrl: `${F}/tech/laptop_on_right.png`,
    leftUrl: `${F}/tech/laptop_on_left.png`,
    rightUrl: `${F}/tech/laptop_on_right.png`,
    animatedUrl: `${F}/tech/laptop_loading_right.gif`,
  },
  laptop_pong: {
    defaultUrl: `${F}/tech/laptop_on_right.png`,
    animatedUrl: `${F}/tech/laptop_pong_screen_right.gif`,
    leftUrl: `${F}/tech/laptop_pong_screen_left.gif`,
    rightUrl: `${F}/tech/laptop_pong_screen_right.gif`,
  },
  laptop_snake: {
    defaultUrl: `${F}/tech/laptop_on_right.png`,
    animatedUrl: `${F}/tech/laptop_snake_screen_right.gif`,
    leftUrl: `${F}/tech/laptop_snake_screen_left.gif`,
    rightUrl: `${F}/tech/laptop_snake_screen_right.gif`,
  },
  roomba: {
    defaultUrl: `${F}/tech/roomba_charing_right.png`,
    leftUrl: `${F}/tech/roomba_charing_left.png`,
    rightUrl: `${F}/tech/roomba_charing_right.png`,
  },

  // ─── MISC ───────────────────────────────────────────────────────────────────
  teddybear: {
    defaultUrl: `${F}/misc/teddybear_right.png`,
    leftUrl: `${F}/misc/teddybear_left.png`,
    rightUrl: `${F}/misc/teddybear_right.png`,
  },

  // ─── ROOMS: FLOORS ──────────────────────────────────────────────────────────
  floor_wood: {
    defaultUrl: `${R}/floors/wood_stripe_floor_right.png`,
    leftUrl: `${R}/floors/wood_stripe_floor_left.png`,
    rightUrl: `${R}/floors/wood_stripe_floor_right.png`,
  },
  floor_dark: {
    defaultUrl: `${R}/floors/dark_floor_right.png`,
    leftUrl: `${R}/floors/dark_floor_left.png`,
    rightUrl: `${R}/floors/dark_floor_right.png`,
  },
  floor_bright_wood: {
    defaultUrl: `${R}/floors/bright_wood_stripe_floor_left.png`,
    leftUrl: `${R}/floors/bright_wood_stripe_floor_left.png`,
  },
  floor_dark_wood: {
    defaultUrl: `${R}/floors/dark_wood_stripe_floor_right.png`,
    rightUrl: `${R}/floors/dark_wood_stripe_floor_right.png`,
  },

  // ─── ROOMS: WALLS ───────────────────────────────────────────────────────────
  wall_grey_blue_stripe: {
    defaultUrl: `${R}/walls/grey_blue_stripe_wall_right.png`,
    leftUrl: `${R}/walls/grey_blue_stripe_wall_left.png`,
    rightUrl: `${R}/walls/grey_blue_stripe_wall_right.png`,
  },
  wall_grey: {
    defaultUrl: `${R}/walls/grey_wall_right.png`,
    leftUrl: `${R}/walls/grey_wall_left.png`,
    rightUrl: `${R}/walls/grey_wall_right.png`,
  },
  wall_white_stripe: {
    defaultUrl: `${R}/walls/white_stripe_wall_right.png`,
    rightUrl: `${R}/walls/white_stripe_wall_right.png`,
  },
  wall_dual_color: {
    defaultUrl: `${R}/walls/dual_color_wall_left.png`,
    leftUrl: `${R}/walls/dual_color_wall_left.png`,
  },

  // ─── ROOMS: DOORS ───────────────────────────────────────────────────────────
  door_black: {
    defaultUrl: `${R}/doors/black_door_entrance_right.png`,
    leftUrl: `${R}/doors/black_door_entrance_left.png`,
    rightUrl: `${R}/doors/black_door_entrance_right.png`,
  },
  door_blue: {
    defaultUrl: `${R}/doors/blue_door_entrance_right.png`,
    leftUrl: `${R}/doors/blue_door_entrance_left.png`,
    rightUrl: `${R}/doors/blue_door_entrance_right.png`,
  },
  door_wooden: {
    defaultUrl: `${R}/doors/wooden_door_entrance_right.png`,
    leftUrl: `${R}/doors/wooden_door_entrance_left.png`,
    rightUrl: `${R}/doors/wooden_door_entrance_right.png`,
  },
  door_sliding: {
    defaultUrl: `${R}/doors/double_sliding_door_closed_right.png`,
    leftUrl: `${R}/doors/double_sliding_door_closed_left.png`,
    rightUrl: `${R}/doors/double_sliding_door_closed_right.png`,
    animatedUrl: `${R}/doors/double_sliding_door_with_tree.gif`,
  },
  door_terrace: {
    defaultUrl: `${R}/doors/terrace_door_single_closed_rightt.png`,
    rightUrl: `${R}/doors/terrace_door_single_closed_rightt.png`,
    animatedUrl: `${R}/doors/terrace_door_single_with_snow_outside_right.gif`,
  },

  // ─── ROOMS: WINDOWS ─────────────────────────────────────────────────────────
  window_closed: {
    defaultUrl: `${R}/windows/window_closed_left.png`,
    leftUrl: `${R}/windows/window_closed_left.png`,
    animatedUrl: `${R}/windows/Windows_outside_car_traffic_left.gif`,
  },

  // ─── PETS ───────────────────────────────────────────────────────────────────
  cat_sitting: {
    defaultUrl: `${P}/cat_sitting_right.png`,
    leftUrl: `${P}/cat_sitting_left.png`,
    rightUrl: `${P}/cat_sitting_right.png`,
  },
  cat_sleeping: {
    defaultUrl: `${P}/cat_sleeping_left.png`,
    leftUrl: `${P}/cat_sleeping_left.png`,
    animatedUrl: `${P}/cat_sleeping_left.gif`,
  },
  cat_lying: {
    defaultUrl: `${P}/cat_lying_down_left.png`,
    leftUrl: `${P}/cat_lying_down_left.png`,
  },
  cat_watching_tv: {
    defaultUrl: `${P}/cat_watching_tv_right.png`,
    leftUrl: `${P}/cat_watching_tv_left.png`,
    rightUrl: `${P}/cat_watching_tv_right.png`,
    animatedUrl: `${P}/cat_watching_tv_right.gif`,
  },
  cat_scratching: {
    defaultUrl: `${P}/cat_sitting_left.png`,
    animatedUrl: `${P}/cat_scratching_left.gif`,
    leftUrl: `${P}/cat_scratching_left.gif`,
    rightUrl: `${P}/cat_scratching_right.gif`,
  },
  cat_on_roomba: {
    defaultUrl: `${P}/cat_on_rumba_right.png`,
    rightUrl: `${P}/cat_on_rumba_right.png`,
    topLeftUrl: `${P}/cat_on_rumba_top_left.png`,
    topRightUrl: `${P}/cat_on_rumba_top_right.png`,
  },
} as const;

export type DawenAssetKey = keyof typeof DAWEN_ASSETS;

/**
 * Maps catalog icon_emoji values to the best matching WorldAsset.
 * Multiple catalog items share the same emoji (e.g., many chairs all use 🪑),
 * so item_type + category are used to pick the right variant in getAssetForItem().
 */
const EMOJI_TO_ASSET: Record<string, DawenAssetKey> = {
  '🪑': 'chair_blue',
  '🗃️': 'table_glass',
  '💡': 'lamp_2',
  '🔦': 'small_lamp',
  '🕯️': 'small_lamp',
  '🟫': 'carpet_plain_rect',
  '🟪': 'carpet_blue_grey_round',
  '🔲': 'carpet_blue_white_rect',
  '⬛': 'carpet_blue_round',
  '🪧': 'painting_scenery',
  '🔮': 'painting_planet',
  '⚡': 'painting_scenery',
  '🖼️': 'painting_people',
  '📊': 'big_tv_wall',
  '💎': 'small_lamp',
  '🌴': 'plant1',
  '🎋': 'plant2',
  '🌸': 'plant1_2',
  '🖥️': 'big_tv_wall',
  '📺': 'big_screen_tv',
  '💻': 'laptop',
  '📱': 'laptop',
  '🗄️': 'tall_bookshelf_closet',
  '🕹️': 'laptop_pong',
  '🎮': 'laptop_snake',
  '🎯': 'teddybear',
  '🏆': 'teddybear',
  '🥇': 'teddybear',
  '👑': 'teddybear',
  '🗿': 'teddybear',
  '💠': 'modern_mirror',
  '🔥': 'small_lamp',
  '🍾': 'small_table_glass',
  '📡': 'big_tv_wall',
  '🌀': 'painting_planet',
  '🏛️': 'tall_bookshelf_closet',
  '🪙': 'teddybear',
  '🔗': 'painting_scenery',
  '🏦': 'wooden_closet',
  '✨': 'small_lamp',
  '🚪': 'door_wooden',
  '🌟': 'small_lamp',
  '🛋️': 'cushion',
  '🛏️': 'modern_double_bed_blue_grey',
};

/**
 * Item-type overrides for specific catalog item types that need
 * a better asset than the generic emoji mapping.
 */
const ITEM_TYPE_ASSET: Record<string, DawenAssetKey> = {
  bed: 'modern_double_bed_blue_grey',
  sofa: 'cushion',
  chair: 'chair_blue',
  table: 'table_wood',
  lamp: 'lamp_2',
  rug: 'carpet_plain_rect',
  wall: 'painting_scenery',
  plant: 'plant1',
  tech: 'laptop',
  gaming: 'laptop_pong',
  luxury: 'modern_mirror',
  special: 'painting_planet',
  solana: 'painting_scenery',
  premium: 'modern_mirror',
};

export function getAssetForItem(
  iconEmoji: string,
  itemType?: string,
): WorldAsset {
  // Prefer item_type-based lookup first for better visual matching
  if (itemType && ITEM_TYPE_ASSET[itemType]) {
    return DAWEN_ASSETS[ITEM_TYPE_ASSET[itemType]];
  }
  const key = EMOJI_TO_ASSET[iconEmoji];
  if (key) return DAWEN_ASSETS[key];
  return DAWEN_ASSETS.teddybear; // fallback box-like object
}

export function getAssetUrl(
  key: DawenAssetKey,
  variant: 'default' | 'left' | 'right' | 'topLeft' | 'topRight' | 'animated' = 'default',
): string {
  const asset = DAWEN_ASSETS[key];
  switch (variant) {
    case 'left': return asset.leftUrl ?? asset.defaultUrl;
    case 'right': return asset.rightUrl ?? asset.defaultUrl;
    case 'topLeft': return asset.topLeftUrl ?? asset.defaultUrl;
    case 'topRight': return asset.topRightUrl ?? asset.defaultUrl;
    case 'animated': return asset.animatedUrl ?? asset.defaultUrl;
    default: return asset.defaultUrl;
  }
}
