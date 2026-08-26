# Pixcode

<p align="center"><strong>Self-hosted AI coding workbench — gerçek CLI terminalleri, dosyalar ve Git tek ekranda.</strong></p>

<p align="center"><a href="https://www.npmjs.com/package/@pixelbyte-software/pixcode"><img src="https://img.shields.io/npm/v/@pixelbyte-software/pixcode?style=flat-square&color=cb3837" alt="npm"></a> <a href="https://github.com/alicomert/pixcode/releases/latest"><img src="https://img.shields.io/github/v/release/alicomert/pixcode?style=flat-square&color=3178c6" alt="release"></a> <img src="https://img.shields.io/badge/Node.js-22%2B-339933?style=flat-square" alt="Node.js 22+"></p>

Pixcode, bilgisayarında çalışan hafif bir kodlama çalışma alanıdır. Mevcut CLI ajanlarını gerçek terminal olarak açar; dosya ağacı, CodeMirror editörü, Git değişiklikleri ve normal shell terminallerini aynı VS Code tarzı çalışma alanında birleştirir.

## Öne çıkanlar

- **Gerçek agent terminalleri:** Codex, Claude Code, Gemini CLI, Qwen Code, OpenCode ve Grok CLI için aynı anda birden fazla oturum.
- **Workspace sekmeleri:** Her sekmenin proje yolu, açık dosyaları, Git görünümü ve terminalleri ayrıdır.
- **Proje seçimi:** Yeni Pixcode projesi, mevcut yerel klasör veya GitHub deposu açılabilir.
- **Arka planda çalışma:** Sayfa yenilense bile çalışan PTY/agent süreçleri devam eder; terminal geçmişi yeniden yüklenir.
- **Dosya ve Git araçları:** Dosya düzenleme, arama, status, staged/unstaged/untracked diff, stage, commit, pull ve push.
- **Responsive VS Code düzeni:** Explorer activity bar, sürüklenebilir paneller, terminal fit/resize ve mobil navigasyon.
- **PWA ve temalar:** Kurulabilir web uygulaması ile karanlık/aydınlık görünüm.

## Hızlı başlangıç

### npm ile

```bash
npx @pixelbyte-software/pixcode
```

veya global kurulum:

```bash
npm install -g @pixelbyte-software/pixcode
pixcode
```

Ardından <http://localhost:3001> adresini açın. İlk çalıştırmada yerel hesap şifresi oluşturulur. Sabit yayın portu **3001**’dir.

### Kaynak koddan

```bash
npm install
npm run build
npm start
```

Geliştirme için Vite arayüzü `npm run dev` ile 5199 portunda açılır.

## Ajan CLI’ları

Pixcode, PATH üzerinde kurulu CLI binary’lerini kullanır: `claude`, `codex`, `gemini`, `qwen`, `opencode`, `grok`. Ajanı ayrıca kurup giriş yapmanız gerekir.

## Workspace yapılandırması

Varsayılan projeler `./pixcode-projects/pixcode-project-N` altında oluşturulur.

```bash
PIXCODE_PROJECTS=/srv/pixcode-projects pixcode
PIXCODE_WORKSPACE=/home/me/project pixcode
PIXCODE_HOME=/srv/pixcode-data pixcode
```

## Masaüstü

Tauri 2 kabuğu `src-tauri/` içindedir. GitHub Actions release tag’inde Linux (`.AppImage`, `.deb`), Windows (`.exe`) ve macOS (`.dmg`) paketlerini üretir.

```bash
npm run desktop:build
```

## API ve güvenlik

REST için JWT veya `px_` API anahtarı, WebSocket için `/ws?token=...` kullanılır. Pixcode kaynak koduna ve yerel CLI’lara eriştiği için internete açık kurulumları reverse proxy/VPN/firewall arkasında çalıştırın.

## Geliştirici komutları

```bash
npm run lint
npm run build
BASE=http://localhost:3001 node scripts/smoke.mjs
BASE=http://localhost:3001 node scripts/agent-terminal-smoke.mjs
```

## Proje yapısı

- `server/` — Node.js backend, auth, WebSocket kanalları ve agent runner.
- `src/` — Preact/Vite frontend ve Tailwind CSS.
- `src-tauri/` — Tauri 2 masaüstü kabuğu.
- `public/` — ikonlar, PWA manifesti ve service worker.

## Bağlantılar

- [GitHub](https://github.com/alicomert/pixcode)
- [npm](https://www.npmjs.com/package/@pixelbyte-software/pixcode)
- [Releases](https://github.com/alicomert/pixcode/releases)
- [Lisans](LICENSE)
