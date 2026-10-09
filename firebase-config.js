/* ============================================================
   WONDER.GG — конфигурация базы Firebase (Realtime Database)
   ============================================================
   Ваша база уже подключена. URL берётся из консоли Firebase:
   Realtime Database → вкладка «Data» → кнопка «Copy URL».

   Пока FIREBASE_ENABLED = false — данные хранятся локально
   в браузере (localStorage), сайт работает автономно.
   ============================================================ */

window.FIREBASE_ENABLED = true;

// URL вашей базы (без завершающего слэша)
window.FIREBASE_DB_URL = "https://wondergg-26b38-default-rtdb.firebaseio.com";
