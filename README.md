 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/README.md b/README.md
new file mode 100644
index 0000000000000000000000000000000000000000..817ad2a344c2f2aa4ea6ce1c204c97fb11b42905
--- /dev/null
+++ b/README.md
@@ -0,0 +1,32 @@
+# DiagStore
+
+Интернет-магазин диагностического оборудования в стиле референса с:
+
+- каталогом и карточкой товара;
+- логичной формой оформления заказа;
+- интеграцией PayPal Checkout;
+- уведомлениями о заказе на email и в Telegram;
+- поддержкой ссылки на 360/AR модель (AR Code API hook).
+
+## Запуск
+
+```bash
+npm install
+cp .env.example .env
+npm start
+```
+
+Открыть: `http://localhost:3000`
+
+## Что настроить
+
+1. В `.env` заполнить `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`.
+2. Для email уведомлений задать SMTP-параметры и `ORDER_NOTIFY_EMAIL`.
+3. Для Telegram уведомлений создать бота и заполнить `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
+4. Для 360/AR загружать/связывать модели через AR Code API и сохранять ссылку в `public/data/products.json` (`arCodeModelUrl`).
+
+## API
+
+- `POST /api/paypal/create-order` — создание заказа PayPal.
+- `POST /api/paypal/capture-order` — подтверждение оплаты PayPal.
+- `POST /api/orders` — отправка уведомлений о заказе на email и в Telegram.
 
EOF
)
