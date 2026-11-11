# Food Delivery System

Монорепо: **NestJS + PostgreSQL** (API) и **Next.js + React + TypeScript + Redux Toolkit (RTK Query) + Tailwind** (веб).
Один ресторан, заказ с оплатой-симуляцией, роли (клиент / кухня / бухгалтер / администратор). Деньги ненастоящие, данные синтетические.

> Вторая итерация — drag and drop, бонусы, отзывы, админ-панель и защита входа — описана в [readme2.md](readme2.md).
> Требования: [docs/requirements-report.md](docs/requirements-report.md). Тесты: [docs/test-report.md](docs/test-report.md).

```
food-delivery/
├─ apps/
│  ├─ api/   NestJS: auth, меню, заказы, отчёты · sql/schema.sql · test/
│  └─ web/   Next.js: меню, регистрация, checkout, кухня, учёт
├─ docker-compose.yml   PostgreSQL 16
└─ package.json         npm workspaces
```

## Порты

| Что | Адрес |
|---|---|
| Сайт (Next.js) | http://localhost:3000 |
| API (NestJS) | http://localhost:3001/api |
| PostgreSQL (Docker) | `localhost:5433` (внутри контейнера 5432) |

Браузер обращается только к сайту на 3000. Next.js сам перенаправляет `/api/*` на API (3001), поэтому cookie остаются first-party и CORS не нужен.

## Запуск (3 терминала, нужен Node 22+ и Docker)

```sh
npm install                 # один раз, в корне

npm run db:up               # 1) PostgreSQL в Docker на порту 5433 (user/pass/db: food / food / food_delivery)
npm run dev:api             # 2) API на http://localhost:3001  (схема и демо-данные создаются сами)
npm run dev:web             # 3) сайт на http://localhost:3000
```

Docker-база проброшена на **5433**, а не на 5432, чтобы не конфликтовать с локально установленным PostgreSQL. Если на 5432 работает другой сервер, `localhost:5432` попадёт в него, и появится ошибка `password authentication failed for user "food"`.

Свой PostgreSQL вместо Docker: создайте пустую базу и укажите её адрес, таблицы API создаст при старте:

```sh
DATABASE_URL=postgres://user:pass@localhost:5432/dbname npm run dev:api
```

Переменные окружения API (см. `apps/api/.env.example`): `DATABASE_URL`, `JWT_SECRET`, `PORT` (по умолчанию 3001). У сайта есть `API_URL`, по умолчанию `http://localhost:3001`.

Для показа используйте `dev`-режим (в `npm start` cookie помечается Secure, а Safari не принимает такие cookie на http://localhost).

### Демо-аккаунты (пароль у всех `StudentDemo123!`)

| Роль | Email |
|---|---|
| Клиент | `alice@example.test`, `bob@example.test` |
| Кухня | `kitchen@example.test` |
| Бухгалтер | `accounts@example.test` |
| Администратор | `admin@example.test` |

Регистрация на сайте создаёт только клиента. Роль из запроса игнорируется.

## Страницы

| Путь | Кто | Что |
|---|---|---|
| `/` | все | меню, добавление в корзину |
| `/register`, `/login` | гость | регистрация клиента, вход |
| `/checkout` | клиент | позиции, сумма, адрес, «как можно скорее» или время, комментарий; затем оплата-симуляция с таймером 2 минуты |
| `/orders` | клиент | свои заказы и статусы |
| `/kitchen` | кухня | оплаченные заказы без цен и адреса, перевод на следующий шаг (кнопкой или перетаскиванием) |
| `/accounting` | бухгалтер | число позиций, суммы, скидки баллами, оценки, фильтр по статусу, выгрузка CSV |
| `/bonus` | клиент | баланс бонусных баллов, история начислений и списаний |
| `/admin` | администратор | обзор, меню (drag and drop), пользователи, журнал безопасности, отзывы |

## Как это устроено

- **Поток данных:** браузер → Next.js (`/api/*` проксируется на NestJS, всё с одного origin) → NestJS → PostgreSQL.
- **Вход:** JWT в httpOnly-cookie, `SameSite=Strict` (CSRF-защита без токенов), пароли в bcrypt.
- **Заказ:** `POST /api/orders` в одной транзакции пишет заказ и позиции. Цены берутся из таблицы меню на сервере, браузер их не присылает. Цена фиксируется в `order_items.unit_price_tiyn`. Деньги хранятся целыми тиынами.
- **Повторы без дублей:** у одного намеренного заказа один `attemptId`. `UNIQUE(customer_id, attempt_id)` + `ON CONFLICT DO NOTHING` дают один заказ при любом числе повторов. Тот же `attemptId` с другим составом даёт 409. Пока попытка не завершена, форма заморожена, а `attemptId` лежит в sessionStorage и переживает перезагрузку страницы.
- **Платёж-симуляция:** один платёж на заказ (`payment_attempts.order_id UNIQUE`). Повторный checkout возвращает сохранённый результат и не платит второй раз. Кнопки на странице оплаты: **Approve**, **Reject**, **Simulate time limit**, **Approve, then lose the confirmation**. Последняя сохраняет платёж, но отвечает 503, затем Retry возвращает тот же заказ.
- **Лимит времени:** 120 секунд с создания заказа. Просроченный `PENDING` становится `EXPIRED` с платежом `TIMEOUT`, даже если «Approve» нажат слишком поздно.
- **Статусы:** `PENDING → CONFIRMED | PAYMENT_REJECTED | EXPIRED | CANCELLED`, `CONFIRMED → PREPARING → READY → DELIVERED`. Вернуть подтверждённый заказ в `PENDING` или пропустить шаг нельзя (HTTP 409). Правило проверяется трижды: фронт (кнопки), сервис (`isKitchenStep`), триггер БД (отказывает даже при прямом `UPDATE`).
- **Роли:** клиент видит только свои заказы (чужой даёт 403), кухня видит только оплаченные заказы без цен и адреса, менять статус может только кухня, отчёты доступны только бухгалтеру.
- **Учёт:** суммы считаются по ценам, сохранённым в заказе. В «approved total» входят только оплаченные заказы, rejected и expired не входят.
- **История:** каждая смена статуса пишется в `order_events` (кто, откуда, куда, когда).

### Эндпоинты

| Метод и путь | Роль | |
|---|---|---|
| `POST /api/auth/register`, `/login`, `/logout`, `GET /api/auth/me` | — | |
| `GET /api/menu` | все | |
| `GET /api/orders?status=` | клиент (свои), кухня (оплаченные) | |
| `POST /api/orders` | клиент | создать (идемпотентно по `attemptId`) |
| `GET /api/orders/:id` | клиент (свой), кухня | |
| `POST /api/orders/:id/checkout` | клиент | `{ outcome: success \| rejected \| timeout \| lost_reply }` |
| `PATCH /api/orders/:id/status` | кухня | `{ status }`, только следующий шаг |
| `GET /api/reports?status=`, `GET /api/reports/export.csv` | бухгалтер | |

## Тесты

```sh
# логика и валидация + правила БД на реальном PostgreSQL (40 тестов)
DATABASE_URL=postgres://food:food@localhost:5433/food_delivery npm test

# сквозные проверки по HTTP (42 сценария), API должен быть запущен: npm run dev:api
npm run test:e2e
```

Без `DATABASE_URL` команда `npm test` пропускает тесты базы. Тест `db-rules` сравнивает триггер PostgreSQL с `domain/status.ts` по всем 64 парам статусов.

`test:e2e` проверяет: меню для гостя, вход всех ролей, создание заказа и серверный расчёт суммы, повтор без дубля, конфликт попытки, валидацию корзины, доступ по ролям, оплату, отказ, лимит времени, потерянный ответ, правила статусов, вид кухни, отчёты и регистрацию — а затем, во втором наборе, админ-панель, порядок меню, бонусы, отзывы и блокировку входа. Полный разбор — в [docs/test-report.md](docs/test-report.md).

## Ограничения

Один ресторан, симуляция оплаты (нет банка и карт), без реальной доставки и курьеров. Ограничение попыток входа добавлено во второй итерации; для публичного деплоя всё ещё нужны HTTPS, свой `JWT_SECRET`, лимит по IP-адресу и аудит безопасности.
