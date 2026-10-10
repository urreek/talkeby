export function remoteOrigin(value: string | undefined): string;
export function remoteAllowedHosts(value: string | undefined): string[];
export function remotePort(value: string | undefined, fallback: number, label: string): number;
export function remoteSettings(env: Record<string, string | undefined>): {
  provider: string; publicUrl: string; httpsPort: number; apiPort: number; webPort: number; target: string;
};
