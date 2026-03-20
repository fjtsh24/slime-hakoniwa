# エラーログ確認・バグ修正

Firebase Cloud Functions と Netlify Functions の本番ログを取得し、エラーを特定してバグ修正を行います。

## 手順

### 1. Firebase Cloud Functions ログ取得

```bash
# 直近1時間のエラーログ（severity=ERROR）
firebase functions:log --project slime-sim-prototype --only scheduledTurnProcessor 2>&1 | grep -i "error\|ERROR\|exception\|Exception" | tail -50

# 全ログ（直近）
firebase functions:log --project slime-sim-prototype 2>&1 | tail -100
```

構造化ログ（JSON形式）が出力される場合は severity フィールドでフィルタ：
```bash
firebase functions:log --project slime-sim-prototype 2>&1 | python3 -c "
import sys, json
for line in sys.stdin:
    line = line.strip()
    try:
        obj = json.loads(line)
        if obj.get('severity') in ('ERROR', 'WARNING'):
            print(json.dumps(obj, ensure_ascii=False, indent=2))
    except:
        if 'ERROR' in line or 'error' in line.lower():
            print(line)
" | head -200
```

### 2. Netlify Functions ログ取得

Netlify CLI の対話型ログは使用不可のため、以下の方法で確認：

```bash
# netlify-cli でサイト情報確認
netlify status

# 関数ログ（最新）
netlify functions:list
```

**重要**: Netlify の詳細ログは Netlify ダッシュボード → Functions → Logs から確認。
ローカルで再現する場合は `netlify dev` を起動してリクエストを送る。

### 3. ログ分析・バグ特定

取得したログを以下の観点で分析：

1. **エラーメッセージ**: `error` フィールドまたはスタックトレース
2. **コンテキスト**: `worldId`, `slimeId`, `turnNumber`, `actionType` などのフィールド
3. **パターン**: 同一エラーが複数回発生しているか
4. **タイムライン**: いつから発生しているか（`createdAt` や関数実行時刻）

### 4. バグ修正の実施

エラー特定後は `diagnose` コマンドの手順に従い：
1. 根本原因を診断（症状への対処でなく原因を修正）
2. 影響ファイルを特定して読み込む
3. 修正を実装
4. テストを実行して確認（`cd functions && npm test`）
5. コミット・プッシュ・PR作成

## ログフィールドの読み方

### Firebase Cloud Functions（turnProcessor）

| フィールド | 説明 |
|-----------|------|
| `severity` | DEBUG / INFO / WARNING / ERROR |
| `message` | ログメッセージ（`[turnProcessor] ...`） |
| `worldId` | 処理中のワールドID |
| `turn` | ターン番号 |
| `slimeId` | 処理中のスライムID |
| `actionType` | 実行アクション種別 |
| `durationMs` | 処理時間（ms） |
| `error` | エラーメッセージ |
| `stack` | スタックトレース |

### Netlify Functions（API）

| フィールド | 説明 |
|-----------|------|
| `severity` | DEBUG / INFO / WARNING / ERROR |
| `message` | ログメッセージ（`[API] ...`） |
| `method` | HTTP メソッド |
| `path` | APIパス |
| `uid` | 認証ユーザーUID |
| `durationMs` | レスポンス時間（ms） |
| `error` | エラーメッセージ |

## よくあるエラーパターン

- **`認証に失敗しました`**: IDトークン期限切れ or Firebaseプロジェクト設定ミス
- **`スライムが見つかりません`**: Firestore のドキュメントID不一致
- **`過去のターンには予約できません`**: クライアントのターン番号がズレている
- **`スライム処理エラー`**: turnProcessor のアクション処理バグ（`slimeId`, `actionType` を確認）
