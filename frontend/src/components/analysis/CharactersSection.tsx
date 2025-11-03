import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import type { AnalysisResult } from "../../types";

interface CharactersSectionProps {
  result: AnalysisResult | null;
}

export function CharactersSection({ result }: CharactersSectionProps) {
  if (!result || result.characters.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        まだキャラクター情報はありません。
      </p>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {result.characters.map((character) => (
        <Card
          key={character.name}
          className="border-dashed border-primary/40 bg-background"
        >
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
