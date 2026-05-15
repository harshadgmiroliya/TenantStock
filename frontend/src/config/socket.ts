/** Socket.io server URL. In dev, connect directly to the API (avoids Vite ws proxy ECONNRESET). */
export function getSocketServerUrl(): string | undefined {
  const fromEnv = import.meta.env.VITE_SOCKET_URL as string | undefined;
  if (fromEnv?.trim()) return fromEnv.trim();
  if (import.meta.env.DEV) return "http://127.0.0.1:4000";
  return undefined;
}
