# DiagStore

Интернет-магазин диагностического оборудования в стиле референса с:

- каталогом и карточкой товара;
- логичной формой оформления заказа;
- интеграцией PayPal Checkout;
- уведомлениями о заказе на email и в Telegram;
- поддержкой ссылки на 360/AR модель (AR Code API hook);
- входом администратора и управлением категориями/товарами.

## Запуск

```bash
npm install
cp .env.example .env
npm start
```

Открыть:
- витрина: `http://localhost:3000`
- админка: `http://localhost:3000/admin.html`

## Что настроить

1. В `.env` заполнить `ADMIN_USERNAME`, `ADMIN_PASSWORD`.
2. Заполнить `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`.
3. Для email уведомлений задать SMTP-параметры и `ORDER_NOTIFY_EMAIL`.
4. Для Telegram уведомлений создать бота и заполнить `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
5. Для 360/AR загружать/связывать модели через AR Code API и сохранять ссылку в товаре (`arCodeModelUrl`).

## Администрирование

После входа администратор может:

- добавлять категории товаров;
- добавлять товары в нужную категорию;
- указывать характеристики, AR ссылку и примечания;
- указывать доступность лицензии на несколько лет и список доступных сроков (например `1,2,3`).

Данные сохраняются в JSON:

- `public/data/categories.json`
- `public/data/products.json`

## API

- `POST /api/admin/login` — вход администратора.
- `GET /api/admin/catalog` — получить категории и товары (только для администратора).
- `POST /api/admin/categories` — добавить категорию (только для администратора).
- `POST /api/admin/products` — добавить товар (только для администратора).
- `POST /api/paypal/create-order` — создание заказа PayPal.
- `POST /api/paypal/capture-order` — подтверждение оплаты PayPal.
- `POST /api/orders` — отправка уведомлений о заказе на email и в Telegram.
