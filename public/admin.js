const loginForm = document.querySelector('#login-form');
const categoryForm = document.querySelector('#category-form');
const productForm = document.querySelector('#product-form');
const loginStatusEl = document.querySelector('#login-status');
const adminStatusEl = document.querySelector('#admin-status');
const adminPanel = document.querySelector('#admin-panel');
const catalogPreview = document.querySelector('#catalog-preview');
const catalogFull = document.querySelector('#catalog-full');
const categorySelect = document.querySelector('#category-select');

let adminToken = localStorage.getItem('adminToken') || '';
let categories = [];
let products = [];

const authHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${adminToken}`
});

const renderCatalog = (target) => {
  target.innerHTML = categories
    .map((category) => {
      const categoryProducts = products.filter((p) => p.categoryId === category.id);
      return `
        <div style="margin-bottom:14px;">
          <b>${category.name}</b>
          <ul>
            ${categoryProducts.map((p) => `<li>${p.name} — ${p.price}€ (лицензия: ${p.licenseOptionsYears.join(', ')} г.)</li>`).join('') || '<li>Нет товаров</li>'}
          </ul>
        </div>
      `;
    })
    .join('');
};

const renderCategoriesSelect = () => {
  categorySelect.innerHTML = categories.map((category) => `<option value="${category.id}">${category.name}</option>`).join('');
};

const loadCatalog = async () => {
  if (!adminToken) {
    return;
  }

  const response = await fetch('/api/admin/catalog', { headers: authHeaders() });
  if (!response.ok) {
    localStorage.removeItem('adminToken');
    adminToken = '';
    loginStatusEl.textContent = 'Сессия истекла, выполните вход снова.';
    return;
  }

  const data = await response.json();
  categories = data.categories;
  products = data.products;
  renderCatalog(catalogPreview);
  renderCatalog(catalogFull);
  renderCategoriesSelect();
};

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(loginForm);

  const response = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.fromEntries(formData.entries()))
  });

  const data = await response.json();
  if (!response.ok) {
    loginStatusEl.textContent = data.error || 'Ошибка входа';
    return;
  }

  adminToken = data.token;
  localStorage.setItem('adminToken', adminToken);
  loginStatusEl.textContent = 'Вход выполнен.';
  adminPanel.style.display = 'grid';
  await loadCatalog();
});

categoryForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(categoryForm);

  const response = await fetch('/api/admin/categories', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(Object.fromEntries(formData.entries()))
  });

  const data = await response.json();
  if (!response.ok) {
    adminStatusEl.textContent = data.error || 'Ошибка добавления категории';
    return;
  }

  adminStatusEl.textContent = `Категория ${data.name} добавлена.`;
  categoryForm.reset();
  await loadCatalog();
});

productForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(productForm);
  const plain = Object.fromEntries(formData.entries());

  plain.price = Number(plain.price);
  plain.features = plain.features ? plain.features.split('\n').map((i) => i.trim()).filter(Boolean) : [];
  plain.hasMultiYearLicense = formData.get('hasMultiYearLicense') === 'on';
  plain.licenseOptionsYears = plain.licenseOptionsYears
    .split(',')
    .map((year) => Number(year.trim()))
    .filter((year) => Number.isFinite(year) && year > 0);

  const response = await fetch('/api/admin/products', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(plain)
  });

  const data = await response.json();
  if (!response.ok) {
    adminStatusEl.textContent = data.error || 'Ошибка добавления товара';
    return;
  }

  adminStatusEl.textContent = `Товар ${data.name} добавлен.`;
  productForm.reset();
  await loadCatalog();
});

if (adminToken) {
  adminPanel.style.display = 'grid';
  loadCatalog();
}
