import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '../components/auth/context/AuthContext';
import { PLATFORM_AUTH_BYPASS_ENABLED } from '../constants/config';
import { createStreamAuthUrl } from '../utils/api';

type WebSocketContextType = {
  ws: WebSocket | null;
  sendMessage: (message: any) => void;
  latestMessage: any | null;
  isConnected: boolean;
};

const WebSocketContext = createContext<WebSocketContextType | null>(null);

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
};

const buildWebSocketUrl = async (token: string | null) => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  if (PLATFORM_AUTH_BYPASS_ENABLED) return `${protocol}//${window.location.host}/ws`; // Trusted platform proxy: same-domain WebSocket
  if (!token) return null;
  const ticketPath = await createStreamAuthUrl('/ws', 'ws');
  return `${protocol}//${window.location.host}${ticketPath}`; // OSS mode: Use same host:port that served the page
};

const useWebSocketProviderState = (): WebSocketContextType => {
  const wsRef = useRef<WebSocket | null>(null);
  const unmountedRef = useRef(false); // Track if component is unmounted
  const hasConnectedRef = useRef(false); // Track if we've ever connected (to detect reconnects)
  const [latestMessage, setLatestMessage] = useState<any>(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const connectionGenerationRef = useRef(0);
  const { token } = useAuth();

  const connect = useCallback(async () => {
    if (unmountedRef.current) return; // Prevent connection if unmounted
    const generation = connectionGenerationRef.current;
    try {
      // Construct WebSocket URL
      const wsUrl = await buildWebSocketUrl(token);
      if (unmountedRef.current || connectionGenerationRef.current !== generation) return;

      if (!wsUrl) return console.warn('No authentication token found for WebSocket connection');
      
      const websocket = new WebSocket(wsUrl);
      // Keep a reference while CONNECTING as well as OPEN so unmounts and
      // token changes can close the socket before it finishes its handshake.
      wsRef.current = websocket;

      websocket.onopen = () => {
        if (unmountedRef.current || wsRef.current !== websocket) {
          websocket.close();
          return;
        }
        setIsConnected(true);
        wsRef.current = websocket;
        if (hasConnectedRef.current) {
          // This is a reconnect — signal so components can catch up on missed messages
          setLatestMessage({ type: 'websocket-reconnected', timestamp: Date.now() });
        }
        hasConnectedRef.current = true;
      };

      websocket.onmessage = (event) => {
        if (unmountedRef.current || wsRef.current !== websocket) return;
        try {
          const data = JSON.parse(event.data);
          setLatestMessage(data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      websocket.onclose = () => {
        if (wsRef.current !== websocket) return;
        setIsConnected(false);
        wsRef.current = null;

        if (unmountedRef.current) return;
        
        // Attempt to reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          if (unmountedRef.current) return; // Prevent reconnection if unmounted
          connect();
        }, 3000);
      };

      websocket.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

    } catch (error) {
      console.error('Error creating WebSocket connection:', error);
      if (!unmountedRef.current && connectionGenerationRef.current === generation) {
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectTimeoutRef.current = null;
          if (!unmountedRef.current) void connect();
        }, 3000);
      }
    }
  }, [token]); // everytime token changes, we reconnect

  useEffect(() => {
    // The cleanup below runs when the auth token changes as well as on
    // unmount. Reset the lifecycle guard before starting the new connection.
    unmountedRef.current = false;
    connectionGenerationRef.current += 1;
    void connect();

    return () => {
      unmountedRef.current = true;
      connectionGenerationRef.current += 1;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]); // everytime token changes, we reconnect through connect()

  const sendMessage = useCallback((message: any) => {
    const socket = wsRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket not connected');
    }
  }, []);

  const value: WebSocketContextType = useMemo(() =>
  ({
    ws: wsRef.current,
    sendMessage,
    latestMessage,
    isConnected
  }), [sendMessage, latestMessage, isConnected]);

  return value;
};

export const WebSocketProvider = ({ children }: { children: React.ReactNode }) => {
  const webSocketData = useWebSocketProviderState();
  
  return (
    <WebSocketContext.Provider value={webSocketData}>
      {children}
    </WebSocketContext.Provider>
  );
};

export default WebSocketContext;
