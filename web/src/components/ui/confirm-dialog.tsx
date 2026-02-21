import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";

type ConfirmDialogOptions = {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "destructive" | "default";
};

type ConfirmDialogState = ConfirmDialogOptions & {
  resolve: (confirmed: boolean) => void;
};

export function useConfirmDialog() {
  const [state, setState] = useState<ConfirmDialogState | null>(null);

  const confirm = useCallback(
    (options: ConfirmDialogOptions): Promise<boolean> => {
      return new Promise((resolve) => {
        setState({ ...options, resolve });
      });
    },
    [],
  );

  const handleConfirm = useCallback(() => {
    state?.resolve(true);
    setState(null);
  }, [state]);

  const handleCancel = useCallback(() => {
    state?.resolve(false);
    setState(null);
  }, [state]);

  const ConfirmDialog = state ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
        onClick={handleCancel}
        onKeyDown={(e) => e.key === "Escape" && handleCancel()}
        role="button"
        tabIndex={0}
      />

      {/* Dialog */}
      <div className="relative z-10 mx-4 w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <h3 className="text-base font-bold text-foreground">{state.title}</h3>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          {state.description}
        </p>
        <div className="mt-5 flex gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="flex-1"
            onClick={handleCancel}
          >
            {state.cancelLabel || "Cancel"}
          </Button>
          <Button
            variant={
              state.variant === "destructive" ? "destructive" : "default"
            }
            size="sm"
            className={`flex-1 ${
              state.variant === "destructive"
                ? "bg-red-500 hover:bg-red-600 text-white"
                : ""
            }`}
            onClick={handleConfirm}
          >
            {state.confirmLabel || "Confirm"}
          </Button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirm, ConfirmDialog };
}
