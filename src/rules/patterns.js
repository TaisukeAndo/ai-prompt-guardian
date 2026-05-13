/**
 * 検知ルール定義
 * 各ルールは { id, label, maskLabel, pattern, severity } の形式
 * severity:  "error"（送信ブロック推奨）/ "warning"（警告のみ）
 * maskLabel: マスキング後のプレースホルダーに使うラベル名
 */

// content scriptとして複数ファイルで順番に読み込まれるため、exportは使わない
// eslint-disable-next-line no-unused-vars
const RULES = [
  // ─── 個人情報 ───
  {
    id: "phone_jp",
    label: "電話番号（日本）",
    maskLabel: "電話番号",
    pattern: /0\d{1,4}[-\s]?\d{1,4}[-\s]?\d{4}/g,
    severity: "error",
  },
  {
    id: "email",
    label: "メールアドレス",
    maskLabel: "メールアドレス",
    pattern: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
    severity: "warning",
  },
  {
    id: "postal_code_jp",
    label: "郵便番号（日本）",
    maskLabel: "郵便番号",
    pattern: /〒?\d{3}[-\s]?\d{4}/g,
    severity: "warning",
  },
  {
    id: "name_jp",
    label: "氏名（様・殿・さん付き）",
    maskLabel: "氏名",
    pattern: /[一-鿿]{2,5}[様殿さんくん氏]/g,
    severity: "warning",
  },
  {
    id: "birthday",
    label: "生年月日",
    maskLabel: "生年月日",
    pattern: /(19|20)\d{2}[年\/\-](0?[1-9]|1[0-2])[月\/\-](0?[1-9]|[12]\d|3[01])日?/g,
    severity: "error",
  },

  // ─── 金融情報 ───
  {
    id: "credit_card",
    label: "クレジットカード番号",
    maskLabel: "カード番号",
    pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
    severity: "error",
  },
  {
    id: "bank_account",
    label: "銀行口座番号",
    maskLabel: "口座番号",
    pattern: /\b\d{7}\b/g,
    severity: "warning",
  },

  // ─── 認証情報 ───
  {
    id: "api_key_generic",
    label: "APIキー（汎用）",
    maskLabel: "APIキー",
    pattern: /[a-zA-Z0-9_\-]{20,}(?=[^\w]|$)/g,
    severity: "warning",
  },
  {
    id: "aws_access_key",
    label: "AWS アクセスキー",
    maskLabel: "AWSキー",
    pattern: /AKIA[0-9A-Z]{16}/g,
    severity: "error",
  },
  {
    id: "github_token",
    label: "GitHub トークン",
    maskLabel: "GitHubトークン",
    pattern: /ghp_[a-zA-Z0-9]{36}/g,
    severity: "error",
  },
  {
    id: "slack_token",
    label: "Slack トークン",
    maskLabel: "Slackトークン",
    pattern: /xox[baprs]-[0-9a-zA-Z\-]{10,}/g,
    severity: "error",
  },
  {
    id: "password_in_text",
    label: "パスワード（テキスト内）",
    maskLabel: "パスワード",
    pattern: /password[=:\s「『【]?\s*\S+/gi,
    severity: "error",
  },
];
