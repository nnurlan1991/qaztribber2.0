# QazTriber — локальная расшифровка KZ/RU для macOS и Windows

QazTriber — нативное десктопное приложение на базе Tauri. Аудио обрабатывается локально: Python sidecar (FastAPI + GigaAM) работает в фоне, а нативное окно Tauri показывает интерфейс. Браузер не нужен.

Доступны ровно две модели:

| В интерфейсе | GigaAM | Для чего |
| --- | --- | --- |
| Быстрая — 220M | `multilingual_ctc` | Обычные заметки и быстрые черновики |
| Точная — 600M | `multilingual_large_ctc` | Более требовательные записи и максимум качества |

> Меньшая официальная модель GigaAM имеет 220M параметров, не 200M.

## Что умеет

- Локальная расшифровка казахской, русской и смешанной речи.
- Загрузка WAV, MP3, M4A, FLAC, OGG и запись с микрофона.
- Обрезка начала и конца записи перед распознаванием.
- Нативное окно на macOS (WKWebView) и Windows (WebView2).
- Выбор ожидаемого языка: казахский, русский или смешанный KZ + RU.
- Кнопка «Скачать обе модели» для подготовки 220M и 600M к работе без интернета.
- Прогресс загрузки модели и транскрибации, отмена задачи.
- Редактирование, копирование и экспорт результата в TXT.
- Обработка длинных записей небольшими фрагментами без передачи аудио во внешний сервис.

## Требования

- macOS 11+ (arm64: M1/M2/M3/M4) или Windows 10/11 (64-bit).
- Интернет только для первого скачивания весов моделей.
- Свободное место на диске: ~1 GB для приложения + ~3 GB для обеих моделей.

## Установка

Скачайте установщик из GitHub Releases:

- **macOS:** `QazTriber_1.0.0_aarch64.dmg` (или `.app` в zip)
- **Windows:** `QazTriber_1.0.0_x64-setup.exe`

На macOS при первом запуске: right-click на `QazTriber.app` → «Open» → «Open» в диалоге (приложение не подписано Apple Developer сертификатом).

На Windows: SmartScreen может показать предупреждение → «More info» → «Run anyway».

При первом запуске выбранной модели её веса будут скачаны в:

- **macOS:** `~/Library/Application Support/QazTriber/models/`
- **Windows:** `%LOCALAPPDATA%\QazTriber\models\`

## Разработка

### Локальный запуск (dev-режим)

```bash
# 1. Python окружение
cd backend
python3.11 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

```bash
# 2. Tauri dev (откроет нативное окно с Vite dev server)
npm install
npm run tauri dev
```

### Сборка релиза (локально)

```bash
# 1. Собрать frontend
cd frontend && npm ci && npm run build && cd ..

# 2. Собрать PyInstaller sidecar
backend/.venv/bin/pip install pyinstaller
backend/.venv/bin/python packaging/build_release.py

# 3. Собрать Tauri приложение
npm run tauri build
```

Результат:
- **macOS:** `src-tauri/target/release/bundle/macos/QazTriber.app`
- **Windows:** `src-tauri/target/release/bundle/nsis/QazTriber_1.0.0_x64-setup.exe`

### CI

GitHub Actions (`.github/workflows/release.yml`) автоматически собирает приложения для macOS arm64 и Windows при публикации тега `v*`:

- `QazTriber_1.0.0_aarch64.dmg` — macOS
- `QazTriber_1.0.0_x64-setup.exe` — Windows

## Проверки

```bash
backend/.venv/bin/python -m pytest backend/tests -q
cd frontend && npm run build
```

## Структура

- `backend/` — FastAPI, очередь задач, подготовка аудио и GigaAM.
- `frontend/` — React-интерфейс аудиостудии.
- `src-tauri/` — Tauri-приложение (Rust): нативное окно, запуск sidecar.
- `packaging/` — PyInstaller-лаунчер (`launcher.py`) и скрипт сборки sidecar (`build_release.py`).
- `IMPLEMENTATION_PLAN_RU.md` — детальный план и архитектурные решения.

## Архитектура

```
QazTriber.app / QazTriber.exe
├── Tauri binary (~3 MB) — нативное окно, грузит http://127.0.0.1:8765
├── sidecar: qaztriber-backend (PyInstaller, ~1 GB)
│   └── FastAPI + uvicorn (без консоли, без логов)
└── frontend/dist — React UI, раздаётся FastAPI через StaticFiles
```

При запуске:
1. Tauri стартует (нативное окно создано).
2. Rust запускает `qaztriber-backend` как дочерний процесс.
3. Ждёт готовности TCP на `:8765` (cold start ~45 сек — грузится torch+gigaam).
4. Окно грузит `http://127.0.0.1:8765` — FastAPI раздаёт React UI + API.
5. Закрытие окна → дочерний процесс убивается автоматически.

Веса моделей не входят в Git или установщик: внутри приложения нажмите «Скачать обе модели» один раз, после чего расшифровка работает офлайн.
