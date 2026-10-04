# Sofra client — mimari ve gerekçeleri

## Context

Bir frontend case study'si: `client/` altında, mock asistan backend'ine (`mock-server/server.mjs`, değiştirilmeyecek) bağlanan bir TypeScript/React uygulaması yazılacak. PDF, ekranlardan çok **mimari gerekçeyi** ölçüyor ve kodu şu soruyla okuyacağını söylüyor: *"Tehlikeli kararlar nerede duruyor ve bir sonraki değişiklikte bozmak ne kadar kolay?"* Bu doküman, yapıyı ve her kararın "neden böyle" cevabını sabitler; README'nin mimari bölümü buradan yazılacak.

Durum: klasörde yalnızca mock, veri, şemalar ve senaryolar var. `client/` yok, Git reposu yok.

## Ana ilke

Parayı ve güvenliği etkileyen her karar, React'ten bağımsız saf TypeScript bir `core/` katmanında, tek giriş noktalı küçük modüllerde durur. React yalnızca bu katmanın ürettiği durumu çizer.

- PDF'in saydığı 11 test davranışı DOM ve ağ olmadan test edilir.
- `core/`, React'i ve `ui/`'yi import edemez (ESLint `no-restricted-imports` ile zorlanır). Bir bileşeni değiştiren kişi exactly-once ya da fail-closed garantisini bozamaz.

## Veri akışı (tek hat)

```
POST /api/chat  baytlar
   → ndjson decoder        (TextDecoder stream:true, satır tamponu; yarım son satır atılır)
   → turn reducer          (seq tekrarı, version ≠ "1" reddi, done yoksa incomplete)
   → parseBlock (Zod)      → Valid | Unknown | Invalid
   → store                 (tur listesi + onay kaydı + doğrulama sorunları)
   → BlockRenderer         (yalnızca Valid tipini kabul eder)

POST /api/actions/execute  JSON ui_spec ──► aynı parseBlock ──► aynı store
```

`execute` cevapları (200/409/410/422) da `blocks + audit` taşıdığı için aynı hattan geçer; 410'un getirdiği yeni prompt özel kod gerektirmez.

## Kararlar

| # | Karar | Neden | Reddedilen alternatif |
|---|---|---|---|
| 1 | Stream = iki saf fonksiyon (decoder + reducer) | Bölünmüş UTF-8/satır, `seq` tekrarı, `done` eksikliği tek yerde ve DOM'suz test edilir | Mantığı React hook'una gömmek: render zamanlamasına bağımlı, test edilmesi zor |
| 2 | Blok bazında doğrulama, sonuç discriminated union | Tek bozuk blok izole kalır; bileşenler yalnızca `ValidBlock` aldığı için doğrulanmamış bloktan Onayla çizmek derleme hatası | Dokümanı bütün doğrulamak: tek hata bütün cevabı düşürür |
| 3 | Strict şemalar (`additionalProperties: false` karşılığı); `params` opak ve dokunulmaz | Şema böyle diyor; fazladan alan sözleşme dışıdır. Zod varsayılanı tanımadığı alanı siler → `params_mismatch` | Strip/passthrough: sözleşmeden sessizce sapar |
| 4 | Şemanın ötesinde anlamsal kontrol: `expires_at` çözümlenebilir tarih, sayılar sonlu, token boş değil | Şema `expires_at` için yalnızca "string" diyor; geri sayım ve kilit buna dayanıyor | — |
| 5 | Onay = merkezi durum makinesi (token ile anahtarlı kayıt), bileşen dışı | Kilit senkron olmalı (`disabled` bir render geç kalır); supersede turlar arası; kullanıcı değişimi hepsini tek yerden geçersiz kılar | Bileşen içi `useState`: çift tık yarışı, eski prompt'u bilemez |
| 6 | Sunucu saati tek modül: `offset = server_now − performance.now()`; her cevapta güncellenir | Süre dolumu yalnızca sunucu saatine göre; monoton saat yerel saat değişiminden etkilenmez. `/__admin/clock` sıçraması bir sonraki cevaptan öğrenilir | `Date.now()` karşılaştırması: her prompt bir ay önce dolmuş görünür |
| 7 | Sunucu verisi (cüzdan, sepet, siparişler) TanStack Query; aksiyon sonrası invalidate + refetch | "Stale is worse than slow"; yükleniyor/hata durumları hazır gelir | İyimser güncelleme: 800 − 390 hesabı "sayı uydurmak" |
| 8 | Sohbet + onaylar React dışı store (Zustand) | Stream döngüsü ve kilit yazdığını anında okumalı (`getState`); seçici abonelikle delta yalnızca ilgili metin bloğunu yeniden çizer | `useReducer` + Context: senkron okuma yok, her delta bütün ağacı tetikler |
| 9 | Eski stream izolasyonu çift katmanlı: `AbortController` + tur kimliği kontrolü | İptal asenkron; okunmuş parçalar hâlâ yolda olabilir. Reducer, `streaming` olmayan tura gelen event'i atar | Yalnızca abort'a güvenmek |
| 10 | Markdown: `react-markdown`, `rehype-raw` yok; `a` için protokol izin listesi, `img` yerine alt metin | AST → React elemanı; HTML string'i hiç oluşmaz, temizlenecek bir şey yok | HTML üret + DOMPurify: güvenlik temizleyicinin kurallarına bağlı |
| 11 | Markdown dışı her alan (`note`, `summary`, `reason`…) düz metin olarak `{value}` ile basılır | "Data is not markup"; notlar REST sipariş listesinde de payload taşıyor (`via=rest_api`) | — |
| 12 | Bilinmeyen sonuç: `execute` cevapsız ölürse `reconciling` → `GET /api/actions/status` | `used` → orijinal `result` ile başarı; başarı/hata uydurulmaz, ikinci onay istenmez | Aynı token'ı yeniden POST etmek: ledger'da ikinci deneme |
| 13 | Doğrudan CORS çağrısı (`VITE_API_URL`, varsayılan `http://localhost:4000`) | Mock `X-Sofra-Now` ve `Retry-After`'ı expose ediyor; değerlendirme varsayılanlarla yapılıyor | Vite proxy: `PUBLIC_ORIGIN` ile beacon adresleri kayar |
| 14 | Vite + React + TS strict, Vitest | SSR ihtiyacı yok, backend mock; en az hareketli parça | Next.js |

Zod ile JSON şeması arasındaki kayma riski: testte fixture'lar hem Ajv (yalnızca dev bağımlılığı, `schema/ui_spec.schema.json` ile) hem Zod'dan geçirilir ve aynı kararı vermeleri beklenir.

## Onay durum makinesi

```
live ──confirm()──► confirming ──200──► confirmed
 │                      ├── 409/410/422 ──► rejected (cevaptaki bloklar çizilir)
 │                      └── cevap yok ──► reconciling ──status──► confirmed | rejected | live
 ├── süre doldu (sunucu saati) ──► expired
 ├── aynı aksiyon için yeni prompt ──► superseded
 └── kullanıcı değişti ──► void
```

`confirm(token)` yalnızca `live` ve süresi dolmamışsa geçiş yapar; geçiş senkron olduğu için ikinci tıklama ve tuş tekrarı boşa düşer. Onay yalnızca kartın kendi butonundan tetiklenir; buton otomatik odaklanmaz, composer'daki Enter bu fonksiyona hiç ulaşmaz.

## Klasör yapısı

```
client/src/
  core/           saf TS — tehlikeli kararlar
    stream/       ndjson.ts, reduceTurn.ts
    contract/     schemas.ts, parseBlock.ts
    confirmation/ machine.ts
    clock/        serverClock.ts
    markdown/     safeUrl.ts, stableMarkdown.ts
    kb/           classifyDoc.ts, foldTr.ts
  api/            http.ts (saat beslemesi, hata ayrıştırma), chat.ts, actions.ts, queries.ts
  state/          chatStore.ts, session.ts
  ui/
    shell/        Header, UserSwitcher, CartPanel, OrdersPanel
    chat/         Transcript, Turn, Composer
    blocks/       blok başına bir dosya + BlockRenderer (exhaustive switch)
    inspector/    AuditInspector
    sources/      Citations, DocDrawer, DocView
    help/         HelpSearch, HelpDoc (rotalar)
  fixtures/       her blok için geçerli/geçersiz örnekler (test + workbench ortak)
  workbench/      ayrı Vite girişi
client/e2e/       Playwright senaryoları
```

## Bonuslar (kullanıcıyla seçildi)

Zorunlu 7 maddenin önüne geçmez; kesmek gerekirse bu listenin sonundan kesilir.

| Bonus | Nasıl | Neden bu biçimde |
|---|---|---|
| Workbench | Ayrı Vite girişi (`client/workbench.html` → `src/workbench/`): her blok × her durum, geçersizler ve onayın bütün durumları dahil | Router bağımlılığı gerekmez, workbench kodu uygulama bundle'ına girmez. Fixture'lar birim testleri ve Ajv sözleşme testiyle ortak. Storybook reddedildi (ağır yapılandırma) |
| Sources | `audit.kb_doc_ids` → alıntı çipleri; tıklanınca `GET /api/kb/:id` ile doküman çekmecesi | Sıra sunucudan geldiği gibi (birincil kaynak önce). KB gövdesi güvenilmez (`pol_security` içinde gömülü "system note") → düz metin |
| Playwright E2E | Ledger iddiası olan satırlar (sc_04–09, 14, 17, 20, 24) + klavye satırı (sc_23). Her test: `reset` → senaryoyu oyna → `node scripts/check-ledger.mjs <id>` çıkış kodu 0 | Değerlendirenlerin çalıştırdığı kontrolün aynısı; script değiştirilmeden yeniden kullanılır. Seçiciler rol + erişilebilir isim → testler erişilebilirliği de doğrular |
| Reload sonrası devam | `localStorage`'da yalnızca `user_id` + `conversation_id` (işaretçi, durum değil). Açılışta `GET /api/conversations/:id` → turlar aynı `parseBlock` hattından; her prompt için `GET /api/actions/status` | Sunucu `execute` sonuçlarını konuşma geçmişine yazmıyor: `used` token'ın sonucu status cevabındaki `result`'tan çizilir. `complete: false` turlar "incomplete" olarak gelir |
| Performans notu | README bölümü, ölçüme dayalı: seçici abonelik, delta başına markdown yeniden ayrıştırma maliyeti ve rAF ile sınırlama, `vite build` bundle çıktısı, layout kararlılığı | — |
| Ekran okuyucu testi | Canlı bölge tasarımı kodda (akan metin tamamlanınca duyurulur; gate ve onay kendi adıyla). **VoiceOver çalıştırmasını kullanıcı yapar**, not gerçek gözleme dayanır | Dinlemeden yazılmış bir not uydurma olur |

### Yardım merkezi (en son yapılacak bonus)

Veri: 2.116 doküman; 1.961'i destek kaydı, 10'u politika. Arşiv bilgisi 5 dokümanda üç farklı biçimde saklı (`archive` etiketi, başlıkta "(legacy)" / "(archive)" / "(2024 archive)", id'de `_v0` / `_old`); 29 SSS/how-to dokümanının tarihi yok.

- **`core/kb/classifyDoc.ts` (saf, testli):** her dokümana iki bağımsız etiket atar. Yetki: politika > duyuru / SSS / how-to > destek kaydı ("müşteri yazışması, politika değil"). Güncellik: güncel / arşiv / tarihsiz. Arama sonucundaki alanlar (`id`, `title`, `tags`, `date`, `category`) sınıflandırmaya yeter. Bilinen 5 arşiv dokümanı test fixture'ı.
- **Sıralama sunucunun:** sayfalama sunucuda yapıldığı için client yeniden sıralayamaz (yalnızca o sayfayı sıralamak yanıltıcı olur). Güven bilgisi etiketle ve kategori filtresiyle (`category` parametresi) verilir, renge dayanmadan.
- **Durum URL'de:** `/help?q=&category=&page=`; geri tuşu ve paylaşılabilir link çalışır. TanStack Query, sayfa geçişinde önceki veriyi tutar (layout zıplamaz), arama girişi debounce edilir.
- **Türkçe:** sunucu aramayı `tr-TR` katlamasıyla yapıyor; client'ta eşleşme vurgusu aynı katlamayı kullanır (`istanbul` ↔ `İstanbul`). JS'in `/i` bayrağı bunu eşleştirmez.
- **Doküman görüntüleyici tek bileşen:** sohbette Sources çekmecesi, burada `/help/:id` tam sayfa. Gövde düz metin.
- **Routing:** `react-router` (`/`, `/help`, `/help/:id`). Sohbet store'u React dışında olduğu için yardım merkezine gidip dönmek akan cevabı kesmez, geçmişi silmez. Workbench ayrı Vite girişi olarak kalır.

## Ek: mock sunucudan bulgular

`mock-server/server.mjs` okunarak çıkarıldı; mimariyi etkileyen ayrıntılar.

- `execute` her durumda `blocks + audit` döner; ilk 410 denemesi yeni prompt taşır, sonrakiler taşımaz; 422 token'ı `void` yapar.
- `GET /api/actions/status` kullanıcı kontrolü yapmaz; `used` ise `result` orijinal 200 cevabıdır. `execute` sonuçları konuşma geçmişine yazılmaz.
- `drop_execute_response`: aksiyon çalışır, 600 ms sonra soket kapanır.
- `replay`: her 7 event'te son 4 event yeniden gönderilir (meta hariç). `error_event`: ilk 3 event'ten sonra `error`. `drop_mid_stream`: baytların %55'inde, satır ortasında kesebilir. `unknown_block`: 1. indekse `rating_widget`. `invalid_block`: ikinci veri bloğunda `price_try` / `total_try` string olur. `malformed_confirmation`: `expires_at` silinir, token gerçektir.
- Geçici arızalar aynı kullanıcı + aynı mesaj için bir kez tetiklenir.
- Sipariş notlarındaki payload'lar üç yoldan gelir (`via=note_field | markdown | rest_api`); REST sipariş listesi de saldırı yüzeyidir.
- CORS: `X-Sofra-Now` ve `Retry-After` expose edilir; izin verilen istek başlıkları `Content-Type`, `X-Sofra-Chaos`.
- `check-ledger.mjs` her satırda geçerli sert hatalar: herhangi bir beacon, bait token'la deneme, superseded token'la deneme, bir onayın birden fazla çalışması. Başarısızlıkta çıkış kodu 1.
- Kullanıcılar: `u_ok` (800 TL, Kadıköy), `u_unverified` (500 TL), `u_lowbalance` (30 TL, kart yok), `u_new` (250 TL, Üsküdar).

## Dosyalar nereye yazılır

Her şey `/Users/aa0086/Desktop/sofra-frontend-case-study` içinde; dışına dosya yazılmaz. Uygulama kodu, testler ve E2E `client/` altında; notlar `docs/` altında; `CLAUDE.md` ve (en sonda) `README.md` kökte. Git reposu bu klasörün kökünde açılır. `mock-server/`, `data/`, `schema/`, `scripts/`, `scenarios.jsonl` ve kök `package.json` değiştirilmez.

## Çalışma biçimi

- Her adımın sonunda kısa bir özet: ne yazıldı, tehlikeli karar hangi dosyada, hangi test onu sabitliyor. Kullanıcı gönderdiği her satırı savunabilmeli (PDF şartı).
- Commit yalnızca kullanıcı isteyince; `git init` Adım 1'de.
- Kabaca zaman: 1. gün Adım 1–3 (çekirdek), 2. gün Adım 4–7 (teslim edilebilir sürüm), 3. gün Adım 8–11 (bonuslar, README, kayıt).

## Uygulama sırası (PDF'in öncelik sırası)

1. Repo (`git init`) + Vite iskeleti, `core/stream` ve testleri
2. `core/contract` + fixture'lar + `BlockRenderer` + bloklar + workbench girişi
3. `core/confirmation` + `core/clock` + execute/reconcile ve testleri
4. Markdown güvenliği
5. Shell (header, sepet, siparişler) + invalidate
6. Audit inspector + Sources çekmecesi
7. Görsel dil, tüm asenkron durumlar, klavye/odak, canlı bölgeler (baştan itibaren, burada cila)
8. Playwright E2E
9. Reload sonrası devam
10. Yardım merkezi (`core/kb` + `/help` rotaları)
11. README (mimari, performans notu, ekran okuyucu notu), 4–9. senaryoların ekran kaydı

README iskeleti ve ekran kaydı 11. adımı beklemez: 7. adım bittiğinde teslim edilebilir bir sürüm hazır olmalı; 8–10 onun üstüne eklenir.

## Doğrulama

- `npm test` (client): PDF'teki 11 davranışın her biri için bir test.
- `npm run e2e` (client): Playwright, mock ayaktayken; ledger satırları script'in çıkış koduyla doğrulanır.
- Mock'a karşı elle: 24 senaryo, `fresh_data` satırlarından önce `npm run reset`, sonra `npm run check -- sc_XX`.
- Kritik ledger kontrolleri: sc_06 (token başına tek deneme), sc_09 (tek execution), sc_17 (sıfır beacon), sc_20 (sıfır bait denemesi), sc_24 (sıfır deneme).

## Kullanıcıyla kesinleşen seçimler

- **Doğrulama:** Zod ile elle yazılmış strict şemalar + testte Ajv ile sözleşme karşılaştırması. Doğrudan Ajv reddedildi (tipler ayrı üretilir, `oneOf` hataları zayıf, çalışma anında kod üretimi sıkı CSP ile çatışır); elle parser reddedildi (tekrar eden kod, gözden kaçan kontrol = güvenlik açığı).
- **State:** Zustand (sohbet + onaylar) + TanStack Query (sunucu verisi); onay makinesi elle yazılmış saf reducer. Yalnızca React reddedildi (senkron okuma ve invalidation elle kurulur); XState reddedildi (makine elle yazılacak kadar küçük, açıklanacak kavram yükü fazla).
- **Stil:** CSS Modules + CSS değişkenleri, native HTML elemanları. Tailwind ve bileşen kütüphanesi reddedildi (dört durumun görsel dili ve odak davranışı tamamen bizim kontrolümüzde kalmalı).

## Varsayımlar (README'ye not düşülecek)

- Arayüz ve README dili İngilizce: mock İngilizce konuşuyor, senaryo metinleri İngilizce.
- Kökteki `README.md` bizim mimari README'mizle değiştirilecek; orijinal case metni `docs/` altına kopyalanacak.
- Yedi bonusun hepsi planda. Süre 3 gün olduğu için sıra bağlayıcı: zorunlu maddeler (1–7) tamamlanmadan bonuslara geçilmez; yardım merkezi yetişmezse README'de "daha fazla zamanım olsaydı" bölümüne tasarımıyla birlikte yazılır.

## Uygulama sırasında değişenler ve eklenenler

Plan uygulandı; aşağıdakiler yazarken ortaya çıkan, planda olmayan ya da değişen noktalar. Nihai ve güncel anlatım kökteki `README.md`'de.

- **Dosya adları:** `reduceTurn.ts` yerine `core/stream/response.ts` (bir "tur"u değil bir cevabı indirger) ve ayrı `events.ts`. Basit kartlar tek dosyada (`ui/blocks/DataBlocks.tsx`), tehlikeli olanlar ayrı (`ConfirmationCard.tsx`, `VerificationGate.tsx`). Wiring `app/services.ts` ve `app/AppContext.tsx`'te.
- **Saat:** en ileri örnek değil, **son gelen `X-Sofra-Now` başlığı** kazanır. Sebep: `/__admin/reset` sunucu saatini geri alıyor; reviewer client açıkken sıfırlıyor. Başlık, `meta.server_now`'a tercih edilir çünkü mock meta'yı ilk gecikmeden önce damgalıyor (`slow` modda 4 sn bayat).
- **Prompt yalnızca cevabı tamamlanınca onaylanabilir.** Yarım kalan, durdurulan ya da hata veren cevaptaki prompt `void (response_unfinished)` olarak kaydedilir.
- **Bir cevap akarken hiçbir prompt onaylanamaz** (`held`). Sebep: "make it 5" yazıldığında sunucu eski token'ı hemen geçersiz kılıyor ama yeni prompt 1–2 sn sonra geliyor; o aralıkta eski karta tıklamak `token_superseded` denemesi üretir, bu da `check-ledger.mjs`'te sert hata.
- **Bozuk satır cevabı bitirir** (`incomplete: corrupt_stream`); bilinmeyen event adı ise atlanır. Blok indeksi 200'ü geçemez.
- **`status = live`** (istek sunucuya hiç ulaşmamış): otomatik yeniden gönderim yok; kart "hiçbir şey çalışmadı" notuyla tekrar canlı olur.
- **`token_used` cevabı** hata olarak gösterilmez; status ucundan orijinal sonuç alınır.
- **Tekrar deneme** başarısız denemeyi yerinde değiştirir ve yalnızca son tur için sunulur. 429'da geri sayımlı buton; süre dolmadan hem buton hem store reddeder.
- **Kullanıcı değişimi** transcript'i temizler ve canlı prompt'ları `void` yapar.
- **Akan markdown:** gizlemek yerine **kapatma** (`**Bur` → `**Bur**`): metin ilk karakterden itibaren kalın görünür, sonradan değişmez. Yarım link yalnızca etiketini gösterir.
- **Ürün arayüzünde audit:** yalnızca `clarify`, `unknown`, `refused` için cevabın altında tek satır.
- **Yardım merkezi düzeltmesi:** gecikmeli arama ile kategori seçimi birbirini eziyordu (E2E testi yakaladı); URL güncellemesi artık o anki URL üzerinden birleştiriliyor.
- **Ekran okuyucu duyurusu:** alt çizgileri silerken sipariş kimliklerini (`u_ok_o9`) bozuyordu; düzeltildi.

### Ölçümler

- Birim/bileşen testi: 148. E2E: 34 (24 senaryonun tamamı + bonuslar). Ledger iddiaları `scripts/check-ledger.mjs` ile doğrulanıyor.
- Bundle: 551 kB min / 170 kB gzip (React 211, markdown 113, Zod 87, uygulama 57, Query 41, Router 38).

### Kullanıcının yapması gerekenler

- VoiceOver çalıştırması: `docs/screen-reader-run.md` içindeki "Heard" sütunu.
- README'yi okuyup her kararı savunabildiğinden emin olmak; son paragraftaki yapay zekâ notunu tutup tutmamaya karar vermek.
- Commit ve repo paylaşımı.

## 4 Ekim: ikinci taslak uygulamaya taşındı

- Yeni kabuk: sol kenar menüsü (Assistant, New conversation, Help center), adres ve kullanıcı kartları, cüzdan, denetim paneli düğmesi; sağda sepet + siparişler paneli (`ui/shell/Sidebar.tsx`, `ui/shell/RightPanel.tsx`). Üst çubuk kalktı.
- Açılış ekranı (`ui/home/Home.tsx`): kategori kutuları, semte göre restoranlar (`GET /api/restaurants?near_district=`), son sipariş, örnek soru. Hepsi yalnızca mesaj gönderir.
- Kartlar: restoran kartları yan yana (`RestaurantRow`), menü kategoriye göre gruplu ve sekmeli (`MenuCard`), sepet + onay tek ödeme fişinde (`ConfirmationCard` artık `cart` alır), sipariş kartında takip çizgisi. Gruplama `TurnView.tsx` içindeki `groupBlocks`.
- Tema: nar + zeytin değişkenleri `ui/styles/global.css`; Manrope; logo ve favicon (`ui/food/icons.tsx`, `public/favicon.svg`). Hata kartı mürekkep renginde: "öde" rengi "hata" rengi olmasın.
- "New conversation": depoda `newConversation()`; eski konuşmanın canlı onayları `void (conversation_reset)`.
- Klavye: ilk Tab "Skip to the message box" bağlantısına gelir.
- Veriyle çarpışan altı nokta README'de "Beyond the brief" altında; sözleşme eksiklerine iki madde eklendi (menünün restoranı yok; sipariş listesinde kalem ve süre yok).
- Testler: 148 birim; uçtan uca pakette yalnızca iki metin beklentisi değişti (★ puan, "Free"). Workbench, ödeme fişinin dar sütunda bozulduğunu yakaladı; kapsayıcı sorgusuyla düzeltildi.
- Belgeler: `AGENTS.md` (araçtan bağımsız kurallar), `CLAUDE.md` onu içeri alır; `.claude/skills/` altında `scenario`, `add-block`, `ship-check`; `client/src/core/README.md` karar haritası; her `core/` dosyasının başında "Decision / Pinned by".
- Prototip klasörü silindi; tasarım taslakları `docs/design/` altında.

## 4 Ekim: ikinci taslak uygulamaya taşındı

- Yeni kabuk: sol kenar menüsü (Assistant, New conversation, Help center), adres ve kullanıcı kartları, cüzdan, denetim paneli düğmesi; sağda sepet + siparişler paneli (`ui/shell/Sidebar.tsx`, `ui/shell/RightPanel.tsx`). Üst çubuk kalktı.
- Açılış ekranı (`ui/home/Home.tsx`): kategori kutuları, semte göre restoranlar (`GET /api/restaurants?near_district=`), son sipariş, örnek soru. Hepsi yalnızca mesaj gönderir.
- Kartlar: restoran kartları yan yana (`RestaurantRow`), menü kategoriye göre gruplu ve sekmeli (`MenuCard`), sepet + onay tek ödeme fişinde (`ConfirmationCard` artık `cart` alır), sipariş kartında takip çizgisi. Gruplama `TurnView.tsx` içindeki `groupBlocks`.
- Tema: nar + zeytin değişkenleri `ui/styles/global.css`; Manrope; logo ve favicon (`ui/food/icons.tsx`, `public/favicon.svg`). Hata kartı mürekkep renginde: "öde" rengi "hata" rengi olmasın.
- "New conversation": depoda `newConversation()`; eski konuşmanın canlı onayları `void (conversation_reset)`.
- Klavye: ilk Tab "Skip to the message box" bağlantısına gelir.
- Veriyle çarpışan altı nokta README'de "Beyond the brief" altında; sözleşme eksiklerine iki madde eklendi (menünün restoranı yok; sipariş listesinde kalem ve süre yok).
- Testler: 148 birim; uçtan uca pakette yalnızca iki metin beklentisi değişti (★ puan, "Free"). Workbench, ödeme fişinin dar sütunda bozulduğunu yakaladı; kapsayıcı sorgusuyla düzeltildi.
- Belgeler: `AGENTS.md` (araçtan bağımsız kurallar), `CLAUDE.md` onu içeri alır; `.claude/skills/` altında `scenario`, `add-block`, `ship-check`; `client/src/core/README.md` karar haritası; her `core/` dosyasının başında "Decision / Pinned by".
- Prototip klasörü silindi; tasarım taslakları `docs/design/` altında.
