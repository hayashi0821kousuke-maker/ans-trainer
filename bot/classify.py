"""テーマ → チャンネル自動分類モジュール"""
import re

CHANNEL_RULES = {
    'yaseru': {
        'name': 'やせる習慣図鑑',
        'keywords': [
            'ダイエット', '食事', '健康', 'ストレッチ', '筋トレ', '美容', '腸活',
            'スキンケア', '睡眠', '栄養', 'カロリー', 'レシピ', '体重', '脂肪',
            '運動', 'ヨガ', 'トレーニング', '肌', '代謝', 'デトックス', '断食',
            'プロテイン', 'ビタミン', '腸内', 'ウォーキング', 'ランニング',
            '生活習慣', '疲労', 'ストレス', '免疫', '食べ方',
        ],
    },
    'okane': {
        'name': 'お金の教科書',
        'keywords': [
            'お金', '投資', 'NISA', '副業', '節約', '資産', '株', '貯金',
            '収入', 'FX', '不動産', '保険', '税金', '年金', '家計', 'iDeCo',
            '運用', '利益', '配当', 'ETF', '積立', '借金', 'ローン', '給料',
            '転職', '起業', 'フリーランス', '稼ぐ', '経費', '確定申告',
            'クレジット', 'ポイント', 'キャッシュレス', 'インフレ', '金利',
        ],
    },
}


def classify_theme(theme, call_ai_fn=None):
    """
    テーマをチャンネルに分類する。
    キーワードマッチ → 失敗時はClaudeで判定。
    Returns: 'yaseru' or 'okane'
    """
    theme_lower = theme.lower()

    # キーワードスコアリング
    scores = {label: 0 for label in CHANNEL_RULES}
    for label, rule in CHANNEL_RULES.items():
        for kw in rule['keywords']:
            if kw in theme:
                scores[label] += 1

    best = max(scores, key=scores.get)
    if scores[best] > 0:
        return best

    # スコアが同点または0 → Claudeで判定
    if call_ai_fn:
        try:
            prompt = (
                f'テーマ「{theme}」は以下のどちらに近いですか？\n'
                f'A: やせる習慣図鑑（健康・ダイエット・食事・美容・運動系）\n'
                f'B: お金の教科書（投資・節約・副業・資産運用・税金系）\n'
                f'AかBだけ答えてください。'
            )
            answer = call_ai_fn(prompt, tokens=5).strip().upper()
            return 'yaseru' if 'A' in answer else 'okane'
        except Exception as e:
            print(f'  ⚠ Claude分類失敗: {e} → デフォルトyaseru')

    # フォールバック: やせる習慣図鑑
    return 'yaseru'


def classify_themes(themes, call_ai_fn=None):
    """
    複数テーマをまとめて分類する。
    Returns: dict {theme: channel_label}
    """
    result = {}
    for theme in themes:
        label = classify_theme(theme, call_ai_fn)
        ch_name = CHANNEL_RULES[label]['name']
        print(f'  📌 「{theme}」 → {ch_name}')
        result[theme] = label
    return result
