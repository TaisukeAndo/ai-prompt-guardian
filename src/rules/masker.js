/**
 * マスキングロジック
 * RULES（patterns.js）を使って検知された値をプレースホルダーに置換し、
 * AI が文脈を正しく理解できるようにプリアンブルを付与する。
 *
 * 例:
 *   「田中様の電話番号は090-1234-5678です」
 *   → 「[氏名A]の電話番号は[電話番号A]です」
 *   + プリアンブル（AIへの注釈）
 */

// ─── テキストをマスキングして置換マップを返す ───
function maskPrompt(text) { // eslint-disable-line no-unused-vars
  const labelCounters = {};
  const replacements = []; // { placeholder, label } の配列（AI向け注釈に使う）
  let maskedText = text;

  for (const rule of RULES) {
    // まずマッチするか確認（コストの安いテスト）
    const testRegex = new RegExp(rule.pattern.source, rule.pattern.flags);
    if (!testRegex.test(maskedText)) continue;

    if (!(rule.id in labelCounters)) labelCounters[rule.id] = 0;

    const replaceRegex = new RegExp(rule.pattern.source, rule.pattern.flags);
    maskedText = maskedText.replace(replaceRegex, (match) => {
      const letter = String.fromCharCode(65 + labelCounters[rule.id]++); // A, B, C...
      const placeholder = `[${rule.maskLabel}${letter}]`;
      replacements.push({ original: match, placeholder, label: rule.maskLabel });
      return placeholder;
    });
  }

  return { maskedText, replacements };
}

// ─── マスク済みテキストにAI向けプリアンブルを付与する ───
// プリアンブルにより「[電話番号A]」が何を指すかをAIが把握でき、
// 回答の精度・自然さを維持する。
function buildFinalPrompt(maskedText, replacements) { // eslint-disable-line no-unused-vars
  if (replacements.length === 0) return maskedText;

  const itemLines = replacements.map((r) => `  ${r.placeholder}：実際の${r.label}`);

  const preamble = [
    "【AI Prompt Guardian：自動マスキング済み】",
    "以下のメッセージでは個人情報・機密情報が自動的にプレースホルダーへ置換されています。",
    ...itemLines,
    "各プレースホルダーは実際の値を表しているものとして、以下のリクエストに自然に回答してください。",
    "",
    "---",
    "",
  ].join("\n");

  return preamble + maskedText;
}
