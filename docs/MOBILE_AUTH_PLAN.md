# Mobile Auth Plan — QazTriber Mobile

> План интеграции той же Firebase-авторизации + admin-approval gate
> в Android-приложение. Выполняется **отдельно** после десктопа.

## Контекст

- **Firebase проект:** `qaztriber` (общий с десктопом)
- **Auth методы:** Email/Password + Google Sign-In (уже подключены в мобилке)
- **Approval gate:** Firestore `users/{uid}.approved` — тот же механизм
- **Telegram bot + VPS admin panel:** уже работают (общие для обеих платформ)

## Текущее состояние мобилки

- `AuthManager.kt` — Firebase Auth (email + Google) ✅ уже работает
- `google-services.json` — подключён ✅
- **НО:** анонимный режим включён (кнопка «Пропустить» в AuthScreen)
- **НО:** нет проверки `approved` — любой зарегистрировавшийся сразу входит
- **НО:** Firestore не подключён (нет зависимости `firebase-firestore-ktx`)

## Задачи

### 1. Добавить Firestore dependency

`android_app/app/build.gradle.kts`:
```kotlin
implementation("com.google.firebase:firebase-firestore-ktx")
```

### 2. Обновить AuthManager.kt

- После успешного логина (email/Google) → подписка на `users/{uid}` через
  `FirebaseFirestore.getInstance().collection("users").document(uid).addSnapshotListener`
- Экспортировать `approved: StateFlow<Boolean>` (или callback)
- Создавать pending-документ при первом входе (аналог desktop `setDoc`):
  ```kotlin
  val userDoc = mapOf(
      "uid" to uid, "email" to email, "displayName" to displayName,
      "provider" to provider, "approved" to false,
      "createdAt" to FieldValue.serverTimestamp()
  )
  db.collection("users").document(uid).set(userDoc, SetOptions.merge())
  ```
  Firestore rules (общие) enforce `approved=false`.
- Убрать `currentUserId()` fallback на локальный `local_<uuid>` —
  теперь только реальный Firebase uid.

### 3. Убрать анонимный режим

- `AuthScreen.kt`: удалить кнопку «Продолжить без входа» (`onSkip`)
- `MainActivity.kt`: убрать обработку `onSkip` — теперь вход обязателен
- Удалить `KEY_LOCAL_ID` из `AuthManager` (больше не нужен)

### 4. Добавить PendingApprovalScreen

Новый Composable-экран:
- Иконка ожидания (часы)
- «Ваш запрос отправлен администратору. Ожидайте подтверждения.»
- Email пользователя
- Кнопка «Выйти»
- Real-time: при `approved == true` автоматически переходит в приложение
  (через наблюдение `approved` StateFlow в AuthManager)

### 5. Обновить навигацию (MainActivity.kt)

Логика gate:
```
when {
    authManager.currentUser.value == null -> AuthScreen
    authManager.currentUser.value != null && !approved -> PendingApprovalScreen
    else -> основной экран (HomeScreen)
}
```

### 6. AppStrings.kt — новые ключи (RU/KK)

- `auth_pending_title` — «Ожидание подтверждения» / «Растауды күту»
- `auth_pending_desc` — «Ваш запрос отправлен администратору...» / ...
- Убрать `auth_skip` (анонимный режим)

## Проверка

1. Регистрация нового email → pending-документ создаётся →
   админ видит уведомление в Telegram → approve → мобилка разблокируется
2. Google Sign-In → та же цепочка
3. Анонимный режим недоступен (кнопки нет)
4. Revoke (через админку) → пользователь выкидывается на PendingApprovalScreen
   в реальном времени (onSnapshot срабатывает)

## Зависимости

- Десктоп + VPS admin panel + Telegram bot должны быть полностью рабочими
  (это уже сделано в текущей фазе)
- Firestore rules уже деплоятся (общие для всех платформ)

## Оценка

- 4-6 часов работы
- 1 фаза (без разделения на подфазы)
