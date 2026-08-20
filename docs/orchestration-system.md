# Pixcode Orchestration System (historical)

> This document describes the pre-1.55 orchestration UI and route family. That
> implementation is no longer mounted in the current server. For supported
> automation use NanoClaw (`/api/nanoclaw/*`, `/api/tasks/*`) or the maintained
> production agent loop (`/api/production-agent-loop/*`). Do not build new
> clients against `/api/orchestration/*`.

## Current replacement

This file is retained only as an archive for readers of older release notes. The
current control plane is:

- NanoClaw: `POST /api/nanoclaw/run` for an immediate multi-CLI run,
  `POST /api/nanoclaw/tasks` for `once`/`interval`/`cron` schedules, and
  `GET/PATCH/POST /api/nanoclaw/tasks/*` for lifecycle operations.
- Compatibility task routes: `/api/tasks/*` for clients that still use the UI
  alias.
- Production automation: `/api/production-agent-loop/*` for issue-to-PR plans,
  CI repair, review queues, checkpoints, and scheduler jobs.
- Public contracts: `/api/public/manifest`, `/api/public/openapi`, and the
  generated SDK/cookbook endpoints.

The former workflow routes are intentionally not mounted. Do not copy endpoint
examples from the historical sections below into new integrations.

Bu dokuman Pixcode orchestration sisteminin 1.34.x davranisini ve beklenen kullanici deneyimini aciklar.

## Amac

Orchestration sistemi, kullanicinin sectigi CLI ajanlarini tek bir hedef etrafinda koordine eder. Sistem sabit bir bot sirasi dayatmaz; kullanici hangi CLI'lari actiysa workflow sadece onlari kullanir.

Desteklenen adapterler:

- Claude Code
- Codex
- Cursor
- Gemini
- Qwen Code
- OpenCode

## Temel Katmanlar

- A2A router: `server/modules/orchestration/a2a/routes.ts`
- Adapterler: `server/modules/orchestration/a2a/adapters/`
- Workflow runner: `server/modules/orchestration/workflows/workflow-runner.ts`
- Workflow store: `server/modules/orchestration/workflows/workflow-store.ts`
- Workflow API: `server/modules/orchestration/workflows/workflow.routes.ts`
- Frontend UI: `src/components/orchestration/`

Her workflow node'u bir A2A task olarak baslar ve child task'lar ayni `contextId` ile gruplanir.

## Calisma Modlari

### Agent Team

Koordinator once aktif ajan kadrosunu ve assignment bilgilerini okur. Ardindan isi parcalara ayirir. Backend/frontend/review gibi roller kullanici tarafindan verilebilir, ama zorunlu degildir.

Kritik davranislar:

- Backend isleri uzun sure bloklamasin diye once kisa `handoff` node'u uretilir.
- Frontend ve backend isleri uygun oldugunda paralel baslar.
- Review asamasi actionable hata bulursa dinamik `repair` ve `recheck` node'lari eklenebilir.
- Final rapor tum sonuc ve degisiklikleri toparlar.

### Decision Debate

Karar tartismasi onerme, elestiri, yanit ve final raporu mantigiyla calisir. Kullanici bu rolleri manuel vermek zorunda degildir.

- Eksik roller otomatik atanir.
- Kullanici isterse ayni role birden fazla CLI atayabilir.
- Final rapor tamamlanmadan "Bu raporla ajan takimi hazirla" aksiyonu gosterilmez.
- Final rapor tamamlandiktan sonra rapor yeni Agent Team prompt'una donusturulebilir.

### Sequential Handoff

Ajanlar sirali olarak calisir. Onceki node'un ciktisi sonraki node'un prompt baglamina eklenir.

### Multi Model Review

Aktif ajanlar ayni hedefi ayri ayri inceler, ardindan bir raporlayici sonucu toparlar.

## Hedef Calisma Alani

1.34.x ile workflow baslatirken hedef calisma alani acik hale getirildi. Bu, ajanlarin yanlis dizinde calismasini engeller.

Secenekler:

- `selected_project`: Sol menude secili proje.
- `pixcode_app`: Pixcode uygulama kok dizini.
- `custom`: Kullanici tarafindan verilen path.

Backend bu hedefi normalize eder ve her child A2A task'a `cwd` olarak gonderir. Her ajan prompt'unun basinda su baglam verilir:

- Hedef workspace adi.
- Ajanin calisacagi gercek dizin.
- Secili UI projesi.
- Pixcode app root.

Bu nedenle kullanici "Pixcode orchestration sistemini analiz et" dediginde hedef `Pixcode sistemi` secilmelidir; ajanlar `/root/pixcode` kokunde calisir.

## Dinamik Repair Mantigi

Sabit DAG tek basina yeterli degildir. Review node'u hata bulursa runner asagidaki dinamik adimlari ekleyebilir:

- `repair_*`: Hatayi duzeltecek uygun implementasyon ajanina verilir.
- `recheck_*`: Duzeltmeden sonra tekrar kontrol eder.
- `final_report`: Repair/recheck sonrasi guncellenen sonuca baglanir.

Boylece "inceleme hata buldu ama workflow bitti" problemi engellenir.

## UI Davranisi

- Assignment opsiyoneldir.
- Assignment etiketi tiklaninca input acilir.
- Kaydet butonu ile explicit save yapilir.
- Ajan ac/kapat kontrolu checkbox degil switch'tir.
- Kullanici ayni CLI'dan birden fazla kopya ekleyebilir.
- Tek ajanla konusma istenirse "Solo" ile yalnizca o ajan aktif birakilir.
- Ajan adimlari renkli status/stage badge'leriyle takip edilir.
- Komut ciktisi gibi gurultulu artifact'ler collapse/dropdown seklinde gosterilir.
- Rapor tamamlanmadan rapordan yeni ajan takimi hazirlama butonu gosterilmez.

## API Yuzeyi (arşivlenmiş v1.34 sözleşmesi)

Onemli endpointler:

- `GET /api/orchestration/workflows`
- `GET /api/orchestration/workflows/context`
- `POST /api/orchestration/workflows/:id/preview`
- `POST /api/orchestration/workflows/:id/runs`
- `GET /api/orchestration/workflows/runs`
- `GET /api/orchestration/workflows/runs/:runId`
- `GET /api/orchestration/workflows/runs/:runId/events`
- `POST /api/orchestration/workflows/runs/:runId/cancel`

`/context` endpoint'i app root ve desteklenen workspace hedeflerini dondurur. UI bu bilgiyi kullanarak ajanlarin hangi dizinde calisacagini kullaniciya acik gosterir.

## Dogrulama

Beklenen minimum kontrol:

- Workflow preview dogru DAG'i uretmeli.
- `pixcode_app` hedefi `/root/pixcode` olarak cozulmeli.
- Her node prompt'u workspace context ile baslamali.
- Stop/cancel calismalari running node'lari terminal hale getirmeli.
- Restart sonrasi terminal olmayan workflow'lar stuck kalmamali.
