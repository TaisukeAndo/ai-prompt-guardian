/**
 * Background Service Worker
 * Content Script からの検査リクエストを受け取り、検知結果を返す
 * 検知処理はここで完結（外部通信なし）
 */

import { detectText } from "../rules/detector.js";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "DETECT") {
    const result = detectText(message.text);
    sendResponse(result);
    return true; // 非同期レスポンスを許可
  }
});
