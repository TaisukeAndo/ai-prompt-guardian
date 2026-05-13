import { RULES } from "./patterns.js";

/**
 * テキストを検査して検知結果を返す
 * @param {string} text
 * @returns {{ matched: boolean, findings: Array<{id, label, severity, matches}> }}
 */
export function detectText(text) {
  const findings = [];

  for (const rule of RULES) {
    const regex = new RegExp(rule.pattern.source, rule.pattern.flags);
    const matches = [...text.matchAll(regex)].map((m) => m[0]);
    if (matches.length > 0) {
      findings.push({
        id: rule.id,
        label: rule.label,
        severity: rule.severity,
        matches: matches.slice(0, 3), // 最大3件表示
      });
    }
  }

  return {
    matched: findings.length > 0,
    hasError: findings.some((f) => f.severity === "error"),
    findings,
  };
}
