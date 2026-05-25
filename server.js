const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const nodemailer = require('nodemailer');
const db = require('./database');

const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// ─────────────────────────────────────────────
// EMAIL SETUP
// ─────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'braingyatt@gmail.com',
    pass: 'atvh izhs wvib iexq'
  }
});

async function sendEmail(toEmail, subject, message) {
  if (!toEmail) return;

  try {
    await transporter.sendMail({
      from: '"LoyaltyApp" <braingyatt@gmail.com>',
      to: toEmail,
      subject: subject,
      html: `
        <div style="
          font-family:Arial;
          padding:20px;
          background:#fff8f0;
          border-radius:10px;
          max-width:600px;
          margin:auto;
        ">
          <h2 style="color:#e67e22;">🎉 Loyalty Update!</h2>

          <div style="font-size:16px;line-height:1.6;">
            ${message}
          </div>

          <hr style="margin:20px 0;border:none;border-top:1px solid #eee;" />

          <p style="color:#888;font-size:12px;">
            Thank you for your loyalty ❤️
          </p>
        </div>
      `
    });

    console.log('✅ Email sent to', toEmail);

  } catch (err) {
    console.error('❌ Email error:', err.message);
  }
}

// ─────────────────────────────────────────────
// RESTAURANT ROUTES
// ─────────────────────────────────────────────

// Register restaurant
app.post('/api/restaurant/register', (req, res) => {
  const { name, email, password } = req.body;

  try {
    const stmt = db.prepare(
      'INSERT INTO restaurants (name, email, password) VALUES (?, ?, ?)'
    );

    const result = stmt.run(name, email, password);

    res.json({
      success: true,
      restaurantId: result.lastInsertRowid
    });

  } catch (err) {
    res.status(400).json({
      success: false,
      error: 'Email already exists'
    });
  }
});

// Login restaurant
app.post('/api/restaurant/login', (req, res) => {
  const { email, password } = req.body;

  const restaurant = db.prepare(
    'SELECT * FROM restaurants WHERE email = ? AND password = ?'
  ).get(email, password);

  if (restaurant) {
    res.json({
      success: true,
      restaurant
    });
  } else {
    res.status(401).json({
      success: false,
      error: 'Invalid credentials'
    });
  }
});

// Public restaurant info
app.get('/api/restaurant/public/:id', (req, res) => {
  const restaurant = db.prepare(
    'SELECT id, name FROM restaurants WHERE id = ?'
  ).get(req.params.id);

  if (!restaurant) {
    return res.status(404).json({
      error: 'Restaurant not found'
    });
  }

  res.json(restaurant);
});

// ─────────────────────────────────────────────
// CUSTOMER ROUTES
// ─────────────────────────────────────────────

// Add customer
app.post('/api/customers', (req, res) => {
  const { restaurant_id, name, phone, email } = req.body;

  // Check existing customer
  const existing = db.prepare(
    'SELECT * FROM customers WHERE phone = ? AND restaurant_id = ?'
  ).get(phone, restaurant_id);

  if (existing) {
    return res.json({
      success: true,
      customer: existing,
      isNew: false
    });
  }

  const stmt = db.prepare(
    'INSERT INTO customers (restaurant_id, name, phone, email) VALUES (?, ?, ?, ?)'
  );

  const result = stmt.run(
    restaurant_id,
    name,
    phone,
    email
  );

  const customer = db.prepare(
    'SELECT * FROM customers WHERE id = ?'
  ).get(result.lastInsertRowid);

  res.json({
    success: true,
    customer,
    isNew: true
  });
});

// Get customers
app.get('/api/customers/:restaurant_id', (req, res) => {
  const customers = db.prepare(
    'SELECT * FROM customers WHERE restaurant_id = ? ORDER BY coin_balance DESC'
  ).all(req.params.restaurant_id);

  res.json(customers);
});

// Customer lookup
app.get('/api/customer/lookup', (req, res) => {
  const { phone, restaurant_id } = req.query;

  if (!phone || !restaurant_id) {
    return res.status(400).json({
      success: false,
      error: 'Missing phone or restaurant'
    });
  }

  const customer = db.prepare(`
    SELECT
      id,
      name,
      phone,
      coin_balance,
      total_spent,
      created_at
    FROM customers
    WHERE phone = ? AND restaurant_id = ?
  `).get(phone, restaurant_id);

  if (!customer) {
    return res.json({
      success: false,
      error: 'No account found'
    });
  }

  const transactions = db.prepare(`
    SELECT
      type,
      coins_earned,
      coins_redeemed,
      bill_amount,
      note,
      created_at
    FROM transactions
    WHERE customer_id = ?
    ORDER BY created_at DESC
    LIMIT 5
  `).all(customer.id);

  // Tier system
  let tier = 'Bronze';
  let tierColor = '#CD7F32';
  let nextTier = 'Silver';
  let nextTierSpend = 1000;

  if (customer.total_spent >= 10000) {
    tier = 'Platinum';
    tierColor = '#8B5CF6';
    nextTier = null;
    nextTierSpend = null;

  } else if (customer.total_spent >= 5000) {
    tier = 'Gold';
    tierColor = '#F59E0B';
    nextTier = 'Platinum';
    nextTierSpend = 10000;

  } else if (customer.total_spent >= 1000) {
    tier = 'Silver';
    tierColor = '#9CA3AF';
    nextTier = 'Gold';
    nextTierSpend = 5000;
  }

  res.json({
    success: true,
    customer: {
      ...customer,
      tier,
      tierColor,
      nextTier,
      nextTierSpend
    },
    transactions
  });
});

// ─────────────────────────────────────────────
// TRANSACTION ROUTES
// ─────────────────────────────────────────────

// Earn coins
app.post('/api/transactions/earn', async (req, res) => {

  const {
    customer_id,
    restaurant_id,
    bill_amount,
    note
  } = req.body;

  const restaurant = db.prepare(
    'SELECT * FROM restaurants WHERE id = ?'
  ).get(restaurant_id);

  const customer = db.prepare(
    'SELECT * FROM customers WHERE id = ?'
  ).get(customer_id);

  if (!restaurant || !customer) {
    return res.status(404).json({
      success: false,
      error: 'Customer or restaurant not found'
    });
  }

  const coins_earned = Math.floor(
    bill_amount * restaurant.coins_per_rupee
  );

  const new_balance =
    customer.coin_balance + coins_earned;

  const new_total_spent =
    customer.total_spent + bill_amount;

  // Save transaction
  db.prepare(`
    INSERT INTO transactions
    (
      customer_id,
      restaurant_id,
      bill_amount,
      coins_earned,
      type,
      note
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    customer_id,
    restaurant_id,
    bill_amount,
    coins_earned,
    'earn',
    note || ''
  );

  // Update customer
  db.prepare(`
    UPDATE customers
    SET
      coin_balance = ?,
      total_spent = ?
    WHERE id = ?
  `).run(
    new_balance,
    new_total_spent,
    customer_id
  );

  // BALANCE LINK
  const balanceUrl =
    `https://your-app.onrender.com/check.html?r=${restaurant_id}`;

  // EMAIL MESSAGE
  const emailMsg = `
    Hi <strong>${customer.name}</strong>! 🌟<br><br>

    You just earned
    <strong>${coins_earned} coins</strong>
    at ${restaurant.name}.<br>

    Your current balance is
    <strong>${new_balance} coins</strong>.<br><br>

    <a href="${balanceUrl}"
       style="
         background:#e67e22;
         color:white;
         padding:12px 20px;
         border-radius:8px;
         text-decoration:none;
         font-weight:bold;
         display:inline-block;
       ">
       View My Balance →
    </a>

    <br><br>

    Keep visiting to earn more rewards 🎉
  `;

  await sendEmail(
    customer.email,
    `You earned ${coins_earned} coins at ${restaurant.name}!`,
    emailMsg
  );

  res.json({
    success: true,
    coins_earned,
    new_balance,
    message:
      `${customer.name} earned ${coins_earned} coins`
  });
});

// Redeem coins
app.post('/api/transactions/redeem', async (req, res) => {

  const {
    customer_id,
    restaurant_id,
    coins_to_redeem,
    note
  } = req.body;

  const restaurant = db.prepare(
    'SELECT * FROM restaurants WHERE id = ?'
  ).get(restaurant_id);

  const customer = db.prepare(
    'SELECT * FROM customers WHERE id = ?'
  ).get(customer_id);

  if (!restaurant || !customer) {
    return res.status(404).json({
      success: false,
      error: 'Customer or restaurant not found'
    });
  }

  if (customer.coin_balance < coins_to_redeem) {
    return res.status(400).json({
      success: false,
      error: 'Insufficient coins'
    });
  }

  const new_balance =
    customer.coin_balance - coins_to_redeem;

  // Save redeem transaction
  db.prepare(`
    INSERT INTO transactions
    (
      customer_id,
      restaurant_id,
      bill_amount,
      coins_earned,
      coins_redeemed,
      type,
      note
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    customer_id,
    restaurant_id,
    0,
    0,
    coins_to_redeem,
    'redeem',
    note || ''
  );

  // Update balance
  db.prepare(`
    UPDATE customers
    SET coin_balance = ?
    WHERE id = ?
  `).run(
    new_balance,
    customer_id
  );

  // BALANCE LINK
  const balanceUrl =
    `https://your-app.onrender.com/check.html?r=${restaurant_id}`;

  // EMAIL
  const emailMsg = `
    Hi <strong>${customer.name}</strong>!<br><br>

    You redeemed
    <strong>${coins_to_redeem} coins</strong>
    at ${restaurant.name}.<br>

    Your remaining balance is
    <strong>${new_balance} coins</strong>.<br><br>

    <a href="${balanceUrl}"
       style="
         background:#e67e22;
         color:white;
         padding:12px 20px;
         border-radius:8px;
         text-decoration:none;
         font-weight:bold;
         display:inline-block;
       ">
       View My Balance →
    </a>

    <br><br>

    Enjoy your reward 🎁
  `;

  await sendEmail(
    customer.email,
    `You redeemed ${coins_to_redeem} coins at ${restaurant.name}!`,
    emailMsg
  );

  res.json({
    success: true,
    coins_redeemed: coins_to_redeem,
    new_balance
  });
});

// Transaction history
app.get('/api/transactions/:customer_id', (req, res) => {

  const txns = db.prepare(`
    SELECT *
    FROM transactions
    WHERE customer_id = ?
    ORDER BY created_at DESC
    LIMIT 20
  `).all(req.params.customer_id);

  res.json(txns);
});

// ─────────────────────────────────────────────
// STATS
// ─────────────────────────────────────────────

app.get('/api/stats/:restaurant_id', (req, res) => {

  const rid = req.params.restaurant_id;

  const total_customers =
    db.prepare(`
      SELECT COUNT(*) as count
      FROM customers
      WHERE restaurant_id = ?
    `).get(rid).count;

  const total_coins_issued =
    db.prepare(`
      SELECT SUM(coins_earned) as sum
      FROM transactions
      WHERE restaurant_id = ?
      AND type = "earn"
    `).get(rid).sum || 0;

  const total_revenue =
    db.prepare(`
      SELECT SUM(bill_amount) as sum
      FROM transactions
      WHERE restaurant_id = ?
    `).get(rid).sum || 0;

  res.json({
    total_customers,
    total_coins_issued,
    total_revenue
  });
});

// ─────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────

const PORT = 3000;

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});