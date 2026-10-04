# Tasarım benchmark'ı: Türkiye'de yemek sipariş uygulamaları (Ekim 2026)

Amaç: Sofra'nın arayüzüne "yemek uygulaması" hissini renk değiştirerek değil, sektörün ortak kalıplarını sohbet arayüzüne uyarlayarak vermek.

## 1. Pazar ve kimlikler

| Uygulama | Kimlik | Not |
|---|---|---|
| Yemeksepeti (Delivery Hero) | 2021'de kırmızıdan pembe/magentaya geçti; yumuşak hatlı özel yazı tipi; kurye ikonu kalktı; cüzdan ve Joker fırsatları öne çıktı | 20 yıllık kırmızı kimliğin bilinçli terki |
| Uber Eats Trendyol Go | Trendyol turuncusu arka plana; Uber Eats siyah + yeşil (#06C067) ön planda; kurye kıyafetleri ve arayüz buna göre | Getir Yemek'in restoran panelleri Eylül 2026'da buraya devrediliyor |
| Migros Yemek | Migros turuncusu; market uygulamasının içinde bir sekme | Lansman iletişimi rakiplerin "arayüz ve sıcaklık" eksiğine vuruyor |
| Getir | Mor (#5D3EBC) + sarı; sektörün kırmızı/mavi alışkanlığını kırmak için seçilmiş | Yemek tarafı küçülüyor |

Küresel referanslar: Uber Eats siyah+yeşil, DoorDash kırmızı, Deliveroo teal, Wolt mavi. Renk tek başına kategori söylemiyor; ortak olan kalıplar.

## 2. Ortak kalıplar

1. Üstte teslimat bağlamı: adres/semt, teslimat modu; belirgin arama çubuğu.
2. Yatay kategori şeridi (ikonlu çipler) ve kampanya bannerları.
3. Restoran kartı: kapak görseli, isim, puan + yorum sayısı, süre, teslimat ücreti, min sepet, promosyon etiketi, favori. Meta satırı 12–13 px, ikonlu.
4. Restoran sayfası: kapak + bilgi satırı, yapışkan kategori sekmeleri, ürün satırları (fiyat kalın, sağda küçük görsel ve `+`), tükenen ürün soluk + "Tükendi".
5. Ürün detayı bottom-sheet: seçenekler, adet, not, tam genişlik "Sepete ekle · ₺".
6. Yapışkan sepet çubuğu: "2 ürün · ₺390 → Sepete git"; ücretsiz teslimat / min sepet ilerleme çubuğu.
7. Ödeme ekranı: adres, ödeme yöntemi, kupon, kurye notu, kalem kalem toplam, tek büyük "Sipariş ver".
8. Sipariş takibi: durum adımları, büyük tahmini saat, harita, kurye.
9. Görsel ağırlık fotoğrafta; arayüz sade: beyaz zemin, tek marka rengi header/CTA/etiketlerde, sabit sistem renkleri, kalın başlıklar, büyük rakamlar.

## 3. Sofra'ya uyarlama

Kısıtlar: veride fotoğraf yok; akış sohbetle ilerler; sayıları sunucu verir; dört durum (engel, onay, tamamlandı, hata) renge dayanmadan ayrışır; para yalnızca onay kartının kendi butonuyla hareket eder.

| Kalıp | Sofra'da karşılığı |
|---|---|
| Teslimat bağlamı | Header'da semt rozeti (`district`), cüzdan, kullanıcı |
| Kategori şeridi | Boş sohbet ekranı ana sayfa olur: ikonlu kategori kutuları; her biri yalnızca bir mesaj gönderir |
| Restoran kartı | Fotoğraf yerine mutfağa göre illüstratif karo + monogram; ikonlu meta satırı; "Menüyü gör" (mesaj gönderir); birden fazla restoran yatay kaydırılan kartlar |
| Restoran sayfası | Menü cevabı kategoriye göre gruplu, yapışkan kategori çipleri; satırda fiyat kalın, "Sipariş et" (mesaj); tükenen soluk + "Tükendi", 18+ rozeti |
| Sepet çubuğu | Composer üstünde "Sepet · 2 ürün · ₺175" şeridi (REST'ten); ücretsiz teslimat mesafesi yalnızca sunucunun metniyle |
| Ödeme ekranı | Onay kartı checkout sheet gibi: restoran başlığı, kalemler, kesikli ayraç, büyük toplam, "Cüzdan · ₺800", süre çubuğu, tam genişlik buton. Kesikli çerçeve ve "Needs your confirmation" kalır |
| Sipariş takibi | Sunucunun verdiği durumlarla sınırlı adım çubuğu: Received → Delivered; Cancelled üstü çizili. Ara adım uydurulmaz |
| Fotoğraf ağırlığı | Mutfak illüstrasyonları (inline SVG) ve güçlü tipografi; rakamlar büyük, meta küçük |
| Hareket | Kısa geçişler, `prefers-reduced-motion` saygılı |

## 4. Tema seçenekleri

- A. Nar + zeytin (öneri): vurgu nar kırmızısı (~#B42318, beyaz üstünde 6:1), ikincil zeytin yeşili, keten zemin, siyaha yakın mürekkep. Pazardaki büyük oyuncularla karışmıyor.
- B. Siyah-beyaz + safran: tek sert vurgu; daha "tech", daha az sıcak.

Her iki yönde renk yalnızca CTA, rozet ve etiketlerde; kartlar beyaz; kimlik ikon + yazı + çerçeve biçiminde.

## 5. Sıradaki adım

v2 taslağı (projeye dokunmadan): ana sayfa/boş ekran, restoran kartı şeridi, menü cevabı, checkout biçimli onay kartı, sipariş takip çubuğu, sepet şeridi; masaüstü + telefon.

## Kaynaklar

- Webrazzi, "Yemeksepeti, logosunu ve tasarımını yeniledi" (2021): https://webrazzi.com/2021/09/29/yemeksepeti-logosunu-ve-tasarimini-yeniledi/
- Marketing Türkiye, "Yemeksepeti 20 senelik logosunu değiştirdi": https://www.marketingturkiye.com.tr/haberler/yemeksepeti-yeni-logo/
- TRHaber, "Trendyol Go'nun logosu mu değişti, neden yeşil?": https://www.trhaber.com.tr/gundem/trendyol-go-nun-logosu-mu-degisti-neden-yesil-h967898.html
- Uber Eats Trendyol Go: https://trendyolgo.com/
- Paketmaster, "Yemek sipariş uygulamaları: restoranlar için karşılaştırma (2026)": https://paketmaster.com/blog/yemek-siparis-uygulamalari?lang=en
- AlternaCX, "Yemek sipariş uygulamaları analizi 2026": https://alternacx.com/yemek-siparis-uygulamalari-analizi-2026/
- Marketing Türkiye, Migros Yemek kampanyası: https://www.marketingturkiye.com.tr/kampanyalar/migros-yemek-uygulamasi/
- Webrazzi, "Migros, Migros Yemek servisi ile…" (2022): https://webrazzi.com/2022/06/13/migros-migros-yemek-servisi-ile-online-yemek-siparisi-sektorune-adim-atti/
- Fol, Getir marka çalışması: https://fol.com.tr/works/getir/
- Brandfetch, Getir: https://brandfetch.com/getir.com
