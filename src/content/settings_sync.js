/**
 * settings_sync.js
 * chrome.storage.local の設定をメモリにキャッシュする。
 * interceptor.js からグローバル変数 __APGSettings として参照できる。
 * content scripts は同じ isolated world を共有するので var で宣言。
 */

var __APGSettings = { enabled: true, rules: {} }; // eslint-disable-line no-unused-vars

chrome.storage.local.get("apgSettings", function (data) {
  if (data.apgSettings) __APGSettings = data.apgSettings;
});

chrome.storage.onChanged.addListener(function (changes, area) {
  if (area === "local" && changes.apgSettings) {
    __APGSettings = changes.apgSettings.newValue;
  }
});
