// DEPRECATED — Cloud Functions не используются.
//
// Архитектура переключена на rules-only: клиент создаёт users/{uid} с
// approved=false (принудительно rules), VPS Admin SDK меняет approved.
// См. ../firestore.rules и ../CLAUDE.md.
export {};
