# Mobile Auth Plan — QazTriber Mobile

> План интеграции approval-gate (Firebase Firestore `users/{uid}.approved`)
> в Android-приложение. Десктопная auth-инфраструктура полностью работает
> с v1.3.0 — мобилка подключается к ней без изменений на сервере.

## Контекст

- **Firebase проект:** `qaztriber` (общий с десктопом)
- **Auth методы:** Email/Password + Google Sign-In — уже работают в мобилке
  через нативный `GoogleSignInClient` (в отличие от десктопа, где Google
  Sign-In идёт через VPS `google.html` + system browser, т.к. Tauri WebView
  блокирует OAuth popups). На мобилке `google.html` relay **не нужен**.
- **Approval gate:** Firestore `users/{uid}.approved` — тот же механизм, что
  в десктопе. Firestore rules уже деплоятся и shared между платформами.
- **Telegram bot + VPS admin panel:** полностью рабочие (v1.3.0+), общие
  для обеих платформ. См. `docs/AUTH_SKILLS.md` и `CLAUDE.md` (раздел
  «Auth & User Management»).
- **Firestore rules:** уже деплоятся (`firestore.rules` в корне десктоп-репо).
  Client может создать `users/{uid}` только с `approved: false`; update/delete
  запрещены — только Admin SDK (VPS) может менять `approved`.

## Текущее состояние мобилки (проверено)

- **Репо:** `/Users/market/Documents/проекты программиста/qaztribber_mobile/`
  (локально; GitHub: `nnurlan1991/qaztriber_mobile`)
- **Package:** `com.example.transcriber`, versionName `2.0`, versionCode `2`
- **Stack:** Kotlin + Jetpack Compose, Room, WorkManager, ONNX Runtime
- **minSdk 26, targetSdk 34, compileSdk 34**

### Auth-инфраструктура (что уже есть)

- `app/build.gradle.kts`: Firebase BOM `32.7.4`, `firebase-auth-ktx`,
  `play-services-auth 21.0.0`, KSP для Room. **Firestore dependency ОТСУТСТВУЕТ.**
- `google-services.json` — подключён (плагин `com.google.gms.google-services`)
- `AuthManager.kt` (183 строки):
  - `signInWithEmail()` / `signUpWithEmail()` — Firebase Auth ✅
  - `googleSignInIntent()` + `completeGoogleSignIn()` — нативный GoogleSignInClient ✅
  - `signOut()` / `deleteAccount()` — оба работают ✅
  - `currentUser: StateFlow<User?>` — persist в SharedPreferences ✅
  - `currentUserId()` — fallback на `local_<uuid>` для анонимного режима ⚠️
- `ui/AuthScreen.kt` (235 строк):
  - Email/password (вход/регистрация), Google Sign-In button ✅
  - Кнопка «Продолжить без входа» (`onSkip`) ⚠️ — анонимный режим
- `MainActivity.kt` → `TranscriberRoot`:
  - Gate: `currentUser == null && !authSkipped -> AuthScreen` ⚠️
  - `authSkipped` state — пропускает в приложение без входа ⚠️
  - Онбординг-гейт (скачивание моделей) — работает ✅

### Что отсутствует (это и есть задачи ниже)

1. **Нет Firestore dependency** — нет `firebase-firestore-ktx`
2. **Нет проверки `approved`** — любой зарегистрировавшийся сразу входит
3. **Анонимный режим включён** — кнопка «Пропустить» в AuthScreen
4. **Нет `PendingApprovalScreen`** — нет экрана ожидания одобрения

## Задачи

### 1. Добавить Firestore dependency

`android_app/app/build.gradle.kts`, блок `dependencies`:
```kotlin
implementation("com.google.firebase:firebase-firestore-ktx")
```

> Firebase BOM уже подключён (`32.7.4`), версия Firestore наследуется автоматически.

### 2. Обновить AuthManager.kt — добавить approval gate

Файл: `android_app/app/src/main/java/com/example/transcriber/AuthManager.kt`

Добавить после инициализации `_currentUser`:

- `private val _approved = MutableStateFlow(false)`
- `val approved: StateFlow<Boolean> = _approved.asStateFlow()`
- `private var userDocListener: ListenerRegistration? = null`

После успешного логина (в `signInWithEmail`, `signUpWithEmail`, `completeGoogleSignIn`)
— вызывать новый `private suspend fun ensureUserDocAndListen(uid, email, displayName, provider)`:

```kotlin
private suspend fun ensureUserDocAndListen(
    uid: String, email: String, displayName: String, provider: String
) {
    val db = FirebaseFirestore.getInstance()
    val userRef = db.collection("users").document(uid)

    // Создаём pending-документ (rules enforce approved=false на create)
    // merge() чтобы не затереть существующий документ (returning user)
    val userDoc = mapOf(
        "uid" to uid,
        "email" to email,
        "displayName" to displayName,
        "provider" to provider,
        "approved" to false,
        "createdAt" to FieldValue.serverTimestamp()
    )
    try {
        userRef.set(userDoc, SetOptions.merge())
    } catch (e: Exception) {
        // Документ уже существует (returning user) — ожидаемо
    }

    // Подписка на approval status (gRPC streaming стабилен на Android,
    // в отличие от VPS/pm2 — см. AUTH_SKILLS.md gotcha #5)
    userDocListener?.remove()
    userDocListener = userRef.addSnapshotListener { snap, error ->
        if (error != null || snap == null || !snap.exists()) {
            _approved.value = false
            return@addSnapshotListener
        }
        _approved.value = snap.getBoolean("approved") == true
    }
}
```

Изменения в существующих методах:
- `signInWithEmail()` / `signUpWithEmail()` / `completeGoogleSignIn()`:
  после `toDomainUser(user).also { persistUser(it) }` добавить вызов
  `ensureUserDocAndListen(user.uid, user.email ?: "", user.displayName ?: "", <provider>)`
- `signOut()`: добавить `userDocListener?.remove(); _approved.value = false`
- `deleteAccount()`: добавить `userDocListener?.remove(); _approved.value = false`
  (перед `user.delete()`)
- `currentUserId()`: **убрать** fallback на `local_<uuid>` — теперь только
  реальный Firebase uid. Если `_currentUser.value == null` — вернуть пустую
  строку (сессии без входа больше не создаются). Удалить `KEY_LOCAL_ID`.
- `User` data class: без изменений (provider уже есть)

> **Важно:** `ensureUserDocAndListen` должна вызываться ДО `persistUser`,
> чтобы подписка стартовала сразу. `addSnapshotListener` асинхронный —
> первый снимок придёт за ~100-300мс, UI покажет loading.

### 3. Убрать анонимный режим

**`ui/AuthScreen.kt`:**
- Удалить параметр `onSkip: () -> Unit` из сигнатуры `AuthScreen()`
- Удалить блок «Продолжить без входа» (строки ~220-224: `TextButton(onClick = onSkip)`)
- Удалить `auth_skip` из `AppStrings.kt` (RU/KK переводы)

**`MainActivity.kt` → `TranscriberRoot`:**
- Удалить `var authSkipped by rememberSaveable { mutableStateOf(false) }`
- Убрать `&& !authSkipped` из gate-условия: `currentUser == null -> AuthScreen(...)`
- Убрать `onSkip = { authSkipped = true }` из вызова `AuthScreen(...)`
- В `onSignOut`: убрать `authSkipped = false`

### 4. Добавить PendingApprovalScreen

Новый файл: `android_app/app/src/main/java/com/example/transcriber/ui/PendingApprovalScreen.kt`

```kotlin
@Composable
fun PendingApprovalScreen(
    email: String,
    onSignOut: () -> Unit
) {
    // Иконка ожидания (часы), текст «Ваш запрос отправлен администратору»,
    // email пользователя, кнопка «Выйти».
    // Real-time переход: при approved == true AuthManager.ApprovedStateFlow
    // обновится → TranscriberRoot перерисуется автоматически (collectAsState).
}
```

### 5. Обновить навигацию (MainActivity.kt → TranscriberRoot)

Новая логика gate (заменяет существующий `when`):
```kotlin
val approved by auth.approved.collectAsState()

when {
    !languageSelected -> LanguageSelectorScreen(...)
    currentUser == null -> AuthScreen(
        authManager = auth,
        onAuthSuccess = { /* StateFlow обновится */ }
    )
    currentUser != null && !approved -> PendingApprovalScreen(
        email = currentUser!!.email,
        onSignOut = { auth.signOut() }
    )
    showOnboarding || screen is Screen.Onboarding -> OnboardingGate(...)
    else -> AppContent(...)
}
```

> `currentUser` и `approved` — оба `StateFlow`, обновляются автоматически.
> При approve в Telegram-боте → Firestore обновляется → `addSnapshotListener`
> срабатывает → `_approved = true` → UI перерисуется → пользователь входит.

### 6. AppStrings.kt — новые ключи (RU/KK)

Добавить:
- `auth_pending_title` — «Ожидание подтверждения» / «Растауды күту»
- `auth_pending_desc` — «Ваш запрос отправлен администратору. Ожидайте подтверждения.» / «Сіздің өтінішіңіз әкімшіге жіберілді. Растауды күтіңіз.»
- `auth_pending_signout` — «Выйти» / «Шығу»

Удалить:
- `auth_skip` (анонимный режим убран)

## Проверка

1. **Регистрация нового email** → pending-документ создаётся в Firestore →
   админ видит уведомление в Telegram → approve → мобилка автоматически
   разблокируется (`addSnapshotListener` срабатывает за ~1с)
2. **Google Sign-In** → та же цепочка (native GoogleSignInClient → Firebase Auth →
   pending doc → admin approve → вход)
3. **Whitelist** → если email в whitelist (Excel/CSV импорт через VPS admin panel),
   VPS polling auto-approve сработает за ~5с — пользователь войдёт без ручного approve
4. **Revoke** (через админку или Telegram bot) → `approved = false` →
   пользователь выкидывается на `PendingApprovalScreen` в реальном времени
5. **Анонимный режим недоступен** — кнопки «Пропустить» нет
6. **Sign out из Pending** → возвращение на AuthScreen
7. **Delete account** (из AccountScreen) → Firebase user + Firestore doc удаляются,
   возврат на AuthScreen

## Зависимости

- ✅ Десктоп auth (v1.3.0+) — полностью рабочий
- ✅ VPS admin panel (`https://qaztribber.aidi-lab.kz/admin/`) — работает
- ✅ Telegram bot (@qaztriberbot) — работает (polling sync 5с)
- ✅ Firestore rules — деплоятся, shared между платформами
- ✅ Whitelist (bulk Excel/CSV импорт + auto-approve) — работает
- ✅ Firebase Auth providers (Email/Password + Google) — включены
- ⬜ Firestore dependency в mobile `build.gradle.kts` — задача 1
- ⬜ `google-services.json` с реальным Firebase проектом (не demo) —
   если сейчас demo-файл, заменить на реальный из Firebase Console

## Отличия от десктопа

| Аспект | Десктоп (Tauri) | Мобильная (Android) |
|--------|-----------------|---------------------|
| Google Sign-In | VPS `google.html` + system browser (WebView блокирует popups) | Нативный `GoogleSignInClient` (уже работает) |
| Approval listener | `onSnapshot` (Firestore JS SDK) | `addSnapshotListener` (Firestore Android SDK, gRPC стабилен) |
| Polling vs streaming | Desktop: polling для job status (SSE нестабилен в WebView) | Mobile: `addSnapshotListener` для approval (gRPC стабилен на Android) |
| VPS google.html relay | Нужен | **Не нужен** |
| CSP | Строгий в `tauri.conf.json` | Не применимо (нативное приложение) |

## Оценка

- **4-6 часов** работы
- **1 фаза** (без разделения на подфазы)
- Файлы для изменения:
  - `app/build.gradle.kts` — +1 строка (Firestore dependency)
  - `AuthManager.kt` — ~40 строк (approval gate, убрать local fallback)
  - `ui/AuthScreen.kt` — удалить ~5 строк (onSkip)
  - `ui/PendingApprovalScreen.kt` — новый файл (~60 строк)
  - `MainActivity.kt` — ~10 строк (gate logic, убрать authSkipped)
  - `ui/AppStrings.kt` — +3 ключа, -1 ключ
