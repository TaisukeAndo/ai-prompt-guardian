/**
 * Background Service Worker
 * 検知処理は Content Script 内で同期実行されるため、
 * Service Worker 側では検知ロジックを持たない。
 * 将来的なログ記録・設定管理の拡張ポイントとして存在する。
 */

chrome.runtime.onInstalled.addListener(() => {
  console.log("AI Prompt Guardian installed.");
});
