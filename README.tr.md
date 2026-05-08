<div align="center">
  <img src="public/logo.png" alt="Pixcode logo" width="96" height="96" />
  <h1>Pixcode</h1>
  <p><strong>AI coding agent'ları için self-hosted kontrol odası.</strong></p>
  <p>
    Claude Code, Cursor CLI, Codex, Gemini CLI, Qwen Code ve OpenCode'u tek web arayüzünden yönet. Chat, shell, dosyalar, git, orkestrasyon, API key, plugin, bildirim, Telegram ve desktop/server kurulumları aynı sistemde.
  </p>
  <p>
    <a href="https://www.npmjs.com/package/@pixelbyte-software/pixcode"><img src="https://img.shields.io/npm/v/@pixelbyte-software/pixcode?style=for-the-badge&color=10b981" alt="npm version" /></a>
    <a href="https://github.com/alicomert/pixcode/releases/latest"><img src="https://img.shields.io/github/v/release/alicomert/pixcode?style=for-the-badge&color=0ea5e9" alt="latest release" /></a>
    <img src="https://img.shields.io/badge/Node.js-22%2B-3c873a?style=for-the-badge" alt="Node.js 22+" />
    <img src="https://img.shields.io/badge/Desktop-Windows%20%7C%20macOS%20%7C%20Linux-6366f1?style=for-the-badge" alt="desktop platforms" />
  </p>
  <p>
    <a href="README.md">English</a> ·
    <a href="README.de.md">Deutsch</a> ·
    <a href="README.ru.md">Русский</a> ·
    <a href="README.ja.md">日本語</a> ·
    <a href="README.ko.md">한국어</a> ·
    <a href="README.zh-CN.md">简体中文</a>
  </p>
</div>

## Pixcode Nedir?

Pixcode kendi bilgisayarını, VDS'ini veya workstation'ını tarayıcıdan yönetilen bir AI geliştirme kokpitine çevirir. Terminal, desktop uygulama, CLI logları, dosya gezgini, Git ekranı ve provider ayarları arasında dağılmak yerine bütün coding-agent akışını tek arayüzde toplar.

Üç kullanım için tasarlandı:

- **Kendi bilgisayarında**: Claude, Codex, Cursor, Gemini, Qwen veya OpenCode CLI'larını daha güçlü bir web arayüzüyle kullan.
- **Sürekli açık sunucuda**: Linux/VDS üzerinde daemon olarak çalıştır, telefondan, tabletten veya başka tarayıcıdan bağlan.
- **Desktop uygulama olarak**: Windows `.exe`, macOS `.dmg` ve Linux build'leriyle paketli kullanım al.

Pixcode hosted cloud IDE değildir. Projelerin, credential'ların, CLI session'ların, local dosyaların, Git durumun ve MCP config'in senin makinenin üzerinde kalır.

## Ekran Görüntüleri

| Workspace kontrol odası | Mobil chat |
| --- | --- |
| <img src="public/screenshots/desktop-main.png" alt="Pixcode desktop workspace" width="480" /> | <img src="public/screenshots/mobile-chat.png" alt="Pixcode mobile chat" width="260" /> |

| CLI seçimi | Tool ve MCP ekranı |
| --- | --- |
| <img src="public/screenshots/cli-selection.png" alt="Pixcode CLI selection" width="420" /> | <img src="public/screenshots/tools-modal.png" alt="Pixcode tools modal" width="420" /> |

## Öne Çıkanlar

### Kullandığın CLI'lar tek ekranda

- Claude Code, Cursor CLI, Codex, Gemini CLI, Qwen Code ve OpenCode aynı proje ekranında.
- Provider auth, API key credential, OAuth paste, kurulum kontrolü, model listesi ve CLI version durumu Settings altında.
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

Amaç kontrol hissi: AI agent dosya değiştirirken kullanıcı hangi dosyanın oynadığını görür, sağ panelde açar ve ana chat/orkestrasyon ekranını kaybetmez.

### Çok ajanlı orkestrasyon

Orkestrasyon sadece "tek prompt, tek bot" değildir. Pixcode aynı hedef için birden fazla CLI agent'ını organize edebilir.

Hazır çalışma tipleri:

- **Agent Team**: frontend, backend, review, docs veya özel rollere göre görev dağıtımı.
- **Multi-model Review**: aynı değişikliği farklı provider/model ile inceletme.
- **Sequential Handoff**: birbirine bağlı işleri sırayla devretme.
- **Decision Debate**: uygulamadan önce yaklaşım karşılaştırma.

Orkestrasyon içinde:

- ajanları aç/kapat,
- aynı provider'dan birden fazla worker oluştur,
- role, stage, label ve instruction ver,
- her ajan için model seç,
- hata alırsa kullanılacak yedek CLI agent'ı belirle,
- workflow DAG'ini çalıştırmadan önce preview et,
- run event'lerini stream et ve aktif run'ı iptal et,
- sağ/sol panelleri sürükleyerek genişlet.

### API odaklı yapı

Pixcode frontend'i zaten backend ile REST ve WebSocket üzerinden konuşur. Harici otomasyonlar da aynı kontrol düzlemini Pixcode API key ile kullanabilir.

Yeni API key'ler `px_` ile başlar:

```bash
curl http://localhost:3001/api/projects \
  -H "Authorization: Bearer px_your_key_here"
```

Tek seferlik agent işi:

```bash
curl http://localhost:3001/api/agent \
  -H "Authorization: Bearer px_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "codex",
    "projectPath": "/home/me/project",
    "message": "Mevcut diff'i incele ve riskli değişiklikleri listele.",
    "stream": false
  }'
```

Orkestrasyon preview:

```bash
curl http://localhost:3001/api/orchestration/workflows/agent_team/preview \
  -H "Authorization: Bearer px_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "metadata": {
      "agents": [
        { "adapterId": "codex", "label": "Backend", "role": "backend" },
        { "adapterId": "opencode", "label": "Reviewer", "role": "review" }
      ]
    }
  }'
```

Eski kurulumlardaki `ck_` key'ler çalışmaya devam eder. Güncel standart `px_`.

OpenAPI referansı: [`public/openapi.yaml`](public/openapi.yaml)

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
- `server/modules/orchestration/` - multi-agent workflow engine ve A2A adapter'ları.
- `server/modules/providers/` - provider auth, MCP, session, model ve install endpoint'leri.
- `shared/` - frontend/backend ortak contract'lar.
- `public/openapi.yaml` - uygulamayla gelen API referansı.
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
- API docs: [`public/openapi.yaml`](public/openapi.yaml)
- Static docs: [`public/docs.html`](public/docs.html), [`public/features.html`](public/features.html), [`public/orchestration.html`](public/orchestration.html), [`public/api-automation.html`](public/api-automation.html)
- AI discovery: [`public/llms.txt`](public/llms.txt), [`public/llms-full.txt`](public/llms-full.txt)
