/**
 * YouTube Shorts 自動制作パイプライン - 一括実行スクリプト
 *
 * 使い方：
 *   スプレッドシートのメニュー「🎬 YouTube Shorts」→「▶ 動画制作を開始」をクリック
 *   テーマと秒数を入力するだけで台本・画像・設定ファイルが自動生成されます
 *
 * 必要なAPIキー（⚙️ → スクリプトプロパティに登録）：
 *   GEMINI_API_KEY  : Google AI Studio で取得
 *   PEXELS_API_KEY  : https://www.pexels.com/api/ で無料取得
 */

// ─── 定数 ─────────────────────────────────────────────────────────────────────

const MASTER_MODEL      = 'gemini-2.5-flash';
const MASTER_API_URL    = `https://generativelanguage.googleapis.com/v1beta/models/${MASTER_MODEL}:generateContent`;
const PEXELS_SEARCH_URL = 'https://api.pexels.com/v1/search';
const DRIVE_ROOT_FOLDER = 'YouTube_Production';

// ─── メニュー ─────────────────────────────────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🎬 YouTube Shorts')
    .addItem('▶ 動画制作を開始', 'runPipeline')
    .addSeparator()
    .addItem('🔑 APIキーを設定', 'setupApiKeys')
    .addToUi();
}

// ─── メイン：ワンクリックで全工程を実行 ──────────────────────────────────────

function runPipeline() {
  const ui = SpreadsheetApp.getUi();

  const themeRes = ui.prompt(
    '🎬 YouTube Shorts 自動制作',
    'テーマを入力してください\n例：「筋トレ初心者が1ヶ月で変わる方法」',
    ui.ButtonSet.OK_CANCEL
  );
  if (themeRes.getSelectedButton() !== ui.Button.OK) return;
  const theme = themeRes.getResponseText().trim();
  if (!theme) { ui.alert('テーマが空です'); return; }

  const durRes = ui.prompt(
    '⏱ 動画の長さ',
    '目標秒数を入力してください（30〜60）\n※空白なら45秒で作成',
    ui.ButtonSet.OK_CANCEL
  );
  const duration = Math.min(60, Math.max(30, parseInt(durRes.getResponseText()) || 45));

  try {
    showToast_(`「${theme}」の制作を開始します…`);
    const folderUrl = runFullPipeline_(theme, duration);
    ui.alert(
      '✅ 準備完了！',
      `すべてのファイルをGoogleドライブに保存しました。\n\n` +
      `次のステップ：\n` +
      `1. フォルダをダウンロード\n` +
      `2. python make_video.py --project <フォルダ> を実行\n\n` +
      folderUrl,
      ui.ButtonSet.OK
    );
  } catch (e) {
    ui.alert('❌ エラーが発生しました', e.message, ui.ButtonSet.OK);
    Logger.log(e.stack);
  }
}

// ─── パイプライン本体 ─────────────────────────────────────────────────────────

function runFullPipeline_(theme, duration) {
  const sceneCount = duration <= 35 ? 4 : duration <= 50 ? 5 : 6;
  const projectFolder = createProjectFolder_(theme);

  // ① YouTubeトレンド分析
  Logger.log('[1/4] YouTubeトレンド分析中...');
  showToast_('YouTubeトレンドを分析中...');
  const trendAnalysis = analyzeYouTubeTrends_(theme, duration);
  saveText_(projectFolder, 'トレンド分析.txt', trendAnalysis);
  Logger.log('トレンド分析完了');

  // ② 台本＋画像検索キーワード生成
  Logger.log('[2/4] 台本を生成中...');
  showToast_('台本を生成中...');
  const { script, keywords, timings } = generateScriptAndKeywords_(theme, duration, sceneCount, trendAnalysis);
  saveText_(projectFolder, '台本.txt', script);
  Logger.log('台本生成完了');

  // ③ Pexels APIで著作権フリー画像を自動ダウンロード
  Logger.log('[3/4] 画像をダウンロード中...');
  showToast_('著作権フリー画像を取得中...');
  const imagesFolder = projectFolder.createFolder('images');
  const downloadedImages = downloadPexelsImages_(keywords, imagesFolder);
  Logger.log(`画像取得完了: ${downloadedImages}件`);

  // ④ Python用の設定ファイルを生成
  Logger.log('[4/4] 設定ファイルを生成中...');
  const config = buildConfig_(theme, duration, sceneCount, keywords, timings);
  saveText_(projectFolder, 'production_config.json', JSON.stringify(config, null, 2));
  Logger.log('設定ファイル生成完了');

  Logger.log(`✅ 完了！フォルダ: ${projectFolder.getUrl()}`);
  return projectFolder.getUrl();
}

// ─── ① YouTubeトレンド分析 ────────────────────────────────────────────────────

function analyzeYouTubeTrends_(theme, duration) {
  const prompt = `
あなたはYouTubeショート動画のトレンドアナリストです。

【テーマ】${theme}
【目標尺】${duration}秒

以下の観点で分析し、台本制作に直接活かせる形で出力してください：

1. このテーマのYouTubeショートでの現在トレンド傾向
2. バズりやすいフックパターン（最初3秒の言い回し例を3つ）
3. 視聴者維持率を高める構成のコツ
4. ${duration}秒で最も効果的な情報量とテンポ
5. このテーマで差別化できるユニークな切り口（2〜3案）
6. 避けるべきNG表現・構成
7. おすすめのビジュアルスタイル・雰囲気

これらをもとに最適な台本を作るための指針をまとめてください。
`;
  return callGemini_(prompt);
}

// ─── ② 台本＋キーワード生成 ───────────────────────────────────────────────────

function generateScriptAndKeywords_(theme, duration, sceneCount, trendAnalysis) {
  const prompt = `
あなたはYouTubeショート動画の台本専門ライターです。

【テーマ】${theme}
【目標尺】${duration}秒（${sceneCount}シーン構成）
【トレンド分析】
${trendAnalysis}

上記のトレンド分析を最大限に活かして、以下を生成してください。

=== 出力フォーマット（必ずこの形式で） ===

[台本]
テーマ：${theme}
目標尺：${duration}秒

シーン1（フック）:
[速く]（セリフ）[間0.5]（セリフ）

シーン2（問題提起）:
[ゆっくり]（セリフ）[間1.0]（セリフ）

シーン3（本題①）:
（セリフ）

シーン4（本題②）:
（セリフ）

${sceneCount >= 5 ? 'シーン5（まとめ）:\n（セリフ）\n\n' : ''}${sceneCount >= 6 ? 'シーン6（CTA）:\n[速く]（セリフ）\n\n' : ''}[キーワード]
各シーンのPexels画像検索用英語キーワード（1〜3語の英単語）：
scene1: （英語キーワード）
scene2: （英語キーワード）
scene3: （英語キーワード）
scene4: （英語キーワード）
${sceneCount >= 5 ? 'scene5: （英語キーワード）\n' : ''}${sceneCount >= 6 ? 'scene6: （英語キーワード）\n' : ''}
[秒数配分]
各シーンの推奨秒数（合計が${duration}秒になるように）：
scene1: （秒数）
scene2: （秒数）
scene3: （秒数）
scene4: （秒数）
${sceneCount >= 5 ? 'scene5: （秒数）\n' : ''}${sceneCount >= 6 ? 'scene6: （秒数）\n' : ''}
`;

  const response = callGemini_(prompt);

  // パース
  const scriptMatch  = response.match(/\[台本\]([\s\S]*?)(?=\[キーワード\])/);
  const kwMatch      = response.match(/\[キーワード\]([\s\S]*?)(?=\[秒数配分\])/);
  const timingMatch  = response.match(/\[秒数配分\]([\s\S]*?)$/);

  const script = scriptMatch ? scriptMatch[1].trim() : response;

  const keywords = [];
  if (kwMatch) {
    kwMatch[1].split('\n').forEach(line => {
      const m = line.match(/scene\d+:\s*(.+)/i);
      if (m) keywords.push(m[1].trim());
    });
  }
  while (keywords.length < sceneCount) keywords.push(theme.replace(/[^\w\s]/g, '').substring(0, 20));

  const timings = [];
  if (timingMatch) {
    timingMatch[1].split('\n').forEach(line => {
      const m = line.match(/scene\d+:\s*(\d+)/i);
      if (m) timings.push(parseInt(m[1]));
    });
  }
  if (timings.length < sceneCount) {
    const perScene = Math.floor(duration / sceneCount);
    for (let i = timings.length; i < sceneCount; i++) timings.push(perScene);
  }

  return { script, keywords, timings };
}

// ─── ③ Pexels画像ダウンロード ─────────────────────────────────────────────────

function downloadPexelsImages_(keywords, imagesFolder) {
  const pexelsKey = PropertiesService.getScriptProperties().getProperty('PEXELS_API_KEY');

  if (!pexelsKey) {
    Logger.log('⚠ PEXELS_API_KEY未設定 → キーワードファイルのみ保存します');
    keywords.forEach((kw, i) => {
      saveText_(imagesFolder, `scene_${String(i + 1).padStart(2, '0')}_keyword.txt`, kw);
    });
    return 0;
  }

  let count = 0;
  keywords.forEach((keyword, i) => {
    Utilities.sleep(600);
    try {
      const photo = searchPexels_(keyword, pexelsKey);
      if (!photo) {
        Logger.log(`  ⚠ シーン${i + 1}: 「${keyword}」の画像が見つかりませんでした`);
        return;
      }
      const filename = `scene_${String(i + 1).padStart(2, '0')}.jpg`;
      downloadAndSaveImage_(photo.src.portrait || photo.src.large, filename, imagesFolder);
      Logger.log(`  ✓ シーン${i + 1}: ${keyword} → ${photo.photographer}`);
      count++;
    } catch (e) {
      Logger.log(`  ⚠ シーン${i + 1}: ${e.message}`);
    }
  });
  return count;
}

function searchPexels_(keyword, apiKey) {
  const url = `${PEXELS_SEARCH_URL}?query=${encodeURIComponent(keyword)}&per_page=1&orientation=portrait`;
  const res  = UrlFetchApp.fetch(url, {
    headers:            { Authorization: apiKey },
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) return null;
  const json = JSON.parse(res.getContentText());
  return json.photos?.[0] || null;
}

function downloadAndSaveImage_(imageUrl, filename, folder) {
  const res = UrlFetchApp.fetch(imageUrl, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error(`画像DL失敗: ${imageUrl}`);
  folder.createFile(res.getBlob().setName(filename));
}

// ─── ④ Python用設定ファイル生成 ───────────────────────────────────────────────

function buildConfig_(theme, duration, sceneCount, keywords, timings) {
  const scenes = keywords.map((kw, i) => ({
    scene:    i + 1,
    image:    `images/scene_${String(i + 1).padStart(2, '0')}.jpg`,
    keyword:  kw,
    duration: timings[i] || Math.floor(duration / sceneCount),
    effect:   i % 2 === 0 ? 'zoom_in' : 'zoom_out',
  }));

  return {
    theme,
    target_duration: duration,
    scene_count:     sceneCount,
    scenes,
    video_settings: {
      width:   1080,
      height:  1920,
      fps:     30,
      format:  'mp4',
    },
    created_at: new Date().toISOString(),
  };
}

// ─── Gemini API 呼び出し ───────────────────────────────────────────────────────

function callGemini_(prompt) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY が未設定です');

  const url = `${MASTER_API_URL}?key=${apiKey}`;
  const res  = UrlFetchApp.fetch(url, {
    method:             'post',
    contentType:        'application/json',
    payload:            JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.8, maxOutputTokens: 4096 },
    }),
    muteHttpExceptions: true,
  });

  const code = res.getResponseCode();
  const body = res.getContentText();
  if (code !== 200) {
    const err = JSON.parse(body);
    throw new Error(`Gemini API エラー (${code}): ${err.error?.message || body}`);
  }
  return JSON.parse(body).candidates[0].content.parts[0].text;
}

// ─── ユーティリティ ────────────────────────────────────────────────────────────

function createProjectFolder_(theme) {
  const folders = DriveApp.getFoldersByName(DRIVE_ROOT_FOLDER);
  if (!folders.hasNext()) throw new Error(`「${DRIVE_ROOT_FOLDER}」フォルダが見つかりません`);
  const root      = folders.next();
  const timestamp = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd_HHmmss');
  const safeName  = theme.replace(/[\\/:*?"<>|]/g, '_').substring(0, 30);
  return root.createFolder(`${timestamp}_${safeName}`);
}

function saveText_(folder, filename, content) {
  folder.createFile(filename, content, MimeType.PLAIN_TEXT);
}

function showToast_(message) {
  try {
    SpreadsheetApp.getActiveSpreadsheet().toast(message, '🎬 YouTube Shorts', -1);
  } catch (_) {
    Logger.log(message);
  }
}

// ─── APIキー設定UI ─────────────────────────────────────────────────────────────

function setupApiKeys() {
  const ui = SpreadsheetApp.getUi();

  const geminiRes = ui.prompt('🔑 Gemini APIキー', 'Google AI Studio のAPIキーを入力:', ui.ButtonSet.OK_CANCEL);
  if (geminiRes.getSelectedButton() === ui.Button.OK && geminiRes.getResponseText().trim()) {
    PropertiesService.getScriptProperties().setProperty('GEMINI_API_KEY', geminiRes.getResponseText().trim());
  }

  const pexelsRes = ui.prompt('🔑 Pexels APIキー', 'pexels.com/api で取得した無料APIキーを入力:', ui.ButtonSet.OK_CANCEL);
  if (pexelsRes.getSelectedButton() === ui.Button.OK && pexelsRes.getResponseText().trim()) {
    PropertiesService.getScriptProperties().setProperty('PEXELS_API_KEY', pexelsRes.getResponseText().trim());
  }

  ui.alert('✅ APIキーを保存しました！');
}
