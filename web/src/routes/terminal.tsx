import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createRoute } from "@tanstack/react-router";
import { LoaderCircle, SquareTerminal, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { closeTerminal, fetchTerminalSnapshot, sendTerminalInput, startTerminal } from "@/lib/api";
import { subscribeTerminalEvents } from "@/lib/events";
import type { TerminalEvent } from "@/lib/types";
import { cn } from "@/lib/utils";
import { rootRoute } from "@/routes/__root";

export const terminalRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/terminal",
  component: TerminalScreen,
});

function TerminalScreen() {
  const queryClient = useQueryClient();
  const outputRef = useRef<HTMLDivElement | null>(null);
  const [cwdDraft, setCwdDraft] = useState("");
  const [commandDraft, setCommandDraft] = useState("");
  const [streamError, setStreamError] = useState("");
  const [liveEvents, setLiveEvents] = useState<TerminalEvent[]>([]);

  const terminalQuery = useQuery({
    queryKey: ["terminal"],
    queryFn: () => fetchTerminalSnapshot(0, 800),
    refetchOnWindowFocus: false,
  });

  const session = terminalQuery.data?.session ?? null;
  const events = useMemo(() => {
    const merged = [...(terminalQuery.data?.events ?? []), ...liveEvents];
    const deduped = new Map<number, TerminalEvent>();
    for (const event of merged) {
      deduped.set(event.id, event);
    }
    return [...deduped.values()].sort((left, right) => left.id - right.id);
  }, [liveEvents, terminalQuery.data?.events]);
  const lastEventId = events.at(-1)?.id ?? 0;
  const renderedOutput = useMemo(
    () => events.map((event) => event.data).join(""),
    [events],
  );

  const ensureTerminalMutation = useMutation({
    mutationFn: (cwd: string) => startTerminal(cwd || undefined),
    onSuccess: (data) => {
      setLiveEvents([]);
      queryClient.setQueryData(["terminal"], data);
      if (data.session?.cwd) {
        setCwdDraft(data.session.cwd);
      }
    },
  });

  const sendInputMutation = useMutation({
    mutationFn: (input: string) => sendTerminalInput(input),
  });

  const closeMutation = useMutation({
    mutationFn: closeTerminal,
    onSuccess: async () => {
      setLiveEvents([]);
      await queryClient.invalidateQueries({ queryKey: ["terminal"] });
    },
  });

  useEffect(() => {
    setLiveEvents([]);
  }, [terminalQuery.data?.session?.id]);

  useEffect(() => {
    if (terminalQuery.isLoading) {
      return;
    }
    if (!session && !ensureTerminalMutation.isPending) {
      void ensureTerminalMutation.mutateAsync(cwdDraft.trim());
    }
  }, [cwdDraft, ensureTerminalMutation, session, terminalQuery.isLoading]);

  useEffect(() => {
    const unsubscribe = subscribeTerminalEvents({
      afterEventId: lastEventId,
      onEvent: (event) => {
        setStreamError("");
        setLiveEvents((current) => {
          if (current.some((entry) => entry.id === event.id)) {
            return current;
          }
          return [...current, event];
        });
      },
      onError: () => {
        setStreamError("Terminal stream disconnected. Reconnecting...");
      },
    });

    return unsubscribe;
  }, [lastEventId]);

  useEffect(() => {
    const viewport = outputRef.current;
    if (!viewport) {
      return;
    }
    viewport.scrollTop = viewport.scrollHeight;
  }, [renderedOutput]);

  const handleStart = async () => {
    await ensureTerminalMutation.mutateAsync(cwdDraft.trim());
  };

  const handleSubmit = async () => {
    const command = commandDraft.trim();
    if (!command) {
      return;
    }

    setCommandDraft("");
    await sendInputMutation.mutateAsync(`${command}\n`);
  };

  const statusTone = session?.status === "running"
    ? "text-emerald-500"
    : session?.status === "closing"
      ? "text-amber-500"
      : "text-muted-foreground";

  const errorMessage = readError(
    terminalQuery.error,
    ensureTerminalMutation.error,
    sendInputMutation.error,
    closeMutation.error,
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <SquareTerminal className="size-5" />
            Host Terminal
          </h2>
          <p className="text-sm text-muted-foreground">
            Direct shell access on the main machine from Talkeby.
          </p>
        </div>
        <Button asChild variant="outline" className="rounded-xl">
          <Link to="/">Back to Workspace</Link>
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[20rem_minmax(0,1fr)]">
        <Card className="theme-surface border-border/50 shadow-md">
          <CardHeader>
            <CardTitle>Session</CardTitle>
            <CardDescription>Start or reconnect to the shared host terminal.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Working Directory
              </label>
              <Input
                value={cwdDraft}
                placeholder="Use Talkeby default workspace"
                onChange={(event) => setCwdDraft(event.target.value)}
              />
            </div>

            <div className="rounded-xl border border-border/50 bg-background/70 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Status</span>
                <span className={cn("font-medium capitalize", statusTone)}>
                  {session?.status ?? "offline"}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Shell</span>
                <span className="truncate font-mono text-xs">{session?.shell ?? "Not connected"}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Current Dir</span>
                <span className="truncate font-mono text-xs">{session?.cwd ?? "-"}</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                className="rounded-xl"
                disabled={ensureTerminalMutation.isPending}
                onClick={() => void handleStart()}
              >
                {ensureTerminalMutation.isPending ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : null}
                {session ? "Reconnect Snapshot" : "Start Terminal"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                disabled={!session || closeMutation.isPending}
                onClick={() => closeMutation.mutate()}
              >
                {closeMutation.isPending ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
                Close
              </Button>
            </div>

            {streamError ? (
              <p className="text-sm text-amber-600">{streamError}</p>
            ) : null}
            {errorMessage ? (
              <p className="text-sm text-destructive">{errorMessage}</p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="theme-surface flex min-h-[65vh] max-h-[78vh] flex-col overflow-hidden border-border/50 shadow-md">
          <CardHeader className="shrink-0 border-b border-border/40">
            <CardTitle>Console</CardTitle>
            <CardDescription>
              Output is streamed live. Commands are executed in the shared host shell.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col gap-4 p-0">
            <div
              ref={outputRef}
              className="min-h-0 flex-1 overflow-y-auto bg-slate-950 px-4 py-4 font-mono text-sm text-slate-100"
            >
              <pre className="whitespace-pre-wrap break-words">{renderedOutput || "No terminal output yet.\n"}</pre>
            </div>

            <div className="shrink-0 border-t border-border/40 bg-card/70 p-4">
              <div className="space-y-3">
                <Textarea
                  value={commandDraft}
                  rows={3}
                  placeholder="Type a command, then send it to the host shell"
                  className="min-h-[88px] rounded-xl bg-background"
                  onChange={(event) => setCommandDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                      event.preventDefault();
                      void handleSubmit();
                    }
                  }}
                />
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    Send with Ctrl/Cmd+Enter.
                  </p>
                  <Button
                    type="button"
                    className="rounded-xl"
                    disabled={!session || session.status !== "running" || sendInputMutation.isPending}
                    onClick={() => void handleSubmit()}
                  >
                    {sendInputMutation.isPending ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : null}
                    Send Command
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function readError(...values: unknown[]) {
  for (const value of values) {
    if (value instanceof Error && value.message.trim()) {
      return value.message.trim();
    }
  }
  return "";
}
