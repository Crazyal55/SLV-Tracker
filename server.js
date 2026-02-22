const express = require('express');
const axios = require('axios');
const Database = require('better-sqlite3');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3002;

// Database setup
const db = new Database('slv_calls.db');

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT UNIQUE,
    close REAL,
    high REAL,
    low REAL,
    volume INTEGER,
    fetched_at TEXT
  );

  CREATE TABLE IF NOT EXISTS calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    strike_date TEXT,
    strike_price REAL,
    current_price REAL,
    premium REAL,
    premium_pct REAL,
    shares INTEGER,
    income REAL,
    status TEXT DEFAULT 'open',
    expires TEXT,
    created_at TEXT
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  INSERT OR IGNORE INTO settings (key, value) VALUES ('shares_owned', '100');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('premium_pct', '3');
`);

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Settings helpers
const getSetting = (key) => {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? parseFloat(row.value) : null;
};

const setSetting = (key, value) => {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value.toString());
};

// Alpha Vantage API
const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_KEY || 'demo';
const fetchSLVPrices = async (days = 90) => {
  try {
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=SLV&outputsize=compact&apikey=${ALPHA_VANTAGE_KEY}`;
    const response = await axios.get(url);
    const data = response.data['Time Series (Daily)'];

    if (!data) {
      throw new Error('Invalid API response');
    }

    const prices = [];
    let count = 0;

    for (const [date, values] of Object.entries(data)) {
      if (count >= days) break;

      prices.push({
        date,
        close: parseFloat(values['4. close']),
        high: parseFloat(values['2. high']),
        low: parseFloat(values['3. low']),
        volume: parseInt(values['5. volume'])
      });

      // Store in database
      db.prepare(`
        INSERT OR REPLACE INTO prices (date, close, high, low, volume, fetched_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
      `).run(
        date,
        prices[prices.length - 1].close,
        prices[prices.length - 1].high,
        prices[prices.length - 1].low,
        prices[prices.length - 1].volume
      );

      count++;
    }

    return prices.reverse(); // Return in chronological order
  } catch (error) {
    console.error('Error fetching SLV prices:', error.message);
    // Fallback: return recent prices from database
    const cachedPrices = db.prepare(`
      SELECT date, close, high, low, volume
      FROM prices
      ORDER BY date DESC
      LIMIT ?
    `).all(days);
    return cachedPrices.reverse();
  }
};

const getCurrentPrice = async () => {
  const prices = await fetchSLVPrices(1);
  return prices[prices.length - 1]?.close || 0;
};

// Calculate premium estimate (simplified Black-Scholes approximation)
const calculatePremium = (currentPrice, strikePrice, daysToExpiry, impliedVolatility = 0.30) => {
  const timeToExpiry = daysToExpiry / 365;
  const riskFreeRate = 0.05; // 5%

  // Simplified Black-Scholes for call option
  const d1 = (Math.log(currentPrice / strikePrice) + (riskFreeRate + 0.5 * impliedVolatility ** 2) * timeToExpiry) /
    (impliedVolatility * Math.sqrt(timeToExpiry));

  const d2 = d1 - impliedVolatility * Math.sqrt(timeToExpiry);

  // Approximate N(d) using error function
  const N = (x) => {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return 0.5 * (1.0 + sign * y);
  };

  const callPrice = currentPrice * N(d1) - strikePrice * Math.exp(-riskFreeRate * timeToExpiry) * N(d2);

  return Math.max(callPrice, 0);
};

// Generate next monthly expiration date
const getNextMonthlyExpiry = () => {
  const now = new Date();

  // Find the 3rd Friday of the next month
  const year = now.getFullYear();
  const currentMonth = now.getMonth();
  const nextMonth = currentMonth + 1;

  const thirdFriday = new Date(year, nextMonth, 1);

  // Find the third Friday
  let fridays = 0;
  while (thirdFriday.getDay() !== 5 || fridays < 3) {
    if (thirdFriday.getDay() === 5) fridays++;
    if (fridays < 3) thirdFriday.setDate(thirdFriday.getDate() + 1);
  }

  return thirdFriday;
};

// Routes

// Get current price and strategy info
app.get('/api/status', async (req, res) => {
  try {
    const currentPrice = await getCurrentPrice();
    const sharesOwned = getSetting('shares_owned');
    const premiumPct = getSetting('premium_pct');

    const nextExpiry = getNextMonthlyExpiry();
    const daysToExpiry = Math.ceil((nextExpiry - new Date()) / (1000 * 60 * 60 * 24));
    const strikePrice = currentPrice * (1 + premiumPct / 100);

    const estimatedPremium = calculatePremium(currentPrice, strikePrice, daysToExpiry);
    const estimatedIncome = estimatedPremium * sharesOwned;

    // Get recent prices for chart
    const recentPrices = db.prepare(`
      SELECT date, close
      FROM prices
      ORDER BY date DESC
      LIMIT 30
    `).all().reverse();

    // Get total income from closed calls
    const totalIncome = db.prepare(`
      SELECT COALESCE(SUM(income), 0) as total
      FROM calls
      WHERE status = 'closed'
    `).get().total;

    res.json({
      currentPrice,
      strikePrice,
      estimatedPremium,
      premiumPct,
      estimatedIncome,
      sharesOwned,
      daysToExpiry,
      nextExpiry: nextExpiry.toISOString().split('T')[0],
      recentPrices,
      totalIncome: parseFloat(totalIncome),
      annualizedReturn: totalIncome / (currentPrice * sharesOwned) * 12 // Rough annualization
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Fetch and update prices
app.post('/api/refresh', async (req, res) => {
  try {
    const prices = await fetchSLVPrices(365);
    res.json({ count: prices.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create a new covered call position
app.post('/api/calls', async (req, res) => {
  try {
    const currentPrice = await getCurrentPrice();
    const sharesOwned = getSetting('shares_owned');
    const premiumPct = getSetting('premium_pct');

    const nextExpiry = getNextMonthlyExpiry();
    const daysToExpiry = Math.ceil((nextExpiry - new Date()) / (1000 * 60 * 60 * 24));
    const strikePrice = currentPrice * (1 + premiumPct / 100);

    const premium = calculatePremium(currentPrice, strikePrice, daysToExpiry);
    const income = premium * sharesOwned;

    const result = db.prepare(`
      INSERT INTO calls (strike_date, strike_price, current_price, premium, premium_pct, shares, income, expires, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      nextExpiry.toISOString().split('T')[0],
      strikePrice,
      currentPrice,
      premium,
      premiumPct,
      sharesOwned,
      income,
      nextExpiry.toISOString().split('T')[0]
    );

    const call = db.prepare('SELECT * FROM calls WHERE id = ?').get(result.lastInsertRowid);
    res.json(call);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all calls
app.get('/api/calls', (req, res) => {
  const calls = db.prepare(`
    SELECT * FROM calls
    ORDER BY created_at DESC
  `).all();
  res.json(calls);
});

// Close a call
app.post('/api/calls/:id/close', (req, res) => {
  try {
    db.prepare('UPDATE calls SET status = ? WHERE id = ?').run('closed', req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update settings
app.post('/api/settings', (req, res) => {
  try {
    const { sharesOwned, premiumPct } = req.body;

    if (sharesOwned) setSetting('shares_owned', sharesOwned);
    if (premiumPct) setSetting('premium_pct', premiumPct);

    res.json({ success: true, sharesOwned, premiumPct });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get historical prices
app.get('/api/prices', (req, res) => {
  const { days = 90 } = req.query;
  const prices = db.prepare(`
    SELECT date, close, high, low
    FROM prices
    ORDER BY date DESC
    LIMIT ?
  `).all(days).reverse();
  res.json(prices);
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`📈 SLV Covered Calls running on http://localhost:${PORT}`);
  console.log('💰 Note: Set ALPHA_VANTAGE_KEY env var for live data, otherwise using demo/cached data');
});
