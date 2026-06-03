"""ノートブックを1本だけローカル実行するスクリプト"""
import sys, os, types, json, builtins, traceback
from pathlib import Path

# ── 1. google.colab をモック ────────────────────────────────────────────
_colab_mod   = types.ModuleType('google.colab')
_userdata    = types.ModuleType('google.colab.userdata')
_drive_mod   = types.ModuleType('google.colab.drive')
_output_mod  = types.ModuleType('google.colab.output')
_display_mod = types.ModuleType('IPython.display')
_ipython_mod = types.ModuleType('IPython')

class _FakeDrive:
    @staticmethod
    def mount(*a, **kw): pass

class _FakeUserdata:
    @staticmethod
    def get(key, default=''): return os.environ.get(key, default)

_colab_mod.userdata = _FakeUserdata()
_colab_mod.drive    = _FakeDrive()
_colab_mod.output   = types.SimpleNamespace(clear=lambda **kw: None, no_vertical_scroll=lambda: None)
_display_mod.display = lambda *a, **kw: None
_display_mod.clear_output = lambda **kw: None
_ipython_mod.display = _display_mod

for _name, _mod in [
    ('google',              types.ModuleType('google')),
    ('google.colab',        _colab_mod),
    ('google.colab.userdata', _userdata),
    ('google.colab.drive',  _drive_mod),
    ('google.colab.output', _output_mod),
    ('googleapiclient',     types.ModuleType('googleapiclient')),
    ('googleapiclient.discovery', types.ModuleType('googleapiclient.discovery')),
    ('googleapiclient.http', types.ModuleType('googleapiclient.http')),
    ('google_auth_oauthlib',types.ModuleType('google_auth_oauthlib')),
    ('google_auth_oauthlib.flow', types.ModuleType('google_auth_oauthlib.flow')),
    ('google.auth',         types.ModuleType('google.auth')),
    ('google.oauth2',       types.ModuleType('google.oauth2')),
    ('google.oauth2.credentials', types.ModuleType('google.oauth2.credentials')),
    ('IPython',             _ipython_mod),
    ('IPython.display',     _display_mod),
    ('pydub',               types.ModuleType('pydub')),
    ('pydub.AudioSegment',  types.ModuleType('pydub.AudioSegment')),
]:
    sys.modules[_name] = _mod

# pydub.AudioSegment stub
_pydub = sys.modules['pydub']
class _FakeAS:
    @staticmethod
    def from_mp3(*a, **kw): return _FakeAS()
    def export(self, *a, **kw): pass
    @property
    def duration_seconds(self): return 5.0
_pydub.AudioSegment = _FakeAS

# google.auth.credentials stub
_google_auth = sys.modules['google.auth']
_google_auth.credentials = types.SimpleNamespace(Credentials=object)

# ── 2. APIキーと設定（環境変数から読み込む）────────────────────────────
# 実行前に環境変数をセットしてください:
#   export CLAUDE_API_KEY=sk-ant-api03-...
#   export PEXELS_API_KEY=...
#   export ELEVENLABS_API_KEY=sk_...
CLAUDE_API_KEY     = os.environ.get('CLAUDE_API_KEY', '')
PEXELS_API_KEY     = os.environ.get('PEXELS_API_KEY', '')
ELEVENLABS_API_KEY = os.environ.get('ELEVENLABS_API_KEY', '')
YOUTUBE_API_KEY    = os.environ.get('YOUTUBE_API_KEY', 'DUMMY')
GOOGLE_API_KEY     = os.environ.get('GOOGLE_API_KEY', '')

THEMES            = ['タンパク質']
DURATION          = 45
IMAGE_STYLE       = 'realistic'
VIDEOS_PER_THEME  = 1
AUTO_UPLOAD       = False
UPLOAD_PRIVACY    = 'private'
SCHEDULE_POST     = False
FORCE_CHANNEL     = ''
DRIVE_FOLDER_ID   = ''
BGM_FOLDER        = ''
YASERU_CHANNEL_ID = ''
OKANE_CHANNEL_ID  = ''
LOOP_STRUCTURE    = True
GEMINI_IMAGE_MODEL= ''
IMG_SWITCH_SEC    = 2.0
VIDEO_FORMAT      = 'standard'
CHANNEL_NAME      = ''
DIAGNOSIS_ITEMS   = 4
MASCOT_PROMPT     = ''
ASMR_TICK         = False
GENERATION_START_HOUR = 0
PUBLISH_TIME_OVERRIDE = ''
POST_WINDOWS      = []
SCHEDULE_POST     = False
_GRADIENT_SKIP_PATHS = []

# ── 3. ノートブック読み込み ──────────────────────────────────────────────
nb = json.load(open('YouTube_Shorts_ワンクリック生成.ipynb'))
def _cell(i): return ''.join(nb['cells'][i]['source'])

# ── 4. 共有グローバル辞書 ────────────────────────────────────────────────
G = {
    'CLAUDE_API_KEY': CLAUDE_API_KEY,
    'PEXELS_API_KEY': PEXELS_API_KEY,
    'ELEVENLABS_API_KEY': ELEVENLABS_API_KEY,
    'YOUTUBE_API_KEY': YOUTUBE_API_KEY,
    'GOOGLE_API_KEY': GOOGLE_API_KEY,
    'THEMES': THEMES,
    'THEME': THEMES[0],
    'DURATION': DURATION,
    'IMAGE_STYLE': IMAGE_STYLE,
    'VIDEOS_PER_THEME': VIDEOS_PER_THEME,
    'AUTO_UPLOAD': False,
    'UPLOAD_PRIVACY': UPLOAD_PRIVACY,
    'SCHEDULE_POST': False,
    'FORCE_CHANNEL': FORCE_CHANNEL,
    'DRIVE_FOLDER_ID': DRIVE_FOLDER_ID,
    'BGM_FOLDER': BGM_FOLDER,
    'YASERU_CHANNEL_ID': YASERU_CHANNEL_ID,
    'OKANE_CHANNEL_ID': OKANE_CHANNEL_ID,
    'LOOP_STRUCTURE': LOOP_STRUCTURE,
    'GEMINI_IMAGE_MODEL': GEMINI_IMAGE_MODEL,
    'IMG_SWITCH_SEC': IMG_SWITCH_SEC,
    'VIDEO_FORMAT': VIDEO_FORMAT,
    'CHANNEL_NAME': CHANNEL_NAME,
    'DIAGNOSIS_ITEMS': DIAGNOSIS_ITEMS,
    'MASCOT_PROMPT': MASCOT_PROMPT,
    'ASMR_TICK': ASMR_TICK,
    'GENERATION_START_HOUR': 0,
    'PUBLISH_TIME_OVERRIDE': '',
    'POST_WINDOWS': [],
    '_GRADIENT_SKIP_PATHS': [],
    'ANGLES': [],
    'VIDEO_COUNT': 1,
    'DIAGNOSIS_LINES': [],
    # Colab stub
    'drive': _FakeDrive(),
}

# ── 5. Cell1を実行してchanel分類関数などを取得 ──────────────────────────
print('▶ Cell1 実行中...')
src1 = _cell(1)
# APIキーをCell1の先頭定義より前に上書き注入
src1 = (
    f"CLAUDE_API_KEY     = {repr(CLAUDE_API_KEY)}\n"
    f"PEXELS_API_KEY     = {repr(PEXELS_API_KEY)}\n"
    f"ELEVENLABS_API_KEY = {repr(ELEVENLABS_API_KEY)}\n"
    f"YOUTUBE_API_KEY    = {repr(YOUTUBE_API_KEY or 'DUMMY')}\n"
    f"GOOGLE_API_KEY     = {repr(GOOGLE_API_KEY or '')}\n"
    + src1
)
# バリデーション raise を警告に降格
import re as _re
src1 = _re.sub(
    r"raise ValueError\('❌ (YOUTUBE|CLAUDE|PEXELS)_API_KEY[^']*'\)",
    r"print('⚠ skip validation')",
    src1
)
# client_secrets.json ブロックをスキップ（YouTube投稿しないので不要）
_cs_start = src1.find('# ── client_secrets.json を3ステップで取得')
_cs_end   = src1.find("print('  ✅ client_secrets.json: OK')")
if _cs_start >= 0 and _cs_end >= 0:
    src1 = (
        src1[:_cs_start]
        + "_csj_path = '/dev/null'  # client_secrets skipped (no YouTube upload)\n"
        + src1[_cs_end:]
    )
exec(src1, G)
print('✅ Cell1 完了')

# ── 6. Cell5を実行してANGLES生成 ────────────────────────────────────────
print('\n▶ Cell5 (ANGLES生成) 実行中...')
src5 = _cell(5)
# 「セル4で自動スタート」の待機処理をスキップ
src5_patched = src5
exec(src5_patched, G)
print(f'✅ Cell5 完了 — ANGLES: {G.get("ANGLES", [])}')
print(f'   THEME={G.get("THEME")}, VIDEO_COUNT={G.get("VIDEO_COUNT")}')

# 1本だけ生成するためANGLESを1件に絞る
if G.get('ANGLES'):
    G['ANGLES'] = [G['ANGLES'][0]]
    G['VIDEO_COUNT'] = 1
else:
    G['ANGLES'] = [f'{THEMES[0]}の効果5選']
    G['VIDEO_COUNT'] = 1

# ── 7. Cell6の後半ループのみ実行（関数定義+1本）──────────────────────────
print('\n▶ Cell6 (動画生成) 実行中...')
src6 = _cell(6)

# Drive/YouTube関連のアップロードブロックをスキップ
# Cell6末尾のアップロード部分はAUTO_UPLOAD=Falseなので自動スキップされる
import time as _time
G['start_all'] = _time.time()
G['completed'] = []
G['failed']    = []

exec(src6, G)

comp = G.get('completed', [])
fail = G.get('failed', [])
print(f'\n{"="*50}')
if comp:
    for item in comp:
        if isinstance(item, tuple) and len(item) == 3:
            print(f'✅ 生成完了: {item[2]}')
        else:
            print(f'✅ 生成完了: {item}')
else:
    print('❌ 生成失敗')
    for f in fail:
        print(f'  エラー: {f}')
