# Step 3: 台本・画像プロンプト自動生成 (Gemini API)

## セットアップ手順

### 1. GASプロジェクトを開く

Step 2 で作成したGASプロジェクトを開く（または新規スプレッドシート → 拡張機能 → Apps Script）。

### 2. スクリプトを貼り付ける

`Step3_ScriptGenerator.gs` の内容を GASエディタにコピー＆ペーストして保存。

### 3. APIキーを登録する

**方法A（UIから）**
1. スプレッドシートのメニュー「🎬 YouTube Shorts → APIキーを設定」をクリック
2. Gemini API キーを入力して OK

**方法B（GASエディタから）**
1. GASエディタ → 左サイドバーの「⚙️ プロジェクトの設定」
2. 「スクリプトプロパティ」→「プロパティを追加」
3. プロパティ名: `GEMINI_API_KEY` / 値: あなたのAPIキー

### 4. 実行する

**スプレッドシート経由**
→ メニュー「🎬 YouTube Shorts → 台本・画像プロンプト生成」

**GASエディタから直接実行（スプレッドシート不要）**
1. `generateStandalone` 関数内のテーマを書き換える
2. 関数を選択して「▶ 実行」

---

## 出力ファイル（Googleドライブ）

```
YouTube_Production/
└── 20250522_123456_筋トレ初心者が1ヶ月で/
    ├── 台本_20250522_123456.txt
    ├── 画像プロンプト_20250522_123456.txt
    └── 【完全版】台本＋プロンプト_20250522_123456.txt
```

---

## 台本の出力例

```
シーン1（フック）:
[速く]え？たった1ヶ月でそんなに変わるの？[間1.0]

シーン2（問題提起）:
[ゆっくり]筋トレを始めたいけど、何から始めればいいかわからない…[間0.5]そんな人、多いですよね。
...
```

## 画像プロンプトの出力例

```
シーン1:
A dramatic close-up of a surprised young Japanese man, 25 years old,
looking directly at camera with wide eyes and open mouth expression.
Portrait orientation 9:16, shallow depth of field, bright studio lighting,
wearing casual white t-shirt. Photorealistic, high quality photography,
no text, no watermark.
```

---

## 次のステップ（Step 4以降）

- Step 4: Gemini Imagen で画像を一括生成
- Step 5: 画像＋ズーム動画クリップを自動生成（FFmpeg）
- Step 6: BGM自動選定・テロップ合成・最終エンコード
