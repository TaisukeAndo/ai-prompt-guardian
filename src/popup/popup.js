/**
 * popup.js
 * 設定の読み込み・保存・UIレンダリングを担う。
 * error ルールは常時表示、warning ルールは詳細設定として折りたたむ。
 */

const RULE_META = [
  // ─── 常時表示（重要） ───
  { id: "phone_jp",         label: "電話番号（日本）",      severity: "error" },
  { id: "birthday",         label: "生年月日",              severity: "error" },
  { id: "credit_card",      label: "クレジットカード番号",   severity: "error" },
  { id: "aws_access_key",   label: "AWS アクセスキー",       severity: "error" },
  { id: "github_token",     label: "GitHub トークン",        severity: "error" },
  { id: "slack_token",      label: "Slack トークン",         severity: "error" },
  { id: "password_in_text", label: "パスワード記載",         severity: "error" },
  // ─── 詳細設定（折りたたみ） ───
  { id: "email",            label: "メールアドレス",          severity: "warning" },
  { id: "postal_code_jp",   label: "郵便番号",               severity: "warning" },
  { id: "name_jp",          label: "氏名（様・さん付き）",    severity: "warning" },
  { id: "bank_account",     label: "銀行口座番号",            severity: "warning" },
  { id: "api_key_generic",  label: "API キー（汎用）",        severity: "warning" },
];

const PRIMARY_RULES   = RULE_META.filter((r) => r.severity === "error");
const SECONDARY_RULES = RULE_META.filter((r) => r.severity === "warning");

const STORAGE_KEY = "apgSettings";

function defaultSettings() {
  const rules = {};
  RULE_META.forEach((r) => { rules[r.id] = true; });
  return { enabled: true, rules };
}

function loadSettings(callback) {
  chrome.storage.local.get(STORAGE_KEY, (data) => {
    const settings = data[STORAGE_KEY] || defaultSettings();
    RULE_META.forEach((r) => {
      if (!(r.id in settings.rules)) settings.rules[r.id] = true;
    });
    callback(settings);
  });
}

function saveSettings(settings) {
  chrome.storage.local.set({ [STORAGE_KEY]: settings });
}

// ─── ルール行を生成してコンテナに追加 ───
function buildRuleRows(rules, container, settings) {
  rules.forEach((meta) => {
    const enabled    = settings.rules[meta.id] !== false;
    const iconName   = meta.severity === "error" ? "dangerous" : "warning";
    const iconClass  = meta.severity === "error" ? "error-icon" : "warning-icon";
    const row = document.createElement("div");
    row.className = "rule-row" + (enabled ? "" : " rule-off");
    row.dataset.id = meta.id;
    row.innerHTML = `
      <div class="rule-info">
        <span class="material-symbols-outlined rule-badge ${iconClass}">${iconName}</span>
        <span class="rule-label">${meta.label}</span>
      </div>
      <label class="toggle">
        <input type="checkbox" ${enabled ? "checked" : ""}
               ${settings.enabled ? "" : "disabled"} />
        <span class="slider"></span>
      </label>
    `;
    row.querySelector("input").addEventListener("change", (e) => {
      settings.rules[meta.id] = e.target.checked;
      row.classList.toggle("rule-off", !e.target.checked);
      saveSettings(settings);
    });
    container.appendChild(row);
  });
}

// ─── マスターUIの更新 ───
function updateMasterUI(enabled) {
  const section = document.getElementById("master-section");
  const icon    = document.getElementById("master-icon");
  const text    = document.getElementById("master-status-text");
  const sub     = document.getElementById("master-status-sub");
  section.classList.toggle("disabled", !enabled);
  if (icon) icon.textContent = enabled ? "verified_user" : "gpp_bad";
  text.textContent = enabled ? "保護中" : "停止中";
  sub.textContent  = enabled ? "AIへの送信前に検査します" : "検査は無効です";
}

function setAllTogglesDisabled(disabled) {
  document.querySelectorAll(".rule-row .toggle input").forEach((cb) => {
    cb.disabled = disabled;
  });
}

// ─── 詳細設定の開閉 ───
function initDetailToggle() {
  const btn  = document.getElementById("detail-toggle");
  const body = document.getElementById("detail-body");

  btn.addEventListener("click", () => {
    const isOpen = body.classList.toggle("open");
    btn.setAttribute("aria-expanded", isOpen);

    const offCount = SECONDARY_RULES.filter(
      (r) => document.querySelector(`.rule-row[data-id="${r.id}"] input`)?.checked === false
    ).length;
    updateDetailLabel(isOpen, offCount);
  });
}

function updateDetailLabel(isOpen, offCount) {
  const label = document.getElementById("detail-label");
  if (isOpen) {
    label.textContent = "詳細設定を閉じる";
    return;
  }
  const disabledNote = offCount > 0 ? `（${offCount}件 OFF）` : "";
  label.textContent = `詳細設定${disabledNote}`;
}

// ─── 初期レンダリング ───
function render(settings) {
  // マスタートグル
  const masterToggle = document.getElementById("master-toggle");
  masterToggle.checked = settings.enabled;
  updateMasterUI(settings.enabled);
  masterToggle.addEventListener("change", () => {
    settings.enabled = masterToggle.checked;
    updateMasterUI(settings.enabled);
    setAllTogglesDisabled(!settings.enabled);
    saveSettings(settings);
  });

  // 重要ルール（常時表示）
  buildRuleRows(PRIMARY_RULES, document.getElementById("rule-list-primary"), settings);

  // 詳細設定（折りたたみ）
  buildRuleRows(SECONDARY_RULES, document.getElementById("rule-list-secondary"), settings);

  // 詳細ラベルの初期テキスト
  const offCount = SECONDARY_RULES.filter((r) => settings.rules[r.id] === false).length;
  updateDetailLabel(false, offCount);

  initDetailToggle();
}

loadSettings(render);
