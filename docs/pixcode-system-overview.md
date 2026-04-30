# Pixcode System Overview

Bu dokuman Pixcode 1.34.x cizgisindeki ana sistemi ve dagitim demirbaslarini ozetler.

## Ana Mimari

Pixcode tek uygulama icinde web UI, backend API, CLI runtime yonetimi ve desktop paketleme katmanlarini tasir.

- Frontend: `src/` altinda React, Vite ve Tailwind tabanli arayuz.
- Backend: `server/` altinda Express, WebSocket, CLI adapterleri, auth, proje/session ve orchestration API'leri.
- Shared contracts: `shared/` ve `server/shared/` uzerinden frontend/backend arasinda tip ve yardimci sozlesmeler.
- Runtime build: `npm run build` sonrasi frontend `dist/`, backend `dist-server/` altina uretilir.
- CLI entrypoint: npm paketi `pixcode` komutunu `dist-server/server/cli.js` uzerinden yayinlar.

## Calisma Modlari

- `npm run client`: yalnizca Vite frontend.
- `npm run build:server`: backend TypeScript/JS build.
- `npm run server`: build edilmis backend'i baslatir.
- `npm run dev`: daemon/system mode akisini kullanir; foreground dev server degildir.
- `node server/cli.js start`: kaynak uzerinden dogrudan calistirma icin kullanilir.

## API ve Auth

- Ana API yuzeyi `/api/*` altindadir.
- A2A ve orchestration yuzeyi `/a2a/*` ve `/api/orchestration/*` altindadir.
- API key tabanli otomasyon desteklenir.
- Localhost guvenli akislar icin ayricalikli olabilir; remote erisimde bearer auth beklenir.

## Desktop ve Installer Demirbaslari

Desktop wrapper `desktop/` altinda izole bir Electron alt paketidir. Root `npm install`, Electron bagimliliklarini yuklemez; installer derleme CI workflow uzerinden yapilir.

Uretilen native ciktilar:

- Windows: `Pixcode-Setup-X.Y.Z.exe`
- macOS: `Pixcode-X.Y.Z-arm64.dmg` ve `Pixcode-X.Y.Z-x64.dmg`
- Linux: `Pixcode-X.Y.Z-x64.AppImage` ve `Pixcode-X.Y.Z-x64.deb`

1.34.0 icin root paket ve desktop wrapper surumu ayni hizada tutulmalidir:

- `package.json` version: `1.34.0`
- `desktop/package.json` version: `1.34.0`
- `desktop/package.json` icindeki `@pixelbyte-software/pixcode`: `1.34.0`

Tag/release akisi:

- `vX.Y.Z` tag'i GitHub'a push edilir.
- `.github/workflows/desktop.yml` installer matrix build'lerini calistirir.
- Uygun release asset'leri GitHub Releases altina eklenir.
- npm tarball ve desktop installer ayni version sayfasinda olmalidir.

## Dogrulama Beklentisi

Bu repoda unit test suite yoktur. Temel kabul kontrolleri:

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- Canli servis icin `/health`
- Orchestration icin `/api/orchestration/workflows/context`

## Operasyon Notlari

- `npm run server` her zaman build edilmis `dist-server` ciktisini kullanir.
- Source degisikligi sonrasi sadece servis restart etmek yeterli degildir; once `npm run build:server` gerekir.
- Desktop installer yeni urunu paketleyecekse `desktop/package.json` surumu root paketle ayni tutulmalidir.
