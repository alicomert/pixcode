import { CandlestickSeries, createChart } from 'lightweight-charts';

const DEFAULT_SYMBOL = 'BTCUSDT';
const DEFAULT_INTERVAL = '1m';

const chartOptions = {
  autoSize: true,
  layout: {
    background: { color: '#131722', type: 'solid' },
    textColor: '#d1d4dc',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Trebuchet MS", "Segoe UI", sans-serif',
  },
  grid: {
    vertLines: { color: '#1f2430' },
    horzLines: { color: '#1f2430' },
  },
  crosshair: {
    mode: 0,
    vertLine: {
      color: '#758696',
      labelBackgroundColor: '#2a2e39',
      style: 3,
      width: 1,
    },
    horzLine: {
      color: '#758696',
      labelBackgroundColor: '#2a2e39',
      style: 3,
      width: 1,
    },
  },
  rightPriceScale: {
    borderColor: '#2a2e39',
    scaleMargins: {
      top: 0.08,
      bottom: 0.16,
    },
  },
  timeScale: {
    borderColor: '#2a2e39',
    rightOffset: 8,
    barSpacing: 9,
    timeVisible: true,
    secondsVisible: false,
  },
  handleScroll: {
    mouseWheel: true,
    pressedMouseMove: true,
    horzTouchDrag: true,
    vertTouchDrag: true,
  },
  handleScale: {
    axisPressedMouseMove: true,
    mouseWheel: true,
    pinch: true,
  },
  localization: {
    priceFormatter: (price) =>
      Number(price).toLocaleString('en-US', {
        maximumFractionDigits: price >= 100 ? 2 : 6,
      }),
  },
};

const candleOptions = {
  upColor: '#26a69a',
  downColor: '#ef5350',
  borderVisible: false,
  wickUpColor: '#26a69a',
  wickDownColor: '#ef5350',
  priceLineColor: '#f0b90b',
  lastValueVisible: true,
  priceLineVisible: true,
};

let activeChart = null;

function toNumber(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function toSeriesTime(value) {
  const timestamp = toNumber(value);

  if (timestamp === null) {
    return value;
  }

  return timestamp > 1_000_000_000_000
    ? Math.floor(timestamp / 1000)
    : Math.floor(timestamp);
}

function normalizeBinanceArray(kline) {
  return {
    time: toSeriesTime(kline[0]),
    open: toNumber(kline[1]),
    high: toNumber(kline[2]),
    low: toNumber(kline[3]),
    close: toNumber(kline[4]),
  };
}

function normalizeBinanceSocketKline(payload) {
  const kline = payload.k ?? payload;

  return {
    time: toSeriesTime(kline.t ?? kline.T ?? payload.E),
    open: toNumber(kline.o),
    high: toNumber(kline.h),
    low: toNumber(kline.l),
    close: toNumber(kline.c),
  };
}

export function normalizeCandle(candle) {
  if (!candle) {
    return null;
  }

  if (typeof candle === 'string') {
    try {
      return normalizeCandle(JSON.parse(candle));
    } catch {
      return null;
    }
  }

  if (Array.isArray(candle)) {
    return normalizeBinanceArray(candle);
  }

  if (typeof candle !== 'object') {
    return null;
  }

  if ('k' in candle || 'o' in candle || 'c' in candle) {
    return normalizeBinanceSocketKline(candle);
  }

  const normalized = {
    time: toSeriesTime(candle.time),
    open: toNumber(candle.open),
    high: toNumber(candle.high),
    low: toNumber(candle.low),
    close: toNumber(candle.close),
  };

  if (typeof candle.time === 'string' && Number.isNaN(Number(candle.time))) {
    normalized.time = candle.time;
  }

  return normalized;
}

function isValidCandle(candle) {
  return (
    candle &&
    candle.time !== null &&
    candle.time !== undefined &&
    candle.open !== null &&
    candle.high !== null &&
    candle.low !== null &&
    candle.close !== null
  );
}

function normalizeCandleSet(candles) {
  return candles
    .map(normalizeCandle)
    .filter(isValidCandle)
    .sort((left, right) => {
      if (typeof left.time === 'string' || typeof right.time === 'string') {
        return String(left.time).localeCompare(String(right.time));
      }

      return left.time - right.time;
    });
}

function createWatermark(symbol, interval) {
  return {
    visible: true,
    fontSize: 40,
    horzAlign: 'left',
    vertAlign: 'top',
    color: 'rgba(209, 212, 220, 0.08)',
    text: `${symbol} ${interval}`,
  };
}

export function initChart(
  container,
  symbol = DEFAULT_SYMBOL,
  interval = DEFAULT_INTERVAL,
  options = {},
) {
  if (!container) {
    throw new Error('initChart requires a chart container element.');
  }

  const chart = createChart(container, {
    ...chartOptions,
    ...options,
    watermark: createWatermark(symbol, interval),
  });
  const candleSeries = chart.addSeries(CandlestickSeries, candleOptions);

  const controller = {
    chart,
    candleSeries,
    symbol,
    interval,
    resize() {
      chart.timeScale().fitContent();
    },
    setSymbol(nextSymbol) {
      this.symbol = nextSymbol;
      chart.applyOptions({
        watermark: createWatermark(this.symbol, this.interval),
      });
    },
    setInterval(nextInterval) {
      this.interval = nextInterval;
      chart.applyOptions({
        watermark: createWatermark(this.symbol, this.interval),
      });
    },
    setCandles(candles = []) {
      candleSeries.setData(normalizeCandleSet(candles));
      chart.timeScale().fitContent();
    },
    updateCandle(candle) {
      const normalized = normalizeCandle(candle);

      if (!isValidCandle(normalized)) {
        return;
      }

      candleSeries.update(normalized);
    },
    destroy() {
      chart.remove();

      if (activeChart === controller) {
        activeChart = null;
      }
    },
  };

  activeChart = controller;

  return controller;
}

export function updateCandle(candle) {
  activeChart?.updateCandle(candle);
}
