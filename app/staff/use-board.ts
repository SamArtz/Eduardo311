"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { errorMessage, StaffError, staffRequest } from "./data";
import { useStaff } from "./staff-access";

type Connection = "connecting" | "live" | "retrying";

async function readEvents(stream: ReadableStream<Uint8Array>, frame: (event: string, isTrivia: boolean) => void) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const message = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const event = /^event: *(sync|change)$/m.exec(message)?.[1];
        frame(event ?? "", message.includes('"topic":"trivia"'));
        boundary = buffer.indexOf("\n\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export function useBoard<T>() {
  const { credentials, section } = useStaff();
  const [data, setData] = useState<T>();
  const [connection, setConnection] = useState<Connection>("connecting");
  const [error, setError] = useState("");
  const [denied, setDenied] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<string[]>([]);
  const running = useRef(new Set<string>());
  const request = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    try {
      const next = await staffRequest<T>(credentials, section, undefined, controller.signal);
      if (controller.signal.aborted) return;
      setData(next);
      setError("");
      setDenied(false);
    } catch (failure) {
      if (controller.signal.aborted) return;
      if (failure instanceof StaffError && [401, 403].includes(failure.status)) {
        setData(undefined);
        setDenied(true);
      }
      setError(errorMessage(failure));
    }
  }, [credentials, section]);

  useEffect(() => {
    void refresh();
    return () => request.current?.abort();
  }, [refresh]);

  useEffect(() => {
    if (denied) return;
    let closed = false;
    let online = false;
    let reconnect: ReturnType<typeof setTimeout> | undefined;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    let stream: AbortController | undefined;

    async function connect() {
      const controller = new AbortController();
      stream = controller;
      function armWatchdog() {
        clearTimeout(watchdog);
        watchdog = setTimeout(() => controller.abort(), 38_000);
      }
      armWatchdog();
      try {
        const response = await fetch(`/api/realtime/${credentials.restaurantId}`, {
          headers: { Authorization: `Bearer ${credentials.token}`, Accept: "text/event-stream" },
          cache: "no-store", signal: controller.signal,
        });
        if (closed) return;
        if ([401, 403].includes(response.status)) {
          void refresh();
          return;
        }
        if (!response.ok || !response.body || !response.headers.get("content-type")?.includes("text/event-stream")) return;
        await readEvents(response.body, (event, isTrivia) => {
          if (closed) return;
          armWatchdog();
          online = true;
          setConnection("live");
          if (event && (!isTrivia || section === "admin")) void refresh();
        });
      } catch {
        // The loop retries after aborts, idle proxies and connection failures.
      } finally {
        clearTimeout(watchdog);
        if (!closed) {
          online = false;
          setConnection("retrying");
          reconnect = setTimeout(() => void connect(), 3000);
        }
      }
    }

    void connect();
    const fallback = window.setInterval(() => { if (!online) void refresh(); }, 15_000);
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", visible);
    return () => {
      closed = true;
      clearTimeout(reconnect);
      clearTimeout(watchdog);
      clearInterval(fallback);
      stream?.abort();
      document.removeEventListener("visibilitychange", visible);
    };
  }, [credentials, denied, refresh, section]);

  async function mutate(key: string, path: string, method: "POST" | "PATCH" | "DELETE", body: unknown, success: string, archivedMessage?: string) {
    if (running.current.has(key)) return false;
    running.current.add(key);
    setPending([...running.current]);
    try {
      const result = await staffRequest<{ archived?: boolean }>(credentials, path, { method, body });
      setMessage(result.archived ? archivedMessage ?? success : success);
      return true;
    } finally {
      running.current.delete(key);
      setPending([...running.current]);
      void refresh();
    }
  }

  return { data, connection, error, denied, message, clearMessage: () => setMessage(""), pending, refresh, mutate };
}
