"""
YouTube Shorts Bot - Phase 1
テーマを複数入力 → AI分類 → 動画生成 → YouTube投稿
"""
import sys, os, json, time
from pathlib import Path

# プロジェクトルートをパスに追加
ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).parent))

from bot.auth import get_client, get_auth_url, save_token_from_url, check_auth_status
from bot.classify import classify_themes, CHANNEL_RULES
from bot.upload import (
    generate_metadata, upload_video, post_comment,
    save_pending_comment, flush_pending_comments, get_random_post_time,
)


PENDING_FILE = ROOT / '.tokens' / 'pending_comments.json'
NOTEBOOK_PATH = ROOT / 'YouTube_Shorts_ワンクリック生成.ipynb'


# ── 設定（ここを変更する）────────────────────────────────────────────────
CONFIG = {
    'themes':          ['ダイエット', '投資'],  # テーマリスト
    'videos_per_theme': 1,
    'duration':        45,
    'image_style':     'realistic',
    'schedule_post':   True,
    'upload_privacy':  'public',
    'post_windows':    [(8, 0, 30), (12, 0, 30), (18, 0, 30)],  # JST
    # APIキー（環境変数またはここに直接入力）
    'claude_api_key':   os.environ.get('CLAUDE_API_KEY', ''),
    'google_api_key':   os.environ.get('GOOGLE_API_KEY', ''),
    'youtube_api_key':  os.environ.get('YOUTUBE_API_KEY', ''),
    'pexels_api_key':   os.environ.get('PEXELS_API_KEY', ''),
}
# ────────────────────────────────────────────────────────────────────────


def load_notebook_cell(cell_index):
    """ノートブックから指定セルのソースコードを返す"""
    with open(NOTEBOOK_PATH, encoding='utf-8') as f:
        nb = json.load(f)
    return ''.join(nb['cells'][cell_index]['source'])


def run_video_generation(theme, config):
    """
    既存ノートブックのCell4+Cell5を使って動画を生成する。
    Returns: list of (idx, angle, video_path) tuples
    """
    print(f'\n{"─"*50}')
    print(f'🎬 動画生成: 「{theme}」')
    print(f'{"─"*50}')

    # グローバル名前空間を構築してセルコードを実行
    ns = {
        '__builtins__': __builtins__,
        # Cell1の設定変数を注入
        'THEME':             theme,
        'VIDEO_COUNT':       config.get('videos_per_theme', 1),
        'DURATION':          config.get('duration', 45),
        'IMAGE_STYLE':       config.get('image_style', 'realistic'),
        'GEMINI_IMAGE_MODEL': '',
        'IMG_SWITCH_SEC':    2.0,
        'LOOP_STRUCTURE':    True,
        'AUTO_UPLOAD':       False,   # アップロードはmain.pyが担当
        'UPLOAD_PRIVACY':    'public',
        'SCHEDULE_POST':     False,
        'DRIVE_FOLDER_ID':   '',
        'CHANNEL_MAP':       [],
        'POST_SLOTS_JST':    [8, 12, 18],
        'VIDEO_FORMAT':      'standard',
        'CHANNEL_NAME':      '',
        'DIAGNOSIS_ITEMS':   4,
        'MASCOT_PROMPT':     '',
        'ASMR_TICK':         False,
        # APIキー
        'YOUTUBE_API_KEY':   config.get('youtube_api_key', ''),
        'CLAUDE_API_KEY':    config.get('claude_api_key', ''),
        'PEXELS_API_KEY':    config.get('pexels_api_key', ''),
        'GOOGLE_API_KEY':    config.get('google_api_key', ''),
    }

    # Cell4 (リサーチ + call_ai) を実行
    print('  🔍 Cell4: キーワード調査・トレンド分析...')
    cell4_src = load_notebook_cell(4)
    # Colab固有のimportを無効化
    cell4_src = cell4_src.replace('from google.colab import', '# from google.colab import')
    try:
        exec(compile(cell4_src, 'cell4', 'exec'), ns)
    except Exception as e:
        print(f'  ⚠ Cell4エラー (継続): {e}')

    # Cell5 (動画生成) を実行
    print('  🎥 Cell5: 動画生成...')
    cell5_src = load_notebook_cell(5)
    cell5_src = cell5_src.replace('from google.colab import', '# from google.colab import')
    # Drive関連のコードをスキップ
    cell5_src = cell5_src.replace(
        "from google.colab import drive", "# from google.colab import drive"
    )

    try:
        exec(compile(cell5_src, 'cell5', 'exec'), ns)
    except SystemExit:
        pass  # 正常終了
    except Exception as e:
        print(f'  ❌ Cell5エラー: {e}')
        import traceback
        traceback.print_exc()

    completed = ns.get('completed', [])
    print(f'  ✅ 生成完了: {len(completed)}本')
    return completed


def run_auth_setup():
    """認証セットアップ（初回のみ）"""
    print('\n' + '='*60)
    print('🔐 YouTube OAuth2 認証セットアップ')
    print('='*60)

    status = check_auth_status()
    missing = [label for label, ok in status.items() if not ok]

    if not missing:
        print('\n✅ 両チャンネルの認証が完了しています。')
        return True

    for label in missing:
        ch_name = CHANNEL_RULES[label]['name']
        print(f'\n【{ch_name} ({label}) の認証】')
        print(f'  1. YouTubeで「{ch_name}」チャンネルに切り替えてください')
        print(f'  2. 以下のURLをブラウザで開いてください:\n')
        print(f'  {get_auth_url(label)}\n')
        print(f'  3. Googleでログイン → 承認')
        print(f'  4. リダイレクトされた http://localhost/?code=... のURL全体をコピー')
        print(f'  5. 以下に貼り付けてEnterを押してください:')

        response_url = input(f'\n  レスポンスURL ({label}): ').strip()
        if not response_url:
            print(f'  ⏭ {label} をスキップ')
            continue

        try:
            save_token_from_url(response_url, label)
            print(f'  ✅ {ch_name}: 認証完了！')
        except Exception as e:
            print(f'  ❌ 認証失敗: {e}')
            return False

    return True


def run_phase1(themes=None, auto_upload=True):
    """Phase 1: テーマ → 分類 → 生成 → 投稿"""
    if themes is None:
        themes = CONFIG['themes']

    print('\n' + '='*60)
    print('🚀 YouTube Shorts Bot - Phase 1 開始')
    print('='*60)
    print(f'テーマ: {themes}')

    # ① call_ai関数が使えるかAPIキー確認
    claude_key = CONFIG['claude_api_key']
    if not claude_key:
        print('❌ CLAUDE_API_KEY が未設定です。')
        return

    # ② テーマ分類
    print('\n📌 テーマ分類中...')
    def call_ai_simple(prompt, tokens=100):
        import requests as _r
        r = _r.post(
            'https://api.anthropic.com/v1/messages',
            headers={'x-api-key': claude_key, 'anthropic-version': '2023-06-01',
                     'content-type': 'application/json'},
            json={'model': 'claude-haiku-4-5-20251001', 'max_tokens': tokens,
                  'messages': [{'role': 'user', 'content': prompt}]},
            timeout=30,
        )
        return r.json()['content'][0]['text']

    theme_channels = classify_themes(themes, call_ai_simple)

    # ③ チャンネルごとにグループ化
    groups = {}
    for theme, label in theme_channels.items():
        if label not in groups:
            groups[label] = []
        groups[label].append(theme)

    print(f'\n  振り分け結果:')
    for label, ts in groups.items():
        print(f'    {CHANNEL_RULES[label]["name"]}: {ts}')

    # ④ 認証確認
    if auto_upload:
        print('\n🔐 認証確認中...')
        yt_clients = {}
        for label in groups.keys():
            yt = get_client(label)
            if yt is None:
                print(f'  ⚠ {CHANNEL_RULES[label]["name"]} ({label}): 未認証')
                print(f'    → まず "python bot/main.py --auth" を実行してください')
                auto_upload = False
            else:
                yt_clients[label] = yt
                print(f'  ✅ {CHANNEL_RULES[label]["name"]}: 認証済み')

    # ⑤ 動画生成 + 投稿
    all_results = []
    upload_slot_idx = 0

    for label, theme_list in groups.items():
        for theme in theme_list:
            # 動画生成
            completed = run_video_generation(theme, CONFIG)

            if not completed:
                print(f'  ⚠ 「{theme}」: 動画生成なし')
                continue

            if not auto_upload:
                for idx, angle, path in completed:
                    print(f'  📁 保存済み: {path}')
                continue

            # 保留コメントを処理
            yt = yt_clients.get(label)
            if yt:
                flush_pending_comments(yt, PENDING_FILE)

            # 各動画をアップロード
            for idx, angle, video_path in completed:
                print(f'\n  ⬆️  アップロード: {Path(video_path).name}')

                # メタデータ生成
                meta = generate_metadata(theme, label, [], call_ai_simple)
                print(f'    タイトル: {meta["title"]}')

                # 投稿時刻
                sched = None
                if CONFIG.get('schedule_post'):
                    sched = get_random_post_time(CONFIG['post_windows'], upload_slot_idx)
                    from datetime import datetime, timezone, timedelta
                    jst = datetime.fromisoformat(sched.replace('Z', '+00:00')).astimezone(
                        timezone(timedelta(hours=9))
                    )
                    print(f'    📅 投稿予定(JST): {jst.strftime("%m/%d %H:%M")}')
                    upload_slot_idx += 1

                try:
                    vid_id = upload_video(yt, video_path, meta, scheduled_time=sched,
                                          channel_label=label)
                    url = f'https://youtube.com/watch?v={vid_id}'
                    print(f'    ✅ 完了: {url}')
                    all_results.append(url)

                    # コメント投稿（スケジュール動画は保留）
                    if sched:
                        save_pending_comment(vid_id, meta['first_comment'], PENDING_FILE)
                    else:
                        post_comment(yt, vid_id, meta['first_comment'])

                except Exception as e:
                    print(f'    ❌ アップロード失敗: {e}')

    print(f'\n{"="*60}')
    print(f'🎉 完了: {len(all_results)}本を投稿')
    for url in all_results:
        print(f'  {url}')
    return all_results


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='YouTube Shorts Bot')
    parser.add_argument('--auth', action='store_true', help='認証セットアップ')
    parser.add_argument('--check', action='store_true', help='認証状態確認')
    parser.add_argument('--themes', nargs='+', help='テーマリスト（例: ダイエット 投資）')
    parser.add_argument('--no-upload', action='store_true', help='アップロードなし（動画生成のみ）')
    args = parser.parse_args()

    if args.auth:
        run_auth_setup()
    elif args.check:
        check_auth_status()
    else:
        themes = args.themes or CONFIG['themes']
        run_phase1(themes=themes, auto_upload=not args.no_upload)
