import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { io, Socket } from "socket.io-client";
import { getSocketServerUrl } from "../config/socket";
import { useAuth } from "./AuthContext";

type SocketState = {
  socket: Socket | null;
  connected: boolean;
  lastInventoryEvent: number;
};

const SocketContext = createContext<SocketState | undefined>(undefined);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastInventoryEvent, setLastInventoryEvent] = useState(0);

  useEffect(() => {
    if (!token) {
      setSocket(null);
      setConnected(false);
      return;
    }

    const serverUrl = getSocketServerUrl();
    const s = io(serverUrl ?? window.location.origin, {
      path: "/socket.io",
      auth: { token },
      transports: ["polling", "websocket"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 20000,
    });

    const bump = () => setLastInventoryEvent(Date.now());

    s.on("connect", () => setConnected(true));
    s.on("disconnect", () => setConnected(false));
    s.on("connect_error", () => setConnected(false));
    s.on("inventory:updated", bump);
    s.on("purchaseOrder:updated", bump);
    s.on("salesOrder:created", bump);

    setSocket(s);

    return () => {
      s.off("connect");
      s.off("disconnect");
      s.off("connect_error");
      s.off("inventory:updated", bump);
      s.off("purchaseOrder:updated", bump);
      s.off("salesOrder:created", bump);
      s.removeAllListeners();
      s.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [token]);

  const value = useMemo(
    () => ({ socket, connected, lastInventoryEvent }),
    [socket, connected, lastInventoryEvent]
  );
  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error("useSocket must be used within SocketProvider");
  return ctx;
}
