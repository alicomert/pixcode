# Pixcode 1.36.0 - Kontrol, orkestrasyon ve public dokümantasyon sürümü

Pixcode 1.36.0, uygulamayı sadece birden fazla CLI ile konuşulan bir chat ekranı olmaktan çıkarıp daha güçlü bir self-hosted AI coding workspace haline getiriyor. Bu sürümün ana odağı kullanıcıya daha fazla hakimiyet vermek: agent çalışırken ne yaptığını görmek, değişen dosyalara hızlı ulaşmak, orkestrasyon akışlarını daha net yönetmek, tema görünümünü kişiselleştirmek, API erişimini standartlaştırmak ve projeyi dışarıdan keşfedilebilir hale getirmek.

## Öne çıkanlar

### Hakimiyet / Command Center

AI agent dosya düzenlerken kullanıcı artık sadece chat cevabını beklemek zorunda değil. Local working tree değişiklikleri takip ediliyor, değişen dosyalar görünür hale geliyor ve kullanıcı ilgili dosyaya hızlıca dönebiliyor. Amaç agent üzerinde kontrol hissini artırmak: hangi dosya değişti, ne zaman değişti, nereye bakmalıyım soruları UI içinde cevaplanıyor.

### Daha güçlü orkestrasyon

Orkestrasyon tarafı bu sürümde daha pratik hale geldi. Agent bazlı model seçimi, fallback CLI agent seçimi ve daha anlaşılır run akışları eklendi. Kullanıcı bir akışta OpenCode, Codex, Claude, Gemini, Cursor veya Qwen tarafını farklı rollerle kullanabilir; bir adım zayıf veya hatalı giderse yedek agent mantığı devreye alınabilir.

Bu yapı özellikle şu senaryolarda işe yarar:

- backend/frontend/review gibi rol bazlı agent ekipleri,
- farklı modellerle aynı değişikliği inceleme,
- sıralı handoff akışları,
- karar/debate tarzı yaklaşım karşılaştırmaları,
- hata alan adımları başka CLI ile toparlama.

### Yeni tema ve görünüm sistemi

Pixcode artık tek mavi/lacivert görünüme bağlı değil. Emerald, VS Code tarzı renkler ve özel açık/koyu accent renkleri destekleniyor. Tema ayarları token sistemi üzerinden UI genelinde uygulanıyor; butonlar, focus ring, aktif durumlar ve navigation renkleri birlikte değişiyor.

### Daha iyi workspace deneyimi

Chat, Files, Shell, Source Control ve Orchestration alanlarında panel davranışları iyileştirildi. Desktop tarafında split/full mantığı daha net; mobil ve tablette orkestrasyon ekranı daha kontrollü davranıyor. Chat input alanı ve CLI activity feedback de daha okunur hale getirildi.

### Provider durumları ve bildirimler

CLI provider sürüm durumları cache'leniyor, manuel refresh destekleniyor ve güncelleme var bilgisi daha anlamlı gösteriliyor. Browser push ve Telegram bildirim hattı da uzun süren agent işleri için güçlendirildi.

### `px_` API key standardı

Yeni Pixcode API key'leri artık `px_` prefix'iyle üretiliyor. Eski `ck_` key'ler geriye dönük uyumluluk için çalışmaya devam ediyor. Bu değişiklik public API, OpenAPI dokümanı ve otomasyon örnekleriyle birlikte güncellendi.

### Public dokümantasyon ve AI keşfi

README'ler baştan yazıldı ve güncel Pixcode yapısını anlatacak hale getirildi. Ayrıca static HTML dokümantasyon sayfaları eklendi:

- `landing.html`
- `docs.html`
- `features.html`
- `orchestration.html`
- `api-automation.html`

Arama motorları ve AI sistemleri için ek discovery dosyaları da eklendi:

- `llms.txt`
- `llms-full.txt`
- `robots.txt`
- `sitemap.xml`
- `humans.txt`

Bu sayede Pixcode; Claude Code UI, Codex UI, Cursor CLI UI, OpenCode UI, AI coding agent orchestration, self-hosted AI IDE, MCP manager ve benzeri aramalarda daha anlaşılır bir teknik metne sahip oluyor.

## Teknik değişiklik özeti

- `package.json`, `package-lock.json` ve `desktop/package.json` sürümü `1.36.0` oldu.
- Desktop wrapper içindeki `@pixelbyte-software/pixcode` bağımlılığı `1.36.0` sürümüne çekildi.
- OpenAPI sürümü `1.36.0` olarak güncellendi.
- API docs içindeki örnekler `px_` key formatına geçirildi.
- Static dokümantasyon dosyaları build çıktısına dahil edildi.
- npm package description ve keyword listesi SEO/package discovery için genişletildi.
- `CHANGELOG.md` 1.36.0 için ürün seviyesinde güncellendi.

## Doğrulama

Bu sürüm için şu kontroller çalıştırıldı:

- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm pack --dry-run`

Dry-run çıktısında `dist/`, `dist-server/`, README dosyaları, static docs, OpenAPI dosyası ve CLI entrypoint paket içinde göründü.

## Yayın notu

Bu sürüm Pixcode'un 1.36 hattı için temel oluşturur. Bundan sonraki küçük sürümlerde CLI test kapsamı, orchestration polish, desktop installer çıktıları, provider plugin görünürlüğü ve remote/server kullanım akışları daha da sıkılaştırılabilir.
