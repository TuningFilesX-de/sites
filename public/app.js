 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/public/app.js b/public/app.js
new file mode 100644
index 0000000000000000000000000000000000000000..eb0023ac0b50a847abe700eecbe36971c5131cb6
--- /dev/null
+++ b/public/app.js
@@ -0,0 +1,163 @@
+const state = {
+  products: [],
+  selectedProduct: null,
+  cart: []
+};
+
+const catalogEl = document.querySelector('#catalog');
+const productDetailEl = document.querySelector('#product-detail');
+const summaryItemsEl = document.querySelector('#summary-items');
+const summaryTotalEl = document.querySelector('#summary-total');
+const checkoutStatusEl = document.querySelector('#checkout-status');
+
+const formatMoney = (value) => `${Number(value).toFixed(2)} €`;
+
+const renderCatalog = () => {
+  catalogEl.innerHTML = state.products
+    .map(
+      (p) => `
+        <article class="card">
+          <img src="${p.image}" alt="${p.name}" />
+          <p>${p.category}</p>
+          <h3>${p.name}</h3>
+          <p>${p.description}</p>
+          <p class="price">${p.price}€</p>
+          <button class="btn-primary" onclick="selectProduct('${p.id}')">Подробнее</button>
+          <button class="btn-secondary" onclick="addToCart('${p.id}')">Купить</button>
+        </article>
+      `
+    )
+    .join('');
+};
+
+const renderProduct = () => {
+  if (!state.selectedProduct) {
+    productDetailEl.innerHTML = '<p>Выберите товар из каталога.</p>';
+    return;
+  }
+
+  const p = state.selectedProduct;
+  productDetailEl.innerHTML = `
+    <img src="${p.image}" alt="${p.name}" style="width:100%; border-radius:12px"/>
+    <div>
+      <h3>${p.name}</h3>
+      <p>${p.description}</p>
+      <ul>${p.features.map((f) => `<li>${f}</li>`).join('')}</ul>
+      <p class="price">${p.price}€</p>
+      <button class="btn-primary" onclick="addToCart('${p.id}')">Добавить в заказ</button>
+      <div class="ar-code">
+        <h4>360 / AR модель</h4>
+        <p>${p.arCodeNote}</p>
+        <a href="${p.arCodeModelUrl}" target="_blank" rel="noreferrer">Открыть AR Code</a>
+      </div>
+    </div>
+  `;
+};
+
+const renderSummary = () => {
+  if (!state.cart.length) {
+    summaryItemsEl.innerHTML = '<p>Корзина пуста.</p>';
+    summaryTotalEl.textContent = '';
+    return;
+  }
+
+  summaryItemsEl.innerHTML = state.cart
+    .map((item) => `<p>${item.name} × ${item.qty} — ${formatMoney(item.price * item.qty)}</p>`)
+    .join('');
+
+  const total = state.cart.reduce((acc, i) => acc + i.price * i.qty, 0);
+  summaryTotalEl.textContent = `Итого: ${formatMoney(total)}`;
+};
+
+window.selectProduct = (id) => {
+  state.selectedProduct = state.products.find((p) => p.id === id);
+  renderProduct();
+  document.querySelector('#product-view').scrollIntoView({ behavior: 'smooth' });
+};
+
+window.addToCart = (id) => {
+  const product = state.products.find((p) => p.id === id);
+  if (!product) {
+    return;
+  }
+
+  const existing = state.cart.find((i) => i.id === id);
+  if (existing) {
+    existing.qty += 1;
+  } else {
+    state.cart.push({ id: product.id, name: product.name, price: product.price, qty: 1 });
+  }
+  renderSummary();
+};
+
+const getOrderData = () => {
+  const form = document.querySelector('#order-form');
+  const formData = new FormData(form);
+
+  const customer = Object.fromEntries(formData.entries());
+  const total = state.cart.reduce((acc, i) => acc + i.price * i.qty, 0).toFixed(2);
+
+  return { customer, items: state.cart, total };
+};
+
+const setupPayPal = () => {
+  if (!window.paypal) {
+    checkoutStatusEl.textContent = 'PayPal SDK не загружен.';
+    return;
+  }
+
+  window.paypal
+    .Buttons({
+      createOrder: async () => {
+        const payload = { items: state.cart, currency: 'EUR' };
+        const response = await fetch('/api/paypal/create-order', {
+          method: 'POST',
+          headers: { 'Content-Type': 'application/json' },
+          body: JSON.stringify(payload)
+        });
+        const data = await response.json();
+        if (!response.ok) {
+          throw new Error(data.error || 'Ошибка PayPal');
+        }
+        return data.id;
+      },
+      onApprove: async (data) => {
+        const captureResponse = await fetch('/api/paypal/capture-order', {
+          method: 'POST',
+          headers: { 'Content-Type': 'application/json' },
+          body: JSON.stringify({ orderID: data.orderID })
+        });
+        const captureData = await captureResponse.json();
+        if (!captureResponse.ok) {
+          throw new Error(captureData.error || 'Ошибка подтверждения оплаты');
+        }
+
+        const order = getOrderData();
+        order.paypalOrderId = data.orderID;
+
+        const orderResponse = await fetch('/api/orders', {
+          method: 'POST',
+          headers: { 'Content-Type': 'application/json' },
+          body: JSON.stringify(order)
+        });
+
+        const orderData = await orderResponse.json();
+        checkoutStatusEl.textContent = orderData.message || 'Оплата успешна, заказ отправлен.';
+      },
+      onError: (err) => {
+        checkoutStatusEl.textContent = `Ошибка оплаты: ${err.message}`;
+      }
+    })
+    .render('#paypal-button-container');
+};
+
+const init = async () => {
+  const response = await fetch('/data/products.json');
+  state.products = await response.json();
+  renderCatalog();
+  renderProduct();
+  renderSummary();
+  setupPayPal();
+};
+
+init();
 
EOF
)
