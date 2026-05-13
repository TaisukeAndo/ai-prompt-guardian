/**
 * popup.js
 * 設定の読み込み・保存・UI レンダリングを担う。
 * chrome.storage.local に { enabled, rules: { ruleId: boolean } } 形式で保存する。
 */

// ポップアップに表示するルールメタ情報（patterns.js と id を合わせること）
const RULE_META = [
  { id: "phone_jp",         label: "電話番号（日本）",       severity: "error" },
  { id: "birthday",         label: "生年月日",               severity: "error" },
  { id: "credit_card",      label: "クレジットカード番号",    severity: "error" },
  { id: "aws_access_key",   label: "AWS アクセスキー",        severity: "error" },
  { id: "github_token",     label: "GitHub トークン",         severity: "error" },
  { id: "slack_token",      label: "Slack トークン",          severity: "error" },
  { id: "password_in_text", label: "パスワード記載",          severity: "error" },
  { id: "email",            label: "メールアドレス",           severity: "warning" },
  { id: "postal_code_jp",   label: "郵便番号",                severity: "warning" },
  { id: "name_jp",          label: "氏名（様・さん付き）",     severity: "warning" },
  { id: "bank_account",     label: "銀行口座番号",             severity: "warning" },
  { id: "api_key_generic",  label: "API キー（汎用）",         severity: "warning" },
];

const STORAGE_KEY = "apgSettings";

// デフォルト設定：全ルール有効
function defaultSettings() {
  const rules = {};
  RULE_META.forEach((r) => { rules[r.id] = true; });
  return { enabled: true, rules };
}

// ─── 設定の読み込み ───
function loadSettings(callback) {
  chrome.storage.local.get(STORAGE_KEY, (data) => {
    const settings = data[STORAGE_KEY] || defaultSettings();
    // 新しいルールが追加された場合にデフォルト true で補完
    RULE_META.forEach((r) => {
      if (!(r.id in settings.rules)) settings.rules[r.id] = true;
    });
    callback(settings);
  });
}

// ─── 設定の保存 ───
function saveSettings(settings) {
  chrome.storage.local.set({ [STORAGE_KEY]: settings });
}

// ─── UI レンダリング ───
function render(settings) {
  const masterToggle = document.getElementById("master-toggle");
  const masterSection = document.getElementById("master-section");
  const masterStatusText = document.getElementById("master-status-text");
  const masterStatusSub = document.getElementById("master-status-sub");
  const ruleList = document.getElementById("rule-list");

  // マスタートグル
  masterToggle.checked = settings.enabled;
  updateMasterUI(settings.enabled, masterSection, masterStatusText, masterStatusSub);

  masterToggle.addEventListener("change", () => {
    settings.enabled = masterToggle.checked;
    updateMasterUI(settings.enabled, masterSection, masterStatusText, masterStatusSub);
    updateRuleTogglesDisabled(settings.enabled);
    saveSettings(settings);
  });

  // ルール一覧
  ruleList.innerHTML = "";
  RULE_META.forEach((meta) => {
    const enabled = settings.rules[meta.id] !== false;
    const row = document.createElement("div");
    row.className = "rule-row" + (enabled ? "" : " disabled");
    row.dataset.id = meta.id;

    row.innerHTML = `
      <div class="rule-info">
        <span class="rule-badge">${meta.severity === "error" ? "⛔" : "⚠️"}</span>
        <span class="rule-label">${meta.label}</span>
      </div>
      <label class="toggle">
        <input type="checkbox" ${enabled ? "checked" : ""}
               ${settings.enabled ? "" : "disabled"} />
        <span class="slider"></span>
      </label>
    `;

    const checkbox = row.querySelector("input");
    checkbox.addEventListener("change", () => {
      settings.rules[meta.id] = checkbox.checked;
      row.classList.toggle("disabled", !checkbox.checked);
      saveSettings(settings);
    });

    ruleList.appendChild(row);
  });
}

function updateMasterUI(enabled, section, statusText, statusSub) {
  section.classList.toggle("disabled", !enabled);
  statusText.textContent = enabled ? "保護中" : "停止中";
  statusSub.textContent = enabled
    ? "AIへの送信前に検査します"
    : "検査は無効です";
}

function updateRuleTogglesDisabled(masterEnabled) {
  document.querySelectorAll("#rule-list .toggle input").forEach((cb) => {
    cb.disabled = !masterEnabled;
  });
}

// ─── 起動 ───
loadSettings(render);
