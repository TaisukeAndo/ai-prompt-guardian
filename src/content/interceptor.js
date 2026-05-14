/**
 * Content Script
 * 送信イベントを同期的に捕捉し、detectText() で検査する。
 *
 * 設計方針:
 *  - attachInterceptor() はページ読み込み時に必ず実行（ボタン検出を条件にしない）
 *  - ボタン検出は「専用セレクタ → 汎用フォールバック」の2段階
 *  - 再送信時は DOM を再検索（React 再レンダリングによるステール参照を回避）
 *  - Enter キーの bypass は button.click() を優先（ProseMirror との互換性向上）
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
    textSelectors: [
      ".ProseMirror",
      '[contenteditable="true"]',
      '[role="textbox"]',
    ],
    submitSelectors: [
      'button[aria-label="Send message"]',
      'button[aria-label="Send Message"]',
      'button[aria-label="メッセージを送信"]',
      'button[data-testid="send-button"]',
      'button[data-testid="composer-submit-button"]',
      '[role="button"][aria-label="Send message"]',
      '[role="button"][aria-label="Send Message"]',
    ],
  },
  {
    host: "copilot.microsoft.com",
    textSelectors: [
      'textarea',
      'div[contenteditable="true"]',
      '[role="textbox"]',
    ],
    submitSelectors: [
      'button[aria-label="Submit"]',
      'button[aria-label="Send"]',
      'button[aria-label="送信"]',
      'button[type="submit"]',
      'button[data-testid="submit-button"]',
      '[role="button"][aria-label="Submit"]',
      '[role="button"][aria-label="Send"]',
    ],
  },
];

function getCurrentConfig() {
  return SERVICE_CONFIGS.find((c) => location.hostname.includes(c.host));
}

// ─── ボタン検出（クリックイベントから: 専用セレクタ → 汎用フォールバック）───
function findSubmitButton(target, config) {
  for (const sel of config.submitSelectors) {
    const btn = target.closest(sel);
    if (btn) return btn;
  }

  // button または role="button" を探す
  const btn = target.closest("button") || target.closest('[role="button"]');
  if (!btn) return null;

  const ariaLabel = (btn.getAttribute("aria-label") || "").toLowerCase();
  const testId    = (btn.dataset.testid || "").toLowerCase();
  const title     = (btn.getAttribute("title") || "").toLowerCase();
  const isSendLike =
    ariaLabel.includes("send") ||
    ariaLabel.includes("送信") ||
    ariaLabel.includes("submit") ||
    testId.includes("send") ||
    testId.includes("submit") ||
    title.includes("send") ||
    title.includes("送信");

  return isSendLike ? btn : null;
}

// ─── ボタン再検索（ダイアログ後: React 再レンダリングでステール参照を回避）───
function findFreshSubmitButton(config) {
  const dialog = document.getElementById("apg-dialog");
  for (const sel of config.submitSelectors) {
    const btn = document.querySelector(sel);
    if (btn && !dialog?.contains(btn)) return btn;
  }
  for (const btn of document.querySelectorAll('button, [role="button"]')) {
    if (dialog?.contains(btn)) continue; // ダイアログ内は除外
    const ariaLabel = (btn.getAttribute("aria-label") || "").toLowerCase();
    const testId    = (btn.dataset.testid || "").toLowerCase();
    const title     = (btn.getAttribute("title") || "").toLowerCase();
    if (
      ariaLabel.includes("send") || ariaLabel.includes("送信") || ariaLabel.includes("submit") ||
      testId.includes("send")    || testId.includes("submit") ||
      title.includes("send")     || title.includes("送信")
    ) return btn;
  }
  return null;
}

// ─── テキスト取得（専用セレクタ → アクティブ要素）───
function getPromptText(config) {
  for (const sel of config.textSelectors) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const text = (el.innerText || el.value || el.textContent || "").trim();
    if (text) return text;
  }

  const active = document.activeElement;
  if (active && (active.isContentEditable || active.tagName === "TEXTAREA" || active.tagName === "INPUT")) {
    const text = (active.innerText || active.value || "").trim();
    if (text) return text;
  }

  return "";
}

// ─── 警告ダイアログ ───
const SHIELD_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V7L12 2z" fill="white" fill-opacity="0.9"/>
  <path d="M9 12l2 2 4-4" stroke="#1e3a5f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

function showWarningDialog(result, callbacks) {
  const { onSend, onMask } = callbacks;
  document.getElementById("apg-dialog")?.remove();
  injectStyles();

  const hasError = result.hasError;
  const findingsHTML = result.findings
    .map((f) => `
      <div class="apg-finding apg-${f.severity}">
        <span class="apg-dot apg-dot-${f.severity}">!</span>
        <div>
          <strong>${f.label}</strong>
          <span class="apg-sample">${f.matches.map(redactText).join(", ")}</span>
        </div>
      </div>`)
    .join("");

  const dialog = document.createElement("div");
  dialog.id = "apg-dialog";
  dialog.innerHTML = `
    <div id="apg-overlay"></div>
    <div id="apg-modal">
      <div id="apg-header">
        <span id="apg-icon">${SHIELD_SVG}</span>
        <span id="apg-title">Review before sending</span>
      </div>
      <div id="apg-body">
        <p id="apg-desc">Sensitive information may be included in your prompt:</p>
        <div id="apg-findings">${findingsHTML}</div>
      </div>
      <div id="apg-actions">
        <button id="apg-cancel">Cancel</button>
        <button id="apg-mask">Mask &amp; Send</button>
        ${!hasError ? '<button id="apg-send">Send Anyway</button>' : ""}
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
  let bypassClick   = false;
  let bypassKeydown = false;

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
    // 自分のダイアログ内のクリックは処理しない
    if (e.target.closest("#apg-dialog")) return;

    const btn = findSubmitButton(e.target, config);
    if (!btn) return;

    if (bypassClick) { bypassClick = false; return; }

    const text = getPromptText(config);
    if (!text) return;

    e.preventDefault();
    e.stopImmediatePropagation();

    handleDetection(text, () => {
      bypassClick = true;
      // React が再レンダリングしてもボタンを取得できるよう DOM を再検索する
      const freshBtn = findFreshSubmitButton(config) || btn;
      freshBtn.click();
    });
  }, true);

  // ─── Enter キー ───
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    if (e.isComposing) return; // IME 変換確定は無視

    const active = document.activeElement;
    if (!active) return;

    const isInputArea = config.textSelectors.some(
      (sel) => active.matches?.(sel) || !!active.closest?.(sel)
    );
    const isGenericInput = active.isContentEditable || active.tagName === "TEXTAREA";
    if (!isInputArea && !isGenericInput) return;

    if (bypassKeydown) { bypassKeydown = false; return; }

    const text = getPromptText(config);
    if (!text) return;

    e.preventDefault();
    e.stopImmediatePropagation();

    handleDetection(text, () => {
      bypassKeydown = true;
      // ボタンクリックを優先（ProseMirror への synthetic keydown より確実）
      const submitBtn = findFreshSubmitButton(config);
      if (submitBtn) {
        bypassClick = true;
        submitBtn.click();
      } else {
        // フォールバック: Enter キー再送出
        active.focus();
        active.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, composed: true })
        );
      }
    });
  }, true);
}

// ─── ダイアログスタイル ───
function injectStyles() {
  if (document.getElementById("apg-styles")) return;
  const style = document.createElement("style");
  style.id = "apg-styles";
  style.textContent = `
    #apg-overlay{position:fixed;inset:0;background:rgba(15,23,42,.6);backdrop-filter:blur(3px);z-index:2147483646;}
    #apg-modal{
      position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
      background:#fff;border-radius:16px;width:440px;max-width:92vw;
      box-shadow:0 24px 64px rgba(15,23,42,.3);z-index:2147483647;overflow:hidden;
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:14px;color:#1e293b;
    }
    #apg-header{
      display:flex;align-items:center;gap:10px;
      padding:15px 20px;
      background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%);color:#fff;
    }
    #apg-icon{display:flex;align-items:center;}
    #apg-title{font-size:15px;font-weight:700;letter-spacing:.01em;}
    #apg-body{padding:16px 20px 4px;}
    #apg-desc{margin-bottom:12px;color:#64748b;font-size:13px;}
    #apg-findings{display:flex;flex-direction:column;gap:8px;margin-bottom:8px;}
    .apg-finding{display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border-radius:10px;line-height:1.5;}
    .apg-finding.apg-error  {background:#fef2f2;border:1px solid #fecaca;}
    .apg-finding.apg-warning{background:#fffbeb;border:1px solid #fde68a;}
    .apg-dot{
      width:20px;height:20px;border-radius:50%;
      display:inline-flex;align-items:center;justify-content:center;
      color:#fff;font-size:11px;font-weight:700;flex-shrink:0;margin-top:1px;
    }
    .apg-dot-error{background:#ef4444;}
    .apg-dot-warning{background:#f59e0b;}
    .apg-finding strong{color:#1e293b;font-weight:600;font-size:13px;}
    .apg-sample{color:#94a3b8;font-size:11px;display:block;margin-top:2px;font-family:monospace;}
    #apg-actions{
      display:flex;gap:8px;justify-content:flex-end;
      padding:12px 20px 16px;border-top:1px solid #f1f5f9;background:#f8fafc;
    }
    #apg-cancel{
      padding:8px 16px;border-radius:8px;border:1px solid #e2e8f0;background:#fff;
      cursor:pointer;font-size:13px;color:#475569;font-family:inherit;font-weight:500;transition:background .15s;
    }
    #apg-cancel:hover{background:#f8fafc;}
    #apg-mask{
      padding:8px 16px;border-radius:8px;border:none;background:#2563eb;color:#fff;
      cursor:pointer;font-size:13px;font-weight:600;font-family:inherit;transition:background .15s;
    }
    #apg-mask:hover{background:#1d4ed8;}
    #apg-send{
      padding:8px 16px;border-radius:8px;border:1px solid #e2e8f0;background:#fff;color:#475569;
      cursor:pointer;font-size:13px;font-weight:500;font-family:inherit;transition:background .15s;
    }
    #apg-send:hover{background:#f8fafc;}
  `;
  document.head.appendChild(style);
}

// ─── 初期化 ───
(function init() {
  const config = getCurrentConfig();
  if (!config) return;

  if (document.body) {
    attachInterceptor(config);
  } else {
    document.addEventListener("DOMContentLoaded", () => attachInterceptor(config));
  }
})();
