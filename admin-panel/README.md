# QazTriber Admin Panel

Серверная админ-панель + Telegram bot для управления доступом пользователей.

## Архитектура

```
Desktop/Mobile → Firebase Auth → Firestore users/{uid} (approved: false)
                                        ↑↓
                              VPS Admin (этот проект)
                                        ↑↓
                          Telegram Bot (уведомления + inline approve)
```

- **Firebase Auth** — только авторизация (login)
- **Firestore `users/{uid}`** — единый источник правды (`approved` поле)
- **VPS Node.js** — admin panel (web) + Telegram bot, оба через Firebase Admin SDK
- **Синхронизация:** Firestore `onSnapshot` listeners — web и bot видят изменения друг друга в реальном времени

## Деплой на VPS

```bash
# 1. Копировать код
cd ~/projects && git clone <repo> qaztriber-admin
cd qaztriber-admin/admin-panel/server

# 2. Установить зависимости
npm install && npm run build

# 3. Положить service account JSON
cp firebase-service-account.json /home/ai/.config/qaztriber/
export GOOGLE_APPLICATION_CREDENTIALS=/home/ai/.config/qaztriber/firebase-service-account.json

# 4. Создать .env (см. .env.example)
cp .env.example .env
# Заполнить: JWT_SECRET, TELEGRAM_BOT_TOKEN, TELEGRAM_ADMIN_CHAT_ID, PUBLIC_URL

# 5. Запустить через pm2
pm2 start dist/index.js --name qaztriber-admin
pm2 save && pm2 startup
```

## nginx

```nginx
location /admin/ {
    proxy_pass http://127.0.0.1:3003/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

## Использование

1. Открой бота в Telegram → `/login` → ссылка на админ-панель
2. В админ-панели: список пользователей, approve/revoke/delete
3. Уведомления о новых регистрациях приходят в Telegram с inline-кнопками

## Безопасность

- Firestore rules: клиенты могут только читать свой `users/{uid}`,
  не могут писать `approved` и admin-поля
- Service account JSON в `.gitignore`, не коммитится
- JWT magic-link: одноразовый, TTL 1 час, привязка к chat_id
- Bot: restricted to admin chat_id
- Web: HttpOnly + Secure cookies, CSP, X-Frame-Options: DENY
