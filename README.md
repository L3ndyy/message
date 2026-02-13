# Мессенджер (в стиле Telegram)

Мессенджер с шифрованием чатов, загрузкой файлов (почти любые типы), простой регистрацией и реальным временем.

**Репозиторий:** [github.com/L3ndyy/message](https://github.com/L3ndyy/message)

---

## Деплой на GitHub Pages

Фронт можно бесплатно выложить на GitHub Pages. Бэкенд (Node.js + WebSocket) на Pages не запускается — его нужно разместить отдельно (например на [Render](https://render.com) бесплатно).

### Шаг 1: Включить GitHub Pages из Actions

1. Открой репозиторий: **https://github.com/L3ndyy/message**
2. **Settings** → **Pages**
3. В блоке **Build and deployment** выбери **Source: GitHub Actions**.

### Шаг 2: Запушить код и дождаться деплоя

После пуша в ветку `main` workflow соберёт клиент и задеплоит его. Готовый сайт будет здесь:

**https://l3ndyy.github.io/message/**

Если ветка у тебя называется `master`, в файле `.github/workflows/deploy.yml` замени `branches: [main]` на `branches: [master]`.

### Шаг 3 (важно): Подключить бэкенд

Без бэкенда на Pages будет только интерфейс: логин/чаты не заработают, пока API не доступен. Нужно поднять сервер на Render и «склеить» его с фронтом через секрет в GitHub.

---

#### 3.1. Зарегистрироваться на Render

1. Открой в браузере: **[https://render.com](https://render.com)**.
2. Нажми **Get Started** (или **Sign Up**).
3. Войди через **GitHub** — так Render сразу увидит твои репозитории.

---

#### 3.2. Создать Web Service (сервер)

1. В личном кабинете Render нажми **New +** → **Web Service**.
2. В списке репозиториев выбери **L3ndyy/message** (если не видно — нажми **Configure account** и дай доступ к этому репо).
3. Нажми **Connect** рядом с репо **message**.

Дальше заполни форму так:

| Поле | Что вписать |
|------|------------------|
| **Name** | Любое имя, например `message-api` (по нему будет URL: `message-api.onrender.com`). |
| **Region** | Оставь по умолчанию (например Frankfurt). |
| **Branch** | `main` (или `master`, если у тебя такая ветка). |
| **Root Directory** | **Важно:** впиши **`server`** — так Render будет считать корнем проекта папку `server` из репо. |
| **Runtime** | **Node**. |
| **Build Command** | `npm install` (или оставь пустым — Render сам поставит зависимости). |
| **Start Command** | `npm start` (обязательно). |

4. Раскрой блок **Advanced** (или **Environment**).
5. В **Environment Variables** добавь две переменные (кнопка **Add Environment Variable**):

   - **Key:** `JWT_SECRET`  
     **Value:** придумай длинную случайную строку, например `moya-taynaya-stroka-dlya-jwt-32-simvola-minimum`.  
   - **Key:** `CRYPTO_SECRET`  
     **Value:** другую длинную строку, например `drugaya-taynaya-stroka-dlya-shifra-32-simv`.  

   Оба значения лучше сделать длинными (от 32 символов) и не светить их нигде публично.

6. Нажми **Create Web Service**. Render начнёт собирать и запускать сервер (первый раз может занять 2–5 минут).

7. Когда деплой станет зелёным, вверху страницы появится **URL сервиса**, например:  
   **https://message-api.onrender.com**  
   Скопируй этот URL (без слэша в конце) — он понадобится в следующем шаге.

---

#### 3.3. Сказать фронту на GitHub, куда стучаться (секрет VITE_API_URL)

Фронт на GitHub Pages должен знать адрес твоего API. Это задаётся через секрет репозитория.

1. Открой репозиторий: **https://github.com/L3ndyy/message**.
2. Вкладка **Settings** (настройки репо).
3. Слева в меню: **Secrets and variables** → **Actions**.
4. Нажми **New repository secret**.
5. Заполни:
   - **Name:** ровно так: `VITE_API_URL` (большими буквами, без пробелов).
   - **Value:** URL твоего сервиса с Render, **без слэша в конце**, например:  
     `https://message-api.onrender.com`
6. Нажми **Add secret**.

Теперь при следующей сборке фронта GitHub подставит этот URL в код, и сайт будет обращаться к твоему бэкенду на Render.

---

#### 3.4. Пересобрать фронт с новым URL

Секрет подставляется только при сборке. Нужно один раз заново запустить деплой:

1. В том же репо открой вкладку **Actions**.
2. Слева выбери workflow **Deploy to GitHub Pages**.
3. Справа нажми **Run workflow** → выбери ветку **main** (или **master**) → **Run workflow**.
4. Дождись, пока запуск станет зелёным (обычно 1–2 минуты).

После этого сайт **https://l3ndyy.github.io/message/** будет отправлять запросы и WebSocket на твой сервер на Render — логин, чаты и сообщения заработают.

---

## Возможности

- **Регистрация и вход** — логин/пароль, отображаемое имя
- **Личные чаты** — диалоги между двумя пользователями
- **Шифрование** — текст сообщений шифруется AES-256-GCM перед сохранением в БД (ключ в переменной окружения)
- **Файлы** — загрузка любых файлов до 100 МБ (изображения, документы, видео и т.д.)
- **Мгновенная доставка** — WebSocket (Socket.io)

## Запуск локально

### 1. Сервер (бэкенд)

```bash
cd server
npm install
```

Создайте файл `server/.env` (или задайте переменные в системе):

```
PORT=3001
JWT_SECRET=ваш-секрет-для-jwt-минимум-32-символа
CRYPTO_SECRET=ваш-секрет-для-шифрования-сообщений-32-симв
```

Запуск:

```bash
npm start
```

Сервер будет на `http://localhost:3001`.

### 2. Клиент (фронтенд)

```bash
cd client
npm install
npm run dev
```

Откройте `http://localhost:5173`. Прокси уже настроен на API и WebSocket сервера.

### 3. Сборка для продакшена

```bash
cd client
npm run build
```

Папка `client/dist` — статические файлы. Их нужно отдавать через ваш веб-сервер (Nginx/Apache) или через Express (см. ниже).

---

## Куда загрузить и как сделать, чтобы работало в РФ

### Варианты хостинга в РФ и рядом

1. **Российские VPS**
   - **Selectel** (selectel.ru) — есть дата-центры в РФ, оплата картой/СБП.
   - **Timeweb** (timeweb.com) — российский хостинг, удобная панель.
   - **Reg.ru** (reg.ru) — VPS и хостинг, оплата в рублях.
   - **RUVDS** (ruvds.com) — недорогие VPS, серверы в РФ и Европе.

2. **Иностранные с оплатой из РФ**
   - **DigitalOcean** / **Hetzner** — иногда доступны российские карты; сервер лучше выбрать в Европе (например, Финляндия/Германия) для меньшей задержки из РФ.

3. **Важно для работы в РФ**
   - Домен можно зарегистрировать у российского регистратора (Reg.ru, nic.ru и т.д.) или зарубежного.
   - Сервер в РФ даёт стабильный доступ без блокировок и быстрый отклик для пользователей из России.
   - Обязательно использовать **HTTPS** (SSL-сертификат, например бесплатный Let's Encrypt).

### Деплой на VPS (общая схема)

На сервере (Ubuntu/Debian):

1. Установить Node.js (например 20 LTS), Nginx, certbot.
2. Клонировать проект, в папке `server`: `npm install --production`, задать переменные окружения (PORT, JWT_SECRET, CRYPTO_SECRET).
3. Собрать клиент: в папке `client`: `npm run build`.
4. Настроить один сервис, который:
   - Запускает `node server/index.js` (или через pm2: `pm2 start server/index.js --name messenger`).
   - Отдаёт статику из `client/dist` и проксирует `/api`, `/uploads`, `/socket.io` на этот же Node-сервер (или сразу отдавать статику из Express, см. ниже).

### Отдача статики и API из одного Node-сервера (простой вариант)

Чтобы не настраивать Nginx сразу, можно раздавать фронт из Express. В `server/index.js` после подключения роутов добавьте:

```js
import { join } from 'path';
const clientDist = join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api') && !req.path.startsWith('/uploads') && !req.path.startsWith('/socket.io')) {
    res.sendFile(join(clientDist, 'index.html'));
  }
});
```

Тогда после `npm run build` в `client` один процесс Node будет и API, и фронт, и WebSocket. Для продакшена лучше поставить перед ним Nginx с SSL.

### Nginx (пример для HTTPS)

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.ru;
    ssl_certificate     /etc/letsencrypt/live/your-domain.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.ru/privkey.pem;

    root /path/to/your/client/dist;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }
    location /api {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location /uploads {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
    }
    location /socket.io {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

Замените `your-domain.ru` и пути к сертификатам и `root` на свои.

### Переменные окружения на продакшене

- **JWT_SECRET** — длинная случайная строка (≥32 символа), не меняйте после появления пользователей.
- **CRYPTO_SECRET** — ещё одна длинная случайная строка (≥32 символа) для шифрования текста сообщений в БД. Не меняйте после появления сообщений, иначе старые не расшифруются.
- **PORT** — порт, на котором слушает Node (например 3001).

---

## Структура проекта

```
├── client/          — фронтенд (React + Vite)
│   ├── src/
│   │   ├── App.jsx, Login.jsx, Register.jsx
│   │   ├── Messenger.jsx, ChatList.jsx, ChatWindow.jsx
│   │   ├── api.js, socket.js
│   │   └── index.css
│   └── index.html
├── server/          — бэкенд (Express + Socket.io + SQLite)
│   ├── index.js     — точка входа, WebSocket
│   ├── auth.js      — регистрация, логин, JWT
│   ├── routes.js    — API, загрузка файлов, чаты, сообщения
│   ├── db.js        — SQLite
│   ├── crypto-util.js — шифрование/расшифровка сообщений
│   ├── data/        — БД (создаётся автоматически)
│   └── uploads/     — загруженные файлы
└── README.md
```

## Безопасность

- Пароли хранятся в виде bcrypt-хешей.
- Текст сообщений в БД хранится в зашифрованном виде (AES-256-GCM).
- Для продакшена обязательно: HTTPS, надёжные JWT_SECRET и CRYPTO_SECRET, ограничение размера файлов (уже 100 МБ в коде).

Удачи с запуском и деплоем в РФ.
