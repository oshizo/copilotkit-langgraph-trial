# 概要

## v0 機能一覧
### 画面
* 分析開始ボタン
    * 分析を開始する
* 分析進捗表示
    * 分析のAgentフローの進捗を画面に表示し、状況を閲覧できる
* 分析承認
    * 分析の途中（後述）でユーザーへの承認依頼を表示する
    * ユーザーの承認操作を受け付ける
* 分析結果表示
    * 分析結果のキャラクターリストと、シーンリストの情報をカードレイアウトで表示

### バックエンド
* 分析
    * 分析実施
        * 以下の処理を行い、進捗状況をAG-UIプロトコルで画面に逐次返却する。処理はSequentialやParallelにagentを組み合わせるlanggraphの機能を使う
            1. 環境変数で指定されているプロジェクトディレクトリから.txtファイルをすべて読み込む
            2. ファイルが大きい場合は扱える単位に分割（20000字程度）し、LLMに処理させるデータリストを作成する
                3に進む前に、ユーザーに承認を求める
            3. データごとに以下の分析を行うLLM処理をlanggraphのLLMのAgentで実行する。OpenAI APIを使う。以下の処理は並列化して行う。並列化はlanggraphの機能を使う
                 3-1. キャラクター名とキャラクタープロフィールの抽出
                 3-2. シーンのリストとシーン概要の抽出
            4. 3の処理結果を再びLLMのAgentで集約し、キャラクター情報リスト、シーン情報リストを作成する
            5. 作成した情報をjsonファイルに記録する

## v1機能一覧
### 画面
* ファイルアップロード
    * テキストファイルを複数アップロードする
* プロジェクト作成ボタン
    * 対象の小説を分析、結果を保持する単位であるプロジェクトの新規作成を行う
* プロジェクト一覧
    * サイドバーにプロジェクト一覧を表示
    * 選択したプロジェクトの結果をメインペインに復元する
    * プロジェクト名を変更できる

### バックエンド
* ファイルアップロード受付
    * アップロードされたファイルを、プロジェクトフォルダに格納する
* プロジェクト作成
    * 画面でプロジェクトが作成され、ファイルがアップロードされた段階でプロジェクトをデータとして作成する
    * ファイルはプロジェクトごとのフォルダに格納する

## v2機能一覧
* ログイン
* 小説をrag dbに登録してシンプルなrag chatを行う

## 方針
* adkの標準的なagent機能と、ag-uiプロトコルを利用する。
* 画面はag-uiプロトコルを使ったcopilotkitを使う
    * @ag-ui/client, @copilotkit/react-coreなど
* copilotkitを使うagent系以外のuiは、shadcnを使い、自前でUIコンポーネントを実装しない。
* 最低限の実装を重視
* チャンキングなどもlangchainにある機能を利用
* sseを使う
* sseはag-ui経由で使用し、ag-uiでカバーできるagent周りでは自前実装は行わない。
* リポジトリ構成はモノレポとし、本リポジトリにfrontendとbackendの両方を入れる
* バックエンドはpython fastapiを使う
* agent機能はlanggraphを使う
* langgraphのag-uiラッパーを利用する
    * ag-ui-langgraph, openaiなど
    * https://github.com/ag-ui-protocol/ag-ui/tree/main/integrations/langgraph/python
        * human in the loopは以下を参考
            * https://github.com/ag-ui-protocol/ag-ui/blob/main/integrations/langgraph/python/examples/agents/human_in_the_loop/agent.py
* 環境変数はfastapiのSettingクラスを使って管理し、.env.exampleを作成する
* pythonの構築はuvを使って行う
* フォルダ階層は深くせず、シンプルな構成とする
* 

# Build
npm run dev

