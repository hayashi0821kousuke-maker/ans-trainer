/**
 * YouTube Shorts 台本・画像プロンプト自動生成
 * Step 3: Gemini API を使って台本と画像プロンプトを生成し、Googleドライブに保存
 *
 * セットアップ手順:
 *   1. GASエディタ → プロジェクトの設定 → スクリプトプロパティ
 *      → 「GEMINI_API_KEY」にAPIキーを登録
 *   2. このスクリプトをスプレッドシートに紐付けて実行 or
 *      単独プロジェクトとして「main()」を直接実行
 */

// ─── 定数 ─────────────────────────────────────────────────────────────────────

const GEMINI_MODEL    = 'gemini-2.0-flash';
const GEMINI_BASE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const PRODUCTION_FOLDER_NAME = 'YouTube_Production';

// シーン数（台本をこの数のシーンに分ける）
const SCENE_COUNT = 6;

// ─── メニュー登録（スプレッドシートに紐付けている場合） ─────────────────────

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🎬 YouTube Shorts')
    .addItem('台本・画像プロンプト生成', 'main')
    .addSeparator()
    .addItem('APIキーを設定', 'setupApiKey')
    .addToUi();
}

// ─── メイン ──────────────────────────────────────────────────────────────────

/**
 * スプレッドシートのメニューまたはエディタから直接呼び出すエントリーポイント
 */
function main() {
  const ui    = SpreadsheetApp.getUi();
  const input = ui.prompt(
    '🎬 YouTube Shorts ジェネレーター',
    '動画のテーマを入力してください\n例：「猫がシェフになって料理する話」',
    ui.ButtonSet.OK_CANCEL
  );

  if (input.getSelectedButton() !== ui.Button.OK) return;
  const theme = input.getResponseText().trim();
  if (!theme) {
    ui.alert('テーマが空です。もう一度試してください。');
    return;
  }

  try {
    showToast_('生成中です…少々お待ちください（30〜60秒）');
    const folderUrl = generateAndSave(theme);
    ui.alert(
      '✅ 生成完了！',
      `Googleドライブに保存しました。\n\n${folderUrl}`,
      ui.ButtonSet.OK
    );
  } catch (e) {
    ui.alert('❌ エラーが発生しました', e.message, ui.ButtonSet.OK);
    Logger.log(e.stack);
  }
}

/**
 * スクリプト単体で実行する場合（スプレッドシート不要）
 * GASエディタで generateStandalone() を選択して「実行」
 */
function generateStandalone() {
  const theme = '筋トレ初心者が1ヶ月で変わる方法';  // ← ここを書き換えて実行
  const folderUrl = generateAndSave(theme);
  Logger.log(`✅ 完了！フォルダ: ${folderUrl}`);
}

// ─── コアロジック ─────────────────────────────────────────────────────────────

/**
 * テーマを受け取り、台本と画像プロンプトを生成してGoogleドライブに保存する
 * @param {string} theme 動画テーマ
 * @returns {string} 保存先フォルダのURL
 */
function generateAndSave(theme) {
  Logger.log(`▶ テーマ: ${theme}`);

  // 1. 台本生成
  Logger.log('[1/3] 台本を生成中...');
  const script = generateScript_(theme);
  Logger.log('台本生成完了:\n' + script);

  // 2. 画像プロンプト生成
  Logger.log('[2/3] 画像プロンプトを生成中...');
  const imagePrompts = generateImagePrompts_(theme, script);
  Logger.log('画像プロンプト生成完了:\n' + imagePrompts);

  // 3. Googleドライブへ保存
  Logger.log('[3/3] Googleドライブに保存中...');
  const folderUrl = saveToGoogleDrive_(theme, script, imagePrompts);

  return folderUrl;
}

// ─── 台本生成 ─────────────────────────────────────────────────────────────────

function generateScript_(theme) {
  const prompt = `
あなたはYouTubeショート動画（縦型・60秒以内）の台本専門ライターです。

【テーマ】
${theme}

【台本の要件】
- ${SCENE_COUNT}つのシーンに分けて構成する
- 最初の3秒（シーン1）は視聴者を引きつけるフック（驚き・疑問・共感）
- NotebookLMで読み上げることを想定した自然な話し言葉
- 読み上げ速度・間の指示タグを各セリフに付与
  タグ一覧: [速く] [ゆっくり] [間0.5] [間1.0] [間2.0] [強調]
- シーン5〜6に視聴者へのCTA（いいね・フォロー・コメント促進）を入れる
- 全体の読み上げ時間が45〜55秒になるよう調整

【出力フォーマット（必ずこの形式で）】
=== 台本 ===
テーマ：${theme}
想定尺：約50秒

シーン1（フック）:
[速く]（ここにセリフ）

シーン2（問題提起）:
[ゆっくり]（ここにセリフ）[間1.0]（ここにセリフ）

シーン3（本題①）:
（ここにセリフ）

シーン4（本題②）:
（ここにセリフ）

シーン5（まとめ）:
（ここにセリフ）

シーン6（CTA）:
[速く]（ここにセリフ）

=== ナレーター補足 ===
（全体のトーン・読み方のアドバイスを2〜3行で）
`;

  return callGeminiApi_(prompt);
}

// ─── 画像プロンプト生成 ────────────────────────────────────────────────────────

function generateImagePrompts_(theme, script) {
  const prompt = `
あなたはAI画像生成（Gemini Imagen）のプロンプトエンジニアです。

以下のYouTubeショート台本の各シーンに合う、Gemini Imagen用の画像生成プロンプトを英語で作成してください。

【テーマ】
${theme}

【台本】
${script}

【プロンプトの要件】
- 各シーンに1つのプロンプト（シーン1〜${SCENE_COUNT}）
- スタイル：photorealistic, high quality, professional photography
- 構図：縦型（9:16 portrait orientation）を意識
- 照明・雰囲気・被写体を具体的に英語で記述（80〜120語）
- 人物が登場する場合は年齢・表情・服装も指定
- テキスト・文字・ロゴは含めない（no text, no watermark）

【出力フォーマット（必ずこの形式で）】
=== 画像プロンプト ===

シーン1:
（英語プロンプト）

シーン2:
（英語プロンプト）

シーン3:
（英語プロンプト）

シーン4:
（英語プロンプト）

シーン5:
（英語プロンプト）

シーン6:
（英語プロンプト）

=== 画像スタイル共通設定 ===
（全シーン共通で使えるスタイル指定を1行で）
`;

  return callGeminiApi_(prompt);
}

// ─── Gemini API 呼び出し ───────────────────────────────────────────────────────

/**
 * Gemini API にテキストプロンプトを送り、レスポンスのテキストを返す
 * @param {string} prompt
 * @returns {string}
 */
function callGeminiApi_(prompt) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY が未設定です。\n' +
      'メニュー「🎬 YouTube Shorts → APIキーを設定」から登録してください。'
    );
  }

  const url = `${GEMINI_BASE_URL}?key=${apiKey}`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature:     0.8,
      maxOutputTokens: 4096,
      topP:            0.9,
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ],
  };

  const options = {
    method:          'post',
    contentType:     'application/json',
    payload:         JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  const response = UrlFetchApp.fetch(url, options);
  const code     = response.getResponseCode();
  const body     = response.getContentText();

  if (code !== 200) {
    const err = JSON.parse(body);
    throw new Error(`Gemini API エラー (HTTP ${code}): ${err.error?.message || body}`);
  }

  const json = JSON.parse(body);

  if (!json.candidates || json.candidates.length === 0) {
    throw new Error('Gemini API から候補が返ってきませんでした。プロンプトを確認してください。');
  }

  return json.candidates[0].content.parts[0].text;
}

// ─── Googleドライブへ保存 ──────────────────────────────────────────────────────

/**
 * YouTube_Production フォルダ配下にプロジェクトフォルダを作成し、
 * 台本・画像プロンプトをテキストファイルとして保存する
 */
function saveToGoogleDrive_(theme, script, imagePrompts) {
  // YouTube_Production フォルダを検索
  const folders = DriveApp.getFoldersByName(PRODUCTION_FOLDER_NAME);
  if (!folders.hasNext()) {
    throw new Error(
      `「${PRODUCTION_FOLDER_NAME}」フォルダがGoogleドライブに見つかりません。\n` +
      'Step 2のGASを先に実行してフォルダ構造を作成してください。'
    );
  }
  const productionFolder = folders.next();

  // 日時付きプロジェクトフォルダを作成
  const timestamp     = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd_HHmmss');
  const safeTheme     = theme.replace(/[\\/:*?"<>|]/g, '_').substring(0, 30);
  const projectFolder = productionFolder.createFolder(`${timestamp}_${safeTheme}`);

  // 台本ファイル保存
  const scriptContent =
    `テーマ：${theme}\n` +
    `生成日時：${Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss')}\n` +
    `モデル：${GEMINI_MODEL}\n\n` +
    script;
  projectFolder.createFile(`台本_${timestamp}.txt`, scriptContent, MimeType.PLAIN_TEXT);

  // 画像プロンプトファイル保存
  const promptsContent =
    `テーマ：${theme}\n` +
    `生成日時：${Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss')}\n` +
    `モデル：${GEMINI_MODEL}\n\n` +
    imagePrompts;
  projectFolder.createFile(`画像プロンプト_${timestamp}.txt`, promptsContent, MimeType.PLAIN_TEXT);

  // 両方まとめたフルドキュメントをGoogle Docsで保存（コピペしやすい）
  const fullContent =
    `テーマ：${theme}\n` +
    `生成日時：${Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss')}\n\n` +
    '━'.repeat(40) + '\n\n' +
    script + '\n\n' +
    '━'.repeat(40) + '\n\n' +
    imagePrompts;
  projectFolder.createFile(`【完全版】台本＋プロンプト_${timestamp}.txt`, fullContent, MimeType.PLAIN_TEXT);

  Logger.log(`✅ 保存先: ${projectFolder.getUrl()}`);
  return projectFolder.getUrl();
}

// ─── セットアップ ─────────────────────────────────────────────────────────────

/**
 * Gemini API キーをスクリプトプロパティに保存する
 */
function setupApiKey() {
  const ui    = SpreadsheetApp.getUi();
  const input = ui.prompt(
    '🔑 Gemini API キー設定',
    'Google AI Studio で取得したAPIキーを入力してください:',
    ui.ButtonSet.OK_CANCEL
  );

  if (input.getSelectedButton() !== ui.Button.OK) return;
  const key = input.getResponseText().trim();
  if (!key) {
    ui.alert('APIキーが空です。');
    return;
  }

  PropertiesService.getScriptProperties().setProperty('GEMINI_API_KEY', key);
  ui.alert('✅ APIキーを保存しました！\n「台本・画像プロンプト生成」を試してください。');
}

// ─── ユーティリティ ────────────────────────────────────────────────────────────

function showToast_(message) {
  try {
    SpreadsheetApp.getActiveSpreadsheet().toast(message, '🎬 YouTube Shorts Generator', -1);
  } catch (_) {
    Logger.log(message);
  }
}
