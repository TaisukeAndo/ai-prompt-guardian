/**
 * Content Script
 * 送信イベントを同期的に捕捉し、detectText() で検査する。
 * 各サービスにつき複数のセレクタ候補を順番に試すフォールバック方式。
 */

// ─── サービスごとのセレクタ候補（上から順に試す）───
const SERVICE_CONFIGS = [
  {
    host: "chatgpt.com",
    textSelectors: [
      "#prompt-textarea",
      'div[contenteditable="true"]',
    ],
    submitSelectors: [
      'button[data-testid="send-button"]',
      'button[aria-label="Send prompt"]',
    ],
  },
  {
    host: "chat.openai.com",
    textSelectors: [
      "#prompt-textarea",
      'div[contenteditable="true"]',
    ],
    submitSelectors: [
      'button[data-testid="send-button"]',
      'button[aria-label="Send prompt"]',
    ],
  },
  {
    host: "gemini.google.com",
    textSelectors: [
      ".ql-editor",
      "rich-textarea .ql-editor",
      '[contenteditable="true"]',
      '[role="textbox"]',
    ],
    submitSelectors: [
      "button.send-button",
      'button[aria-label="Send message"]',
      'button[aria-label="送信"]',
      'button[data-mat-icon-name="send"]',
      'button[jsname]',  // Gemini特有の属性で絞る最終手段
    ],
  },
  {
    host: "claude.ai",
    textSelectors: [
      ".ProseMirror",
      '[contenteditable="true"][data-testid]',
      '[contenteditable="true"]',
    ],
    submitSelectors: [
      'button[aria-label="Send message"]',
      'button[aria-label="Send Message"]',
      'button[data-testid="send-button"]',
      'button[type="submit"]',
    ],
  },
  {
    host: "copilot.microsoft.com",
    textSelectors: [
      "#userInput",
      'textarea',
      '[contenteditable="true"]',
    ],
    submitSelectors: [
      'button[aria-label="Submit"]',
      'button[aria-label="Send"]',
      'button[type="submit"]',
    ],
  },
];

// ─── セレクタのデバッグ用ログ（DevToolsのConsoleで確認可能）───
const DEBUG = false;
function log(...args) {
  if (DEBUG) console.log("[APG]", ...args);
}

function getCurrentConfig() {
  return SERVICE_CONFIGS.find((c) => location.hostname.includes(c.host));
}

// 複数セレクタを順番に試してテキストを取得
function getPromptText(config) {
  for (const sel of config.textSelectors) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const text = (el.innerText || el.value || el.textContent || "").trim();
    if (text) {
      log(`テキスト取得: ${sel} → ${text.slice(0, 30)}...`);
      return text;
    }
  }
  return "";
}

// クリックされた要素が送信ボタンかどうかを複数セレクタで判定
function findSubmitButton(target, config) {
  for (const sel of config.submitSelectors) {
    const btn = target.closest(sel);
    if (btn) {
      log(`送信ボタン検出: ${sel}`);
      return btn;
    }
  }
  return null;
}

// ─── 警告ダイアログ ───
// callbacks: { onSend, onMask }
function showWarningDialog(result, callbacks) {
  const { onSend, onMask } = callbacks;
  document.getElementById("apg-dialog")?.remove();
  injectStyles();

  const hasError = result.hasError;

  const findingsHTML = result.findings
    .map(
      (f) => `
      <div class="apg-finding apg-${f.severity}">
        <span class="apg-badge">${f.severity === "error" ? "⛔" : "⚠️"}</span>
        <strong>${f.label}</strong>
        <span class="apg-sample">${f.matches.map(redactText).join("、")}</span>
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
        <button id="apg-cancel">キャンセル</button>
        <button id="apg-mask">🔒 情報を隠して送信</button>
        ${!hasError ? '<button id="apg-send">このまま送信</button>' : ""}
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  document.getElementById("apg-cancel").addEventListener("click", () => {
    dialog.remove();
  });
  document.getElementById("apg-overlay").addEventListener("click", () => {
    dialog.remove();
  });
  document.getElementById("apg-mask").addEventListener("click", () => {
    dialog.remove();
    if (onMask) onMask();
  });
  if (!hasError) {
    document.getElementById("apg-send").addEventListener("click", () => {
      dialog.remove();
      if (onSend) onSend();
    });
  }
}

// ダイアログ内のサンプル表示用（部分伏字）
function redactText(text) {
  if (text.length <= 4) return "****";
  return text.slice(0, 2) + "*".repeat(Math.min(text.length - 4, 6)) + text.slice(-2);
}

// ─── テキスト入力欄にマスク済みプロンプトを注入 ───
function injectText(config, text) {
  for (const sel of config.textSelectors) {
    const el = document.querySelector(sel);
    if (!el) continue;

    el.focus();

    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
      // React等のフレームワーク対応: nativeなsetterを使ってstateを更新
      const proto = el.tagName === "TEXTAREA"
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (setter) setter.call(el, text);
      el.dispatchEvent(new Event("input",  { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      // contenteditable (ProseMirror / Quill 等)
      // execCommandはReact/Vueの合成イベントにも乗るため最も互換性が高い
      document.execCommand("selectAll", false, null);
      document.execCommand("insertText", false, text);
    }

    log("テキスト注入完了:", sel);
    return true;
  }
  return false;
}

// ─── インターセプタ本体 ───
function attachInterceptor(config) {
  let bypassClick = false;
  let bypassKeydown = false;

  log("インターセプタ起動:", config.host);

  function handleDetection(text, onProceed) {
    const result = detectText(text);
    if (!result.matched) { onProceed(); return; }

    showWarningDialog(result, {
      // 「このまま送信」
      onSend: onProceed,
      // 「情報を隠して送信」
      onMask: () => {
        const { maskedText, replacements } = maskPrompt(text);
        const finalPrompt = buildFinalPrompt(maskedText, replacements);
        injectText(config, finalPrompt);
        // フレームワークのstate更新を待ってから送信
        setTimeout(onProceed, 80);
      },
    });
  }

  // 送信ボタン クリック
  document.addEventListener(
    "click",
    (e) => {
      const btn = findSubmitButton(e.target, config);
      if (!btn) return;
      if (bypassClick) { bypassClick = false; return; }

      const text = getPromptText(config);
      if (!text) return;

      e.preventDefault();
      e.stopImmediatePropagation();

      handleDetection(text, () => {
        bypassClick = true;
        btn.click();
      });
    },
    true
  );

  // Enter キー送信
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Enter" || e.shiftKey) return;
      const active = document.activeElement;
      if (!active) return;

      const isInputArea = config.textSelectors.some(
        (sel) => active.matches(sel) || !!active.closest(sel)
      );
      if (!isInputArea) return;
      if (bypassKeydown) { bypassKeydown = false; return; }

      const text = getPromptText(config);
      if (!text) return;

      e.preventDefault();
      e.stopImmediatePropagation();

      handleDetection(text, () => {
        bypassKeydown = true;
        active.focus();
        active.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Enter", bubbles: true, cancelable: true, composed: true,
          })
        );
      });
    },
    true
  );
}

// ─── スタイル注入 ───
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
      position: fixed; top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      background: #fff; border-radius: 12px; padding: 24px;
      width: 420px; max-width: 90vw;
      box-shadow: 0 8px 32px rgba(0,0,0,0.2);
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 14px; color: #1a1a1a;
    }
    #apg-header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
    #apg-icon { font-size: 22px; }
    #apg-title { font-size: 16px; font-weight: 700; }
    #apg-desc { margin: 0 0 12px; color: #555; }
    #apg-findings { display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px; }
    .apg-finding {
      display: flex; align-items: flex-start; gap: 8px;
      padding: 8px 10px; border-radius: 8px; line-height: 1.4;
    }
    .apg-finding.apg-error   { background: #fff0f0; border: 1px solid #fcc; }
    .apg-finding.apg-warning { background: #fffbe6; border: 1px solid #ffe58f; }
    .apg-badge { font-size: 16px; }
    .apg-sample { color: #888; font-size: 12px; display: block; margin-top: 2px; }
    #apg-actions { display: flex; gap: 10px; justify-content: flex-end; }
    #apg-cancel {
      padding: 8px 16px; border-radius: 8px;
      border: 1px solid #d1d5db; background: #fff;
      cursor: pointer; font-size: 14px;
    }
    #apg-cancel:hover { background: #f3f4f6; }
    #apg-mask {
      padding: 8px 16px; border-radius: 8px;
      border: none; background: #3b82f6; color: #fff;
      cursor: pointer; font-size: 14px; font-weight: 600;
    }
    #apg-mask:hover { background: #2563eb; }
    #apg-send {
      padding: 8px 16px; border-radius: 8px;
      border: none; background: #f59e0b; color: #fff;
      cursor: pointer; font-size: 14px; font-weight: 600;
    }
    #apg-send:hover { background: #d97706; }
  `;
  document.head.appendChild(style);
}

// ─── 初期化 ───
(function init() {
  const config = getCurrentConfig();
  if (!config) return;

  let attached = false;

  function tryAttach() {
    if (attached) return;
    // いずれかの送信ボタンがDOMに存在すればアタッチ
    const found = config.submitSelectors.some(
      (sel) => !!document.querySelector(sel)
    );
    if (found) {
      attached = true;
      attachInterceptor(config);
    }
  }

  tryAttach();

  if (!attached) {
    const observer = new MutationObserver(tryAttach);
    observer.observe(document.body, { childList: true, subtree: true });
  }
})();
