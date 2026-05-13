/**
 * Content Script
 * 各AIサービスの送信ボタン押下を捕捉し、プロンプトテキストを検査する
 */

// ─── サービスごとのテキスト取得セレクタ定義 ───
const SERVICE_CONFIGS = [
  {
    host: "chatgpt.com",
    textSelector: "#prompt-textarea",
    submitSelector: 'button[data-testid="send-button"]',
  },
  {
    host: "chat.openai.com",
    textSelector: "#prompt-textarea",
    submitSelector: 'button[data-testid="send-button"]',
  },
  {
    host: "gemini.google.com",
    textSelector: "rich-textarea .ql-editor",
    submitSelector: 'button[aria-label="送信"]',
  },
  {
    host: "claude.ai",
    textSelector: 'div[contenteditable="true"]',
    submitSelector: 'button[aria-label="Send Message"]',
  },
  {
    host: "copilot.microsoft.com",
    textSelector: 'textarea[placeholder]',
    submitSelector: 'button[aria-label="Submit"]',
  },
];

function getCurrentConfig() {
  return SERVICE_CONFIGS.find((c) => location.hostname.includes(c.host));
}

function getPromptText(config) {
  const el = document.querySelector(config.textSelector);
  if (!el) return "";
  return el.innerText || el.value || el.textContent || "";
}

// ─── 送信ボタンへのインターセプト ───
function attachInterceptor(config) {
  document.addEventListener(
    "click",
    async (e) => {
      const btn = e.target.closest(config.submitSelector);
      if (!btn) return;

      const text = getPromptText(config);
      if (!text.trim()) return;

      // Background Service Worker に検査を依頼
      const result = await chrome.runtime.sendMessage({
        type: "DETECT",
        text,
      });

      if (!result.matched) return; // 問題なし → そのまま送信

      // 問題あり → 送信を止めてダイアログ表示
      e.preventDefault();
      e.stopImmediatePropagation();
      showWarningDialog(result, btn);
    },
    true // キャプチャフェーズで捕捉
  );

  // Enterキーによる送信も捕捉
  document.addEventListener(
    "keydown",
    async (e) => {
      if (e.key !== "Enter" || e.shiftKey) return;
      const active = document.activeElement;
      if (!active) return;
      const isInputArea =
        active.matches(config.textSelector) ||
        active.closest(config.textSelector);
      if (!isInputArea) return;

      const text = getPromptText(config);
      if (!text.trim()) return;

      const result = await chrome.runtime.sendMessage({
        type: "DETECT",
        text,
      });

      if (!result.matched) return;

      e.preventDefault();
      e.stopImmediatePropagation();
      showWarningDialog(result, active);
    },
    true
  );
}

// ─── 警告ダイアログ ───
function showWarningDialog(result, triggerEl) {
  // 既存ダイアログがあれば削除
  document.getElementById("apg-dialog")?.remove();

  const hasError = result.findings.some((f) => f.severity === "error");

  const findingsHTML = result.findings
    .map(
      (f) => `
      <div class="apg-finding apg-${f.severity}">
        <span class="apg-badge">${f.severity === "error" ? "⛔" : "⚠️"}</span>
        <strong>${f.label}</strong>
        <span class="apg-sample">${f.matches.map(maskText).join("、")}</span>
      </div>`
    )
    .join("");

  const dialog = document.createElement("div");
  dialog.id = "apg-dialog";
  dialog.innerHTML = `
    <div id="apg-overlay"></div>
    <div id="apg-modal">
      <div id="apg-header">
        <span id="apg-icon">${hasError ? "⛔" : "⚠️"}</span>
        <span id="apg-title">送信前に確認してください</span>
      </div>
      <p id="apg-desc">プロンプト内に以下の情報が含まれている可能性があります：</p>
      <div id="apg-findings">${findingsHTML}</div>
      <div id="apg-actions">
        <button id="apg-cancel">キャンセル（修正する）</button>
        ${!hasError ? '<button id="apg-send">このまま送信</button>' : ""}
      </div>
    </div>
  `;

  // スタイル注入
  injectStyles();
  document.body.appendChild(dialog);

  document.getElementById("apg-cancel").addEventListener("click", () => {
    dialog.remove();
    triggerEl?.focus();
  });

  if (!hasError) {
    document.getElementById("apg-send").addEventListener("click", () => {
      dialog.remove();
      // 送信を再実行（インターセプトをバイパスするフラグ付き）
      triggerEl?.click();
    });
  }

  document.getElementById("apg-overlay").addEventListener("click", () => {
    dialog.remove();
  });
}

function maskText(text) {
  if (text.length <= 4) return "****";
  return text.slice(0, 2) + "*".repeat(Math.min(text.length - 4, 6)) + text.slice(-2);
}

function injectStyles() {
  if (document.getElementById("apg-styles")) return;
  const style = document.createElement("style");
  style.id = "apg-styles";
  style.textContent = `
    #apg-overlay {
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.5);
      z-index: 2147483646;
    }
    #apg-modal {
      position: fixed;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      background: #fff;
      border-radius: 12px;
      padding: 24px;
      width: 420px;
      max-width: 90vw;
      box-shadow: 0 8px 32px rgba(0,0,0,0.2);
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 14px;
      color: #1a1a1a;
    }
    #apg-header {
      display: flex; align-items: center; gap: 8px;
      margin-bottom: 12px;
    }
    #apg-icon { font-size: 22px; }
    #apg-title { font-size: 16px; font-weight: 700; }
    #apg-desc { margin: 0 0 12px; color: #555; }
    #apg-findings { display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px; }
    .apg-finding {
      display: flex; align-items: flex-start; gap: 8px;
      padding: 8px 10px;
      border-radius: 8px;
      line-height: 1.4;
    }
    .apg-finding.apg-error   { background: #fff0f0; border: 1px solid #fcc; }
    .apg-finding.apg-warning { background: #fffbe6; border: 1px solid #ffe58f; }
    .apg-badge { font-size: 16px; }
    .apg-sample { color: #888; font-size: 12px; display: block; margin-top: 2px; }
    #apg-actions { display: flex; gap: 10px; justify-content: flex-end; }
    #apg-cancel {
      padding: 8px 16px;
      border-radius: 8px;
      border: 1px solid #d1d5db;
      background: #fff;
      cursor: pointer;
      font-size: 14px;
    }
    #apg-cancel:hover { background: #f3f4f6; }
    #apg-send {
      padding: 8px 16px;
      border-radius: 8px;
      border: none;
      background: #f59e0b;
      color: #fff;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
    }
    #apg-send:hover { background: #d97706; }
  `;
  document.head.appendChild(style);
}

// ─── 初期化 ───
const config = getCurrentConfig();
if (config) {
  // DOMが安定するまで少し待ってからアタッチ
  const observer = new MutationObserver(() => {
    if (document.querySelector(config.submitSelector)) {
      observer.disconnect();
      attachInterceptor(config);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // すでにDOMが存在する場合
  if (document.querySelector(config.submitSelector)) {
    attachInterceptor(config);
  }
}
