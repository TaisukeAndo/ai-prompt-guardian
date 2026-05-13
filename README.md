# AI Prompt Guardian

AIサービス（ChatGPT・Gemini・Claude.ai・Copilot）へ送るプロンプトに、**個人情報・機密情報が含まれていないかをローカルで検知する** Chrome 拡張機能。

> **すべての検査処理はブラウザ内で完結します。プロンプトデータが外部サーバーに送られることはありません。**

---

## 検知対象

| 種別 | 項目 | 重要度 |
|---|---|---|
| 個人情報 | 電話番号・生年月日・氏名（様/さん付き）・郵便番号 | ⛔ error / ⚠️ warning |
| 金融情報 | クレジットカード番号・銀行口座番号 | ⛔ error |
| 認証情報 | AWS アクセスキー・GitHub トークン・Slack トークン・パスワード記載 | ⛔ error |
| その他 | メールアドレス | ⚠️ warning |

- **error**：送信ブロック（「このまま送信」ボタンなし）
- **warning**：警告のみ（確認後に送信可能）

---

## 対応サービス

- [ChatGPT](https://chatgpt.com)
- [Gemini](https://gemini.google.com)
- [Claude.ai](https://claude.ai)
- [Microsoft Copilot](https://copilot.microsoft.com)

---

## 要件定義

### 機能要件

1. 各 AI サービスの送信ボタン押下・Enter キー送信を捕捉する
2. プロンプトテキストを正規表現ルールで検査する
3. 検知した場合はモーダルダイアログで警告を表示する
4. `error` 判定の項目が含まれる場合は送信をブロックする
5. `warning` 判定のみの場合は「このまま送信」でスキップ可能にする

### 非機能要件

1. **ローカル完結**：検査処理は一切外部に通信しない
2. **低レイテンシ**：送信インターセプトで体感できる遅延を生じさせない（目標 50ms 以内）
3. **プライバシー**：プロンプト内容はログに記録しない
4. **可搬性**：追加インストール不要（Chrome に拡張機能を追加するだけ）

### 将来対応（Phase 2 以降）

- 社内カスタム辞書（機密プロジェクト名・顧客名）の登録 UI
- 画像添付の OCR 検査（Tesseract.js）
- Claude Code CLI・API スクリプト向けのローカルプロキシ連携

---

## ディレクトリ構成

```
ai-prompt-guardian/
├── manifest.json              # 拡張機能設定（Manifest V3）
├── icons/                     # アイコン画像（16/48/128px）
└── src/
    ├── content/
    │   └── interceptor.js     # 各AIサービスの送信を捕捉するContent Script
    ├── background/
    │   └── service_worker.js  # 検査処理を担うBackground Service Worker
    ├── rules/
    │   ├── patterns.js        # 検知ルール（正規表現）定義
    │   └── detector.js        # テキスト検査ロジック
    └── popup/
        ├── popup.html         # 拡張機能ポップアップUI
        └── popup.css
```

---

## 環境構築・インストール手順

### 前提

- Google Chrome 114 以降（Manifest V3 対応）
- git

### 1. リポジトリをクローン

```bash
git clone https://github.com/TaisukeAndo/ai-prompt-guardian.git
cd ai-prompt-guardian
```

### 2. Chrome に拡張機能を読み込む（開発者モード）

1. Chrome を開き、アドレスバーに `chrome://extensions` を入力
2. 右上の **「デベロッパーモード」をオン** にする
3. **「パッケージ化されていない拡張機能を読み込む」** をクリック
4. クローンしたフォルダ（`ai-prompt-guardian/`）を選択
5. 拡張機能一覧に「AI Prompt Guardian」が追加されれば完了

### 3. 動作確認

1. [ChatGPT](https://chatgpt.com) を開く
2. プロンプト欄に `090-1234-5678` と入力して送信ボタンを押す
3. 警告ダイアログが表示されれば正常に動作しています

---

## 開発ガイド

### ルールの追加・編集

`src/rules/patterns.js` に正規表現ルールを追加します。

```js
{
  id: "my_rule",          // 一意のID
  label: "表示名",         // ダイアログに表示されるラベル
  pattern: /正規表現/g,    // 検知パターン（gフラグ必須）
  severity: "error",      // "error" または "warning"
}
```

### 対象サービスの追加

`src/content/interceptor.js` の `SERVICE_CONFIGS` にエントリを追加し、  
`manifest.json` の `host_permissions` と `content_scripts.matches` にもホストを追加します。

---

## ライセンス

MIT
