# copilotkit-langgraph-trial

小説テキストを LangGraph エージェントで分析し、AG-UI プロトコル経由で進捗・結果をフロントエンドに配信するデモです。v0 では以下を提供します。

- 進捗表示付きの分析実行 UI
- LangGraph + AG-UI を用いたストリーミング処理
- ユーザー承認を挟むヒューマンインザループ
- 抽出したキャラクター・シーン情報の表示

## プロジェクト構成

- `backend/` – FastAPI + LangGraph の分析エージェント
- `frontend/` – React + Vite の UI (AG-UI プロトコル対応)
- `sample_texts/` – 開発用のテキストファイル置き場

## セットアップ

共通の設定値は `.env.example` を参照してください。

```bash
cp .env.example backend/.env
cp .env.example frontend/.env.local  # 必要に応じて
```

### Backend

バックエンドは [uv](https://github.com/astral-sh/uv) で依存関係を管理します。

```bash
cd backend
uv sync
uv run fastapi run app/main.py --reload
```

環境変数:

- `OPENAI_API_KEY` – OpenAI API キー
- `PROJECT_TEXT_DIR` – 解析対象の `.txt` ファイルが置かれたディレクトリ
- `ANALYSIS_OUTPUT_DIR` – 解析結果 JSON を保存するディレクトリ
- `OPENAI_MODEL` – 使用する Chat モデル (例: `gpt-4o-mini`)

### Frontend

```bash
cd frontend
npm install
npm run dev
```

`VITE_BACKEND_URL` を `.env.local` などで指定すると、バックエンドのエンドポイントを上書きできます (既定値は `http://localhost:8000/api/analyze`)。

## 開発メモ

- LangGraph の状態管理には `MemorySaver` を用い、ヒューマンインザループでの再開をサポート
- テキストチャンクごとの分析を並列ノードで実行し、集約ノードでキャラクター・シーン情報を統合
- フロントエンドは `@ag-ui/client` の HTTP エージェントを利用して SSE ストリームを購読

## ライセンス

MIT