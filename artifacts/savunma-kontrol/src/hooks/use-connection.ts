import { useCallback, useEffect, useRef, useState } from "react";
import {
  hardwareConnection,
  getStoredUrl,
  setStoredUrl,
  type ConnStatus,
} from "@/lib/connection";
import type { Command, ServerMessage } from "@/lib/protocol";

interface UseConnectionOptions {
  onMessage: (m: ServerMessage) => void;
}

export function useHardwareConnection({ onMessage }: UseConnectionOptions) {
  const [status, setStatus] = useState<ConnStatus>("disconnected");
  const [url, setUrl] = useState<string>(getStoredUrl());
  const [info, setInfo] = useState<string>("");
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    hardwareConnection.attach({
      onStatus: (s, i) => {
        setStatus(s);
        if (i) setInfo(i);
      },
      onMessage: (m) => onMessageRef.current(m),
    });
  }, []);

  const connect = useCallback((u: string) => {
    setUrl(u);
    setStoredUrl(u);
    if (u) hardwareConnection.connect(u);
  }, []);

  const disconnect = useCallback(() => {
    hardwareConnection.disconnect();
  }, []);

  const send = useCallback((cmd: Command): boolean => {
    return hardwareConnection.send(cmd);
  }, []);

  const isConnected = status === "connected";

  return { status, url, info, isConnected, connect, disconnect, send };
}
