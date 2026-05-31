# 🎓 Akıllı Ders Platformu

İlkokul, ortaokul ve lise öğrencileri için **yapay zeka destekli** modern bir
öğrenme platformu. Bir konu yazın; uygulama Gemini API ile o konuyu
**resimlerle ve örneklerle** anlatır, **oyunlar** oynatır, **bilgi yarışması**
yapar ve **ödev** verir.

> Çıktı: tarayıcıda doğrudan açılabilen tek sayfa web uygulaması (`index.html`).
> Derleme adımı yoktur — saf HTML/CSS/JavaScript.

## ✨ Özellikler

- 📖 **Resimli Ders Anlatımı** — Konu, sınıf seviyesine göre örneklerle ve
  Gemini görsel API'siyle üretilen resimlerle anlatılır.
- 🎮 **Oyunlar** — Konuya özel en az 4 farklı oyun: Hafıza/Eşleştirme, Kelime
  Bulmaca, Doğru/Yanlış Hız Oyunu ve Adam Asmaca.
- 🧠 **Bilgi Yarışması** — Anında geri bildirimli, skorlu çoktan seçmeli quiz.
- 📝 **Ödev** — Kısa cevaplı/klasik sorular, proje görevi, cevap anahtarı ve
  yazdırma desteği.
- ⏳ **Eğlenceli Yükleme Animasyonu** — Ders inşa edilirken öğrenci sıkılmasın
  diye animasyonlu, ilerleme çubuklu ve mesaj döngülü ekran.
- 🎨 Modern, renkli, çocuk dostu ve tamamen responsive arayüz (Türkçe).

## 🚀 Kullanım

1. [Google AI Studio](https://aistudio.google.com/app/apikey) üzerinden ücretsiz
   bir **Gemini API anahtarı** alın.
2. `index.html` dosyasını bir tarayıcıda açın.
3. Sağ üstteki ⚙️ **Ayarlar**'dan API anahtarınızı yapıştırıp kaydedin
   (anahtar yalnızca kendi tarayıcınızda saklanır).
4. Bir konu yazın, sınıf seviyesini seçin ve **🚀 Dersi Başlat**'a tıklayın.

## 🧩 Proje Yapısı

```
index.html           Arayüz kabuğu ve DOM yapısı
css/styles.css       Tema, animasyonlar, responsive tasarım
js/config.js         Genel yapılandırma (modeller, sabitler)
js/gemini.js         Gemini metin + görsel API entegrasyonu
js/ui.js             Yükleme, sekme, bildirim yardımcıları
js/lesson.js         Resimli ders oluşturucu
js/games.js          Oyunlar
js/quiz.js           Bilgi yarışması
js/homework.js       Ödev üretici
js/app.js            Orkestrasyon (modülleri birbirine bağlar)
docs/ARCHITECTURE.md Modüller arası mimari sözleşme
```

## 🔧 Kullanılan Modeller

- Metin: `gemini-2.0-flash`
- Görsel: `gemini-2.5-flash-image-preview`

Modeller `js/config.js` üzerinden değiştirilebilir.

## 🏗️ Geliştirme Notu

Proje, her biri ayrı bir modülden sorumlu **alt ajanlar (sub-agents)** tarafından,
`docs/ARCHITECTURE.md` içindeki ortak sözleşmeye göre paralel olarak inşa edildi.
