# QazTriber — Project Guide

> Контекстный файл для AI-агентов. Читай перед любой работой с проектом.

## Overview

**QazTriber** — десктопное приложение для офлайн-расшифровки казахской, русской и смешанной речи. Аудио обрабатывается локально на устройстве пользователя (ИИ модель для распознавания, PyTorch). Никаких облаков, аккаунтов, телеметрии.

## Products

| Продукт | Платформа | Где проект |
|---------|-----------|------------|
| Desktop (macOS/Windows) | Tauri 2.x + Python sidecar | этот репозиторий |
| Mobile (Android) | нативный (Kotlin/Compose) | `/Users/market/Documents/проекты программиста/qaztribber_mobile/` |
| Landing | статичный HTML на nginx | `landing/index.html` + сервер |
| Models hosting | nginx статика | `https://qaztribber.aidi-lab.kz/models/desktop/` |

## Tech Stack

### Frontend (desktop)
- **Tauri 2.x** — нативное окно, Rust-ядро
- **React 18 + TypeScript** — UI
- **Vite** — бандлер
- Дизайн-система: obsidian+gold (dark/light темы), токены в `styles.css`

### Backend (sidecar)
- **Python 3.11**, FastAPI, Uvicorn
- **PyInstaller** (`--onedir`) → `src-tauri/binaries/qaztriber-backend/`
- **ИИ модель для распознавания** (PyTorch): MPS на Apple Silicon, CPU на Windows
- venv: `backend/.venv/bin/python` (Python 3.11, arm64)

### Build pipeline
```bash
# 1. Frontend → frontend/dist/
cd frontend && npm run build

# 2. Sidecar (PyInstaller + strip) → src-tauri/binaries/qaztriber-backend/
backend/.venv/bin/python packaging/build_release.py

# 3. Tauri app → src-tauri/target/release/bundle/macos|dmg|nsis/
npm run tauri build
```

## Architecture (критичные детали)

### Frontend вшит в Python sidecar
PyInstaller копирует `frontend/dist/` в `_internal/frontend/dist/`. **Пересборка только Tauri НЕ обновляет frontend** — нужно пересобирать sidecar каждый раз.

### Модели НЕ вшиты в .app
Скачиваются при первом запуске (~3 ГБ) с `https://qaztribber.aidi-lab.kz/models/desktop/`. Две модели:
- `multilingual_ctc.ckpt` (220M, ~880 МБ) — быстрая
- `multilingual_large_ctc.ckpt` (600M, ~2.3 ГБ) — точная

### Polling вместо SSE
`watchJob()` в `api.ts` использует `setTimeout`-polling каждые 500мс (не EventSource) — надёжнее, нет ложных onerror.

### Backend endpoint `/api/system`
Возвращает device, CPU brand, memory, speed_multiplier — для расчёта ETA расшифровки.

### strip_sidecar() в build_release.py
Удаляет дубликаты libtorch библиотек (`.dylib` на Mac, `.dll` на Windows) из `torch/lib/` — экономит ~350 МБ. Кроссплатформенный.

## Auth & User Management (v1.3.0)

### Архитектура авторизации
- **Firebase Auth** (email/password + Google Sign-In) — клиентский SDK в frontend
- **Admin approval gate** — пользователи регистрируются, но доступ получают только после одобрения админом
- **Firestore rules** принуждают `approved=false` при создании документа — клиент не может подделать одобрение
- **VPS admin panel** (`https://qaztribber.aidi-lab.kz/admin/`) — Express + Firebase Admin SDK, обходит rules
- **Telegram bot** (@qaztriberbot) — мгновенные уведомления + inline кнопки (approve/reject/revoke)
- **Whitelist** — bulk Excel/CSV импорт email с auto-approve
- **Google Sign-In** через системный браузер (Tauri WebView блокирует OAuth popups):
  desktop → VPS `google.html` → Firebase `signInWithPopup` → customToken → desktop `signInWithCustomToken`
- **Без Cloud Functions** (Spark план) — всё на Firestore rules + VPS Admin SDK

### Ключевые файлы auth
- `frontend/src/lib/firebase.ts` — клиентский SDK
- `frontend/src/lib/auth.tsx` — AuthProvider (loading→unauth→pending→approved)
- `frontend/src/views/AuthView.tsx` — экран входа
- `frontend/src/views/PendingApprovalView.tsx` — ожидание одобрения
- `admin-panel/server/src/` — весь VPS backend (Express, Admin SDK, Telegram bot)
- `admin-panel/web/google.html` — VPS-хостинг Google Sign-In страница
- `firestore.rules` — security rules (deployed)
- `docs/AUTH_SKILLS.md` — подробный гайд по архитектуре для переиспользования

### VPS admin panel
- **URL:** `https://qaztribber.aidi-lab.kz/admin/`
- **Код на VPS:** `/home/ai/projects/qaztriber-admin/`
- **pm2 process:** `qaztriber-admin` (port 3003)
- **Service account:** `/home/ai/.config/qaztriber/firebase-service-account.json`
- **Вход в админку:** Telegram bot → `/login` → magic link → JWT cookie
- **CSP:** строгий везде, ослабленный только для `google.html` (Firebase SDK + Google APIs)

## Deployment

### Desktop builds (CI)
- **Workflow:** `.github/workflows/release.yml`
- **Триггер:** push тега `v*` или ручной dispatch
- **Платформы:** macOS (`macos-14`) + Windows (`windows-latest`) параллельно
- **Результат:** `.dmg` (macOS) + `.exe` (Windows) в GitHub Releases
- **Релиз:** `git tag v1.x.0 && git push origin v1.x.0`

### Landing page
- **Сервер:** `qaztribber.aidi-lab.kz` (nginx, Hetzner)
- **Файл:** `/var/www/qaztribber/index.html`
- **Зеркало:** GitHub Pages → `https://nnurlan1991.github.io/qaztriber2.0/`
- **Workflow:** `.github/workflows/pages.yml` (авто-деплой при пуше в `landing/`)

### Models
- Хостинг: `https://qaztribber.aidi-lab.kz/models/desktop/`
- Файлы: `multilingual_ctc.ckpt`, `multilingual_large_ctc.ckpt`, `manifest.json`
- Range requests включены (resume downloads)

## Server Access

| Параметр | Значение |
|----------|----------|
| Host | `46.224.176.8` (также `aidi-lab.kz`) |
| User | `ai` |
| SSH key | `~/.ssh/ai_project1` |
| Команда | `ssh -i ~/.ssh/ai_project1 ai@46.224.176.8` |
| sudo | без пароля |
| Webroot | `/var/www/qaztribber/` |
| nginx config | `/etc/nginx/sites-enabled/qaztribber.aidi-lab.kz` |
| SSL | Let's Encrypt (Certbot) |

### Другие сервисы на сервере
- `aidi-lab.kz` — Node.js (:3000)
- `dastarkhan.online` — Node.js (:3001)
- `slidegen.aidi-lab.kz`, `tapsiramin`, `tapsirubot.aidi-lab.kz`, `vp.aidi-lab.kz`, `oyau`

## GitHub

| Параметр | Значение |
|----------|----------|
| Repo | `https://github.com/nnurlan1991/qaztribber2.0` (public) |
| Owner | `nnurlan1991` |
| Releases | `https://github.com/nnurlan1991/qaztribber2.0/releases` |
| Latest | v1.1.0 |
| Desktop assets | `.dmg` (195 MB), `.exe` (150 MB) |
| Mobile repo | `https://github.com/nnurlan1991/qaztribber_mobile` (public) |
| Mobile asset | APK (имя может содержать версию, напр. `QazTriber-v2.0.apk`) |

### Прямые ссылки на скачивание
- macOS: `https://github.com/nnurlan1991/qaztribber2.0/releases/latest/download/QazTriber_aarch64.dmg`
- Windows: `https://github.com/nnurlan1991/qaztribber2.0/releases/latest/download/QazTriber_x64-setup.exe`
- Android: `https://github.com/nnurlan1991/qaztriber_mobile/releases/latest` (лендинг через GitHub API берёт URL последнего asset)

## Release Workflow (для агента)

При завершении фичи/релиза выполняй чек-лист по порядку:

### Desktop (macOS + Windows) — автоматически через CI
1. Обновить версию в `src-tauri/tauri.conf.json` (поле `version`) и `src-tauri/Cargo.toml` (`[package] version`)
2. Закоммитить: `git commit -am "v1.x.0: <описание>"`
3. Запушить на main: `git push origin main`
4. Создать тег: `git tag -a v1.x.0 -m "v1.x.0: <описание>" && git push origin v1.x.0`
5. CI автоматически соберёт .dmg (macOS) и .exe (Windows) за ~10 мин и опубликует в Release
6. Дождаться CI: `gh run watch`
7. Проверить Release: `gh release view v1.x.0` (должны быть .dmg + .exe)

### Android (APK) — вручную из мобильного репо
1. Мобильный проект: `/Users/market/Documents/проекты программиста/qaztribber_mobile/`
2. Собрать APK: `cd android_app && ./gradlew assembleDebug`
3. APK появится: `android_app/app/build/outputs/apk/debug/app-debug.apk`
4. Загрузить в Release мобильного репо:
   ```bash
   gh release upload v1.x.0 \
     "/Users/market/Documents/проекты программиста/qaztribber_mobile/android_app/app/build/outputs/apk/debug/app-debug.apk#QazTriber-v2.0.apk" \
     --repo nnurlan1991/qaztribber_mobile --clobber
   ```
   (имя файла в Release может быть любым — лендинг через GitHub API берёт последний asset)
5. Проверить: `gh release view v1.x.0 --repo nnurlan1991/qaztribber_mobile`

### Лендинг (обновлять НЕ нужно)
- Файл: `landing/index.html` + сервер `/var/www/qaztribber/index.html`
- Desktop: `releases/latest/download/` — прямые ссылки со стабильными именами файлов
- Mobile: GitHub API `/repos/nnurlan1991/qaztriber_mobile/releases/latest` → `assets[0].browser_download_url` (имя может содержать версию)
- Лендинг обновлять НЕ нужно при новых релизах — ссылки динамические


### Финальная проверка
- `gh release view v1.x.0` (desktop) → .dmg + .exe
- `gh release view v1.x.0 --repo nnurlan1991/qaztribber_mobile` → APK файл
- `curl -sI https://qaztribber.aidi-lab.kz/` → 200 OK
- Открыть `https://qaztribber.aidi-lab.kz/` в браузере — 3 кнопки работают

## Key Files

```
frontend/src/
  views/          — HomeView, HistoryView, SessionView, ModelsView, SettingsView
  components/     — Sidebar, TopBar, RecordButton, ProgressBar, Waveform, Modal, StatusBadge
  store.tsx       — React context (theme, language, systemInfo)
  api.ts          — polling watchJob, getSystemInfo
  styles.css      — obsidian+gold дизайн-система
  i18n.ts         — RU/KZ переводы
  storage.ts      — localStorage сессии

backend/app/
  api/transcriptions.py — endpoints (/transcribe, /system, /sessions)
  services/gigaam.py    — wrapper для ИИ модели, MODEL_DOWNLOAD_BASE
  schemas.py            — Pydantic schemas (SystemInfoResponse и др.)

packaging/build_release.py — PyInstaller + strip_sidecar()
src-tauri/tauri.conf.json   — Tauri config
.github/workflows/release.yml — CI сборка desktop
.github/workflows/pages.yml   — CI деплой лендинга
landing/index.html            — лендинг
```

## Important Notes

- **Windows CI:** env `PYTHONUTF8=1` обязателен — иначе `UnicodeEncodeError` на кириллице в print()
- **DMG locally:** `bundle_dmg.sh` падает на macOS, но .app собирается. CI собирает .dmg успешно.
- **ИИ модель для распознавания:** PyTorch (не ONNX) — MPS на Apple Silicon, CPU на Windows
- **.swarm/ и .opencode/** в `.gitignore` — не коммитить
- **Ключ `id_rsa_aidi`** на этом Mac не работает для сервера — использовать `ai_project1`

## Languages & i18n

- Языки интерфейса: **RU** (русский), **KZ** (казахский)
- Языки распознавания: kazakh, russian, mixed (KZ+RU)
- Переводы в `frontend/src/i18n.ts`

## Models (ИИ модель для распознавания)

- Использует PyTorch (не ONNX)
- `device()` в `gigaam.py` определяет `mps` или `cpu`
- 220M (быстрая, ~3x realtime на MPS) и 600M (точная, ~1x realtime)
- Скачиваются с `https://qaztribber.aidi-lab.kz/models/desktop/`
