/**
 * popup.js
 */

const RULE_META = [
  // ─── Critical (always visible) ───
  { id: "phone_jp",         label: "Phone number (JP)",      severity: "error" },
  { id: "birthday",         label: "Date of birth",          severity: "error" },
  { id: "credit_card",      label: "Credit card number",     severity: "error" },
  { id: "aws_access_key",   label: "AWS access key",         severity: "error" },
  { id: "github_token",     label: "GitHub token",           severity: "error" },
  { id: "slack_token",      label: "Slack token",            severity: "error" },
  { id: "password_in_text", label: "Password in text",       severity: "error" },
  // ─── Advanced (collapsible) ───
  { id: "email",            label: "Email address",          severity: "warning" },
  { id: "postal_code_jp",   label: "Postal code (JP)",       severity: "warning" },
  { id: "name_jp",          label: "Japanese name (honorific)", severity: "warning" },
  { id: "bank_account",     label: "Bank account number",    severity: "warning" },
  { id: "api_key_generic",  label: "Generic API key",        severity: "warning" },
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

// ─── Rule rows ───
function buildRuleRows(rules, container, settings) {
  rules.forEach((meta) => {
    const enabled   = settings.rules[meta.id] !== false;
    const iconName  = meta.severity === "error" ? "dangerous" : "warning";
    const iconClass = meta.severity === "error" ? "error-icon" : "warning-icon";
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

// ─── Master UI ───
function updateMasterUI(enabled) {
  const section = document.getElementById("master-section");
  const icon    = document.getElementById("master-icon");
  const text    = document.getElementById("master-status-text");
  const sub     = document.getElementById("master-status-sub");
  section.classList.toggle("disabled", !enabled);
  if (icon) icon.textContent = enabled ? "verified_user" : "gpp_bad";
  text.textContent = enabled ? "Protected" : "Disabled";
  sub.textContent  = enabled ? "Scanning prompts before send" : "Inspection is off";
}

function setAllTogglesDisabled(disabled) {
  document.querySelectorAll(".rule-row .toggle input").forEach((cb) => {
    cb.disabled = disabled;
  });
}

// ─── Detail toggle ───
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
  if (isOpen) { label.textContent = "Close Advanced"; return; }
  const note = offCount > 0 ? ` (${offCount} off)` : "";
  label.textContent = `Advanced${note}`;
}

// ─── Render ───
function render(settings) {
  const masterToggle = document.getElementById("master-toggle");
  masterToggle.checked = settings.enabled;
  updateMasterUI(settings.enabled);
  masterToggle.addEventListener("change", () => {
    settings.enabled = masterToggle.checked;
    updateMasterUI(settings.enabled);
    setAllTogglesDisabled(!settings.enabled);
    saveSettings(settings);
  });

  buildRuleRows(PRIMARY_RULES,   document.getElementById("rule-list-primary"),   settings);
  buildRuleRows(SECONDARY_RULES, document.getElementById("rule-list-secondary"), settings);

  const offCount = SECONDARY_RULES.filter((r) => settings.rules[r.id] === false).length;
  updateDetailLabel(false, offCount);
  initDetailToggle();
}

loadSettings(render);
