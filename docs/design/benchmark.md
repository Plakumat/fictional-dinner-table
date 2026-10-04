# Design benchmark: food-delivery apps in Turkey

The brief grades whether the interface communicates. The goal of this note is
to make the client read as a food-ordering product, by borrowing the patterns
the Turkish food-delivery apps share rather than by changing a few colours.

## Identities

| App | Identity | Note |
|---|---|---|
| Yemeksepeti (Delivery Hero) | Moved from red to pink/magenta in 2021; a soft custom typeface; the courier icon went; wallet and "Joker" deals in front | A deliberate break with a twenty-year-old red |
| Uber Eats Trendyol Go | Trendyol orange in the background, Uber Eats black and green (#06C067) in front; couriers and interface follow | Getir Yemek's restaurant panels move here in 2026 |
| Migros Yemek | Migros orange; a tab inside the grocery app | Its launch messaging targets rivals' "interface and warmth" |
| Getir | Purple (#5D3EBC) and yellow, chosen against the sector's red/blue habit | The food side is shrinking |

Global references: Uber Eats black and green, DoorDash red, Deliveroo teal,
Wolt blue. Colour alone does not say "food"; the shared patterns do.

## Shared patterns

1. Delivery context at the top: address or district, delivery mode; a prominent search box.
2. A horizontal category strip with icon chips; campaign banners.
3. Restaurant card: cover image, name, rating with review count, time, delivery fee, minimum basket, promotion tag, favourite. The meta line is 12–13 px with icons.
4. Restaurant page: cover and info line, sticky category tabs, item rows (price bold, a small image and `+` on the right), sold-out items dimmed and labelled.
5. Item sheet from the bottom: options, quantity, a note, a full-width "Add to cart · ₺".
6. A sticky cart bar: "2 items · ₺390 → Go to cart"; a free-delivery or minimum-basket progress bar.
7. Checkout: address, payment method, coupon, courier note, itemised totals, one large "Place order".
8. Order tracking: status steps, a large estimated time, a map, the courier.
9. Visual weight in photographs; the interface itself plain: white surfaces, one brand colour on header, calls to action and tags, system colours fixed, bold headings, large numbers.

## Applied to Sofra

Constraints: the data has no photographs; the flow is a conversation; every
number is the server's; the four states (blocked, waiting, done, error) must
be told apart without colour; money moves only through the confirmation
card's own button.

| Pattern | In Sofra |
|---|---|
| Delivery context | The account rail: address card (`district`), wallet, user |
| Category strip | The empty conversation is a start screen with icon tiles; each tile only sends a message |
| Restaurant card | A cuisine drawing and tint instead of a photograph; an icon meta line; "See the menu" sends a message; several restaurants become a row |
| Restaurant page | A menu answer grouped by category with category tabs; price bold; "+ Order 1" sends a message; sold-out dimmed and labelled; an 18+ badge |
| Cart bar | The cart panel on the right, from REST; the free-delivery distance only in the server's own sentence |
| Checkout | The confirmation card as a checkout card: restaurant heading, line items, dashed rule, large total, "Wallet · ₺800", the countdown bar, a full-width button. The dashed border and "Needs your confirmation" stay |
| Order tracking | A step bar limited to the statuses the server gives: Received → Delivered; Cancelled struck through. No intermediate step is invented |
| Photographs | Cuisine illustrations (inline SVG) and strong typography; numbers large, meta small |
| Motion | Short transitions; `prefers-reduced-motion` respected |

## Palette

Nar (pomegranate, `#B42318`, 7:1 white on it) as the accent, zeytin (olive,
`#3F6B3A`) as the secondary, linen as the ground, near-black ink. It does not
collide with the large players. Colour appears only on calls to action, badges
and tags; cards are white; identity is carried by icon, type and border.

The alternative considered was black and white with a single saffron accent:
one hard accent, more "tech", less warm.

## Mock-ups

Two drafts the interface was built from, in this folder:

| File | What it is |
|---|---|
| `brand-sheet.png` | Logo, palette, type, and the four states side by side: blocked, waiting for you, done, error |
| `mockup-desktop-home.png` | The start screen: the rail, the category tiles, the restaurant row, the cart and orders panel |

Three elements of the mock-up were not built, because the data does not
support them: "Reorder" (the order list has no line items), the free-delivery
progress bar (the ratio would be computed on the client), and the arrival
time on the active order (only the chat's `order_summary` carries `eta_min`).
The README's "Beyond the brief" section lists them.

## Sources

- Webrazzi, "Yemeksepeti, logosunu ve tasarımını yeniledi" (2021): https://webrazzi.com/2021/09/29/yemeksepeti-logosunu-ve-tasarimini-yeniledi/
- Marketing Türkiye, "Yemeksepeti 20 senelik logosunu değiştirdi": https://www.marketingturkiye.com.tr/haberler/yemeksepeti-yeni-logo/
- TRHaber, "Trendyol Go'nun logosu mu değişti, neden yeşil?": https://www.trhaber.com.tr/gundem/trendyol-go-nun-logosu-mu-degisti-neden-yesil-h967898.html
- Uber Eats Trendyol Go: https://trendyolgo.com/
- Paketmaster, food-delivery apps compared for restaurants (2026): https://paketmaster.com/blog/yemek-siparis-uygulamalari?lang=en
- AlternaCX, analysis of food-delivery apps, 2026: https://alternacx.com/yemek-siparis-uygulamalari-analizi-2026/
- Marketing Türkiye, Migros Yemek campaign: https://www.marketingturkiye.com.tr/kampanyalar/migros-yemek-uygulamasi/
- Webrazzi, Migros enters online food ordering (2022): https://webrazzi.com/2022/06/13/migros-migros-yemek-servisi-ile-online-yemek-siparisi-sektorune-adim-atti/
- Fol, Getir brand work: https://fol.com.tr/works/getir/
- Brandfetch, Getir: https://brandfetch.com/getir.com
