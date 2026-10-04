# Son kontrol listesi

Kural: sunucunun vermediği veri gösterilmez, istemcide hesap yapılmaz, yeni uç nokta uydurulmaz. Para yalnızca onay kartındaki düğmeyle hareket eder; diğer her düğme yalnızca mesaj gönderir.

Durum: 4 Ekim akşamı. A, B ve C tamamlandı; D ve E kullanıcıda.

## A. İkinci taslağı ana uygulamaya taşımak

- [x] A1 Tema ve kimlik: nar + zeytin, Manrope, logo, favicon.
- [x] A2 Kabuk: sol kenar menüsü, adres kartı, kullanıcı seçimi, cüzdan, denetim paneli düğmesi.
- [x] A3 Açılış ekranı: kategori kutuları, semte göre restoranlar, son sipariş, örnek soru.
- [x] A4 Sohbet kartları: yan yana restoranlar, gruplu menü, ödeme fişi, engel/sipariş/hata kartları.
- [x] A5 Sağ panel: sepet, aktif sipariş takip çizgisi, geçmiş siparişler; "Cancel order" ve "Leave a tip".
- [x] A6 Yazma kutusu: hap biçimli, Durdur ve Gönder simgeleri.
- [x] A7 "New conversation" = yeni konuşma.
- [x] A8 Yapılmayacaklar listesine uyuldu (yeniden sipariş, tahmini süre, ilerleme çubuğu, ayrı sayfa, sepet şeridi yok). Telefon düzeni yapılmadı.
- [x] A9 Prototip klasörü silindi; taslaklar `docs/design/` altında.

## B. Doğrulama

- [x] B1 Taşımadan önce tam uçtan uca paket (34 geçti).
- [x] B2 Birim ve bileşen testleri: 168 geçti (makine, saat ve yeni konuşma testleri eklendi).
- [x] B3 Uçtan uca testler: 36 geçti (iki genişlikte düzen testi eklendi).
- [x] B4 Workbench güncel; dar sütunda bozulan ödeme fişi düzeltildi.
- [x] B5 Ekran görüntüleri yeniden üretildi.
- [x] B6 Son tam tur: tipler ve lint temiz, 168 birim, 36 uçtan uca test geçti; verilen dosyalar değişmedi.

## C. Okunabilirlik, belgeler, yapay zekâ çalışma düzeni

- [x] C1 Her `core/` dosyasının başında "Decision / Pinned by".
- [x] C2 `client/src/core/README.md` karar haritası.
- [x] C3 README'nin başında mimari şema; onay makinesi diyagramı.
- [x] C4 README "Beyond the brief".
- [x] C5 Sözleşme eksiklerine iki madde.
- [x] C6 Performans ölçümleri (565 kB / 174 kB gzip).
- [x] C7 README "How I worked".
- [x] C8 AGENTS.md.
- [x] C9 CLAUDE.md (`@AGENTS.md` + Claude'a özgü notlar).
- [x] C10 Beceriler: `/scenario`, `/add-block`, `/ship-check`. (Kişisel `/defend` yazılmadı; istenirse `~/.claude/skills/` altına.)
- [x] C11 `docs/architecture-plan.md` 4 Ekim notu.

## F. 5 Ekim geri bildirimleri

- [x] F1 Workbench: her örnek kendi çerçevesinde, düz dilde başlık ve "ne zaman olur" açıklaması, teknik ad küçük; bölüm menüsü.
- [x] F2 Yardım merkezi yeni tasarımda: hap biçimli arama, kartlar, düğme görünümlü geri bağlantısı, iskeletler.
- [x] F3 Vurgu renkleri tutarlı: çerçeveli kontroller açılır, dolu kontroller koyulaşır; siyah menü ögesi açık zemine düşmez.
- [x] F4 Yazma kutusunda odak halkası kutunun kendisine değil hap biçimli çerçeveye.
- [x] F5 Kullanıcı seçiminde ad · kimlik; altında ham bayraklar (payment_method, age_verified, district).
- [x] F6 İskeletler: ana sayfa restoranları ve son sipariş, sepet, siparişler, yardım merkezi sonuçları ve doküman sayfası, kenar çubuğu adres/cüzdan.
- [x] F7 Kaydırıcıda önceki/sonraki okları; kaydırma çubuğu gizli (yüksekliği değiştirmesin).
- [x] F8 Düzen kararlılığı: akış sırasında çerçeve ve önceki turlar kıpırdamıyor, tarayıcı kayma ölçüsü 0,1'in altında; uçtan uca testle sabit.
- [x] F9 Telefon düzeni: üst çubuk, çekmece olarak kenar menüsü ve sepet, tek sütun ödeme fişi; sayfa ekranı tam dolduruyor.
- [x] F10 Seçim kutusu kendi okunu çiziyor (`appearance: none`), yerleşik ok kenara yapışmıyor.

## D. Kullanıcının yapacakları

- [ ] D1 VoiceOver çalıştırması: `docs/screen-reader-run.md` içindeki "Heard" sütunu.
- [ ] D2 README'nin baştan sona okunması. "How I worked" bölümü yapay zekâ kullanımını anlatıyor; kalsın mı, nasıl kalsın kararı.
- [ ] D3 Teslimde PDF ve `docs/case-brief.md` kopyası repoya girsin mi kararı.
- [ ] D4 İlk commit ve reponun paylaşımı.

## E. Sunum

- [ ] E1 10 dakikalık sunum metni.
- [ ] E2 Savunma turu.
