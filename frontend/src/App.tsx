import { useEffect, useMemo, useState } from "react";

import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { ScrollArea } from "./components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "./components/ui/alert-dialog";
import { useAgentRunner } from "./hooks/useAgentRunner";
import type { AnalysisResult } from "./types";

const DEFAULT_API_URL = "http://localhost:8000/api/analyze";

function formatNumber(value: number) {
  return new Intl.NumberFormat("ja-JP").format(value);
}

function CharactersView({ result }: { result: AnalysisResult | null }) {
  if (!result || result.characters.length === 0) {
    return <p className="text-sm text-muted-foreground">まだキャラクター情報はありません。</p>;
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {result.characters.map((character) => (
        <Card key={character.name} className="border-dashed border-primary/40 bg-background">
          <CardHeader>
            <CardTitle className="text-base">{character.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
              {character.description}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ScenesView({ result }: { result: AnalysisResult | null }) {
  if (!result || result.scenes.length === 0) {
    return <p className="text-sm text-muted-foreground">まだシーン情報はありません。</p>;
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {result.scenes.map((scene, index) => (
        <Card key={`${scene.title}-${index}`} className="bg-background">
          <CardHeader>
            <CardTitle className="text-base">{scene.title || `シーン ${index + 1}`}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
              {scene.summary}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function App() {
  const apiUrl = useMemo(() => import.meta.env.VITE_BACKEND_URL ?? DEFAULT_API_URL, []);
  const { state, start, resume } = useAgentRunner({ apiUrl });
  const [approvalOpen, setApprovalOpen] = useState(false);

  useEffect(() => {
    setApprovalOpen(Boolean(state.approval));
  }, [state.approval]);

  const handleStart = () => {
    start();
  };

  const handleApproval = (approved: boolean) => {
    setApprovalOpen(false);
    resume(approved);
  };

  return (
    <div className="min-h-screen bg-muted/40">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10">
        <section className="space-y-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">小説分析パイロット</h1>
            <p className="text-sm text-muted-foreground">
              プロジェクトフォルダ内のテキストを読み込み、キャラクターとシーンを抽出します。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={handleStart}
              disabled={state.status === "running" || state.status === "awaiting-approval"}
            >
              分析開始
            </Button>
            <span className="text-sm text-muted-foreground">
              {state.status === "running" && "分析を実行中です…"}
              {state.status === "awaiting-approval" && "ユーザー承認待ちです"}
              {state.status === "completed" && "最新の分析が完了しました"}
              {state.status === "error" && `エラー: ${state.error ?? "不明な問題"}`}
            </span>
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          <Card className="h-[320px]">
            <CardHeader>
              <CardTitle className="text-lg">進捗</CardTitle>
            </CardHeader>
            <CardContent className="h-[220px]">
              <ScrollArea className="h-full">
                <div className="space-y-3 pr-2 text-sm">
                  {state.steps.length === 0 ? (
                    <p className="text-muted-foreground">まだステップは開始されていません。</p>
                  ) : (
                    state.steps.map((step) => (
                      <div
                        key={step.name}
                        className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2"
                      >
                        <span>{step.name}</span>
                        <span
                          className={
                            step.status === "completed"
                              ? "text-xs font-medium text-emerald-600"
                              : "text-xs font-medium text-amber-600"
                          }
                        >
                          {step.status === "completed" ? "完了" : "実行中"}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className="h-[320px]">
            <CardHeader>
              <CardTitle className="text-lg">メッセージ</CardTitle>
            </CardHeader>
            <CardContent className="h-[220px]">
              <ScrollArea className="h-full">
                <div className="space-y-3 pr-2 text-sm">
                  {state.messages.length === 0 ? (
                    <p className="text-muted-foreground">アシスタントのメッセージはまだありません。</p>
                  ) : (
                    state.messages.map((message, index) => (
                      <div key={`${message}-${index}`} className="rounded-md border border-border bg-background p-3">
                        <p className="whitespace-pre-wrap leading-relaxed text-muted-foreground">{message}</p>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">キャラクター</h2>
          </div>
          <CharactersView result={state.result} />
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">シーン</h2>
          </div>
          <ScenesView result={state.result} />
        </section>
      </main>

      <AlertDialog open={approvalOpen} onOpenChange={setApprovalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>分析を開始する前に確認してください</AlertDialogTitle>
            <AlertDialogDescription>
              指定されたテキストを {formatNumber(state.approval?.chunkCount ?? 0)} 個のチャンクに分割します。
              合計文字数は約 {formatNumber(state.approval?.totalCharacters ?? 0)} 文字です。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 rounded-md bg-muted/60 p-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">対象ファイル</p>
            <ul className="list-inside list-disc space-y-1">
              {(state.approval?.files ?? []).map((file) => (
                <li key={file}>{file}</li>
              ))}
            </ul>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => handleApproval(false)}>中止する</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleApproval(true)}>分析を続行</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
