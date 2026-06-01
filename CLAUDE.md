# YouTube Shorts 自動生成ノートブック — 開発ルール

## 絶対ルール（過去の失敗から）

### コード変更のたびに必ずやること
1. **変更した関数の戻り値の型を確認** — 呼び出し元が期待する型と一致しているか
2. **全セルを最初から実行した場合の流れをトレース** — セルをまたぐ変数受け渡しを確認
3. **新しいバグを入れていないか確認してからコミット**

---

## 過去に発生したバグ（再発禁止）

### 1. MP3をWAVとして使う問題 ← 最重要
- `make_tts_elevenlabs()` は MP3 を返す
- `get_wav_dur()` は `wave.open()` を使いMP3を読めず `3.0` を返す
- 結果: 40秒音声なのに `_total=3.0` → 全シーン `0.15秒` に切断 → 「え」しか入らない
- **対処済み**: `get_wav_dur()` に ffprobe フォールバック追加 + ElevenLabs音声をMP3→WAV変換してから使用

### 2. Drive未マウントでトークンが消える問題
- `_TOKEN_DIR6` は `'/content/drive/MyDrive'` が存在すれば Drive、なければ `/content`
- Drive未マウントの場合、トークンが `/content`（セッション終了で消える）に保存される
- 結果: 毎回認証が必要になる
- **対処済み**: セル7実行時に `drive.mount()` を自動実行

### 3. xfade フィルターグラフ複雑度エラー
- 58クリップを1つのFFmpegコマンドでxfade処理するとエラー
- **対処済み**: 15クリップごとにチャンク処理

### 4. BGMシードが固定
- `time() * 1000 % 99999` は同ミリ秒内で同じシード → 同じBGM
- **対処済み**: `os.urandom(4)` による真乱数シード

### 5. 音声等分割問題
- 全シーンを `合計秒数 ÷ シーン数` で等分割 → 短いシーンと長いシーンが同じ秒数
- **対処済み**: Whisperセグメント境界検出 + テキスト長比例分割

### 6. cap_dur バリデーター上限が古い値
- `cap_dur ≤ 25s` チェックが残っていた（実際は58s対応済み）
- **対処済み**: バリデーターを58sに更新

---

## ノートブック構造

| セル | 役割 | 重要変数 |
|------|------|---------|
| Cell 0 | マークダウン説明 | — |
| Cell 1 | 設定（ユーザー変更） | `THEMES`, `DURATION`, `IMAGE_STYLE`, `VIDEOS_PER_THEME`, 各APIキー |
| Cell 2 | pip install | — |
| Cell 3 | keepalive（切断防止） | — |
| Cell 4 | トレンド調査 + ANGLES生成 | `ANGLES`, `THEME`, `VIDEO_COUNT`, `DIAGNOSIS_LINES` |
| Cell 5 | 動画一括生成 | `completed` (list of dicts) |
| Cell 6 | client_secrets.json 貼り付け | `/content/client_secrets.json` |
| Cell 7 | YouTube投稿 | `_auth_map6`, `_TOKEN_DIR6` |

## セルをまたぐ変数の受け渡し

```
Cell 1  → Cell 4: THEMES, DURATION, IMAGE_STYLE, VIDEOS_PER_THEME, *_API_KEY
Cell 4  → Cell 5: ANGLES (list[str]), THEME (str), VIDEO_COUNT (int), DIAGNOSIS_LINES
Cell 5  → Cell 7: completed (list[dict{title, path, channel_label, ...}])
Cell 6  → Cell 7: /content/client_secrets.json
```

## チャンネル構成

| ラベル | チャンネル名 | ジャンル |
|--------|------------|---------|
| yaseru | やせる習慣図鑑 | ダイエット・健康・食事・美容・腸活 |
| okane | お金の教科書 | お金・投資・NISA・副業・節約 |

トークン保存先: `/content/drive/MyDrive/yt_token_{label}.pickle`

## コード変更時のチェックリスト

- [ ] 変更した関数の入力型・出力型を確認した
- [ ] 呼び出し元で戻り値を正しく使えるか確認した  
- [ ] Drive/ファイルパスが正しいか確認した
- [ ] 新しい依存関係（import）が全セルで利用可能か確認した
- [ ] 実行順序（セル1→2→3→4→5→6→7）で問題ないか確認した
