/**
 * YouTube Shorts 画像自動生成
 * Step 4: Gemini画像生成APIを使って各シーンの画像を生成し、Googleドライブに保存
 */

// ─── 定数 ─────────────────────────────────────────────────────────────────────

const IMAGE_MODEL   = 'gemini-2.0-flash-preview-image-generation';
const IMAGE_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent`;
const PROD_FOLDER   = 'YouTube_Production';

// ─── メイン ──────────────────────────────────────────────────────────────────

function generateImages() {
  Logger.log('=== Step 4: 画像生成開始 ===');

  Logger.log('[1/3] プロジェクトフォルダを検索中...');
  const projectFolder = getLatestProjectFolder_();
  Logger.log(`対象フォルダ: ${projectFolder.getName()}`);

  Logger.log('[2/3] 画像プロンプトを読み込み中...');
  const prompts = readImagePrompts_(projectFolder);
  Logger.log(`${prompts.length} シーン分のプロンプトを取得しました`);

  Logger.log('[3/3] 画像を生成中...');
  let imagesFolder;
  try {
    imagesFolder = projectFolder.createFolder('images');
  } catch (e) {
    // imagesフォルダがすでに存在する場合は既存を使う
    const subs = projectFolder.getFoldersByName('images');
    imagesFolder = subs.hasNext() ? subs.next() : projectFolder.createFolder('images');
  }

  let successCount = 0;
  for (let i = 0; i < prompts.length; i++) {
    Logger.log(`  シーン${i + 1}/${prompts.length} を生成中...`);
    try {
      const imageData = callGeminiImageApi_(prompts[i]);
      const filename  = `scene_${String(i + 1).padStart(2, '0')}.png`;
      saveImage_(imageData, filename, imagesFolder);
      Logger.log(`  ✓ ${filename} を保存しました`);
      successCount++;
    } catch (e) {
      Logger.log(`  ⚠ シーン${i + 1} の生成に失敗: ${e.message}`);
    }
    Utilities.sleep(2000);
  }

  Logger.log(`\n✅ 完了！ ${successCount}/${prompts.length} 枚生成`);
  Logger.log(`保存先: ${imagesFolder.getUrl()}`);
}

// ─── プロジェクトフォルダ取得 ─────────────────────────────────────────────────

function getLatestProjectFolder_() {
  const topFolders = DriveApp.getFoldersByName(PROD_FOLDER);
  if (!topFolders.hasNext()) throw new Error(`「${PROD_FOLDER}」フォルダが見つかりません`);
  const productionFolder = topFolders.next();

  const subFolders = productionFolder.getFolders();
  let latestFolder = null;
  let latestDate   = new Date(0);

  while (subFolders.hasNext()) {
    const folder  = subFolders.next();
    if (folder.getName() === 'images') continue;
    const created = folder.getDateCreated();
    if (created > latestDate) {
      latestDate   = created;
      latestFolder = folder;
    }
  }

  if (!latestFolder) throw new Error('プロジェクトフォルダが見つかりません。Step 3を先に実行してください。');
  return latestFolder;
}

// ─── 画像プロンプト読み込み ────────────────────────────────────────────────────

function readImagePrompts_(projectFolder) {
  const files = projectFolder.getFiles();
  let promptFile = null;

  while (files.hasNext()) {
    const f = files.next();
    if (f.getName().startsWith('画像プロンプト')) {
      promptFile = f;
      break;
    }
  }

  if (!promptFile) throw new Error('画像プロンプトファイルが見つかりません。Step 3を先に実行してください。');

  const content = promptFile.getBlob().getDataAsString('UTF-8');
  return parsePrompts_(content);
}

function parsePrompts_(content) {
  const prompts = [];
  const regex   = /シーン\d+[：:]\s*\n([\s\S]*?)(?=\nシーン\d+[：:]|\n===|$)/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    const prompt = match[1].trim();
    if (prompt.length > 10) prompts.push(prompt);
  }

  if (prompts.length === 0) throw new Error('プロンプトのパースに失敗しました');
  return prompts;
}

// ─── Gemini 画像生成API呼び出し ───────────────────────────────────────────────

function callGeminiImageApi_(prompt) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY が未設定です');

  const url = `${IMAGE_API_URL}?key=${apiKey}`;

  const payload = {
    contents: [{
      parts: [{ text: `Generate a photorealistic, high quality 9:16 portrait image for a YouTube Shorts video. ${prompt}` }]
    }],
    generationConfig: {
      responseModalities: ['IMAGE'],
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
    throw new Error(`API エラー (HTTP ${code}): ${err.error?.message || body}`);
  }

  const json = JSON.parse(body);
  const parts = json.candidates?.[0]?.content?.parts;

  if (!parts) throw new Error('レスポンスに画像データがありません');

  const imagePart = parts.find(p => p.inlineData);
  if (!imagePart) throw new Error('画像パートが見つかりません');

  return imagePart.inlineData;
}

// ─── 画像保存 ─────────────────────────────────────────────────────────────────

function saveImage_(inlineData, filename, folder) {
  const decoded = Utilities.base64Decode(inlineData.data);
  const blob    = Utilities.newBlob(decoded, inlineData.mimeType || 'image/png', filename);
  folder.createFile(blob);
}
