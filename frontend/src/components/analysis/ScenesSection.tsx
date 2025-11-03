import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import type { AnalysisResult } from "../../types";

interface ScenesSectionProps {
  result: AnalysisResult | null;
}

export function ScenesSection({ result }: ScenesSectionProps) {
  if (!result || result.scenes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        まだシーン情報はありません。
      </p>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {result.scenes.map((scene, index) => (
        <Card key={`${scene.title}-${index}`} className="bg-background">
          <CardHeader>
            <CardTitle className="text-base">
              {scene.title || `シーン ${index + 1}`}
            </CardTitle>
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
