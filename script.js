import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase, ref, push, onValue, set } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDHhDMH4wciZBG75V8Pf4zQg9ymS3e4tx4",
  authDomain: "kurukshetraa-game-zone.firebaseapp.com",
  databaseURL: "https://kurukshetraa-game-zone-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "kurukshetraa-game-zone",
  storageBucket: "kurukshetraa-game-zone.firebasestorage.app",
  messagingSenderId: "333963556581",
  appId: "1:333963556581:web:551555a6a58a93a208460c"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const googleProvider = new GoogleAuthProvider();

const state = { products: [], cart: [], wishlist: [], orders: [], addresses: [], user: null, search: '', category: 'all', sort: 'default' };
const $ = (id) => document.getElementById(id);
function escapeHtml(str) { return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function formatPrice(n) { return '$' + Number(n).toFixed(2); }
function generateStars(r) { if(!r) return '★★★★☆'; const f = Math.floor(r.rate); return '★'.repeat(f) + '☆'.repeat(5 - f); }

const Toast = { timer: null, show(msg) { const el = $('toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(this.timer); this.timer = setTimeout(() => el.classList.remove('show'), 2500); } };

// --- ACTIVITY TRACKER ---
function trackActivity(action, details) {
  const uid = state.user ? state.user.uid : 'guest_' + (localStorage.getItem('guest_id') || Date.now());
  if (!localStorage.getItem('guest_id')) localStorage.setItem('guest_id', uid);
  push(ref(db, `activity/${uid}`), { action, details, time: new Date().toISOString() });
}

// --- AUTH & SYNC ---
onAuthStateChanged(auth, (user) => {
  state.user = user;
  if (user) {
    $('userEmail').textContent = user.email.split('@')[0];
    $('loginBtn').style.display = 'none';
    $('userProfile').style.display = 'flex';
    $('authModal').classList.remove('active');
    trackActivity('Logged In', user.email);

    onValue(ref(db, `users/${user.uid}/cart`), (s) => { state.cart = s.val() || []; updateCartUI(); });
    onValue(ref(db, `users/${user.uid}/wishlist`), (s) => { state.wishlist = s.val() || []; updateWishlistUI(); router(); });
    onValue(ref(db, `users/${user.uid}/orders`), (s) => { const d = s.val() || {}; state.orders = Object.keys(d).map(k => ({ id: k, ...d[k] })).reverse(); if(window.location.pathname==='/orders'||window.location.pathname==='/checkout') router(); });
    onValue(ref(db, `users/${user.uid}/addresses`), (s) => { const d = s.val() || {}; state.addresses = Object.keys(d).map(k => ({ id: k, ...d[k] })); if(window.location.pathname==='/profile'||window.location.pathname==='/checkout') router(); });
  } else {
    $('loginBtn').style.display = 'block';
    $('userProfile').style.display = 'none';
    state.cart = []; state.wishlist = []; state.orders = []; state.addresses = [];
    updateCartUI(); updateWishlistUI(); router();
  }
});

// --- CART & WISHLIST ---
const Cart = {
  add(p) {
    const ext = state.cart.find(c => c.id === p.id);
    if (ext) ext.qty++; else state.cart.push({ id: p.id, title: p.title, price: p.price, image: p.image, qty: 1 });
    if (state.user) set(ref(db, `users/${state.user.uid}/cart`), state.cart);
    updateCartUI(); trackActivity('Add to Cart', p.title); Toast.show('✓ Added');
  },
  remove(id) { state.cart = state.cart.filter(c => c.id !== id); if (state.user) set(ref(db, `users/${state.user.uid}/cart`), state.cart); updateCartUI(); },
  changeQty(id, d) { const i = state.cart.find(c => c.id === id); if (!i) return; i.qty += d; if (i.qty <= 0) Cart.remove(id); else { if (state.user) set(ref(db, `users/${state.user.uid}/cart`), state.cart); updateCartUI(); } }
};

function updateCartUI() {
  $('cartCount').textContent = state.cart.reduce((s, c) => s + c.qty, 0);
  const el = $('cartItems');
  if (state.cart.length === 0) { el.innerHTML = '<p style="text-align:center;color:gray;padding:20px">Cart is empty</p>'; $('cartTotal').textContent = '$0.00'; return; }
  el.innerHTML = state.cart.map(c => `
    <div class="drawer-item">
      <img src="${c.image}" />
      <div class="drawer-item-info">
        <div class="drawer-item-title">${escapeHtml(c.title)}</div>
        <div class="drawer-item-price">${formatPrice(c.price)}</div>
        <div class="qty-controls">
          <button class="qty-btn" onclick="window.changeQty('${c.id}', -1)">−</button>
          <span class="qty-val">${c.qty}</span>
          <button class="qty-btn" onclick="window.changeQty('${c.id}', 1)">+</button>
          <button class="remove-btn" onclick="window.removeCart('${c.id}')">Remove</button>
        </div>
      </div>
    </div>`).join('');
  $('cartTotal').textContent = formatPrice(state.cart.reduce((s, c) => s + c.price * c.qty, 0));
}

const Wishlist = {
  toggle(p) {
    const idx = state.wishlist.findIndex(w => w.id === p.id);
    if (idx > -1) state.wishlist.splice(idx, 1); else state.wishlist.push(p);
    if (state.user) set(ref(db, `users/${state.user.uid}/wishlist`), state.wishlist);
    updateWishlistUI(); router(); Toast.show(idx > -1 ? '💔 Removed' : '❤️ Wishlisted');
  }
};

function updateWishlistUI() {
  $('wishlistCount').textContent = state.wishlist.length;
  const el = $('wishlistItems');
  if (state.wishlist.length === 0) return el.innerHTML = '<p style="text-align:center;color:gray;padding:20px">Wishlist empty</p>';
  el.innerHTML = state.wishlist.map(w => `
    <div class="drawer-item">
      <img src="${w.image}" />
      <div class="drawer-item-info">
        <div class="drawer-item-title">${escapeHtml(w.title)}</div>
        <div class="drawer-item-price">${formatPrice(w.price)}</div>
        <button class="add-btn" style="margin-top:8px;padding:4px 8px;font-size:0.8rem" onclick="window.addToCart('${w.id}')">Add to Cart</button>
      </div>
    </div>`).join('');
}

window.changeQty = (id, d) => Cart.changeQty(id, d);
window.removeCart = (id) => Cart.remove(id);
window.addToCart = (id) => { const p = state.products.find(pr => String(pr.id) === String(id)); if (p) Cart.add(p); };
window.toggleWish = (id) => { const p = state.products.find(pr => String(pr.id) === String(id)); if (p) Wishlist.toggle(p); };

// --- API & ROUTER ---
const API = { async fetch() { const r = await fetch('https://fakestoreapi.com/products'); return r.json(); } };
const Router = {
  navigate(path) { history.pushState({}, '', path); router(); },
  resolve(path) {
    if (path === '/') renderHome();
    else if (path === '/products') renderProducts();
    else if (path === '/orders') renderOrders();
    else if (path === '/profile') renderProfile();
    else if (path === '/checkout') renderCheckout();
    else if (path.startsWith('/product/')) renderDetail(path.split('/')[2]);
    else renderHome();
    $('navHome').classList.toggle('active', path === '/');
    $('navProducts').classList.toggle('active', path.includes('/product'));
    $('navOrders').classList.toggle('active', path === '/orders');
    $('navProfile').classList.toggle('active', path === '/profile');
  }
};
function router() { let p = window.location.pathname; if (p.endsWith('/index.html')) p = '/'; Router.resolve(p); }
window.addEventListener('popstate', router);
document.body.addEventListener('click', (e) => { const l = e.target.closest('a[data-link]'); if (l) { e.preventDefault(); Router.navigate(l.getAttribute('href')); } });

// --- VIEWS ---
function renderSkeletons(c, n=8) { c.innerHTML = Array(n).fill('<div class="skeleton-card"></div>').join(''); }

function renderHome() {
  $('app').innerHTML = `<section class="hero"><h1>Premium Products</h1><p>Discover our curated collection.</p><button class="btn-white" onclick="Router.navigate('/products')">Browse Catalog →</button></section><h2 style="margin-bottom:24px">⭐ Top Rated</h2><div id="featuredGrid" class="product-grid"></div>`;
  renderSkeletons($('featuredGrid'), 4);
  API.fetch().then(p => { state.products = p; renderGrid($('featuredGrid'), [...p].sort((a,b)=>b.rating.rate-a.rating.rate).slice(0,4)); });
}

function renderProducts() {
  $('app').innerHTML = `<div class="toolbar" id="toolbar" style="display:none"><div class="category-filters" id="categoryFilters"></div><select class="sort-select" id="sortSelect"><option value="default">Sort: Default</option><option value="price-asc">Price: Low to High</option><option value="price-desc">Price: High to Low</option><option value="rating">Top Rated</option></select></div><div id="productsGrid" class="product-grid"></div>`;
  renderSkeletons($('productsGrid'), 8);
  API.fetch().then(p => { state.products = p; initToolbar(); applyFilters(); });
}

function initToolbar() {
  $('toolbar').style.display = 'flex';
  const cats = ['all', ...new Set(state.products.map(p => p.category))];
  $('categoryFilters').innerHTML = cats.map(c => `<button class="cat-btn ${state.category === c ? 'active' : ''}" onclick="window.setCat('${c}')">${c === 'all' ? 'All' : c}</button>`).join('');
  $('sortSelect').value = state.sort;
  $('sortSelect').onchange = (e) => { state.sort = e.target.value; applyFilters(); };
}
window.setCat = (c) => { state.category = c; initToolbar(); applyFilters(); };

function applyFilters() {
  let f = [...state.products];
  if (state.search) f = f.filter(p => p.title.toLowerCase().includes(state.search.toLowerCase()) || p.category.toLowerCase().includes(state.search.toLowerCase()));
  if (state.category !== 'all') f = f.filter(p => p.category === state.category);
  if (state.sort === 'price-asc') f.sort((a,b)=>a.price-b.price);
  if (state.sort === 'price-desc') f.sort((a,b)=>b.price-a.price);
  if (state.sort === 'rating') f.sort((a,b)=>b.rating.rate-a.rating.rate);
  renderGrid($('productsGrid'), f);
}

function renderDetail(id) {
  let p = state.products.find(pr => String(pr.id) === String(id));
  if (!p) return $('app').innerHTML = `<p style="text-align:center;padding:40px">Loading... Please go back to products.</p>`;
  trackActivity('View Product', p.title);
  const w = state.wishlist.some(x => x.id === p.id);
  $('app').innerHTML = `
    <button class="secondary-btn" style="margin-bottom:24px" onclick="Router.navigate('/products')">← Back</button>
    <div class="detail-wrap">
      <div class="detail-img-wrap"><img src="${p.image}" /></div>
      <div class="detail-info">
        <div class="product-category">${escapeHtml(p.category)}</div>
        <h2>${escapeHtml(p.title)}</h2>
        <div class="rating-row" style="margin-bottom:16px"><span class="stars">${generateStars(p.rating)}</span> <span>(${p.rating.count})</span></div>
        <div class="detail-price">${formatPrice(p.price)}</div>
        <p class="detail-desc">${escapeHtml(p.description)}</p>
        <div class="detail-actions">
          <button class="primary-btn" onclick="window.addToCart('${p.id}')">🛒 Add to Cart</button>
          <button class="secondary-btn" onclick="window.toggleWish('${p.id}')" style="width:56px;padding:0;font-size:1.5rem">${w ? '❤️' : '🤍'}</button>
        </div>
      </div>
    </div>`;
}

function renderOrders() {
  if (state.orders.length === 0) return $('app').innerHTML = `<div style="text-align:center;padding:60px"><h2>No Orders Yet</h2><p>Shop something first!</p></div>`;
  $('app').innerHTML = `<h2 style="margin-bottom:24px">My Orders</h2>` + state.orders.map(o => {
    let cls = o.status === 'Shipped' ? 'status-shipped' : o.status === 'Delivered' ? 'status-delivered' : 'status-placed';
    return `
    <div class="order-card">
      <div class="order-header">
        <div><b>Order #${o.id.slice(-6).toUpperCase()}</b><br><small>${new Date(o.date).toLocaleDateString()}</small></div>
        <div class="order-status ${cls}">${o.status || 'Placed'}</div>
      </div>
      <div class="order-body">
        ${o.items.map(i => `<div style="display:flex;align-items:center;gap:16px;margin-bottom:12px"><img src="${i.image}" width="40"><div><b>${i.title}</b><br>Qty: ${i.qty}</div><div style="margin-left:auto">$${i.price}</div></div>`).join('')}
        <div style="border-top:1px solid #ddd;margin-top:12px;padding-top:12px;font-size:0.9rem">
          <b>Delivery Address:</b><br>${o.address || 'N/A'}<br>
          <b>Phone:</b> ${o.phone || 'N/A'}<br>
          <b>Payment:</b> ${o.payment || 'COD'}
        </div>
      </div>
      <div class="order-footer">Total: $${o.total.toFixed(2)}</div>
    </div>`;
  }).join('');
}

function renderProfile() {
  if (!state.user) return $('app').innerHTML = `<div style="text-align:center;padding:60px"><h2>Please Login</h2></div>`;
  $('app').innerHTML = `
    <h2>My Profile</h2>
    <div class="profile-card">
      <h3>Saved Addresses</h3>
      <div id="addressList">
        ${state.addresses.length === 0 ? '<p>No addresses saved yet.</p>' : state.addresses.map(a => `
          <div class="address-item ${a.isDefault ? 'default' : ''}">
            <div>
              <b>${escapeHtml(a.name)}</b><br>
              <small>${escapeHtml(a.address)}, ${escapeHtml(a.city)} - ${escapeHtml(a.pincode)}<br>Phone: ${escapeHtml(a.phone)}</small>
            </div>
            <button class="remove-btn" onclick="window.deleteAddress('${a.id}')">Delete</button>
          </div>
        `).join('')}
      </div>
    </div>
    <div class="profile-card">
      <h3>Add New Address</h3>
      <div class="form-group"><label>Full Name</label><input id="addrName" placeholder="John Doe" /></div>
      <div class="form-group"><label>Phone Number</label><input id="addrPhone" placeholder="+91 9876543210" /></div>
      <div class="form-group"><label>Address</label><input id="addrStreet" placeholder="House No, Street, Area" /></div>
      <div class="form-group"><label>City & Pincode</label><input id="addrCity" placeholder="Mumbai, 400001" /></div>
      <button class="primary-btn" style="max-width:200px" onclick="window.saveAddress()">Save Address</button>
    </div>
  `;
}
window.saveAddress = () => {
  const name = $('addrName').value.trim(); const phone = $('addrPhone').value.trim();
  const address = $('addrStreet').value.trim(); const city = $('addrCity').value.trim();
  if (!name || !phone || !address || !city) return Toast.show('Please fill all fields');
  push(ref(db, `users/${state.user.uid}/addresses`), { name, phone, address, city, isDefault: state.addresses.length === 0 });
  Toast.show('Address Saved!');
};
window.deleteAddress = (id) => { remove(ref(db, `users/${state.user.uid}/addresses/${id}`)); Toast.show('Address Deleted'); };

function renderCheckout() {
  if (!state.user) return $('app').innerHTML = `<div style="text-align:center;padding:60px"><h2>Please Login to Checkout</h2></div>`;
  if (state.cart.length === 0) return $('app').innerHTML = `<div style="text-align:center;padding:60px"><h2>Cart is empty</h2></div>`;

  $('app').innerHTML = `
    <h2>Checkout</h2>
    <div class="checkout-grid">
      <div>
        <div class="checkout-card">
          <h3>Select Delivery Address</h3>
          ${state.addresses.length === 0 ? '<p style="color:red">No address found. Please add address in Profile first.</p>' : state.addresses.map(a => `
            <label style="display:block; padding:12px; border:1px solid var(--border); border-radius:8px; margin-bottom:12px; cursor:pointer">
              <input type="radio" name="address" value="${a.id}" ${a.isDefault ? 'checked' : ''} />
              <b>${escapeHtml(a.name)}</b> - ${escapeHtml(a.address)}, ${escapeHtml(a.city)}<br>
              <small>Phone: ${escapeHtml(a.phone)}</small>
            </label>
          `).join('')}
          <button class="secondary-btn" style="width:100%" onclick="Router.navigate('/profile')">+ Add New Address</button>
        </div>
        <div class="checkout-card" style="margin-top:24px">
          <h3>Payment Method</h3>
          <label><input type="radio" name="payment" value="COD" checked /> Cash on Delivery (COD)</label><br><br>
          <label><input type="radio" name="payment" value="Online" /> Online Payment (Mock)</label>
        </div>
      </div>
      <div class="order-summary">
        <h3>Order Summary</h3>
        ${state.cart.map(c => `<div class="order-summary-item"><span>${escapeHtml(c.title)} x ${c.qty}</span><span>${formatPrice(c.price * c.qty)}</span></div>`).join('')}
        <div style="border-top:1px solid #ddd; margin-top:12px; padding-top:12px; display:flex; justify-content:space-between; font-weight:800; font-size:1.2rem">
          <span>Total</span><span>${formatPrice(state.cart.reduce((s,c)=>s+(c.price*c.qty),0))}</span>
        </div>
        <button class="primary-btn" style="width:100%; margin-top:24px" onclick="window.placeOrder()">Place Order</button>
      </div>
    </div>
  `;
}

window.placeOrder = () => {
  const selectedAddressId = document.querySelector('input[name="address"]:checked')?.value;
  const payment = document.querySelector('input[name="payment"]:checked')?.value || 'COD';
  if (!selectedAddressId) return Toast.show('Please select an address');
  const addr = state.addresses.find(a => a.id === selectedAddressId);

  push(ref(db, `users/${state.user.uid}/orders`), {
    date: new Date().toISOString(),
    items: state.cart,
    total: state.cart.reduce((s,c)=>s+(c.price*c.qty),0),
    address: `${addr.name}, ${addr.address}, ${addr.city}`,
    phone: addr.phone,
    payment: payment,
    status: 'Placed'
  }).then(() => {
    Toast.show('🎉 Order Placed!');
    trackActivity('Order Placed', `$${state.cart.reduce((s,c)=>s+(c.price*c.qty),0)}`);
    state.cart = []; set(ref(db, `users/${state.user.uid}/cart`), []);
    updateCartUI(); Router.navigate('/orders');
  });
};

function renderGrid(c, p) {
  if (p.length === 0) return c.innerHTML = '<p style="text-align:center;width:100%">No products.</p>';
  c.innerHTML = p.map(x => {
    const w = state.wishlist.some(y => y.id === x.id);
    return `<article class="product-card" onclick="Router.navigate('/product/${x.id}')">
      <button class="wishlist-toggle ${w ? 'active' : ''}" onclick="event.stopPropagation(); window.toggleWish('${x.id}')">${w ? '❤️' : '🤍'}</button>
      <div class="product-img-wrap"><img src="${x.image}" loading="lazy" /></div>
      <div class="product-info">
        <div class="product-category">${escapeHtml(x.category)}</div>
        <h3 class="product-title">${escapeHtml(x.title)}</h3>
        <div class="rating-row"><span class="stars">${generateStars(x.rating)}</span></div>
        <div class="product-bottom"><span class="product-price">${formatPrice(x.price)}</span><button class="add-btn" onclick="event.stopPropagation(); window.addToCart('${x.id}')">Add</button></div>
      </div>
    </article>`;
  }).join('');
}
window.Router = Router;

// --- INIT ---
function initUI() {
  const overlay = $('drawerOverlay');
  const closeAll = () => { $('cartDrawer').classList.remove('active'); $('wishlistDrawer').classList.remove('active'); overlay.classList.remove('active'); };
  $('cartBtn').onclick = () => { $('cartDrawer').classList.add('active'); overlay.classList.add('active'); };
  $('wishlistBtn').onclick = () => { $('wishlistDrawer').classList.add('active'); overlay.classList.add('active'); };
  $('closeCart').onclick = closeAll; $('closeWishlist').onclick = closeAll; overlay.onclick = closeAll;
  $('globalSearch').oninput = (e) => { state.search = e.target.value; if (window.location.pathname === '/products') applyFilters(); };
  $('checkoutBtn').onclick = () => { closeAll(); Router.navigate('/checkout'); };

  $('loginBtn').onclick = () => $('authModal').classList.add('active');
  $('closeAuthModal').onclick = () => $('authModal').classList.remove('active');
  $('emailLoginBtn').onclick = async () => {
    const e = $('authEmail').value, p = $('authPassword').value;
    try { await signInWithEmailAndPassword(auth, e, p).catch(() => createUserWithEmailAndPassword(auth, e, p)); } catch (err) { $('authError').textContent = err.message; }
  };
  $('googleLoginBtn').onclick = () => signInWithPopup(auth, googleProvider);
  $('logoutBtn').onclick = () => signOut(auth);

  router();
}
initUI();