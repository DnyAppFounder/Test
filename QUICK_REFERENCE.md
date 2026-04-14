# Quick Reference Guide

## 🔍 Where Is Everything?

### Wallet System
**Solana-only wallet management**
- `lib/wallet/SecureWalletManager.ts` - Core wallet logic
- `contexts/WalletContext.tsx` - Wallet state management
- `app/onboarding/create.tsx` - Create wallet flow
- `app/onboarding/import.tsx` - Import wallet flow

### Jupiter Integration
**Real swap infrastructure**
- `services/jupiter/swapService.ts` - Jupiter V6 API integration
- `services/jupiter/tokenListService.ts` - SPL token list
- `app/swap.tsx` - Swap UI with live quotes

### Market Data
**Live token discovery**
- `services/dexscreener/tokenDiscoveryService.ts` - DEX Screener API
- `services/liveMarketService.ts` - Unified market interface
- `app/(tabs)/index.tsx` - Main dashboard with live tokens

### Wallet Assets
**Real balance display**
- `services/walletAssetLoader.ts` - Load real wallet assets
- `services/solana/walletService.ts` - Solana RPC interactions

---

## 🔧 How To...

### Add a New Solana Account
1. User goes to Settings
2. Clicks "Manage Accounts"
3. Clicks "Add Solana Account"
4. New account derived from same seed phrase

**Code:** `app/(tabs)/settings.tsx` line 113

### Fetch a Swap Quote
```typescript
import { jupiterSwapService } from '@/services/jupiter/swapService';

const quote = await jupiterSwapService.getQuote(
  inputMint,   // e.g., SOL mint
  outputMint,  // e.g., USDC mint
  amount,      // in smallest unit (lamports)
  50           // slippage in bps (0.5%)
);
```

### Get Live Token Price
```typescript
import { jupiterSwapService } from '@/services/jupiter/swapService';

const price = await jupiterSwapService.getTokenPrice(tokenMint);
```

### Search Tokens
```typescript
import { liveMarketService } from '@/services/liveMarketService';

const tokens = await liveMarketService.searchTokens('bonk');
```

### Load Wallet Assets
```typescript
import { walletAssetLoader } from '@/services/walletAssetLoader';

const result = await walletAssetLoader.loadWalletAssets(
  'solana',
  walletAddress
);
const assets = result.assets;
const totalValue = result.totalValue;
```

---

## 🎨 UI Components

### Main Dashboard
**File:** `app/(tabs)/index.tsx`
- **Line 190-254:** Header with portfolio and action buttons
- **Line 257-306:** Tab bar and search
- **Line 308-333:** Category chips
- **Line 335-412:** Token list (market data)
- **Line 414-484:** Asset list (wallet balances)
- **Line 486-544:** Watchlist

### Swap Screen
**File:** `app/swap.tsx`
- **Line 136-144:** Header
- **Line 146-198:** Swap card with token inputs
- **Line 200-226:** Swap details (price impact)
- **Line 228-244:** Execute button
- **Line 254-299:** Token selection modal

### Token Detail
**File:** `app/token-detail/[address].tsx`
- **Line 87-102:** Token header with logo
- **Line 104-122:** Price display
- **Line 124-156:** Stats grid (volume, liquidity, mcap)
- **Line 158-165:** Contract address
- **Line 167-180:** DEX information

---

## 🔑 API Endpoints

### Jupiter APIs
```
Quote:  https://quote-api.jup.ag/v6/quote
Swap:   https://quote-api.jup.ag/v6/swap
Price:  https://price.jup.ag/v4/price
Tokens: https://token.jup.ag/all
```

### DEX Screener API
```
Base:     https://api.dexscreener.com/latest/dex
Search:   /search?q={query}
Token:    /tokens/{address}
Trending: /tokens/trending/solana
Boosted:  /tokens/boosted/solana
New:      /tokens/new/solana
```

### Solana RPC
```
Mainnet: https://api.mainnet-beta.solana.com
```

---

## 🎯 Common Tasks

### Update RPC Endpoint
**File:** `services/jupiter/swapService.ts` line 33
```typescript
this.connection = new Connection(
  'YOUR_CUSTOM_RPC_URL',
  'confirmed'
);
```

### Change Slippage Default
**File:** `app/swap.tsx` line 82
```typescript
50  // current (0.5%)
100 // for 1%
```

### Add New Market Category
**File:** `app/(tabs)/index.tsx` line 170
```typescript
{ key: 'your_category', label: 'Your Label', icon: YourIcon }
```

Then update:
**File:** `services/liveMarketService.ts` line 35
```typescript
case 'your_category':
  // fetch logic
```

### Customize Colors
**File:** `constants/theme.ts`
```typescript
primary: '#8B5CF6',        // Change accent color
background: '#0A0A0F',     // Change background
surface: '#12121A',        // Change card background
```

---

## 📊 Data Models

### LiveToken
```typescript
{
  id: string;
  address: string;
  name: string;
  symbol: string;
  image?: string;
  price: number;
  priceChange24h: number;
  volume24h: number;
  liquidity: number;
  marketCap?: number;
}
```

### WalletAsset
```typescript
{
  id: string;
  blockchain: string;
  address: string;
  name: string;
  symbol: string;
  balance: string;
  uiBalance: number;
  price: number;
  value: number;
  logoUrl?: string;
  isNative: boolean;
}
```

### JupiterQuote
```typescript
{
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  priceImpactPct: number;
  slippageBps: number;
  routePlan: any[];
}
```

---

## 🐛 Troubleshooting

### Quotes Not Loading
- Check internet connection
- Verify token addresses are valid
- Check Jupiter API status
- Look at console logs

### Balances Not Showing
- Confirm wallet is imported correctly
- Check Solana RPC is responding
- Verify wallet has SOL for rent
- Look at network tab for API errors

### Tokens Not Appearing
- Wait for cache to refresh (2-5 minutes)
- Check DEX Screener API status
- Verify token has liquidity
- Try manual refresh

### Swap Fails
- Ensure quote is still valid (not expired)
- Check slippage tolerance
- Verify sufficient balance
- Confirm wallet adapter is connected

---

## 🔐 Security Checklist

- ✅ Seeds encrypted with device password
- ✅ No hardcoded API keys
- ✅ HTTPS everywhere
- ✅ No sensitive data in logs
- ✅ Secure storage for keys
- ✅ No network exposure of private keys

---

## 📝 Code Style

### Naming Conventions
- **Services:** `camelCase` with `Service` suffix
- **Components:** `PascalCase`
- **Files:** `camelCase.ts` for services, `PascalCase.tsx` for components
- **Constants:** `SCREAMING_SNAKE_CASE`

### Import Order
1. React imports
2. React Native imports
3. Third-party libraries
4. Local services
5. Local components
6. Types/constants

### Error Handling
Always use try/catch:
```typescript
try {
  const result = await apiCall();
  return result;
} catch (error) {
  console.error('Error description:', error);
  return fallbackValue;
}
```

---

## 🎉 You're Ready!

Everything is documented and organized. The app is:
- ✅ Solana-only (clean focus)
- ✅ Jupiter-integrated (real swaps)
- ✅ Live market data (DexScreener)
- ✅ Premium UI (polished design)
- ✅ Production-ready (just add wallet adapter)

**Next step:** Integrate wallet adapter → Launch! 🚀
