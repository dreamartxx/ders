# Akıllı Ders Platformu — Mimari Sözleşme (Contract)

İlkokul / ortaokul / lise öğrencileri için, konu girildiğinde Gemini API ile
resimli + örnekli ders anlatan, oyun oynatan, bilgi yarışması yapan ve ödev
veren modern bir tek sayfa web uygulaması (SPA).

Tüm modüller saf (vanilla) JavaScript ile yazılır, derleme adımı YOKTUR.
Çıktı: tarayıcıda doğrudan açılabilen `index.html`.

## Global Ad Alanı (Namespace)

Her modül kendini `window.App` üzerine bağlar. app.js orkestrasyonu yapar.

```
window.App = {
  config,                              // sabitler, models
  gemini: { setApiKey, getApiKey, hasKey, generateText, generateJSON, generateImage },
  ui:     { showLoading, updateLoading, hideLoading, switchTab, toast },
  lesson: { build },
  games:  { list, mount },
  quiz:   { start },
  homework:{ generate },
  state:  { topic, grade }             // app.js doldurur
}
```

## Yükleme Sırası (index.html sonunda)
```
js/config.js
js/gemini.js
js/ui.js
js/lesson.js
js/games.js
js/quiz.js
js/homework.js
js/app.js   <-- en son
```

## DOM Sözleşmesi (ID'ler değişmez)

- Kök: `#app`
- Ayarlar / API anahtarı: `#api-key-input`, `#save-key-btn`, `#settings-toggle`, `#settings-panel`
- Konu formu: `#topic-form`, `#topic-input`, `#grade-select` (option value: `ilkokul|ortaokul|lise`), `#start-btn`
- Örnek konu çipleri: `button.example-chip[data-topic="..."]`
- Yükleme katmanı: `#loading-overlay` (gizliyken `.hidden`), animasyon `.loader`, durum metni `#loading-status`, ilerleme `#loading-bar`
- Çalışma alanı: karşılama `#welcome` (ders başlayınca `.hidden`), `#workspace` (başta `.hidden`), başlık `#workspace-title`, yeni konu butonu `#new-topic-btn`
- Sekme navigasyonu: `#tab-nav`, butonlar `button.tab-btn[data-tab="lesson|games|quiz|homework"]`, aktif sekmeye `.active`
- Sekme panelleri (aktif olmayan `.hidden`):
  - `#panel-lesson`  içinde `#lesson-content`
  - `#panel-games`   içinde `#games-content`
  - `#panel-quiz`    içinde `#quiz-content`
  - `#panel-homework`içinde `#homework-content`

## Modül API Sözleşmeleri

### js/config.js → window.App.config
```
{
  TEXT_MODEL: "gemini-2.0-flash",
  IMAGE_MODEL: "gemini-2.5-flash-image-preview",
  API_BASE: "https://generativelanguage.googleapis.com/v1beta",
  GRADES: { ilkokul:"İlkokul", ortaokul:"Ortaokul", lise:"Lise" },
  STORAGE_KEY: "gemini_api_key"
}
window.App.state = { topic, grade }
```

### js/gemini.js → window.App.gemini
- `setApiKey(key)` localStorage'a yazar (config.STORAGE_KEY).
- `getApiKey()` / `hasKey()`.
- `async generateText(prompt)` → `string` (candidates[0].content.parts[].text birleştir).
- `async generateJSON(prompt)` → ayrıştırılmış nesne. Prompt'a "sadece JSON" talimatı ekle; ```json kod çitlerini temizle; başarısızsa ilk { } / [ ] bloğunu bul. Hata fırlat.
- `async generateImage(prompt)` → görsel `data:` URL (base64); generationConfig.responseModalities=["IMAGE","TEXT"], yanıttan inlineData al. Hata/yoksa `null` döndür.
- Anahtar yoksa generateText/generateJSON `throw new Error("API anahtarı gerekli")`.
- response.ok değilse anlamlı hata fırlat.

### js/ui.js → window.App.ui
- `showLoading(title)` / `updateLoading(text, percent)` (#loading-bar width) / `hideLoading()`.
- `switchTab(name)` sekme/panel görünürlüğü (.active / .hidden).
- `toast(msg, type)` kısa bildirim (info|error|success).

### js/lesson.js → window.App.lesson
- `async build(topic, grade)`: showLoading → generateJSON ile yapı (title, intro, sections[{heading,text,imagePrompt}], funFacts[], keyTerms[{term,definition}]) → her section için generateImage (ilerleme güncelle, null ise placeholder) → `#lesson-content` içine kart render → hideLoading. Hata: hideLoading+toast.

### js/games.js → window.App.games
- `list`: `[{id,name,icon,desc}]` EN AZ 4 oyun.
- `mount(containerSel, {topic,grade})`: oyun seçici render; seçilince oyun başlat; "geri" butonu. İçerik için generateJSON kullanır (gerekirse showLoading). Oyunlar: Hafıza/Eşleştirme, Kelime Bulmaca, Doğru/Yanlış Hız, Adam Asmaca. Skor + tekrar oyna.

### js/quiz.js → window.App.quiz
- `async start(containerSel, {topic,grade})`: generateJSON ile {questions:[{question,options[4],answerIndex,explanation}]} → interaktif, anında geri bildirim, skor, özet, tekrar.

### js/homework.js → window.App.homework
- `async generate(containerSel, {topic,grade})`: generateJSON ile {shortAnswer[],openEnded[],project,answerKey[]} → render, cevap anahtarı toggle (başta gizli), Yazdır (window.print).

## Tasarım / UX
- Modern, renkli, çocuk dostu, merak uyandırıcı. Gradyan arka plan, yumuşak köşeler, animasyonlar, büyük dokunmatik hedefler. Türkçe. Tamamen responsive.
- Yükleme animasyonu eğlenceli (ampul/roket/gezegen) + ilerleme çubuğu + dönen mesajlar.
- CSS değişkenleri ile tema (`css/styles.css`). `.hidden { display:none !important; }`.
- innerHTML'de AI/kullanıcı metnini güvenli işle (escape/textContent, XSS yok).
