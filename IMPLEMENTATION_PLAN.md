# COMPREHENSIVE PRODUCT IMPLEMENTATION PLAN

## CURRENT STATE ASSESSMENT

### What Works ✅
- **Social Features**: Posts, likes, reposts, comments, follows all fully functional
- **Token Chat**: Real-time per-token community chat with database sync
- **Wallet Management**: Secure local wallet creation, import, multi-account support
- **Market Data**: Live CoinGecko integration with search, filtering, categories
- **Gaming**: Mystery boxes and team tournaments with database tracking
- **UI/UX**: Premium dark violet galaxy identity, consistent design system
- **Database**: Comprehensive Supabase schema with RLS policies

### Critical Gaps 🔴
1. **Scrolling**: Not optimized, no pagination, no FlatList virtualization
2. **Buy/Sell Flow**: Mock only, doesn't update real asset ownership
3. **Token State**: Purchases don't persist to owned assets
4. **Multi-chain**: Only Solana works, other chains disabled
5. **NFT Category**: No NFT display in wallet
6. **Referral System**: Completely missing
7. **Rewards**: No points/rewards tracking
8. **Trade Features**: No stop loss, take profit, alerts
9. **Profile Photos**: No gallery picker integration
10. **Token Charts**: Only sparklines, no TradingView-style charts

---

## EXECUTION PLAN

### PHASE 1: CORE WORKFLOW FIXES (Critical Foundation)
**Goal**: Make buy/sell/assets/scroll work correctly

#### 1.1 Fix Scrolling Everywhere
- Replace ScrollView → FlatList for all lists (market, assets, feed, chat)
- Add pagination with "load more" or infinite scroll
- Implement scroll position persistence
- Add RefreshControl optimization

#### 1.2 Fix Asset State Management
- Create `user_assets` table (user_id, token_id, quantity, avg_buy_price)
- Create `user_transactions` table (type, token_id, quantity, price, timestamp)
- Update buy flow to insert into both tables
- Update sell flow to decrement quantity
- Update WalletContext to load from `user_assets` instead of just Solana RPC

#### 1.3 Fix Total Balance Logic
- Calculate from `user_assets` + `user_transactions`
- Cache balance with timestamp
- Refresh on pull-to-refresh
- Show loading state during refresh

#### 1.4 Fix Category Organization
**Wallet Categories**:
- My Assets (owned tokens from user_assets)
- NFT Collections (placeholder for now)
- Activity (transaction history)
- Watchlist (favorited tokens)

**Market Categories**:
- Trending (high volume last 24h)
- New Listings (recent additions)
- Top Gainers (24h % change positive)
- Top Losers (24h % change negative)
- Top Volume (by 24h volume)
- All Tokens (default)

---

### PHASE 2: WALLET & MARKET IMPROVEMENTS
**Goal**: Premium wallet UX and better market discovery

#### 2.1 Wallet Section Redesign
- Stronger total balance hero section (larger, bolder)
- Improved quick actions (Receive, Send, Buy, Swap with better icons)
- Assets list showing:
  - Only owned assets (from user_assets table)
  - Token logo, name, symbol
  - Quantity owned
  - Current value
  - 24h change
  - Click → token detail page
- Empty state when no assets: "Get started by buying your first crypto"
- Add NFT Collections tab (shows "Coming soon" or empty state)
- Add Activity tab showing transaction history
- Add Watchlist tab showing favorited tokens

#### 2.2 Market Discovery Enhancement
- Full scrolling with FlatList
- Category chips at top (Trending, New, Gainers, Losers, Volume, All)
- Search bar with debounced input
- Token cards showing:
  - Rank #
  - Logo
  - Name + Symbol
  - Current price
  - 24h % change (color coded)
  - Sparkline chart
  - Market cap or volume
- Click any token → opens `/token/[id]` with that token's data
- Add "Add to Watchlist" star button on each card

#### 2.3 Token Detail Page Upgrade
- Hero section:
  - Large token logo
  - Token name + symbol
  - Current price (large, bold)
  - 24h change % (color coded with arrow)
- Metadata cards:
  - Market Cap
  - 24h Volume
  - Circulating Supply
  - All-time High/Low
  - Fully Diluted Valuation
- Chart section:
  - Replace sparkline with larger chart
  - Timeframe selector (1D, 1W, 1M, 3M, 1Y, ALL)
  - Use recharts or victory-native for better charts
  - Price data from CoinGecko market_chart API
- Action buttons:
  - Buy
  - Sell
  - Send
  - Swap (disabled with "Coming soon")
  - Add to Watchlist (star icon)
- Tabs:
  - Chart (main view)
  - About (description)
  - Chat (token community)

#### 2.4 Token Chat Improvements
- Show "X people active" count at top
- Online users indicator (live count from recent chat activity)
- Message list with:
  - Avatar (fallback to initials)
  - Username
  - Message text
  - Timestamp
  - Scrollable with FlatList
  - Pagination (load older messages)
- Input at bottom:
  - Text input
  - Send button
  - Disabled if not authenticated
- Empty state: "Be the first to start the conversation"
- Real-time updates using Supabase subscriptions

---

### PHASE 3: COMMUNITY & SOCIAL
**Goal**: X-inspired social network feel

#### 3.1 Community Feed Rebuild
- FlatList with pagination (20 posts per page)
- Post cards showing:
  - User avatar + username (clickable → profile)
  - Post timestamp
  - Post text content
  - Post image if exists
  - Like count + button (heart)
  - Comment count + button (bubble)
  - Repost count + button (retweet icon)
  - Share button
- Promoted posts:
  - Appear at top of feed
  - Have "Promoted" badge with star icon
  - Different background color or glow
  - Sorted by promotion_expires_at
- Feed algorithm:
  1. Promoted posts (not expired)
  2. Followed users' posts (recent first)
  3. Popular posts (high engagement)
  4. All other posts (recent first)

#### 3.2 Post Creation Flow
- Create post button → modal
- Text input (280 char limit)
- Image upload option (placeholder for now or use URL input)
- "Post" button
- After posting:
  - Appears in feed immediately
  - Option to "Promote this post" appears

#### 3.3 Promoted Posts Logic
- Promote button on own posts
- Modal with duration options:
  - 1 hour - $5
  - 10 hours - $25
  - 24 hours - $50
  - 1 week - $200
- Payment flow (simulated for now)
- Updates post.promoted_tier and promoted_expires_at
- Post moves to top of feed
- Badge appears on post

#### 3.4 Profile System
- Profile page showing:
  - Large avatar (changeable)
  - Username
  - Bio (editable)
  - Join date
  - Followers count (clickable → followers list)
  - Following count (clickable → following list)
  - Verified badge if applicable
  - Follow/Unfollow button (if not own profile)
- Tabs:
  - Posts (user's posts)
  - Reposts (posts they reposted)
  - Likes (posts they liked)
- Edit profile button (if own profile):
  - Change avatar (use expo-image-picker to select from gallery)
  - Edit username
  - Edit bio
  - Save button

#### 3.5 Comment Thread Logic
- Click comment count → opens comment modal
- Shows original post at top
- Lists all comments below
- Each comment has:
  - Avatar + username
  - Comment text
  - Timestamp
  - Like button (optional)
- Input at bottom to add comment
- Real-time updates

---

### PHASE 4: REWARDS & REFERRALS
**Goal**: Growth loop with incentives

#### 4.1 Database Schema for Referrals
Create migration:
```sql
-- Referral codes table
CREATE TABLE referral_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES user_profiles(id),
  code text UNIQUE NOT NULL,
  uses_count int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Referral relationships
CREATE TABLE referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid REFERENCES user_profiles(id),
  referred_id uuid REFERENCES user_profiles(id),
  reward_amount numeric DEFAULT 0,
  reward_paid boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- User rewards/points
CREATE TABLE user_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES user_profiles(id) UNIQUE,
  total_earned numeric DEFAULT 0,
  total_withdrawn numeric DEFAULT 0,
  available_balance numeric DEFAULT 0,
  referral_count int DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

-- Reward transactions
CREATE TABLE reward_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES user_profiles(id),
  amount numeric NOT NULL,
  type text NOT NULL, -- 'referral', 'signup', 'trade', 'mystery_box'
  description text,
  created_at timestamptz DEFAULT now()
);
```

#### 4.2 Referral Service
Create `/services/referralService.ts`:
- generateCode(userId) → creates unique code
- applyReferralCode(code, newUserId) → records referral
- getReferralStats(userId) → returns count, earnings
- claimRewards(userId) → transfers available balance to wallet

#### 4.3 Rewards Page UI
New route: `/app/rewards.tsx`
- Hero section:
  - "Earn while you share"
  - Total earned
  - Available to claim
  - Claim button
- My referral code:
  - Display code prominently
  - Copy button
  - Share buttons (social media)
- Invite friends:
  - Input for friend email
  - Send invite button
- Referral stats:
  - Total referrals count
  - Pending rewards
  - Claimed rewards
- How it works:
  - Invite a friend → they get $10 bonus
  - You get $10 when they make first trade
  - Multi-level: get 5% of your referrals' earnings

#### 4.4 Rewards Integration
- On signup: Check if referral code was used
- After first trade: Credit referrer account
- Show reward notifications
- Add rewards to total balance

---

### PHASE 5: TRADING FEATURES
**Goal**: Stop loss, take profit, alerts

#### 5.1 Database Schema for Trading
Create migration:
```sql
-- Price alerts
CREATE TABLE price_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES user_profiles(id),
  token_id uuid REFERENCES tokens(id),
  alert_type text NOT NULL, -- 'above', 'below'
  target_price numeric NOT NULL,
  triggered boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Trading orders (stop loss, take profit)
CREATE TABLE trading_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES user_profiles(id),
  token_id uuid REFERENCES tokens(id),
  order_type text NOT NULL, -- 'stop_loss', 'take_profit'
  trigger_price numeric NOT NULL,
  quantity numeric NOT NULL,
  status text DEFAULT 'active', -- 'active', 'triggered', 'cancelled'
  created_at timestamptz DEFAULT now(),
  triggered_at timestamptz
);
```

#### 5.2 Trading Features UI
On token detail page, add "Trade" tab:
- Current position:
  - Quantity owned
  - Avg buy price
  - Current price
  - P&L (profit/loss)
- Set Stop Loss:
  - Input field for trigger price
  - "When price drops to $X, sell all"
  - Set button
- Set Take Profit:
  - Input field for trigger price
  - "When price rises to $X, sell all"
  - Set button
- Active orders list:
  - Shows all active stop loss / take profit orders
  - Cancel button for each
- Price Alerts:
  - "Alert me when price goes above $X"
  - "Alert me when price drops below $X"
  - Set button

#### 5.3 Alert Monitoring (Background Job)
Create Edge Function: `/supabase/functions/monitor-prices/index.ts`
- Runs every 5 minutes (cron trigger)
- Fetches all active price_alerts
- Checks current price vs target
- If triggered:
  - Mark alert as triggered
  - Create notification
  - Send push notification (if enabled)
- For trading_orders:
  - Check if trigger_price hit
  - Execute simulated sell
  - Update user_assets
  - Create transaction record

---

### PHASE 6: GAMING IMPROVEMENTS
**Goal**: Better UX inspired by empiredrop.com

#### 6.1 Mystery Box Redesign
- Grid of 3 boxes (Bronze, Silver, Gold)
- Each box card shows:
  - Box image/icon
  - Box name
  - Price
  - Potential rewards range
  - "Open Box" button
- Opening animation:
  - Spinning/glowing animation
  - Reveal prize
  - Confetti effect
  - "You won X tokens!" message
- Prize logic:
  - Random reward from range
  - Higher tier boxes → higher rewards
  - Record to box_purchases table
  - Credit user_rewards table

#### 6.2 Tournament Improvements
- Active tournaments list
- Each tournament shows:
  - Tournament name
  - Entry fee
  - Prize pool
  - Teams count / Max teams
  - Time remaining
  - Join button
- Tournament detail:
  - All teams listed
  - Team scores (if active)
  - Your team (if joined)
  - Prize distribution (1st: 50%, 2nd: 30%, 3rd: 20%)
- Join flow:
  - Select team or create new team
  - Pay entry fee (simulated)
  - Confirmation
- Auto-distribute prizes when tournament ends

---

### PHASE 7: FINAL POLISH
**Goal**: Coherent premium experience

#### 7.1 Visual Consistency
- Apply dark violet galaxy theme everywhere:
  - All cards use `elevation.sm` or `elevation.md`
  - All buttons use Button component
  - All gradients use `colors.gradient.accent`
  - All text uses fontSize scale
  - All spacing uses spacing scale
- Add subtle animations:
  - Button press scale down
  - Card hover (on web)
  - Transition animations on navigation
  - Loading skeletons instead of spinners

#### 7.2 Empty States
- Wallet assets: "Get started by buying your first crypto"
- Market watchlist: "Star tokens to add them to your watchlist"
- Community feed: "Follow users to see their posts"
- Token chat: "Be the first to start the conversation"
- Gaming: "No active tournaments. Create one!"
- Activity: "No transactions yet"

#### 7.3 Error Handling
- Network errors: Show retry button
- Invalid input: Show validation messages
- Failed transactions: Show error details
- Rate limiting: Show "Please wait" message

#### 7.4 Loading States
- Skeleton loaders for cards
- Shimmer effect
- Pull-to-refresh indicators
- Button loading spinners

#### 7.5 Performance
- Image optimization with placeholder
- Lazy loading for lists
- Debounced search input
- Cached API responses with TTL
- Optimistic UI updates

---

## IMPLEMENTATION ORDER

### Week 1: Foundation (PHASE 1)
- Day 1-2: Fix scrolling (FlatList, pagination)
- Day 3-4: Create user_assets & user_transactions tables
- Day 5: Update buy/sell to persist to database
- Day 6: Fix total balance calculation
- Day 7: Fix wallet/market category organization

### Week 2: Wallet & Market (PHASE 2)
- Day 1-2: Redesign wallet section
- Day 3: Add NFT Collections placeholder
- Day 4: Improve market discovery
- Day 5-6: Upgrade token detail page
- Day 7: Improve token chat with active users

### Week 3: Community (PHASE 3)
- Day 1-2: Rebuild community feed with algorithm
- Day 3: Implement promoted posts logic
- Day 4: Profile system improvements
- Day 5: Profile photo picker from gallery
- Day 6: Comment threads
- Day 7: Testing & polish

### Week 4: Rewards & Trading (PHASES 4-5)
- Day 1-2: Referral system database & service
- Day 3: Rewards page UI
- Day 4: Trading features database
- Day 5-6: Stop loss / take profit / alerts UI
- Day 7: Alert monitoring Edge Function

### Week 5: Gaming & Polish (PHASES 6-7)
- Day 1-2: Mystery box redesign
- Day 3: Tournament improvements
- Day 4-5: Visual consistency pass
- Day 6: Empty states & error handling
- Day 7: Final build & testing

---

## SUCCESS CRITERIA

After implementation, the app must:
✅ Scroll smoothly everywhere without cutoff
✅ Update asset ownership after buy/sell
✅ Show only owned assets in wallet
✅ Have working referral system with rewards
✅ Support stop loss / take profit / alerts
✅ Have profile photo picker from gallery
✅ Show promoted posts at top of feed
✅ Have coherent market categories
✅ Display token charts with timeframes
✅ Show active users in token chat
✅ Maintain dark violet galaxy identity throughout
✅ Build successfully with no errors
✅ Feel like a real premium crypto super app

---

## NOTES

- Keep Solana as primary network ✅
- Keep existing app structure ✅
- Keep dark violet galaxy identity ✅
- No white screen, no flickering ✅
- Inspired by Phantom, Moby, X - but still unique ✅
- Real workflow logic, not just cosmetic ✅
