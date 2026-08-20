<div align="center">
  <img src="public/logo.png" alt="Pixcode logo" width="96" height="96" />
  <h1>Pixcode</h1>
  <p><strong>AI coding agent'ları için self-hosted kontrol odası.</strong></p>
  <p>
    Claude Code, Cursor CLI, Codex, Gemini CLI, Qwen Code ve OpenCode'u tek web arayüzünden yönet. Chat, shell, dosyalar, git, agent otomasyonu, API key, plugin, bildirim, Telegram ve desktop/server kurulumları aynı sistemde.
  </p>
  <p>
    <a href="https://www.npmjs.com/package/@pixelbyte-software/pixcode"><img src="https://img.shields.io/npm/v/@pixelbyte-software/pixcode?style=for-the-badge&color=10b981" alt="npm version" /></a>
    <a href="https://github.com/alicomert/pixcode/releases/latest"><img src="https://img.shields.io/github/v/release/alicomert/pixcode?style=for-the-badge&color=0ea5e9" alt="latest release" /></a>
    <img src="https://img.shields.io/badge/Node.js-22%2B-3c873a?style=for-the-badge" alt="Node.js 22+" />
    <img src="https://img.shields.io/badge/Desktop-Windows%20%7C%20macOS%20%7C%20Linux-6366f1?style=for-the-badge" alt="desktop platforms" />
  </p>
  <p>
    <a href="https://buymeacoffee.com/alicomert" target="_blank" rel="noopener noreferrer"><img src="https://img.shields.io/badge/Buy%20me%20a%20coffee-support%20Pixcode-ffdd00?style=for-the-badge&logo=buymeacoffee&logoColor=000000" alt="Buy me a coffee" /></a>
  </p>
  <p>
    <a href="README.md">English</a> ·
    <a href="README.tr.md" aria-current="page">Türkçe</a> ·
    <a href="README.de.md">Deutsch</a> ·
    <a href="README.ru.md">Русский</a> ·
    <a href="README.ja.md">日本語</a> ·
    <a href="README.ko.md">한국어</a> ·
    <a href="README.zh-CN.md">简体中文</a> ·
    <a href="README.es-ES.md">Español</a>
  </p>
</div>

## Pixcode Nedir?

> **Güncel API notu (1.64.x):** Eski `/api/orchestration/*` workflow UI/API'si v1.55'te kaldırıldı. Çoklu CLI görevleri, konuşmalar ve zamanlamalar için NanoClaw (`/api/nanoclaw/*` veya `/api/tasks/*` alias'ı), üretim agent döngüsü için `/api/production-agent-loop/*` kullanılmalıdır. Tarihsel orkestrasyon bölümleri yalnızca migration bağlamı olarak tutulur.

Pixcode kendi bilgisayarını, VDS'ini veya workstation'ını tarayıcıdan yönetilen bir AI geliştirme kokpitine çevirir. Terminal, desktop uygulama, CLI logları, dosya gezgini, Git ekranı ve provider ayarları arasında dağılmak yerine bütün coding-agent akışını tek arayüzde toplar.

Üç kullanım için tasarlandı:

- **Kendi bilgisayarında**: Claude, Codex, Cursor, Gemini, Qwen veya OpenCode CLI'larını daha güçlü bir web arayüzüyle kullan.
- **Sürekli açık sunucuda**: Linux/VDS üzerinde daemon olarak çalıştır, telefondan, tabletten veya başka tarayıcıdan bağlan.
- **Desktop uygulama olarak**: Windows `.exe`, macOS `.dmg` ve Linux build'leriyle paketli kullanım al.

Pixcode hosted cloud IDE değildir. Projelerin, credential'ların, CLI session'ların, local dosyaların, Git durumun ve MCP config'in senin makinenin üzerinde kalır.

## Ekran Görüntüleri

| Workspace kontrol odası | Mobil çalışma alanı |
| --- | --- |
| <img src="public/screenshots/desktop-main.png" alt="Pixcode desktop workspace" width="480" /> | <img src="public/screenshots/mobile-chat.png" alt="Pixcode mobil çalışma alanı" width="260" /> |

## Öne Çıkanlar

### Kullandığın CLI'lar tek ekranda

- Claude Code, Cursor CLI, Codex, Gemini CLI, Qwen Code ve OpenCode aynı proje ekranında.
- Provider auth, API key credential, provider'a özgü OAuth callback/paste akışları, kurulum kontrolü, model listesi ve CLI version durumu Settings altında. GitHub bağlantısı Settings içinden OAuth ile yapılır.
- Provider'ın kendi CLI mantığı korunur; Pixcode üstüne session yönetimi, WebSocket, bildirim, dosya bağlamı ve proje kontrolleri ekler.
- CLI düşünürken, tool çalıştırırken, approval beklerken veya çıktı üretirken işlem durumu görünür. Kullanıcı boş ekrana bakmaz.

### Chat gibi ama geliştirme ortamı gibi

- Proje bağlı konuşmalar ve session geçmişi.
- Chat ve seçili proje ekranında en alta sabit prompt composer.
- Default/plan/run modları ve akışa göre mod kalıcılığı.
- Slash command desteği ve provider'a özel tool görüntüleme.
- Uzun süren işlerde tarayıcı ve Telegram bildirimleri.

### Files, Shell ve Source Control

- Dosya gezme, düzenleme, upload, rename, delete ve detailed view.
- Shell paneli ana ekranı kapatmadan yarım ekranda açılabilir; tekrar büyütülerek tam panel yapılabilir.
- Source Control panelinde Git status, diff, branch, commit ve değişen dosyalar.
- Split panellerde sadece ikonlu kontroller, kapatma butonu ve desktop için yarım/tam davranışı.
- Mobilde masaüstü split davranışı zorlanmaz; ekran boyutuna uygun panel mantığı kullanılır.
- Files paneli daraldığında yazı ve metadata daha kontrollü davranır.

### Hakimiyet: değişen dosyalar anında görünür

Pixcode sadece GitHub'dan gelen güncellemeyi beklemez; local working tree değişikliklerini de takip eder. Quick Settings içindeki **Hakimiyet** modu değişen dosyaları anlık listeler, yeşil belirteçle öne çıkarır ve tıklayınca direkt ilgili dosya/satıra götürür.

Amaç kontrol hissi: AI agent dosya değiştirirken kullanıcı hangi dosyanın oynadığını görür, sağ panelde açar ve ana chat/görev ekranını kaybetmez.

### Agent otomasyonu (NanoClaw + production agent loop)

Pixcode'un güncel otomasyon yüzeyleri amaca göre ayrılır:

- **NanoClaw** proje bağlamını koruyarak çoklu CLI konuşmaları, tek seferlik
  çalıştırmalar ve kalıcı `once`/`interval`/`cron` zamanlamaları yürütür.
- **Production agent loop** issue-to-PR, CI repair, review queue, checkpoint ve
  scheduler gibi yönetici akışlarını yürütür.

Eski `/api/orchestration/*` workflow UI ve route ailesi v1.55'te kaldırıldı.
Kalan orkestrasyon dokümanları yalnızca migration geçmişidir; yeni istemciler
aşağıdaki güncel API'leri kullanmalıdır.

### API odaklı yapı

Pixcode frontend'i zaten backend ile REST ve WebSocket üzerinden konuşur. Harici otomasyonlar da aynı kontrol düzlemini Pixcode API key ile kullanabilir.

Yeni API key'ler `px_` ile başlar:

```bash
curl http://localhost:3001/api/projects \
  -H "Authorization: Bearer px_your_key_here"
```

NanoClaw ile tek seferlik agent işi (schedule oluşturmaz):

```bash
curl -X POST http://localhost:3001/api/nanoclaw/run \
  -H "Authorization: Bearer px_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "agentType": "codex",
    "projectId": "my-app",
    "prompt": "Mevcut diff'i incele ve riskli değişiklikleri listele."
  }'
```

NanoClaw çoklu-CLI konuşması:

```bash
curl -X POST http://localhost:3001/api/nanoclaw/bot/chat \
  -H "Authorization: Bearer px_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Auth yapılandırması nerede?",
    "projectId": "my-app",
    "agentType": "claude-code"
  }'
```

Eski kurulumlardaki `ck_` key'ler çalışmaya devam eder. Güncel standart `px_`.

Etkileşimli API referansı: [`public/api-docs.html`](public/api-docs.html). Çalışan bir Pixcode instance'ında oturum açtıktan sonra keşif için `GET /api/public/manifest`, güncel makine-okur API parçası için `GET /api/public/openapi` kullanılır. Bu katalog uçları Pixcode oturumunu kullanır; otomasyon çağrılarında kapsamlı `px_` API anahtarı gerekir. [`public/openapi.yaml`](public/openapi.yaml) paketle gelen sürüm anlık görüntüsüdür.

### Tema ve görünüm

Pixcode artık tek mavi/lacivert görünümle sınırlı değil.

- Koyu ve açık mod.
- Zümrüt, VS Code benzeri ve farklı accent paletleri.
- Açık mod ve koyu mod için özel renk seçimi.
- Buton, focus ring, navigation, aktif durum ve önemli kontrollerde token tabanlı renk sistemi.
- Ayarlardan tema değişir; build almaya gerek yok.

Amaç UI'ın gerektiğinde command-line/development tool hissine yaklaşması, ama mobil ve desktop'ta okunabilir kalması.

### Bildirimler ve Telegram bridge

- Uzun süren CLI session'ları için browser push notification.
- Kısa süreli kodla Telegram eşleştirme.
- Tamamlandı, hata aldı veya kullanıcı aksiyonu gerekiyor bildirimleri.
- İsteğe bağlı bridge ile Telegram mesajlarını Pixcode instance'ına prompt olarak yönlendirme.
- Bildirim tercihleri kullanıcı bazlı saklanır.

### Plugin ve MCP

- Desteklenen provider'lar için MCP server yönetimi.
- Provider'a özel MCP/session/auth ekranları.
- Frontend tab ve opsiyonel backend servisleriyle plugin sistemi.
- API key, base URL, model katalogları ve provider kurulum durumları için local ayarlar.

## Kurulum

### npx ile çalıştır

Node.js 22 veya üstü gerekir.

```bash
npx @pixelbyte-software/pixcode
```

Sonra aç:

```text
http://localhost:3001
```

### Global kurulum

```bash
npm install -g @pixelbyte-software/pixcode
pixcode
```

### Desktop installer

GitHub releases üzerinden indir:

- Windows: `.exe`
- macOS: `.dmg`
- Linux: AppImage veya release asset'inde yayınlanan paket

Releases: <https://github.com/alicomert/pixcode/releases/latest>

#### macOS Gatekeeper: "Pixcode hasar görmüş"

Şu an macOS desktop build'leri Apple Developer ID ile imzalı/notarize olmayabilir. Bu uyarı tek başına indirme dosyasının güvenli olduğunu kanıtlamaz. Gatekeeper'ı değiştirmeden önce:

1. DMG'yi yalnızca resmi [GitHub Releases](https://github.com/alicomert/pixcode/releases/latest) sayfasından indir.
2. Yayınlanan SHA-256/checksum varsa karşılaştır ve dosyanın eşleştiğini doğrula. Kaynağını veya bütünlüğünü doğrulayamadığın DMG'yi çalıştırma.
3. DMG'yi açıp `Pixcode.app` dosyasını `/Applications` içine sürükle. Finder'da uygulamaya sağ tıklayıp **Aç** seçeneğini kullan; macOS imzasız uygulama için bu açık onaydan sonra izin verebilir.
4. Doğrulanmış uygulama hâlâ engelleniyorsa, yalnızca resmi ve doğrulanmış DMG içindeki `Fix Gatekeeper.command` dosyasını çalıştır. Bu script güvenlik özniteliklerini değiştirir ve uygulamayı açar; üçüncü taraf kopyalarda kullanma.

Manuel çözüm (yalnızca DMG doğrulandıktan sonra):

```bash
xattr -d com.apple.quarantine "/Applications/Pixcode.app" 2>/dev/null || true
open "/Applications/Pixcode.app"
```

### Linux daemon

VDS/sunucu kullanımı için:

```bash
pixcode daemon install --mode auto --port 3001
pixcode daemon status --mode auto
pixcode daemon logs --mode auto
pixcode daemon restart --mode auto
```

Foreground mod:

```bash
pixcode --no-daemon
```

### Portlar

- Backend ve paketlenmiş frontend: `SERVER_PORT`, varsayılan `3001`.
- Sadece Vite frontend geliştirme: `VITE_PORT`, varsayılan `5173`.

Normal kurulumda tek port düşün: `3001`. `5173` sadece frontend'i ayrı Vite dev server ile geliştirirken kullanılır.

## İlk Açılışta

1. Pixcode'u aç ve local kullanıcı oluştur/giriş yap.
2. Yönetmek istediğin proje klasörlerini ekle.
3. Kullanacağın CLI provider'larını bağla.
4. Settings altında provider install/auth/model durumlarını kontrol et.
5. Otomasyon, CI, Telegram veya harici araçlar için gerekiyorsa `px_` API key üret.
6. Appearance altından tema paletini seç.
7. Uzun işlerde haber almak istiyorsan bildirimleri aç.

## Geliştirme

```bash
npm install
npm run typecheck
npm run lint
npm run build
```

Önemli notlar:

- `npm run dev` Linux'ta daemon manager kullanır.
- Foreground geliştirme için `npm run client` ve `npm run server` ayrı çalıştırılabilir veya `pixcode --no-daemon` kullanılabilir.
- `npm run server` built output'u `dist-server/` içinden çalıştırır; backend değişikliğinden sonra rebuild gerekir.
- Şu anda unit test script'i yok. Doğrulama için typecheck, lint, build ve manuel provider/API kontrolleri kullanılır.

## Repo Haritası

- `src/` - React + Vite frontend.
- `server/` - Express, WebSocket, CLI adapter'ları, route'lar, auth, daemon, bildirim.
- `server/modules/nanoclaw/` - NanoClaw chat, task ve multi-CLI agent köprüsü.
- `server/routes/production-agent-loop.js` - production otomasyonu, CI ve review API'si.
- `server/modules/providers/` - provider auth, MCP, session, model ve install endpoint'leri.
- `shared/` - frontend/backend ortak contract'lar.
- `public/api-docs.html` - uygulamayla gelen etkileşimli API referansı.
- `GET /api/public/manifest` ve `GET /api/public/openapi` - oturum gerektiren, çalışan instance için kanonik API keşif ve makine-okur belgeleri.
- `public/openapi.yaml` - core REST API'nin paketle gelen sürüm anlık görüntüsü.
- `public/screenshots/` - README ve tanıtım görselleri.

## Güvenlik Mantığı

- Pixcode self-hosted çalışır. Bunu makinen için bir local kontrol düzlemi gibi düşün.
- Ağa açacaksan güçlü kullanıcı şifresi kullan.
- Public server'da reverse proxy/VPN arkasına almak daha sağlıklıdır.
- API key'ler otomasyon içindir; ifşa olursa rotate et.
- Provider secret'ları API ve UI cevaplarında mümkün olduğunca maskelenir.

## Linkler

- npm: <https://www.npmjs.com/package/@pixelbyte-software/pixcode>
- GitHub: <https://github.com/alicomert/pixcode>
- Releases: <https://github.com/alicomert/pixcode/releases/latest>
- API docs: [`public/api-docs.html`](public/api-docs.html), veya çalışan instance'ta `GET /api/public/openapi`
- Static docs: [`public/docs.html`](public/docs.html), [`public/features.html`](public/features.html), [`public/orchestration.html` (migration bağlamı)](public/orchestration.html), [`public/api-automation.html`](public/api-automation.html)
- AI discovery: [`public/llms.txt`](public/llms.txt), [`public/llms-full.txt`](public/llms-full.txt)
