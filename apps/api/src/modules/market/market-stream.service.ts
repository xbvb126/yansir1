import { Injectable, MessageEvent } from "@nestjs/common";
import { Observable } from "rxjs";
import { WebSocket } from "ws";
import {
  buildKlineStreamUrl,
  KlineStreamRequest,
  normalizeKlineStreamRequest,
  parseKlineStreamMessage
} from "./market-stream";

@Injectable()
export class MarketStreamService {
  streamKlines(symbol?: string, timeframe?: string): Observable<MessageEvent> {
    const request = normalizeKlineStreamRequest(symbol, timeframe);

    return new Observable<MessageEvent>((subscriber) => {
      const upstreamUrl = buildKlineStreamUrl(request, process.env.BINANCE_KLINE_STREAM_BASE_URL || undefined);
      const socket = new WebSocket(upstreamUrl);
      const heartbeat = setInterval(() => {
        subscriber.next({
          type: "heartbeat",
          data: {
            ...request,
            status: "live",
            source: "yansir-market-proxy",
            serverTime: new Date().toISOString()
          }
        });
      }, 15000);

      socket.on("open", () => {
        subscriber.next({
          type: "status",
          data: streamStatus(request, "connected")
        });
      });

      socket.on("message", (data) => {
        const event = parseKlineStreamMessage(String(data));
        if (!event || event.symbol !== request.symbol || event.timeframe !== request.timeframe) return;

        subscriber.next({
          type: "kline",
          data: event
        });
      });

      socket.on("error", (error) => {
        subscriber.next({
          type: "status",
          data: {
            ...streamStatus(request, "error"),
            message: error instanceof Error ? error.message : String(error)
          }
        });
      });

      socket.on("close", () => {
        subscriber.next({
          type: "status",
          data: streamStatus(request, "closed")
        });
        subscriber.complete();
      });

      return () => {
        clearInterval(heartbeat);
        socket.removeAllListeners();
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close();
        }
      };
    });
  }
}

function streamStatus(request: KlineStreamRequest, status: "connected" | "error" | "closed") {
  return {
    ...request,
    status,
    source: "yansir-market-proxy",
    serverTime: new Date().toISOString()
  };
}
