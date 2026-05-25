const API = '';  // same server
let currentRestaurant = null;
let currentCustomer = null;
let allCustomers = [];

// ─── AUTH ────────────────────────────────────────

function showTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  document.getElementById('loginForm').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('registerForm').style.display = tab === 'register' ? 'block' : 'none';
}

async function register() {
  const name = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  if (!name || !email || !password) return alert('Fill all fields!');

  const res = await fetch('/api/restaurant/register', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ name, email, password })
  });
  const data = await res.json();
  if (data.success) {
    alert('Account created! Please login.');
    showTab('login');
  } else {
    alert(data.error);
  }
}

async function login() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  const res = await fetch('/api/restaurant/login', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (data.success) {
    currentRestaurant = data.restaurant;
    localStorage.setItem('loyaltyRestaurant', JSON.stringify(data.restaurant));
    document.getElementById('restaurantName').textContent = currentRestaurant.name;
    showPage('dashboardPage');
    loadDashboard();
  } else {
    alert('Invalid login!');
  }
}

function logout() {
  currentRestaurant = null;
  currentCustomer = null;
  localStorage.removeItem('loyaltyRestaurant');
  showPage('loginPage');
}

function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ─── DASHBOARD ────────────────────────────────────

async function loadDashboard() {
  loadStats();
  loadCustomers();
}

async function loadStats() {
  const res = await fetch(`/api/stats/${currentRestaurant.id}`);
  const data = await res.json();
  document.getElementById('statsBar').innerHTML = `
    <div class="stat-card">
      <div class="num">${data.total_customers}</div>
      <div class="label">Total Customers</div>
    </div>
    <div class="stat-card">
      <div class="num">${data.total_coins_issued.toLocaleString()}</div>
      <div class="label">Total Coins Issued</div>
    </div>
    <div class="stat-card">
      <div class="num">₹${data.total_revenue.toLocaleString()}</div>
      <div class="label">Total Revenue Tracked</div>
    </div>
  `;
}

async function loadCustomers() {
  const res = await fetch(`/api/customers/${currentRestaurant.id}`);
  allCustomers = await res.json();
  renderCustomers(allCustomers);
}

function renderCustomers(customers) {
  const list = document.getElementById('customerList');
  if (customers.length === 0) {
    list.innerHTML = '<p style="color:#888;text-align:center;margin-top:20px;">No customers yet. Add your first one!</p>';
    return;
  }
  list.innerHTML = customers.map(c => `
    <div class="customer-row" onclick="selectCustomer(${c.id})">
      <div>
        <div class="name">${c.name}</div>
        <div class="phone">${c.phone}</div>
      </div>
      <span class="coins">🪙 ${c.coin_balance}</span>
    </div>
  `).join('');
}

function filterCustomers() {
  const q = document.getElementById('searchBox').value.toLowerCase();
  const filtered = allCustomers.filter(c =>
    c.name.toLowerCase().includes(q) || c.phone.includes(q)
  );
  renderCustomers(filtered);
}

// ─── TRANSACTIONS ────────────────────────────────

let phoneTimeout;
function lookupCustomer() {
  clearTimeout(phoneTimeout);
  const phone = document.getElementById('txnPhone').value.trim();
  document.getElementById('customerInfo').style.display = 'none';
  document.getElementById('newCustomerForm').style.display = 'none';
  document.getElementById('transactionForm').style.display = 'none';
  document.getElementById('txnResult').style.display = 'none';
  currentCustomer = null;

  if (phone.length >= 10) {
    phoneTimeout = setTimeout(() => checkPhone(phone), 500);
  }
}

function checkPhone(phone) {
  const customer = allCustomers.find(c => c.phone === phone);
  if (customer) {
    currentCustomer = customer;
    document.getElementById('customerInfo').innerHTML = `
      <strong>${customer.name}</strong><br>
      📱 ${customer.phone}<br>
      <span class="coin-badge">🪙 ${customer.coin_balance} coins</span>
    `;
    document.getElementById('customerInfo').style.display = 'block';
    document.getElementById('transactionForm').style.display = 'block';
  } else {
    document.getElementById('newCustomerForm').style.display = 'block';
  }
}

async function registerCustomer() {
  const phone = document.getElementById('txnPhone').value.trim();
  const name = document.getElementById('newName').value.trim();
  const email = document.getElementById('newEmail').value.trim();
  if (!name) return alert('Enter customer name!');

  const res = await fetch('/api/customers', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ restaurant_id: currentRestaurant.id, name, phone, email })
  });
  const data = await res.json();
  if (data.success) {
    await loadCustomers();
    checkPhone(phone);
    document.getElementById('newCustomerForm').style.display = 'none';
  }
}

async function submitTransaction() {
  if (!currentCustomer) return;
  const amount = parseFloat(document.getElementById('billAmount').value);
  const type = document.getElementById('txnType').value;
  const note = document.getElementById('txnNote').value;
  if (!amount || amount <= 0) return alert('Enter a valid amount!');

  const resultBox = document.getElementById('txnResult');

  if (type === 'earn') {
    const res = await fetch('/api/transactions/earn', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ customer_id: currentCustomer.id, restaurant_id: currentRestaurant.id, bill_amount: amount, note })
    });
    const data = await res.json();
    if (data.success) {
      resultBox.className = 'result-box result-success';
      resultBox.innerHTML = `✅ ${data.message}<br>📧 Notification sent!`;
      resultBox.style.display = 'block';
      resetTxnForm();
      loadDashboard();
    }
  } else {
    const coinsToRedeem = parseInt(amount);
    const res = await fetch('/api/transactions/redeem', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ customer_id: currentCustomer.id, restaurant_id: currentRestaurant.id, coins_to_redeem: coinsToRedeem, note })
    });
    const data = await res.json();
    if (data.success) {
      resultBox.className = 'result-box result-success';
      resultBox.innerHTML = `✅ Redeemed ${data.coins_redeemed} coins! Balance: ${data.new_balance}`;
      resultBox.style.display = 'block';
      resetTxnForm();
      loadDashboard();
    } else {
      resultBox.className = 'result-box result-error';
      resultBox.innerHTML = `❌ ${data.error}`;
      resultBox.style.display = 'block';
    }
  }
}

function resetTxnForm() {
  document.getElementById('txnPhone').value = '';
  document.getElementById('billAmount').value = '';
  document.getElementById('txnNote').value = '';
  document.getElementById('customerInfo').style.display = 'none';
  document.getElementById('transactionForm').style.display = 'none';
  currentCustomer = null;
}

function selectCustomer(id) {
  const customer = allCustomers.find(c => c.id === id);
  if (customer) {
    document.getElementById('txnPhone').value = customer.phone;
    lookupCustomer();
    // scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}