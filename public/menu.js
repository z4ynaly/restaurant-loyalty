// ────────────────────────────────────────────
//  STATE
// ────────────────────────────────────────────
let restaurant = null;       // logged-in restaurant object
let allCategories = [];      // all categories from server
let allItems = [];           // all menu items from server
let activeCategoryId = null; // null = show all
let editingCategoryId = null;
let editingItemId = null;
let pendingDeleteType = null;
let pendingDeleteId = null;


// ────────────────────────────────────────────
//  INIT — runs when page loads
// ────────────────────────────────────────────
window.onload = () => {
  // Read restaurant from localStorage (set when they logged in on index.html)
  const stored = localStorage.getItem('loyaltyRestaurant');
  if (!stored) {
    alert('Please log in first.');
    window.location.href = 'index.html';
    return;
  }

  restaurant = JSON.parse(stored);
  document.getElementById('navRestaurantName').textContent = restaurant.name;

  loadAll();
};

async function loadAll() {
  await Promise.all([loadCategories(), loadItems()]);
  renderCategorySidebar();
  renderItems();
  updateMultiplierHint();
}


// ────────────────────────────────────────────
//  DATA FETCHING
// ────────────────────────────────────────────
async function loadCategories() {
  const res = await fetch(`/api/categories/${restaurant.id}`);
  allCategories = await res.json();
}

async function loadItems() {
  const res = await fetch(`/api/menu/${restaurant.id}`);
  allItems = await res.json();
}


// ────────────────────────────────────────────
//  SIDEBAR RENDERING
// ────────────────────────────────────────────
function renderCategorySidebar() {
  const list = document.getElementById('categoryList');

  const totalCount = allItems.length;

  // "All Items" row
  let html = `
    <div class="cat-item cat-all ${activeCategoryId === null ? 'active' : ''}"
         onclick="selectCategory(null)">
      <span class="cat-name">All Items</span>
      <span class="cat-count">${totalCount}</span>
    </div>
  `;

  // Each category
  allCategories.forEach(cat => {
    html += `
      <div class="cat-item ${activeCategoryId === cat.id ? 'active' : ''}"
           onclick="selectCategory(${cat.id})">
        <span class="cat-name">${escHtml(cat.name)}</span>
        <span class="cat-count">${cat.item_count}</span>
        <div class="cat-item-actions">
          <button class="cat-action-btn" title="Rename"
            onclick="event.stopPropagation(); openEditCategory(${cat.id}, '${escHtml(cat.name).replace(/'/g,"\\'")}')">✏️</button>
          <button class="cat-action-btn" title="Delete"
            onclick="event.stopPropagation(); confirmDeleteCategory(${cat.id}, '${escHtml(cat.name).replace(/'/g,"\\'")}')">🗑️</button>
        </div>
      </div>
    `;
  });

  // Uncategorised (items with no category)
  const uncatCount = allItems.filter(i => !i.category_id).length;
  if (uncatCount > 0) {
    html += `
      <div class="cat-item ${activeCategoryId === 'none' ? 'active' : ''}"
           onclick="selectCategory('none')">
        <span class="cat-name" style="color:#aaa;font-style:italic">Uncategorised</span>
        <span class="cat-count">${uncatCount}</span>
      </div>
    `;
  }

  list.innerHTML = html;
}

function selectCategory(id) {
  activeCategoryId = id;
  renderCategorySidebar();
  renderItems();
}


// ────────────────────────────────────────────
//  ITEMS RENDERING
// ────────────────────────────────────────────
function getFilteredItems() {
  const q = document.getElementById('searchInput').value.toLowerCase().trim();

  let items = [...allItems];

  // Filter by category
  if (activeCategoryId === null) {
    // show all
  } else if (activeCategoryId === 'none') {
    items = items.filter(i => !i.category_id);
  } else {
    items = items.filter(i => i.category_id === activeCategoryId);
  }

  // Filter by search text
  if (q) {
    items = items.filter(i =>
      i.name.toLowerCase().includes(q) ||
      (i.description || '').toLowerCase().includes(q) ||
      (i.category_name || '').toLowerCase().includes(q)
    );
  }

  return items;
}

function renderItems() {
  const items = getFilteredItems();
  const grid = document.getElementById('itemsGrid');
  const statsBar = document.getElementById('statsBar');

  // Update header
  const catName = activeCategoryId === null
    ? 'All Items'
    : activeCategoryId === 'none'
    ? 'Uncategorised'
    : (allCategories.find(c => c.id === activeCategoryId) || {}).name || 'Items';

  document.getElementById('currentCategoryTitle').textContent = catName;
  document.getElementById('itemCountBadge').textContent = `${items.length} item${items.length !== 1 ? 's' : ''}`;

  // Stats bar
  if (allItems.length > 0) {
    const available = items.filter(i => i.is_available).length;
    const unavailable = items.filter(i => !i.is_available).length;
    const withBoost = items.filter(i => i.coin_multiplier > 1).length;
    document.getElementById('statTotal').textContent = items.length;
    document.getElementById('statAvailable').textContent = available;
    document.getElementById('statUnavailable').textContent = unavailable;
    document.getElementById('statMultiplier').textContent = withBoost;
    statsBar.style.display = 'flex';
  } else {
    statsBar.style.display = 'none';
  }

  // Empty state
  if (items.length === 0) {
    const q = document.getElementById('searchInput').value.trim();
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">${q ? '🔍' : '🍽️'}</div>
        <div class="empty-title">${q ? 'No items match your search' : 'No items here yet'}</div>
        <div class="empty-sub">${q ? 'Try a different search term' : 'Click "+ Add Item" to add your first menu item'}</div>
      </div>
    `;
    return;
  }

  grid.innerHTML = items.map(item => renderItemCard(item)).join('');
}

function renderItemCard(item) {
  const multiplierLabel = item.coin_multiplier > 1
    ? `${item.coin_multiplier}× coins`
    : item.coin_multiplier < 1
    ? `${item.coin_multiplier}× coins`
    : null;

  return `
    <div class="item-card ${item.is_available ? '' : 'unavailable'}" id="card-${item.id}">
      <div class="item-card-top">
        <div class="item-card-name">${escHtml(item.name)}</div>
        <div class="item-card-price">₹${parseFloat(item.price).toFixed(2)}</div>
      </div>
      <div class="item-card-desc">${escHtml(item.description || '')}</div>
      <div class="item-card-footer">
        <span class="item-badge ${item.is_available ? 'badge-available' : 'badge-unavailable'}">
          ${item.is_available ? '✓ Available' : '✗ Unavailable'}
        </span>
        ${item.category_name ? `<span class="item-badge badge-category">${escHtml(item.category_name)}</span>` : ''}
        ${multiplierLabel ? `<span class="item-badge badge-multiplier">${multiplierLabel}</span>` : ''}
        <div class="item-card-actions">
          <button class="card-btn toggle-btn" onclick="toggleItem(${item.id})"
            title="${item.is_available ? 'Mark unavailable' : 'Mark available'}">
            ${item.is_available ? 'Hide' : 'Show'}
          </button>
          <button class="card-btn edit-btn" onclick="openEditItem(${item.id})">Edit</button>
          <button class="card-btn delete-btn" onclick="confirmDeleteItem(${item.id}, '${escHtml(item.name).replace(/'/g,"\\'")}')">Delete</button>
        </div>
      </div>
    </div>
  `;
}

function filterItems() {
  renderItems();
}


// ────────────────────────────────────────────
//  CATEGORY MODAL
// ────────────────────────────────────────────
function openAddCategory() {
  editingCategoryId = null;
  document.getElementById('categoryModalTitle').textContent = 'Add Category';
  document.getElementById('categoryNameInput').value = '';
  document.getElementById('categoryError').style.display = 'none';
  document.getElementById('saveCategoryBtn').textContent = 'Add Category';
  document.getElementById('categoryModal').style.display = 'flex';
  setTimeout(() => document.getElementById('categoryNameInput').focus(), 50);
}

function openEditCategory(id, currentName) {
  editingCategoryId = id;
  document.getElementById('categoryModalTitle').textContent = 'Rename Category';
  document.getElementById('categoryNameInput').value = currentName;
  document.getElementById('categoryError').style.display = 'none';
  document.getElementById('saveCategoryBtn').textContent = 'Save Changes';
  document.getElementById('categoryModal').style.display = 'flex';
  setTimeout(() => document.getElementById('categoryNameInput').focus(), 50);
}

function closeCategoryModal() {
  document.getElementById('categoryModal').style.display = 'none';
  editingCategoryId = null;
}

async function saveCategory() {
  const name = document.getElementById('categoryNameInput').value.trim();
  const errEl = document.getElementById('categoryError');
  errEl.style.display = 'none';

  if (!name) {
    errEl.textContent = 'Please enter a category name.';
    errEl.style.display = 'block';
    return;
  }

  const btn = document.getElementById('saveCategoryBtn');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    let res;
    if (editingCategoryId) {
      res = await fetch(`/api/categories/${editingCategoryId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, restaurant_id: restaurant.id })
      });
    } else {
      res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, restaurant_id: restaurant.id })
      });
    }

    const data = await res.json();
    if (!data.success) {
      errEl.textContent = data.error || 'Could not save. Try again.';
      errEl.style.display = 'block';
      return;
    }

    closeCategoryModal();
    await loadAll();
  } catch (e) {
    errEl.textContent = 'Network error. Please try again.';
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = editingCategoryId ? 'Save Changes' : 'Add Category';
  }
}


// ────────────────────────────────────────────
//  ITEM MODAL
// ────────────────────────────────────────────
function populateCategoryDropdown(selectedId) {
  const sel = document.getElementById('itemCategory');
  sel.innerHTML = '<option value="">— No category —</option>';
  allCategories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = cat.name;
    if (selectedId && cat.id === selectedId) opt.selected = true;
    sel.appendChild(opt);
  });
}

function openAddItem() {
  editingItemId = null;
  document.getElementById('itemModalTitle').textContent = 'Add Menu Item';
  document.getElementById('itemName').value = '';
  document.getElementById('itemDescription').value = '';
  document.getElementById('itemPrice').value = '';
  document.getElementById('itemMultiplier').value = '1';
  document.getElementById('itemAvailable').checked = true;
  document.getElementById('itemError').style.display = 'none';
  document.getElementById('saveItemBtn').textContent = 'Add Item';
  populateCategoryDropdown(activeCategoryId !== 'none' ? activeCategoryId : null);
  updateMultiplierHint();
  document.getElementById('itemModal').style.display = 'flex';
  setTimeout(() => document.getElementById('itemName').focus(), 50);
}

function openEditItem(id) {
  const item = allItems.find(i => i.id === id);
  if (!item) return;

  editingItemId = id;
  document.getElementById('itemModalTitle').textContent = 'Edit Menu Item';
  document.getElementById('itemName').value = item.name;
  document.getElementById('itemDescription').value = item.description || '';
  document.getElementById('itemPrice').value = item.price;
  document.getElementById('itemMultiplier').value = item.coin_multiplier || 1;
  document.getElementById('itemAvailable').checked = !!item.is_available;
  document.getElementById('itemError').style.display = 'none';
  document.getElementById('saveItemBtn').textContent = 'Save Changes';
  populateCategoryDropdown(item.category_id);
  updateMultiplierHint();
  document.getElementById('itemModal').style.display = 'flex';
  setTimeout(() => document.getElementById('itemName').focus(), 50);
}

function closeItemModal() {
  document.getElementById('itemModal').style.display = 'none';
  editingItemId = null;
}

function updateMultiplierHint() {
  const val = parseFloat(document.getElementById('itemMultiplier').value) || 1;
  const hint = document.getElementById('multiplierHint');
  const price = parseFloat(document.getElementById('itemPrice').value) || 100;
  const baseCoins = Math.floor(price * 1);
  const actualCoins = Math.floor(price * val);

  if (val === 1) {
    hint.textContent = `Standard: ₹${price} bill earns ${actualCoins} coins`;
  } else if (val > 1) {
    hint.textContent = `Boosted: ₹${price} bill earns ${actualCoins} coins instead of ${baseCoins} 🎉`;
  } else {
    hint.textContent = `Reduced: ₹${price} bill earns only ${actualCoins} coins`;
  }
}

async function saveItem() {
  const name = document.getElementById('itemName').value.trim();
  const description = document.getElementById('itemDescription').value.trim();
  const price = document.getElementById('itemPrice').value;
  const category_id = document.getElementById('itemCategory').value || null;
  const coin_multiplier = document.getElementById('itemMultiplier').value;
  const is_available = document.getElementById('itemAvailable').checked;
  const errEl = document.getElementById('itemError');
  errEl.style.display = 'none';

  // Client-side validation
  if (!name) {
    errEl.textContent = 'Item name is required.';
    errEl.style.display = 'block';
    return;
  }
  if (price === '' || isNaN(parseFloat(price))) {
    errEl.textContent = 'Please enter a valid price.';
    errEl.style.display = 'block';
    return;
  }
  if (parseFloat(price) < 0) {
    errEl.textContent = 'Price cannot be negative.';
    errEl.style.display = 'block';
    return;
  }

  const btn = document.getElementById('saveItemBtn');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    const payload = {
      restaurant_id: restaurant.id,
      category_id: category_id ? parseInt(category_id) : null,
      name,
      description,
      price: parseFloat(price),
      coin_multiplier: parseFloat(coin_multiplier),
      is_available
    };

    let res;
    if (editingItemId) {
      res = await fetch(`/api/menu/${editingItemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      res = await fetch('/api/menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }

    const data = await res.json();
    if (!data.success) {
      errEl.textContent = data.error || 'Could not save. Try again.';
      errEl.style.display = 'block';
      return;
    }

    closeItemModal();
    await loadAll();
  } catch (e) {
    errEl.textContent = 'Network error. Please try again.';
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = editingItemId ? 'Save Changes' : 'Add Item';
  }
}


// ────────────────────────────────────────────
//  TOGGLE AVAILABILITY
// ────────────────────────────────────────────
async function toggleItem(id) {
  try {
    const res = await fetch(`/api/menu/${id}/toggle`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurant_id: restaurant.id })
    });
    const data = await res.json();
    if (data.success) {
      // Update locally without full reload
      const item = allItems.find(i => i.id === id);
      if (item) item.is_available = data.is_available;
      await loadCategories(); // refresh counts
      renderCategorySidebar();
      renderItems();
    }
  } catch (e) {
    alert('Could not update item. Please try again.');
  }
}


// ────────────────────────────────────────────
//  DELETE MODAL
// ────────────────────────────────────────────
function confirmDeleteItem(id, name) {
  pendingDeleteType = 'item';
  pendingDeleteId = id;
  document.getElementById('deleteMessage').innerHTML =
    `Are you sure you want to delete <strong>${escHtml(name)}</strong>? This cannot be undone.`;
  document.getElementById('confirmDeleteBtn').onclick = executeDelete;
  document.getElementById('deleteModal').style.display = 'flex';
}

function confirmDeleteCategory(id, name) {
  pendingDeleteType = 'category';
  pendingDeleteId = id;
  document.getElementById('deleteMessage').innerHTML =
    `Are you sure you want to delete the category <strong>${escHtml(name)}</strong>?
     <br><br>Items in this category will become uncategorised. The items themselves won't be deleted.`;
  document.getElementById('confirmDeleteBtn').onclick = executeDelete;
  document.getElementById('deleteModal').style.display = 'flex';
}

function closeDeleteModal() {
  document.getElementById('deleteModal').style.display = 'none';
  pendingDeleteType = null;
  pendingDeleteId = null;
}

async function executeDelete() {
  const btn = document.getElementById('confirmDeleteBtn');
  btn.disabled = true;
  btn.textContent = 'Deleting...';

  try {
    const url = pendingDeleteType === 'item'
      ? `/api/menu/${pendingDeleteId}`
      : `/api/categories/${pendingDeleteId}`;

    const res = await fetch(url, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurant_id: restaurant.id })
    });

    const data = await res.json();

    if (!data.success) {
      closeDeleteModal();
      alert(data.error || 'Could not delete. Try again.');
      return;
    }

    // If deleting a category that was selected, go back to All Items
    if (pendingDeleteType === 'category' && activeCategoryId === pendingDeleteId) {
      activeCategoryId = null;
    }

    closeDeleteModal();
    await loadAll();
  } catch (e) {
    closeDeleteModal();
    alert('Network error. Please try again.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Delete';
  }
}


// ────────────────────────────────────────────
//  HELPERS
// ────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Close modals on overlay click
document.addEventListener('click', (e) => {
  if (e.target.id === 'categoryModal') closeCategoryModal();
  if (e.target.id === 'itemModal') closeItemModal();
  if (e.target.id === 'deleteModal') closeDeleteModal();
});

// Keyboard shortcut: Escape closes modals
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeCategoryModal();
    closeItemModal();
    closeDeleteModal();
  }
  // Enter submits category modal
  if (e.key === 'Enter' && document.getElementById('categoryModal').style.display === 'flex') {
    saveCategory();
  }
});