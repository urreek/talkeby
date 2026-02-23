import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { RuntimeApproval } from "@/lib/types";

type RuntimeApprovalCardsProps = {
  approvals: RuntimeApproval[];
  approvingId?: string;
  denyingId?: string;
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
};

function formatRequestedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleTimeString();
}

function riskClass(value: string) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "low") {
    return "bg-emerald-500/10 text-emerald-500";
  }
  if (normalized === "medium") {
    return "bg-amber-500/10 text-amber-500";
  }
  return "bg-red-500/10 text-red-500";
}

function compactText(value: string, max = 220) {
  const text = String(value || "").trim();
  if (!text) {
    return { preview: "", truncated: false };
  }
  if (text.length <= max) {
    return { preview: text, truncated: false };
  }
  return {
    preview: `${text.slice(0, max).trimEnd()}...`,
    truncated: true,
  };
}

export function RuntimeApprovalCards({
  approvals,
  approvingId,
  denyingId,
  onApprove,
  onDeny,
}: RuntimeApprovalCardsProps) {
  const [expandedById, setExpandedById] = useState<Record<string, boolean>>({});

  if (approvals.length === 0) {
    return null;
  }

  return (
    <Card className="theme-surface border-amber-500/30">
      <CardHeader>
        <CardTitle>Runtime Approvals</CardTitle>
        <CardDescription>
          Risky runtime actions are paused until you decide.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {approvals.map((approval, index) => (
            <div key={approval.id} className="space-y-3">
              {(() => {
                const showFull = Boolean(expandedById[approval.id]);
                const summaryText = compactText(approval.summary, 200);
                const reasonText = compactText(approval.reason || "", 260);
                const commandText = compactText(approval.command || "", 260);

                return (
                  <>
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 break-words text-sm font-semibold">
                    {showFull ? approval.summary : summaryText.preview}
                  </p>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${riskClass(approval.riskLevel)}`}>
                    {approval.riskLevel}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Job {approval.jobId} · {approval.kind} · {formatRequestedAt(approval.createdAt)}
                </p>
                {approval.command ? (
                  <p className="max-h-24 overflow-auto rounded-md bg-muted/40 px-2 py-1 font-mono text-xs text-foreground break-all whitespace-pre-wrap">
                    {showFull ? approval.command : commandText.preview}
                  </p>
                ) : null}
                {approval.cwd ? (
                  <p className="break-all text-xs text-muted-foreground">
                    CWD: {approval.cwd}
                  </p>
                ) : null}
                {approval.reason ? (
                  <p className="max-h-24 overflow-auto break-words whitespace-pre-wrap text-xs text-muted-foreground">
                    Reason: {showFull ? approval.reason : reasonText.preview}
                  </p>
                ) : null}
                {summaryText.truncated || commandText.truncated || reasonText.truncated ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() =>
                      setExpandedById((current) => ({
                        ...current,
                        [approval.id]: !showFull,
                      }))
                    }
                  >
                    {showFull ? "Show less" : "Show more"}
                  </Button>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={() => onApprove(approval.id)}
                  disabled={approvingId === approval.id || denyingId === approval.id}
                >
                  {approvingId === approval.id ? "Approving..." : "Approve"}
                </Button>
                <Button
                  variant="outline"
                  className="bg-background hover:bg-secondary"
                  onClick={() => onDeny(approval.id)}
                  disabled={approvingId === approval.id || denyingId === approval.id}
                >
                  {denyingId === approval.id ? "Denying..." : "Deny"}
                </Button>
              </div>
                  </>
                );
              })()}
              {index < approvals.length - 1 ? <Separator /> : null}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
