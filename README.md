# Minik Odak 🐱⏱️

3D karakterli, kişisel pomodoro uygulaması.

- **Web'de kullan:** https://salihapeker.github.io/minik-odak/
  Telefonda açıp tarayıcı menüsünden **Ana ekrana ekle** de; uygulama gibi kurulur.
- **Android uygulaması (APK):** [Releases → MinikOdak.apk](https://github.com/Salihapeker/minik-odak/releases/latest)
  Telefona indir, aç, "bilinmeyen kaynaklardan yükleme" iznini ver ve kur.

## Neler var?

- Seninle çalışan, molada kahve içen 3D karakterler (kedi, saksı, baykuş) ve fotoğrafından "minik sen"
- Akışı bölmeyen sayaç ve ritmine göre süre önerisi
- Araştır & Anlat modu, konu çarkı, Sprint, kalem notlu Sudoku
- Gün planı ve Trello benzeri pano
- İlaç ve su hatırlatmaları (Android'de ekran kapalıyken de bildirim, 3 kez tekrar)
- Seviye, yıldız, günlük görevler, karakter dolabı
- Ortak odalar (davet koduyla birlikte çalışma)
- Hesapla telefon ↔ bilgisayar eşitleme (Firebase, ücretsiz plan)

## Klasörler

```
docs/                   → uygulamanın kendisi (GitHub Pages buradan yayınlar, Android de bunu paketler)
  index.html            → bütün uygulama
  platform.js           → Firebase, eşitleme, ortak odalar, bildirimler
  firebase-config.js    → Firebase proje ayarı (minik-odak)
  gizlilik.html         → gizlilik politikası (Play Store bu sayfayı ister)
store/magaza-metni.md   → Play Store açıklaması ve veri güvenliği formu cevapları
resources/              → uygulama simgesi ve açılış ekranı
firestore.rules         → veritabanı güvenlik kuralları (Firebase'de yayında)
.github/workflows/      → her güncellemede APK'yı otomatik derleyen iş akışı
```

## Güncellemek

`docs/` içindeki bir dosyayı GitHub'da değiştirip kaydettiğinde:
- Web sürümü 1–2 dakika içinde güncellenir.
- **Actions** sekmesinde yeni APK derlenir ve Releases'e konur (yaklaşık 5 dakika).

## Google Play'e yüklemek

Otomatik derlenen APK test/paylaşım içindir. Play Store için imzalı bir paket (AAB) gerekir:

1. https://play.google.com/console → kişisel geliştirici hesabı aç, kayıt ücretini öde, kimliğini doğrula.
2. İmzalı AAB: bilgisayarında Android Studio ile bu projeyi aç (`npm install` → `npx cap add android` → `npx cap open android`), **Build → Generate Signed App Bundle** de, yeni bir keystore oluştur.
   ⚠️ Keystore dosyasını ve şifresini kaybetme, GitHub'a yükleme.
3. Play Console'da uygulama oluştur. Metinler, veri güvenliği cevapları ve içerik derecelendirmesi `store/magaza-metni.md` dosyasında. Gizlilik politikası bağlantısı: https://salihapeker.github.io/minik-odak/gizlilik.html
4. **Kapalı test zorunlu:** 13 Kasım 2023'ten sonra açılan kişisel hesaplarda yayından önce en az 12 test kullanıcısının 14 gün aralıksız kapalı testte kalması gerekir. Arkadaşlarının Gmail adreslerini kapalı test listesine ekle.
5. 14 gün sonra **Üretime erişim** başvurusu yap.

## Notlar

- Firebase ücretsiz planı (günde 50.000 okuma / 20.000 yazma) kişisel kullanım ve arkadaş grubu için yeterli.
- Yapay zeka geri bildirimi bu sürümde yok (ücretli API gerektirir).
- Pil tasarrufu bildirimleri geciktirebilir: Ayarlar → Uygulamalar → Minik Odak → Pil → Kısıtlama yok.

Lisanslar: three.js (MIT), Firebase JS SDK (Apache 2.0), Capacitor (MIT).
