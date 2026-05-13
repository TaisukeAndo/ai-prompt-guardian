// RULES は patterns.js が先に読み込まれることでグローバルに利用可能

/**
 * テキストを検査して検知結果を返す
 * @param {string} text
 * @returns {{ matched: boolean, hasError: boolean, findings: Array }}
 */
function detectText(text) { // eslint-disable-line no-unused-vars
  const findings = [];

  for (const rule of RULES) {
    const regex = new RegExp(rule.pattern.source, rule.pattern.flags);
    const matches = [...text.matchAll(regex)].map((m) => m[0]);
    if (matches.length > 0) {
      findings.push({
        id: rule.id,
        label: rule.label,
        severity: rule.severity,
        matches: matches.slice(0, 3),
      });
    }
  }

  return {
    matched: findings.length > 0,
    hasError: findings.some((f) => f.severity === "error"),
    findings,
  };
}
