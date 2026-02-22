# SLV Covered Calls Strategy 📈💰

Track SLV (iShares Silver Trust) prices and implement a covered call strategy to generate monthly income by selling calls 3% above the strike price.

## Features

- **Price Tracking** - Fetch and store SLV historical prices
- **Covered Call Calculator** - Calculate optimal strike prices and estimated premiums
- **Income Tracking** - Track total income from closed call positions
- **Monthly Strategy** - Generate calls expiring on the 3rd Friday of each month
- **Real-time Dashboard** - Interactive charts and metrics
- **SQLite Database** - Persistent storage for prices and call history
- **Customizable** - Adjust shares owned and premium percentage

## Strategy Overview

**How it works:**
1. Buy/own SLV shares (silver ETF)
2. Sell call options 3% above current price
3. Collect premium as immediate income
4. Repeat monthly for recurring income

**Benefits:**
- Generate monthly income from silver holdings
- Sell calls above current price (3% buffer)
- Keep shares if price doesn't reach strike
- Compound income by reinvesting premiums

## Installation

```bash
npm install
```

## Configuration

1. **Get Alpha Vantage API Key** (free):
   - Visit: https://www.alphavantage.co/support/#api-key
   - Sign up for free tier (25 requests/day)
   - Copy your API key

2. **Set API Key in `.env`**:
   ```env
   ALPHA_VANTAGE_KEY=your_actual_key_here
   PORT=3002
   ```

## Usage

Start the server:
```bash
npm start
```

Visit: http://localhost:3002

## API Endpoints

### `GET /api/status`
Get current status including:
- Current SLV price
- Next strike price (3% above)
- Estimated premium
- Days to expiry
- Total income from closed calls

### `GET /api/prices?days=90`
Get historical SLV prices

### `POST /api/refresh`
Fetch and update latest prices

### `POST /api/calls`
Create a new covered call position

### `GET /api/calls`
Get all call positions

### `POST /api/calls/:id/close`
Close a call position (mark as closed)

### `POST /api/settings`
Update strategy settings:
- `sharesOwned`: Number of shares you own
- `premiumPct`: Percentage above current price for strike

## Settings

**Default Strategy:**
- **Shares Owned:** 100
- **Premium Above Current:** 3%
- **Expiry:** 3rd Friday of next month

**Adjusting Settings:**
- More shares = higher income potential
- Lower premium % = more calls get exercised
- Higher premium % = fewer calls exercised, lower premium

## Option Pricing Model

Uses simplified Black-Scholes approximation for call option pricing:
- **Inputs:** Current price, strike price, days to expiry
- **Parameters:** 5% risk-free rate, 30% implied volatility
- **Output:** Estimated fair value of the call option

**Note:** Real market prices may vary based on supply/demand, actual IV, and other factors.

## Database Schema

### `prices` Table
- `id`: Primary key
- `date`: Date string (YYYY-MM-DD)
- `close`: Closing price
- `high`: Daily high
- `low`: Daily low
- `volume`: Trading volume
- `fetched_at`: When the price was fetched

### `calls` Table
- `id`: Primary key
- `strike_date`: Expiry date
- `strike_price`: Strike price
- `current_price`: SLV price when call was created
- `premium`: Premium per share
- `premium_pct`: Premium % above current price
- `shares`: Number of shares
- `income`: Total income (premium × shares)
- `status`: 'open' or 'closed'
- `expires`: Expiry date
- `created_at`: When the call was created

### `settings` Table
- `key`: Setting name
- `value`: Setting value

## Example Workflow

1. **Setup:**
   - Set shares owned (e.g., 100 shares)
   - Set premium % (default 3%)

2. **Monthly:**
   - Check current SLV price
   - View estimated premium
   - Click "Sell Covered Call"
   - System creates call position at 3% above current price

3. **At Expiry:**
   - If SLV < strike price: Keep shares + premium
   - If SLV ≥ strike price: Shares called away + premium + strike price
   - Close the position and start next month

4. **Track Performance:**
   - View total income from closed calls
   - See annualized return
   - Review call history

## Risk Disclaimer

⚠️ **Important Risk Warnings:**

1. **Unlimited Loss Potential:** If SLV drops significantly, you lose money on the shares
2. **Capped Upside:** If SLV rises above strike, your profit is limited
3. **Assignment Risk:** Shares may be called away at any time before expiry
4. **Market Risk:** Silver prices are volatile and can swing dramatically
5. **No Guarantee:** Options may not be profitable if premium is too low

**This is not financial advice. Do your own research before trading options.**

## Future Enhancements

- [ ] Real-time option chain data
- [ ] Multiple strike price tiers (2%, 3%, 5%)
- [ ] Auto-rollover expired calls
- [ ] Email/SMS alerts for expiring calls
- [ ] Performance analytics and charts
- [ ] Compare different premium strategies
- [ ] Import/export data
- [ ] Multi-ETF support (GLD, IAU, etc.)
- [ ] Tax reporting
- [ ] Backtesting with historical data

## Tech Stack

- **Backend:** Node.js + Express
- **Database:** SQLite (better-sqlite3)
- **API:** Alpha Vantage (free tier)
- **Frontend:** Chart.js + Vanilla HTML/CSS/JS
- **Option Pricing:** Simplified Black-Scholes

## License

MIT

---

**Built for generating monthly income from silver holdings.** 🥈📈
