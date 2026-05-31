"""YouTube OAuth2 認証モジュール - 2チャンネル対応（google-auth不使用）"""
import os, json, pickle, urllib.parse, time, requests
from pathlib import Path

os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'

SCOPES = [
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube.force-ssl',
    'https://www.googleapis.com/auth/yt-analytics.readonly',
]

TOKEN_DIR = Path(__file__).parent.parent / '.tokens'
TOKEN_DIR.mkdir(exist_ok=True)

SECRETS_PATHS = [
    Path(__file__).parent.parent / 'client_secrets.json',
    Path('/content/client_secrets.json'),
    Path('/content/drive/MyDrive/client_secrets_youtube.json'),
]


def load_secrets():
    for p in SECRETS_PATHS:
        if p.exists():
            return json.loads(p.read_text())
    s = os.environ.get('CLIENT_SECRETS_JSON', '').strip()
    if s:
        return json.loads(s)
    raise FileNotFoundError(
        'client_secrets.json が見つかりません。\n'
        f'  {SECRETS_PATHS[0]} に置いてください。'
    )


def get_auth_url(channel_label):
    sec = load_secrets()['installed']
    return 'https://accounts.google.com/o/oauth2/auth?' + urllib.parse.urlencode({
        'client_id':     sec['client_id'],
        'redirect_uri':  'http://localhost',
        'response_type': 'code',
        'scope':         ' '.join(SCOPES),
        'access_type':   'offline',
        'prompt':        'consent',
        'state':         f'yt_{channel_label}',
    })


class TokenData:
    """シンプルなトークンデータクラス（google-auth不使用）"""
    def __init__(self, access_token, refresh_token, client_id, client_secret,
                 expires_at=0):
        self.access_token  = access_token
        self.refresh_token = refresh_token
        self.client_id     = client_id
        self.client_secret = client_secret
        self.expires_at    = expires_at  # Unix timestamp

    @property
    def expired(self):
        return time.time() >= self.expires_at - 60

    def refresh(self):
        resp = requests.post('https://oauth2.googleapis.com/token', data={
            'refresh_token': self.refresh_token,
            'client_id':     self.client_id,
            'client_secret': self.client_secret,
            'grant_type':    'refresh_token',
        }, timeout=30)
        tok = resp.json()
        if 'error' in tok:
            raise ValueError(f'トークンリフレッシュ失敗: {tok}')
        self.access_token = tok['access_token']
        self.expires_at   = time.time() + tok.get('expires_in', 3600)
        return self


def save_token_from_url(response_url, channel_label):
    """レスポンスURLからコードを取得してトークンを保存"""
    sec = load_secrets()['installed']
    code = urllib.parse.parse_qs(
        urllib.parse.urlparse(response_url).query
    ).get('code', [''])[0]
    if not code:
        raise ValueError(f'URLにcodeが見つかりません: {response_url[:120]}')

    resp = requests.post('https://oauth2.googleapis.com/token', data={
        'code':          code,
        'client_id':     sec['client_id'],
        'client_secret': sec['client_secret'],
        'redirect_uri':  'http://localhost',
        'grant_type':    'authorization_code',
    }, timeout=30)
    tok = resp.json()
    if 'error' in tok:
        raise ValueError(f'トークン交換失敗: {tok}')

    token_data = TokenData(
        access_token  = tok['access_token'],
        refresh_token = tok.get('refresh_token', ''),
        client_id     = sec['client_id'],
        client_secret = sec['client_secret'],
        expires_at    = time.time() + tok.get('expires_in', 3600),
    )
    _save_token(token_data, channel_label)
    return token_data


def _save_token(token_data, channel_label):
    path = TOKEN_DIR / f'yt_token_{channel_label}.pickle'
    with open(path, 'wb') as f:
        pickle.dump(token_data, f)
    print(f'  💾 トークン保存: {path}')


def _build_youtube_client(access_token):
    """requests ベースの軽量YouTubeクライアント"""
    from bot.yt_client import YouTubeClient
    return YouTubeClient(access_token)


def get_client(channel_label):
    """認証済みYouTubeクライアントを返す。未認証ならNoneを返す"""
    path = TOKEN_DIR / f'yt_token_{channel_label}.pickle'
    if not path.exists():
        return None

    with open(path, 'rb') as f:
        token_data = pickle.load(f)

    # 旧フォーマット（google.oauth2.credentials.Credentials）の場合は削除して再認証
    if not isinstance(token_data, TokenData):
        print(f'  ⚠ {channel_label}: 旧トークン形式 → 再認証が必要')
        path.unlink(missing_ok=True)
        return None

    if token_data.expired:
        if token_data.refresh_token:
            try:
                token_data.refresh()
                _save_token(token_data, channel_label)
                print(f'  🔄 {channel_label}: トークン自動更新')
            except Exception as e:
                print(f'  ⚠ {channel_label}: 更新失敗 ({e}) → 再認証が必要')
                path.unlink(missing_ok=True)
                return None
        else:
            print(f'  ⚠ {channel_label}: リフレッシュトークンなし → 再認証が必要')
            path.unlink(missing_ok=True)
            return None

    return _build_youtube_client(token_data.access_token)


def check_auth_status():
    """両チャンネルの認証状態を確認して表示"""
    channels = {'yaseru': 'やせる習慣図鑑', 'okane': 'お金の教科書'}
    status = {}
    for label, name in channels.items():
        yt = get_client(label)
        if yt:
            try:
                ch_name = yt.get_my_channel_name()
                print(f'  ✅ {name} ({label}): 認証済み → チャンネル: {ch_name}')
                status[label] = True
            except Exception as e:
                print(f'  ⚠ {name} ({label}): トークンあるが確認失敗 ({e})')
                status[label] = False
        else:
            print(f'  ❌ {name} ({label}): 未認証')
            status[label] = False
    return status
