import { useEffect, useState } from "react";
import { Outlet, createRootRoute } from "@tanstack/react-router";

import { fetchAccessStatus } from "@/lib/api";
import {
  clearStoredAccessKey,
  getStoredChatId,
  getStoredAccessKey,
  setStoredChatId,
  setStoredAccessKey,
} from "@/lib/storage";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export const rootRoute = createRootRoute({
  component: RootComponent
});

function readErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }
  return fallback;
}

function RootComponent() {
  const [status, setStatus] = useState({
    loading: true,
    required: false,
    authenticated: false,
    error: "",
  });
  const [draftAccessKey, setDraftAccessKey] = useState(() => getStoredAccessKey());
  const [unlockError, setUnlockError] = useState("");

  const refreshAccessStatus = async () => {
    setStatus((current) => ({
      ...current,
      loading: true,
      error: "",
    }));
    try {
      const next = await fetchAccessStatus();
      setStatus({
        loading: false,
        required: next.required,
        authenticated: next.authenticated,
        error: "",
      });

      if (!next.required || next.authenticated) {
        setUnlockError("");
      }
      if (next.ownerChatId && !getStoredChatId()) {
        setStoredChatId(next.ownerChatId);
      }
      return next;
    } catch (error) {
      const message = readErrorMessage(error, "Could not verify access key.");
      setStatus({
        loading: false,
        required: true,
        authenticated: false,
        error: message,
      });
      throw new Error(message);
    }
  };

  useEffect(() => {
    void refreshAccessStatus();
  }, []);

  if (status.loading) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-xl items-center justify-center p-4">
        <Card className="w-full theme-surface">
          <CardHeader>
            <CardTitle>Checking Access</CardTitle>
            <CardDescription>Verifying secure access to this instance.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (status.error) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-xl items-center justify-center p-4">
        <Card className="w-full theme-surface">
          <CardHeader>
            <CardTitle>Connection Error</CardTitle>
            <CardDescription>{status.error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => void refreshAccessStatus()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status.required && !status.authenticated) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-xl items-center justify-center p-4">
        <Card className="w-full theme-surface">
          <CardHeader>
            <CardTitle>Instance Locked</CardTitle>
            <CardDescription>
              Enter your private access key to unlock this Talkeby instance.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <form
              className="space-y-3"
              onSubmit={async (event) => {
                event.preventDefault();
                const key = draftAccessKey.trim();
                if (!key) {
                  setUnlockError("Access key is required.");
                  return;
                }

                setStoredAccessKey(key);
                const next = await refreshAccessStatus().catch(() => null);
                if (!next) {
                  setUnlockError("Could not verify access key.");
                  return;
                }
                if (next.required && !next.authenticated) {
                  clearStoredAccessKey();
                  setUnlockError("Invalid access key.");
                }
              }}
            >
              <Input
                type="password"
                autoComplete="current-password"
                placeholder="Enter access key"
                value={draftAccessKey}
                className="bg-background"
                onChange={(event) => {
                  setDraftAccessKey(event.target.value);
                  if (unlockError) {
                    setUnlockError("");
                  }
                }}
              />
              <Button className="w-full" type="submit">
                Unlock
              </Button>
            </form>
            {unlockError ? (
              <p className="text-sm font-medium text-destructive">{unlockError}</p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
