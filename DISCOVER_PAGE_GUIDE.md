# Discover Page - Quick Reference

## What's Working Now

The Discover page (Home → Discover tab) now displays **real Solana tokens** from DexScreener API.

---

## Features

### 🔍 Token Discovery
- Automatically loads real tokens on app start
- Shows 50-100 tokens per category
- Updates every 2 minutes (cached)
- Pull down to refresh anytime

### 📊 Token Information Displayed
Each token shows:
- **Logo** (or symbol badge if no image)
- **Name** (e.g., "Solana")
- **Symbol** (e.g., "SOL")
- **Price** (formatted: $X.XX or $0.00001234)
- **24h Change** (with ⬆️ green or ⬇️ red indicator)
- **Liquidity** (e.g., "$12.5M liq")
- **Boost Badge** ⚡ (for promoted tokens)

### 🗂️ Categories

**All** - Mix of trending and popular tokens with multiple fallbacks

**Trending** 🔥 - Currently popular tokens with high activity

**New** ✨ - Recently launched tokens

**Boosted** ⚡ - Promoted/advertised tokens

**Volume** 📈 - Sorted by 24-hour trading volume

**Pump.fun** 🚀 - Tokens from Pump.fun platform

### 🔎 Search
- Type to search by:
  - Token name (e.g., "Solana")
  - Symbol (e.g., "SOL")
  - Contract address (full address)
- Results appear instantly
- Combines DexScreener + Jupiter data

---

## How to Use

### View Tokens
1. Open app
2. Tap "Discover" tab (middle tab at bottom)
3. Tokens load automatically
4. Scroll to see more

### Filter by Category
1. Tap category buttons at top (All, Trending, New, etc.)
2. Tokens update automatically
3. Each category shows different tokens

### Search for Token
1. Tap search bar
2. Type token name, symbol, or address
3. Results filter in real-time
4. Tap token to view details (coming soon)

### Refresh Data
1. Pull down on the list
2. Release to refresh
3. Latest data loads

### If Tokens Don't Load
1. Check internet connection
2. Tap "Retry" button if shown
3. Try different category
4. Pull down to refresh

---

## API Information

**Data Source:** DexScreener API (https://dexscreener.com)

**Chain:** Solana mainnet-beta

**Update Frequency:** 2 minutes (cached)

**No Authentication Required:** Free public API

---

## Token Categories Explained

### Trending
- Tokens with increasing activity
- High boost counts
- Rising volume

### New
- Recently created tokens
- Less than 7 days old (for Pump.fun)
- Sorted by creation date

### Boosted
- Actively promoted tokens
- Paid advertising on DexScreener
- Usually have higher visibility

### Volume
- Sorted by 24h trading volume
- High volume = high liquidity
- Good for trading

### Pump.fun
- Tokens launched on Pump.fun
- New and experimental tokens
- Higher risk, higher volatility

---

## Understanding Token Data

### Price
- Current market price in USD
- Formatted for readability:
  - $1,234.56 (normal prices)
  - $0.001234 (small prices)
  - $1.23e-7 (very small prices)

### 24h Change
- **Green ⬆️** = Price increased
- **Red ⬇️** = Price decreased
- **Percentage** = Amount of change
- Example: +12.5% = 12.5% increase

### Liquidity
- Total value locked in trading pool
- Higher = easier to buy/sell
- "$12.5M liq" = $12.5 million liquidity
- Minimum $1K shown

### Market Cap
- Total value of all tokens
- Shows token size/importance
- Format: $1.23M, $45.6B, etc.

---

## Troubleshooting

### "No tokens found"
**Possible causes:**
- No internet connection
- API temporarily unavailable
- Search query too specific

**Solutions:**
- Check internet connection
- Tap "Retry" button
- Try different category
- Clear search query
- Pull to refresh

### "Unable to load tokens"
**Possible causes:**
- DexScreener API down
- Network timeout
- Rate limit reached

**Solutions:**
- Wait 30 seconds
- Tap "Retry"
- Try different category
- Check https://dexscreener.com works in browser

### Tokens load slowly
**Possible causes:**
- Slow internet connection
- API high traffic
- First load (no cache)

**Solutions:**
- Wait a few seconds
- Data will cache after first load
- Subsequent loads faster

### Images not showing
**Normal behavior:**
- Some tokens don't have images
- App shows symbol badge instead
- Not an error

---

## Performance Tips

### Fast Loading
- First load: ~2-3 seconds
- Cached loads: Instant
- Cache expires: 2 minutes
- Pull to refresh anytime

### Reduce Data Usage
- Tokens cached for 2 minutes
- Don't refresh too frequently
- Search uses same cache
- Images cached by system

### Best Categories for Discovery
- **All**: Best starting point
- **Trending**: Most popular right now
- **Volume**: High liquidity tokens
- **New**: Discover new projects

---

## Privacy & Security

### What Data is Sent
- Search queries (to DexScreener)
- Token addresses (for lookups)
- No personal information
- No wallet addresses

### What's Stored Locally
- API responses (2 minute cache)
- No user tracking
- No analytics
- All data temporary

### Safety Tips
- DYOR (Do Your Own Research)
- Check liquidity before trading
- New tokens are high risk
- Verify token contracts
- Never share seed phrase

---

## API Endpoints Used

```
Trending/Boosted:
https://api.dexscreener.com/token-boosts/top/v1

New Tokens:
https://api.dexscreener.com/token-profiles/latest/v1

Search:
https://api.dexscreener.com/latest/dex/search?q={query}

Token Details:
https://api.dexscreener.com/latest/dex/tokens/{address}
```

**All endpoints are public and free.**

---

## Next Steps

### Token Details Page (Coming Soon)
- Full price charts
- Trading history
- Buy/Sell buttons
- Add to watchlist
- Share token

### Trading Integration
- Tap token → Trade
- Jupiter integration
- Swap directly in app
- Real-time quotes

### Watchlist
- Star favorite tokens
- Track portfolio
- Price alerts
- Push notifications

---

## Quick Tips

1. **Start with "All" category** - Best mix of tokens

2. **Use search for specific tokens** - Faster than scrolling

3. **Check liquidity** - Higher = safer to trade

4. **Green = Good, Red = Bad** - For 24h changes

5. **Pull to refresh** - Get latest data

6. **Try different categories** - Discover new tokens

7. **Boost badge = Promoted** - Consider carefully

8. **New = Higher risk** - Do research first

---

## Support

### If Something Doesn't Work
1. Pull to refresh
2. Try different category
3. Check internet
4. Tap retry button
5. Restart app if needed

### Expected Behavior
- Tokens load in 1-3 seconds
- Categories switch instantly
- Search filters in real-time
- Images may load gradually
- Some tokens lack images

---

## Summary

The Discover page is your gateway to the Solana token ecosystem. It shows **real, live data** from DexScreener, updated every 2 minutes.

**Use it to:**
- Find new tokens
- Track trending projects
- Search specific tokens
- Monitor price changes
- Discover trading opportunities

**Remember:**
- Always DYOR
- Check liquidity
- Understand the risks
- Start with established tokens
- Use for research, not just trading

**Happy discovering!** 🚀
