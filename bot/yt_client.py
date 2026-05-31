"""
YouTube Data API v3 クライアント（requests ベース、google-api-python-client 不使用）
"""
import json, os, time, requests
from pathlib import Path

YT_BASE = 'https://www.googleapis.com/youtube/v3'
YT_UPLOAD = 'https://www.googleapis.com/upload/youtube/v3/videos'


class YouTubeClient:
    def __init__(self, access_token):
        self.token = access_token
        self._headers = {'Authorization': f'Bearer {access_token}',
                         'Content-Type': 'application/json'}

    def _get(self, endpoint, params):
        r = requests.get(f'{YT_BASE}/{endpoint}', params=params,
                         headers=self._headers, timeout=30)
        r.raise_for_status()
        return r.json()

    def get_my_channel_name(self):
        data = self._get('channels', {'part': 'snippet', 'mine': 'true'})
        if data.get('items'):
            return data['items'][0]['snippet']['title']
        return '不明'

    def upload_video(self, video_path, body):
        """
        Resumable upload でMP4をアップロードする。
        body: YouTube API の videos.insert 用 dict
        Returns: video_id (str)
        """
        video_path = Path(video_path)
        file_size = video_path.stat().st_size

        # ステップ1: resumable upload セッション開始
        init_headers = {
            'Authorization':  f'Bearer {self.token}',
            'Content-Type':   'application/json',
            'X-Upload-Content-Type': 'video/mp4',
            'X-Upload-Content-Length': str(file_size),
        }
        r = requests.post(
            YT_UPLOAD,
            params={'uploadType': 'resumable', 'part': 'snippet,status'},
            headers=init_headers,
            data=json.dumps(body),
            timeout=30,
        )
        r.raise_for_status()
        upload_url = r.headers['Location']

        # ステップ2: ファイルをチャンク送信
        CHUNK = 8 * 1024 * 1024  # 8MB
        uploaded = 0
        with open(video_path, 'rb') as f:
            while uploaded < file_size:
                chunk = f.read(CHUNK)
                end = uploaded + len(chunk) - 1
                upload_headers = {
                    'Authorization':  f'Bearer {self.token}',
                    'Content-Range':  f'bytes {uploaded}-{end}/{file_size}',
                    'Content-Type':   'video/mp4',
                }
                r = requests.put(upload_url, headers=upload_headers,
                                 data=chunk, timeout=300)
                if r.status_code in (200, 201):
                    return r.json()['id']
                elif r.status_code == 308:
                    uploaded = end + 1
                    pct = int(uploaded / file_size * 100)
                    print(f'    アップロード {pct}%', end='\r')
                else:
                    r.raise_for_status()

        raise RuntimeError('アップロード完了応答なし')

    def post_comment(self, video_id, text):
        body = {'snippet': {
            'videoId': video_id,
            'topLevelComment': {'snippet': {'textOriginal': text}},
        }}
        r = requests.post(
            f'{YT_BASE}/commentThreads',
            params={'part': 'snippet'},
            headers=self._headers,
            data=json.dumps(body),
            timeout=30,
        )
        r.raise_for_status()
        return r.json()

    def get_video_status(self, video_id):
        data = self._get('videos', {'part': 'status', 'id': video_id})
        if data.get('items'):
            return data['items'][0]['status']['privacyStatus']
        return None
