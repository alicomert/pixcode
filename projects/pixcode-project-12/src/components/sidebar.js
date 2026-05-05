const FAVORITES_KEY = 'binance-fav-symbols';

let favorites = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
let allSymbols = [];
let currentTab = 'favorites';
let filterText = '';
let onSelectCallback = null;

function saveFavorites() {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
}

function toggleFavorite(symbol) {
  if (favorites.includes(symbol)) {
    favorites = favorites.filter(s => s !== symbol);
  } else {
    favorites.push(symbol);
  }
  saveFavorites();
  render();
}

function getFilteredSymbols() {
  let symbols = currentTab === 'favorites' ? favorites : allSymbols;
  if (filterText) {
    const lower = filterText.toLowerCase();
    symbols = symbols.filter(s => s.toLowerCase().includes(lower));
  }
  return symbols.filter(s => allSymbols.some(as => as.symbol === s));
}

function formatChange(change) {
  const num = parseFloat(change);
  const prefix = num >= 0 ? '+' : '';
  return prefix + num.toFixed(2) + '%';
}

function getSymbolChange(symbol) {
  const data = allSymbols.find(s => s.symbol === symbol);
  return data ? data.priceChangePercent : '0';
}

function render() {
  const listEl = document.getElementById('symbol-list');
  const symbols = getFilteredSymbols();
  
  if (symbols.length === 0) {
    listEl.innerHTML = '<div class="empty-state">No symbols found</div>';
    return;
  }
  
  listEl.innerHTML = symbols.map(symbol => {
    const data = allSymbols.find(s => s.symbol === symbol);
    if (!data) return '';
    
    const change = parseFloat(data.priceChangePercent);
    const changeClass = change >= 0 ? 'positive' : 'negative';
    const isFav = favorites.includes(symbol);
    
    return `
      <div class="symbol-row" data-symbol="${symbol}">
        <button class="star-btn ${isFav ? 'active' : ''}" data-symbol="${symbol}">
          ${isFav ? '★' : '☆'}
        </button>
        <div class="symbol-info-row">
          <span class="symbol-name">${symbol}</span>
          <span class="symbol-change ${changeClass}">${formatChange(data.priceChangePercent)}</span>
        </div>
      </div>
    `;
  }).join('');
}

function handleClick(e) {
  const row = e.target.closest('.symbol-row');
  const starBtn = e.target.closest('.star-btn');
  
  if (starBtn) {
    e.stopPropagation();
    const symbol = starBtn.dataset.symbol;
    toggleFavorite(symbol);
    return;
  }
  
  if (row) {
    const symbol = row.dataset.symbol;
    if (onSelectCallback) {
      onSelectCallback(symbol);
    }
  }
}

function handleTabClick(e) {
  const tab = e.target.closest('.tab');
  if (!tab) return;
  
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  currentTab = tab.dataset.tab;
  render();
}

function handleSearch(e) {
  filterText = e.target.value;
  render();
}

export function initSidebar(onSymbolSelect) {
  onSelectCallback = onSymbolSelect;
  
  document.querySelector('.tabs').addEventListener('click', handleTabClick);
  document.getElementById('symbol-search').addEventListener('input', handleSearch);
  document.getElementById('symbol-list').addEventListener('click', handleClick);
  
  return {
    setSymbols(symbols) {
      allSymbols = symbols;
      render();
    },
    getFavorites() {
      return favorites;
    },
  };
}