/**
 * Content Script
 * 送信イベントを同期的に捕捉し、detectText() で検査する。
 *
 * 設計方針:
 *  - attachInterceptor() はページ読み込み時に必ず実行（ボタン検出を条件にしない）
 *  - ボタン検出は「専用セレクタ → 汎用フォールバック」の2段階
 *  - テキスト取得は「専用セレクタ → アクティブ要素」の2段階
 */

// ─── サービスごとのセレクタ候補 ───
const SERVICE_CONFIGS = [
  {
    host: "chatgpt.com",
    textSelectors: ["#prompt-textarea", 'div[contenteditable="true"]'],
    submitSelectors: ['button[data-testid="send-button"]', 'button[aria-label="Send prompt"]'],
  },
  {
    host: "chat.openai.com",
    textSelectors: ["#prompt-textarea", 'div[contenteditable="true"]'],
    submitSelectors: ['button[data-testid="send-button"]', 'button[aria-label="Send prompt"]'],
  },
  {
    host: "gemini.google.com",
    textSelectors: [".ql-editor", "rich-textarea .ql-editor", '[contenteditable="true"]', '[role="textbox"]'],
    submitSelectors: ["button.send-button", 'button[aria-label="Send message"]', 'button[aria-label="送信"]'],
  },
  {
    host: "claude.ai",
    textSelectors: [".ProseMirror", '[contenteditable="true"][data-testid]', '[contenteditable="true"]'],
    submitSelectors: ['button[aria-label="Send message"]', 'button[aria-label="Send Message"]', 'button[data-testid="send-button"]'],
  },
  {
    host: "copilot.microsoft.com",
    textSelectors: ["#userInput", "textarea", '[contenteditable="true"]'],
    submitSelectors: ['button[aria-label="Submit"]', 'button[aria-label="Send"]'],
  },
];

function getCurrentConfig() {
  return SERVICE_CONFIGS.find((c) => location.hostname.includes(c.host));
}

// ─── ボタン検出（専用セレクタ → 汎用フォールバック）───
function findSubmitButton(target, config) {
  // 専用セレクタで検索
  for (const sel of config.submitSelectors) {
    const btn = target.closest(sel);
    if (btn) return btn;
  }

  // 汎用フォールバック: aria-label / data-testid にsend/送信/submitを含むボタン
  const btn = target.closest("button");
  if (!btn) return null;

  const ariaLabel = (btn.getAttribute("aria-label") || "").toLowerCase();
  const testId    = (btn.dataset.testid || "").toLowerCase();
  const isSendLike =
    ariaLabel.includes("send") ||
    ariaLabel.includes("送信") ||
    ariaLabel.includes("submit") ||
    testId.includes("send") ||
    testId.includes("submit");

  return isSendLike ? btn : null;
}

// ─── テキスト取得（専用セレクタ → アクティブ要素）───
function getPromptText(config) {
  // 専用セレクタで検索
  for (const sel of config.textSelectors) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const text = (el.innerText || el.value || el.textContent || "").trim();
    if (text) return text;
  }

  // フォールバック: フォーカス中の入力要素
  const active = document.activeElement;
  if (active && (active.isContentEditable || active.tagName === "TEXTAREA" || active.tagName === "INPUT")) {
    const text = (active.innerText || active.value || "").trim();
    if (text) return text;
  }

  return "";
}

// ─── 警告ダイアログ ───
function showWarningDialog(result, callbacks) {
  const { onSend, onMask } = callbacks;
  document.getElementById("apg-dialog")?.remove();
  injectStyles();

  const hasError = result.hasError;
  const findingsHTML = result.findings
    .map((f) => `
      <div class="apg-finding apg-${f.severity}">
        <span class="apg-badge">${f.severity === "error" ? "⛔" : "⚠️"}</span>
        <strong>${f.label}</strong>
        <span class="apg-sample">${f.matches.map(redactText).join("、")}</span>
      </div>`)
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

  document.getElementById("apg-cancel").addEventListener("click", () => dialog.remove());
  document.getElementById("apg-overlay").addEventListener("click", () => dialog.remove());
  document.getElementById("apg-mask").addEventListener("click", () => { dialog.remove(); onMask?.(); });
  if (!hasError) {
    document.getElementById("apg-send").addEventListener("click", () => { dialog.remove(); onSend?.(); });
  }
}

function redactText(text) {
  if (text.length <= 4) return "****";
  return text.slice(0, 2) + "*".repeat(Math.min(text.length - 4, 6)) + text.slice(-2);
}

// ─── テキスト注入（マスキング後の送信用）───
function injectText(config, text) {
  for (const sel of config.textSelectors) {
    const el = document.querySelector(sel);
    if (!el) continue;
    el.focus();
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
      const proto  = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (setter) setter.call(el, text);
      el.dispatchEvent(new Event("input",  { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      document.execCommand("selectAll", false, null);
      document.execCommand("insertText", false, text);
    }
    return true;
  }
  return false;
}

// ─── インターセプタ本体 ───
function attachInterceptor(config) {
  let bypassClick    = false;
  let bypassKeydown  = false;

  console.info("[APG] インターセプタ起動:", config.host);

  function handleDetection(text, onProceed) {
    if (!__APGSettings.enabled) { onProceed(); return; }

    const result = detectText(text, __APGSettings.rules);
    if (!result.matched) { onProceed(); return; }

    showWarningDialog(result, {
      onSend: onProceed,
      onMask: () => {
        const { maskedText, replacements } = maskPrompt(text);
        injectText(config, buildFinalPrompt(maskedText, replacements));
        setTimeout(onProceed, 80);
      },
    });
  }

  // ─── クリック ───
  document.addEventListener("click", (e) => {
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
  }, true);

  // ─── Enter キー ───
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    if (e.isComposing) return; // IME変換確定のEnterは無視

    const active = document.activeElement;
    if (!active) return;

    const isInputArea = config.textSelectors.some(
      (sel) => active.matches?.(sel) || !!active.closest?.(sel)
    );
    // フォールバック: isContentEditable / textarea でもOK
    const isGenericInput = active.isContentEditable || active.tagName === "TEXTAREA";
    if (!isInputArea && !isGenericInput) return;

    if (bypassKeydown) { bypassKeydown = false; return; }

    const text = getPromptText(config);
    if (!text) return;

    e.preventDefault();
    e.stopImmediatePropagation();

    handleDetection(text, () => {
      bypassKeydown = true;
      active.focus();
      active.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, composed: true })
      );
    });
  }, true);
}

// ─── スタイル ───
function injectStyles() {
  if (document.getElementById("apg-styles")) return;
  const style = document.createElement("style");
  style.id = "apg-styles";
  style.textContent = `
    #apg-overlay { position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:2147483646; }
    #apg-modal {
      position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
      background:#fff;border-radius:12px;padding:24px;width:420px;max-width:90vw;
      box-shadow:0 8px 32px rgba(0,0,0,.2);z-index:2147483647;
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:14px;color:#1a1a1a;
    }
    #apg-header{display:flex;align-items:center;gap:8px;margin-bottom:12px;}
    #apg-icon{font-size:22px;}
    #apg-title{font-size:16px;font-weight:700;}
    #apg-desc{margin:0 0 12px;color:#555;}
    #apg-findings{display:flex;flex-direction:column;gap:8px;margin-bottom:20px;}
    .apg-finding{display:flex;align-items:flex-start;gap:8px;padding:8px 10px;border-radius:8px;line-height:1.4;}
    .apg-finding.apg-error  {background:#fff0f0;border:1px solid #fcc;}
    .apg-finding.apg-warning{background:#fffbe6;border:1px solid #ffe58f;}
    .apg-badge{font-size:16px;}
    .apg-sample{color:#888;font-size:12px;display:block;margin-top:2px;}
    #apg-actions{display:flex;gap:10px;justify-content:flex-end;}
    #apg-cancel{padding:8px 16px;border-radius:8px;border:1px solid #d1d5db;background:#fff;cursor:pointer;font-size:14px;}
    #apg-cancel:hover{background:#f3f4f6;}
    #apg-mask{padding:8px 16px;border-radius:8px;border:none;background:#3b82f6;color:#fff;cursor:pointer;font-size:14px;font-weight:600;}
    #apg-mask:hover{background:#2563eb;}
    #apg-send{padding:8px 16px;border-radius:8px;border:none;background:#f59e0b;color:#fff;cursor:pointer;font-size:14px;font-weight:600;}
    #apg-send:hover{background:#d97706;}
  `;
  document.head.appendChild(style);
}

// ─── 初期化（ボタンの有無に関係なく必ず実行）───
(function init() {
  const config = getCurrentConfig();
  if (!config) return;

  // SPAはDOMが遅延構築されるため、body が存在すれば即時・なければ待機
  if (document.body) {
    attachInterceptor(config);
  } else {
    document.addEventListener("DOMContentLoaded", () => attachInterceptor(config));
  }
})();
