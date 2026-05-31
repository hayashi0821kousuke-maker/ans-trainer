"""YouTube動画アップロードモジュール"""
import json, random, re
from datetime import datetime, timezone, timedelta
from pathlib import Path

JST = timezone(timedelta(hours=9))

# 投稿ウィンドウ (hour, min_start, min_end) JST
DEFAULT_POST_WINDOWS = [
    (8,  0, 30),
    (12, 0, 30),
    (18, 0, 30),
]

CATEGORY_MAP = {
    'yaseru': '26',  # Howto & Style
    'okane':  '22',  # People & Blogs
}


def get_random_post_time(windows=None, index=0):
    """
    指定ウィンドウ内のランダムな時刻（UTC文字列）を返す。
    index: 複数本投稿時にウィンドウをずらす
    """
    if windows is None:
        windows = DEFAULT_POST_WINDOWS

    now_jst = datetime.now(JST)
    future_slots = []

    for days_ahead in range(14):
        for hour, min_s, min_e in windows:
            rand_min = random.randint(min_s, min_e)
            rand_sec = random.randint(0, 59)
            dt = (now_jst + timedelta(days=days_ahead)).replace(
                hour=hour, minute=rand_min, second=rand_sec, microsecond=0
            )
            if dt > now_jst + timedelta(hours=2):
                future_slots.append(dt)

    future_slots.sort()
    target = future_slots[index % len(future_slots)]
    return target.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def generate_metadata(theme, channel_label, script_lines, call_ai_fn):
    """タイトル・説明文・タグをClaudeで生成"""
    preview = '\n'.join(script_lines[:8]) if script_lines else ''
    ch_name = 'やせる習慣図鑑' if channel_label == 'yaseru' else 'お金の教科書'

    try:
        raw = call_ai_fn(
            f'YouTube Shorts動画のメタデータをJSON形式で生成してください。\n'
            f'テーマ: {theme}  チャンネル: {ch_name}\n'
            f'台本冒頭:\n{preview}\n\n'
            f'出力形式（JSONのみ、説明不要）:\n'
            '{\n'
            '  "title": "60文字以内、インパクト重視、末尾に #Shorts",\n'
            '  "description": "150文字以内 + ハッシュタグ6〜8個",\n'
            '  "tags": ["タグ1", "タグ2", ...最大15個],\n'
            '  "first_comment": "保存やシェアを促す一言コメント（40文字以内）"\n'
            '}',
            tokens=600,
        )
        m = re.search(r'\{.*\}', raw, re.DOTALL)
        if m:
            return json.loads(m.group())
    except Exception as e:
        print(f'  ⚠ メタデータ生成失敗: {e} → デフォルト使用')

    return {
        'title':         f'{theme} の習慣 #Shorts',
        'description':   f'#{theme} #shorts',
        'tags':          [theme, 'shorts', 'YouTube shorts'],
        'first_comment': f'{theme}について詳しくはコメントで！',
    }


def upload_video(yt, video_path, metadata, channel_id='', scheduled_time=None,
                 channel_label='yaseru', is_ai_generated=True, made_for_kids=False):
    """
    YouTubeに動画をアップロードする。
    yt: YouTubeClient インスタンス
    scheduled_time: ISO 8601 UTC文字列 (例: '2024-01-01T08:00:00Z')
    """
    privacy = 'private' if scheduled_time else 'public'
    category_id = CATEGORY_MAP.get(channel_label, '22')

    body = {
        'snippet': {
            'title':           metadata.get('title', 'YouTube Shorts'),
            'description':     metadata.get('description', ''),
            'tags':            metadata.get('tags', []),
            'categoryId':      category_id,
            'defaultLanguage': 'ja',
        },
        'status': {
            'privacyStatus':            privacy,
            'selfDeclaredMadeForKids':  made_for_kids,
            'containsSyntheticMedia':   is_ai_generated,
        },
    }
    if scheduled_time:
        body['status']['publishAt'] = scheduled_time

    print(f'    ⬆️  アップロード中...')
    video_id = yt.upload_video(video_path, body)
    print(f'    ✅ アップロード完了')
    return video_id


def post_comment(yt, video_id, comment_text):
    """動画にファーストコメントを投稿する"""
    try:
        yt.post_comment(video_id, comment_text)
        print(f'    💬 コメント投稿完了')
        return True
    except Exception as e:
        print(f'    ⚠ コメント投稿失敗（スケジュール動画は公開後に再試行）: {e}')
        return False


def save_pending_comment(video_id, comment_text, pending_file):
    """コメント保留リストに追加"""
    pending_file = Path(pending_file)
    data = []
    if pending_file.exists():
        try:
            data = json.loads(pending_file.read_text())
        except Exception:
            pass
    data.append({'video_id': video_id, 'comment': comment_text})
    pending_file.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    print(f'    📋 コメントを保留リストに追加: {pending_file.name}')


def flush_pending_comments(yt, pending_file):
    """保留コメントのうち公開済みのものに投稿する"""
    pending_file = Path(pending_file)
    if not pending_file.exists():
        return

    try:
        data = json.loads(pending_file.read_text())
    except Exception:
        return

    remaining = []
    for item in data:
        vid_id = item['video_id']
        comment = item['comment']
        try:
            status = yt.get_video_status(vid_id)
            if status:
                if status == 'public':
                    if post_comment(yt, vid_id, comment):
                        print(f'  ✅ 保留コメント投稿: {vid_id}')
                        continue
            remaining.append(item)
        except Exception as e:
            print(f'  ⚠ 保留コメント確認失敗: {e}')
            remaining.append(item)

    pending_file.write_text(json.dumps(remaining, ensure_ascii=False, indent=2))
    if len(data) != len(remaining):
        print(f'  📋 保留コメント: {len(data)-len(remaining)}件投稿済み, {len(remaining)}件残り')
