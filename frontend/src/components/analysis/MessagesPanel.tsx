import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { ScrollArea } from "../ui/scroll-area";

interface MessagesPanelProps {
  messages: string[];
}

export function MessagesPanel({ messages }: MessagesPanelProps) {
  return (
    <Card className="h-[320px]">
      <CardHeader>
        <CardTitle className="text-lg">メッセージ</CardTitle>
      </CardHeader>
      <CardContent className="h-[220px]">
        <ScrollArea className="h-full">
          <div className="space-y-3 pr-2 text-sm">
            {messages.length === 0 ? (
              <p className="text-muted-foreground">
                アシスタントのメッセージはまだありません。
              </p>
            ) : (
              messages.map((message, index) => (
                <div
                  key={`${message}-${index}`}
                  className="rounded-md border border-border bg-background p-3"
                >
                  <p className="whitespace-pre-wrap leading-relaxed text-muted-foreground">
                    {message}
                  </p>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
