/**
 * YouTube Shorts 画像自動生成
 * Step 4: Gemini Imagen API を使って各シーンの画像を生成し、Googleドライブに保存
 *
 * 使い方:
 *   GASエディタで「generateImages」を選択して▶ 実行
 *   ※ Step 3 で生成した最新プロジェクトフォルダから自動で画像プロンプトを読み込みます
 */

// ─── 定数 ─────────────────────────────────────────────────────────────────────

const IMAGEN_MODEL   = 'imagen-3.0-generate-002';
const IMAGEN_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGEN_MODEL}:predict`;
const PROD_FOLDER    = 'YouTube_Production';

// ─── メイン（エディタから直接実行） ──────────────────────────────────────────

function generateImages() {
  Logger.log('=== Step 4: 画像生成開始 ===');

  // 1. 最新プロジェクトフォルダを取得
  Logger.log('[1/3] プロジェクトフォルダを検索中...');
  const projectFolder = getLatestProjectFolder_();
  Logger.log(`対象フォルダ: ${projectFolder.getName()}`);

  // 2. 画像プロンプトファイルを読み込んでパース
  Logger.log('[2/3] 画像プロンプトを読み込み中...');
  const prompts = readImagePrompts_(projectFolder);
  Logger.log(`${prompts.length} シーン分のプロンプトを取得しました`);

  // 3. 各シーンの画像を生成してimagesフォルダに保存
  Logger.log('[3/3] 画像を生成中...');
  const imagesFolder = projectFolder.createFolder('images');

  for (let i = 0; i < prompts.length; i++) {
    Logger.log(`  シーン${i + 1}/${prompts.length} を生成中...`);
    try {
      const prediction = callImagenApi_(prompts[i]);
      const filename   = `scene_${String(i + 1).padStart(2, '0')}.png`;
      saveImage_(prediction, filename, imagesFolder);
      Logger.log(`  ✓ scene_${String(i + 1).padStart(2, '0')}.png を保存しました`);
    } catch (e) {
      Logger.log(`  ⚠ シーン${i + 1} の生成に失敗: ${e.message}`);
    }
    Utilities.sleep(1500); // API レート制限対策
  }

  Logger.log(`\n✅ 完了！`);
  Logger.log(`保存先: ${imagesFolder.getUrl()}`);
}

// ─── プロジェクトフォルダ取得 ─────────────────────────────────────────────────

function getLatestProjectFolder_() {
  const topFolders = DriveApp.getFoldersByName(PROD_FOLDER);
  if (!topFolders.hasNext()) {
    throw new Error(
      `「${PROD_FOLDER}」フォルダが見つかりません。\n` +
      'Step 2 を先に実行してフォルダ構造を作成してください。'
    );
  }
  const productionFolder = topFolders.next();

  // サブフォルダを作成日時の降順で探して最新を返す
  const subFolders = productionFolder.getFolders();
  let latestFolder = null;
  let latestDate   = new Date(0);

  while (subFolders.hasNext()) {
    const folder = subFolders.next();
    // 「images」フォルダは除外
    if (folder.getName() === 'images') continue;
    const created = folder.getDateCreated();
    if (created > latestDate) {
      latestDate   = created;
      latestFolder = folder;
    }
  }

  if (!latestFolder) {
    throw new Error(
      'プロジェクトフォルダが見つかりません。\n' +
      'Step 3 を先に実行して台本・プロンプトを生成してください。'
    );
  }
  return latestFolder;
}

// ─── 画像プロンプト読み込み・パース ───────────────────────────────────────────

function readImagePrompts_(projectFolder) {
  // 「画像プロンプト」で始まるファイルを検索
  const files = projectFolder.getFiles();
  let promptFile = null;

  while (files.hasNext()) {
    const f = files.next();
    if (f.getName().startsWith('画像プロンプト')) {
      promptFile = f;
      break;
    }
  }

  if (!promptFile) {
    throw new Error(
      '画像プロンプトファイルが見つかりません。\n' +
      'Step 3 を先に実行してください。'
    );
  }

  const content = promptFile.getBlob().getDataAsString('UTF-8');
  return parsePrompts_(content);
}

/**
 * テキストから「シーンN:」ブロックを抽出して配列で返す
 */
function parsePrompts_(content) {
  const prompts = [];

  // "シーン1:\n～\nシーン2:" の形式でブロックを切り出す
  const regex = /シーン\d+[：:]\s*\n([\s\S]*?)(?=\nシーン\d+[：:]|\n===|$)/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    const prompt = match[1].trim();
    if (prompt.length > 10) { // 空行やヘッダーを除外
      prompts.push(prompt);
    }
  }

  if (prompts.length === 0) {
    throw new Error(
      'プロンプトのパースに失敗しました。\n' +
      'ファイルの形式を確認してください（シーン1: の形式が必要です）。'
    );
  }

  return prompts;
}

// ─── Imagen API 呼び出し ───────────────────────────────────────────────────────

function callImagenApi_(prompt) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY が未設定です。⚙️ → スクリプトプロパティから登録してください。');
  }

  const url = `${IMAGEN_API_URL}?key=${apiKey}`;

  const payload = {
    instances: [{ prompt: prompt }],
    parameters: {
      sampleCount:       1,
      aspectRatio:       '9:16',     // 縦型（YouTube Shorts用）
      safetyFilterLevel: 'block_some',
      personGeneration:  'allow_adult',
    },
  };

  const options = {
    method:             'post',
    contentType:        'application/json',
    payload:            JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  const response = UrlFetchApp.fetch(url, options);
  const code     = response.getResponseCode();
  const body     = response.getContentText();

  if (code !== 200) {
    const err = JSON.parse(body);
    throw new Error(`Imagen API エラー (HTTP ${code}): ${err.error?.message || body}`);
  }

  const json = JSON.parse(body);

  if (!json.predictions || json.predictions.length === 0) {
    throw new Error('画像が生成されませんでした（predictions が空）。プロンプトを確認してください。');
  }

  return json.predictions[0];
}

// ─── 画像保存 ─────────────────────────────────────────────────────────────────

function saveImage_(prediction, filename, folder) {
  const base64Data = prediction.bytesBase64Encoded;
  const mimeType   = prediction.mimeType || 'image/png';

  const decoded = Utilities.base64Decode(base64Data);
  const blob    = Utilities.newBlob(decoded, mimeType, filename);

  folder.createFile(blob);
}
