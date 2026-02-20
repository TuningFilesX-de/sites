const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const nodemailer = require('nodemailer');
const axios = require('axios');
const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const dataDir = path.join(__dirname, 'public', 'data');
const productsPath = path.join(dataDir, 'products.json');
const categoriesPath = path.join(dataDir, 'categories.json');

const adminTokens = new Map();

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const readJson = async (filePath, fallback) => {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return fallback;
    }
    throw error;
  }
};

const writeJson = async (filePath, data) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
};

const authAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const expiresAt = adminTokens.get(token);

  if (!token || !expiresAt || expiresAt < Date.now()) {
    return res.status(401).json({ error: 'Требуется вход администратора' });
  }

  return next();
};

const getPayPalAccessToken = async () => {
  const client = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;

  if (!client || !secret) {
    throw new Error('PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET не заданы');
  }

  const baseUrl = process.env.PAYPAL_BASE_URL || 'https://api-m.sandbox.paypal.com';
  const auth = Buffer.from(`${client}:${secret}`).toString('base64');

  const response = await axios.post(`${baseUrl}/v1/oauth2/token`, 'grant_type=client_credentials', {
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });

  return response.data.access_token;
};

app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body;
  const expectedUser = process.env.ADMIN_USERNAME || 'admin';
  const expectedPass = process.env.ADMIN_PASSWORD || 'admin123';

  if (username !== expectedUser || password !== expectedPass) {
    return res.status(401).json({ error: 'Неверный логин или пароль' });
  }

  const token = crypto.randomBytes(24).toString('hex');
  adminTokens.set(token, Date.now() + 1000 * 60 * 60 * 8);

  return res.json({ token });
});

app.get('/api/admin/catalog', authAdmin, async (req, res) => {
  const categories = await readJson(categoriesPath, []);
  const products = await readJson(productsPath, []);
  return res.json({ categories, products });
});

app.post('/api/admin/categories', authAdmin, async (req, res) => {
  const { name, slug } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Название категории обязательно' });
  }

  const categories = await readJson(categoriesPath, []);
  const nextCategory = {
    id: `cat-${Date.now()}`,
    name,
    slug: slug || name.toLowerCase().replace(/\s+/g, '-')
  };

  categories.push(nextCategory);
  await writeJson(categoriesPath, categories);

  return res.json(nextCategory);
});

app.post('/api/admin/products', authAdmin, async (req, res) => {
  const {
    name,
    categoryId,
    price,
    image,
    description,
    features,
    arCodeModelUrl,
    arCodeNote,
    licenseOptionsYears,
    hasMultiYearLicense
  } = req.body;

  if (!name || !categoryId || !price) {
    return res.status(400).json({ error: 'name, categoryId, price обязательны' });
  }

  const products = await readJson(productsPath, []);
  const newProduct = {
    id: `prod-${Date.now()}`,
    name,
    categoryId,
    price: Number(price),
    image: image || 'https://via.placeholder.com/900x600?text=Product',
    description: description || '',
    features: Array.isArray(features) ? features : [],
    arCodeModelUrl: arCodeModelUrl || '',
    arCodeNote: arCodeNote || '',
    hasMultiYearLicense: Boolean(hasMultiYearLicense),
    licenseOptionsYears: Array.isArray(licenseOptionsYears) ? licenseOptionsYears.map(Number).filter(Boolean) : [1]
  };

  products.push(newProduct);
  await writeJson(productsPath, products);

  return res.json(newProduct);
});

app.post('/api/paypal/create-order', async (req, res) => {
  try {
    const { items, currency = 'EUR' } = req.body;
    const amount = (items || []).reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 1), 0);

    if (!amount) {
      return res.status(400).json({ error: 'Пустая сумма заказа' });
    }

    const accessToken = await getPayPalAccessToken();
    const baseUrl = process.env.PAYPAL_BASE_URL || 'https://api-m.sandbox.paypal.com';

    const orderResponse = await axios.post(
      `${baseUrl}/v2/checkout/orders`,
      {
        intent: 'CAPTURE',
        purchase_units: [
          {
            amount: {
              currency_code: currency,
              value: amount.toFixed(2)
            },
            description: 'Заказ диагностического оборудования'
          }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return res.json(orderResponse.data);
  } catch (error) {
    return res.status(500).json({ error: 'Ошибка создания PayPal заказа', details: error.message });
  }
});

app.post('/api/paypal/capture-order', async (req, res) => {
  try {
    const { orderID } = req.body;
    if (!orderID) {
      return res.status(400).json({ error: 'orderID обязателен' });
    }

    const accessToken = await getPayPalAccessToken();
    const baseUrl = process.env.PAYPAL_BASE_URL || 'https://api-m.sandbox.paypal.com';

    const captureResponse = await axios.post(
      `${baseUrl}/v2/checkout/orders/${orderID}/capture`,
      {},
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return res.json(captureResponse.data);
  } catch (error) {
    return res.status(500).json({ error: 'Ошибка подтверждения PayPal заказа', details: error.message });
  }
});

const sendEmailNotification = async (order) => {
  if (!process.env.SMTP_HOST) {
    return;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  const html = `
    <h2>Новый заказ</h2>
    <p><strong>Имя:</strong> ${order.customer.firstName} ${order.customer.lastName}</p>
    <p><strong>Email:</strong> ${order.customer.email}</p>
    <p><strong>Телефон:</strong> ${order.customer.phone || '-'}</p>
    <p><strong>Адрес:</strong> ${order.customer.country}, ${order.customer.city}, ${order.customer.address}</p>
    <p><strong>Индекс:</strong> ${order.customer.postcode}</p>
    <p><strong>Примечание:</strong> ${order.customer.note || '-'}</p>
    <h3>Товары:</h3>
    <ul>
      ${order.items.map((item) => `<li>${item.name} x ${item.qty} — ${item.price}€</li>`).join('')}
    </ul>
    <p><strong>Итого:</strong> ${order.total}€</p>
    <p><strong>PayPal Order ID:</strong> ${order.paypalOrderId || '-'}</p>
  `;

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: process.env.ORDER_NOTIFY_EMAIL,
    subject: 'Новый заказ на сайте диагностического оборудования',
    html
  });
};

const sendTelegramNotification = async (order) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return;
  }

  const text = [
    '🛒 Новый заказ!',
    `Клиент: ${order.customer.firstName} ${order.customer.lastName}`,
    `Email: ${order.customer.email}`,
    `Телефон: ${order.customer.phone || '-'}`,
    `Сумма: ${order.total}€`,
    `Товары: ${order.items.map((i) => `${i.name} x${i.qty}`).join(', ')}`,
    `PayPal: ${order.paypalOrderId || '-'}`
  ].join('\n');

  await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
    chat_id: chatId,
    text
  });
};

app.post('/api/orders', async (req, res) => {
  try {
    const order = req.body;
    if (!order?.customer?.email || !order?.items?.length) {
      return res.status(400).json({ error: 'Некорректные данные заказа' });
    }

    await Promise.all([sendEmailNotification(order), sendTelegramNotification(order)]);

    return res.json({ ok: true, message: 'Заказ принят. Уведомления отправлены.' });
  } catch (error) {
    return res.status(500).json({ error: 'Ошибка обработки заказа', details: error.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Store running on http://localhost:${PORT}`);
});
