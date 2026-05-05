const BASE_URL = 'https://fapi.binance.com';
const WS_BASE = 'wss://fstream.binance.com/ws';

let ws = null;
let wsCallbacks = new Map();

export async function fetchSymbols() {
  const response = await fetch(`${BASE_URL}/fapi/v1/ticker/24hr`);
  const data = await response.json();
  return data
    .filter(t => t.symbol.endsWith('USDT'))
    .sort((a, b) => b.quoteVolume - a.quoteVolume)
    .slice(0, 100);
}

export async function fetchKlines(symbol, interval, limit = 500) {
  const response = await fetch(
    `${BASE_URL}/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
  );
  const data = await response.json();
  return data.map(k => ({
    time: k[0],
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
  }));
}

export function subscribeKline(symbol, interval, onMessage) {
  unsubscribeKline();
  
  const stream = `${symbol.toLowerCase()}@kline_${interval}`;
  ws = new WebSocket(`${WS_BASE}/${stream}`);
  
  wsCallbacks.set(symbol, onMessage);
  
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    const callback = wsCallbacks.get(symbol);
    if (callback) {
      callback(data);
    }
  };
  
  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };
  
  return ws;
}

export function unsubscribeKline() {
  if (ws) {
    ws.close();
    ws = null;
  }
  wsCallbacks.clear();
}

export async function fetchTicker(symbol) {
  const response = await fetch(`${BASE_URL}/fapi/v1/ticker/24hr?symbol=${symbol}`);
  return response.json();
}