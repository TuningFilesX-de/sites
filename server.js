 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/server.js b/server.js
new file mode 100644
index 0000000000000000000000000000000000000000..8890af3f1bf2b85971c1867a171d2b04479cdb7f
--- /dev/null
+++ b/server.js
@@ -0,0 +1,193 @@
+const express = require('express');
+const cors = require('cors');
+const dotenv = require('dotenv');
+const nodemailer = require('nodemailer');
+const axios = require('axios');
+const path = require('path');
+
+dotenv.config();
+
+const app = express();
+const PORT = process.env.PORT || 3000;
+
+app.use(cors());
+app.use(express.json({ limit: '1mb' }));
+app.use(express.static(path.join(__dirname, 'public')));
+
+const getPayPalAccessToken = async () => {
+  const client = process.env.PAYPAL_CLIENT_ID;
+  const secret = process.env.PAYPAL_CLIENT_SECRET;
+
+  if (!client || !secret) {
+    throw new Error('PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET не заданы');
+  }
+
+  const baseUrl = process.env.PAYPAL_BASE_URL || 'https://api-m.sandbox.paypal.com';
+  const auth = Buffer.from(`${client}:${secret}`).toString('base64');
+
+  const response = await axios.post(
+    `${baseUrl}/v1/oauth2/token`,
+    'grant_type=client_credentials',
+    {
+      headers: {
+        Authorization: `Basic ${auth}`,
+        'Content-Type': 'application/x-www-form-urlencoded'
+      }
+    }
+  );
+
+  return response.data.access_token;
+};
+
+app.post('/api/paypal/create-order', async (req, res) => {
+  try {
+    const { items, currency = 'EUR' } = req.body;
+    const amount = (items || []).reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 1), 0);
+
+    if (!amount) {
+      return res.status(400).json({ error: 'Пустая сумма заказа' });
+    }
+
+    const accessToken = await getPayPalAccessToken();
+    const baseUrl = process.env.PAYPAL_BASE_URL || 'https://api-m.sandbox.paypal.com';
+
+    const orderResponse = await axios.post(
+      `${baseUrl}/v2/checkout/orders`,
+      {
+        intent: 'CAPTURE',
+        purchase_units: [
+          {
+            amount: {
+              currency_code: currency,
+              value: amount.toFixed(2)
+            },
+            description: 'Заказ диагностического оборудования'
+          }
+        ]
+      },
+      {
+        headers: {
+          Authorization: `Bearer ${accessToken}`,
+          'Content-Type': 'application/json'
+        }
+      }
+    );
+
+    return res.json(orderResponse.data);
+  } catch (error) {
+    return res.status(500).json({ error: 'Ошибка создания PayPal заказа', details: error.message });
+  }
+});
+
+app.post('/api/paypal/capture-order', async (req, res) => {
+  try {
+    const { orderID } = req.body;
+    if (!orderID) {
+      return res.status(400).json({ error: 'orderID обязателен' });
+    }
+
+    const accessToken = await getPayPalAccessToken();
+    const baseUrl = process.env.PAYPAL_BASE_URL || 'https://api-m.sandbox.paypal.com';
+
+    const captureResponse = await axios.post(
+      `${baseUrl}/v2/checkout/orders/${orderID}/capture`,
+      {},
+      {
+        headers: {
+          Authorization: `Bearer ${accessToken}`,
+          'Content-Type': 'application/json'
+        }
+      }
+    );
+
+    return res.json(captureResponse.data);
+  } catch (error) {
+    return res.status(500).json({ error: 'Ошибка подтверждения PayPal заказа', details: error.message });
+  }
+});
+
+const sendEmailNotification = async (order) => {
+  if (!process.env.SMTP_HOST) {
+    return;
+  }
+
+  const transporter = nodemailer.createTransport({
+    host: process.env.SMTP_HOST,
+    port: Number(process.env.SMTP_PORT || 587),
+    secure: process.env.SMTP_SECURE === 'true',
+    auth: {
+      user: process.env.SMTP_USER,
+      pass: process.env.SMTP_PASS
+    }
+  });
+
+  const html = `
+    <h2>Новый заказ</h2>
+    <p><strong>Имя:</strong> ${order.customer.firstName} ${order.customer.lastName}</p>
+    <p><strong>Email:</strong> ${order.customer.email}</p>
+    <p><strong>Телефон:</strong> ${order.customer.phone || '-'}</p>
+    <p><strong>Адрес:</strong> ${order.customer.country}, ${order.customer.city}, ${order.customer.address}</p>
+    <p><strong>Индекс:</strong> ${order.customer.postcode}</p>
+    <p><strong>Примечание:</strong> ${order.customer.note || '-'}</p>
+    <h3>Товары:</h3>
+    <ul>
+      ${order.items.map((item) => `<li>${item.name} x ${item.qty} — ${item.price}€</li>`).join('')}
+    </ul>
+    <p><strong>Итого:</strong> ${order.total}€</p>
+    <p><strong>PayPal Order ID:</strong> ${order.paypalOrderId || '-'}</p>
+  `;
+
+  await transporter.sendMail({
+    from: process.env.SMTP_FROM || process.env.SMTP_USER,
+    to: process.env.ORDER_NOTIFY_EMAIL,
+    subject: 'Новый заказ на сайте диагностического оборудования',
+    html
+  });
+};
+
+const sendTelegramNotification = async (order) => {
+  const token = process.env.TELEGRAM_BOT_TOKEN;
+  const chatId = process.env.TELEGRAM_CHAT_ID;
+
+  if (!token || !chatId) {
+    return;
+  }
+
+  const text = [
+    '🛒 Новый заказ!',
+    `Клиент: ${order.customer.firstName} ${order.customer.lastName}`,
+    `Email: ${order.customer.email}`,
+    `Телефон: ${order.customer.phone || '-'}`,
+    `Сумма: ${order.total}€`,
+    `Товары: ${order.items.map((i) => `${i.name} x${i.qty}`).join(', ')}`,
+    `PayPal: ${order.paypalOrderId || '-'}`
+  ].join('\n');
+
+  await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
+    chat_id: chatId,
+    text
+  });
+};
+
+app.post('/api/orders', async (req, res) => {
+  try {
+    const order = req.body;
+    if (!order?.customer?.email || !order?.items?.length) {
+      return res.status(400).json({ error: 'Некорректные данные заказа' });
+    }
+
+    await Promise.all([sendEmailNotification(order), sendTelegramNotification(order)]);
+
+    return res.json({ ok: true, message: 'Заказ принят. Уведомления отправлены.' });
+  } catch (error) {
+    return res.status(500).json({ error: 'Ошибка обработки заказа', details: error.message });
+  }
+});
+
+app.get('/health', (req, res) => {
+  res.json({ status: 'ok' });
+});
+
+app.listen(PORT, () => {
+  console.log(`Store running on http://localhost:${PORT}`);
+});
 
EOF
)
