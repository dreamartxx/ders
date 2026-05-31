/* Akıllı Ders Platformu — DERS OLUŞTURUCU modülü
 * window.App.lesson.build(topic, grade)
 * Saf (vanilla) JS, derleme adımı yok. Tüm AI/kullanıcı metni güvenli işlenir (XSS yok).
 */
window.App = window.App || {};
window.App.lesson = (function () {
  "use strict";

  // --- Kısayollar ---
  var App = window.App;

  // --- Görsel istekleri için zaman aşımı (ms) ---
  var IMAGE_TIMEOUT_MS = 12000;

  // --- Yükleme sırasında dönen merak uyandırıcı / esprili mesajlar ---
  var SPINNER_MESSAGES = [
    "Beyin hücreleri ısınıyor... 🧠",
    "Bilgi tohumları ekiliyor... 🌱",
    "Robotlar ders kitabını karıştırıyor... 🤖",
    "İlginç örnekler avlanıyor... 🎣",
    "Renkli kalemler bileniyor... 🖍️",
    "Merak ışığı yakılıyor... 💡",
    "Sıkıcı kısımlar çöpe atılıyor... 🗑️",
    "Eğlenceli bilgiler süzülüyor... ✨",
    "Ressamlar fırçaları kapıyor... 🎨",
    "Az kaldı, fırından çıkmak üzere... 🍪"
  ];

  /**
   * HTML özel karakterlerini güvenli hale getirir (XSS koruması).
   * innerHTML içinde kullanılacak her AI/kullanıcı metni bundan geçer.
   */
  function escapeHtml(value) {
    if (value === null || value === undefined) return "";
    var str = String(value);
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /**
   * Sınıf seviyesine göre dil/ton talimatı üretir.
   */
  function gradeToneInstruction(grade) {
    switch (grade) {
      case "ilkokul":
        return "Öğrenciler İLKOKUL seviyesinde (yaklaşık 7-10 yaş). " +
          "Çok basit, kısa cümleler kur. Sıcak, sevimli ve oyuncu bir dil kullan. " +
          "Somut, günlük hayattan (oyuncak, hayvan, oyun, yemek) örnekler ver. " +
          "Karmaşık terimlerden kaçın; kullanırsan hemen basitçe açıkla.";
      case "ortaokul":
        return "Öğrenciler ORTAOKUL seviyesinde (yaklaşık 11-14 yaş). " +
          "Açık ve akıcı bir dil kullan, biraz daha derinleş. " +
          "Günlük hayattan ilgi çekici örnekler ve benzetmeler kullan, neden-sonuç ilişkileri kur.";
      case "lise":
        return "Öğrenciler LİSE seviyesinde (yaklaşık 15-18 yaş). " +
          "Daha akademik ama yine de ilgi çekici bir dil kullan. " +
          "Derinlemesine açıklamalar, gerçek dünya uygulamaları ve eleştirel düşünmeyi teşvik eden örnekler ver.";
      default:
        return "Öğrencilere uygun, açık ve ilgi çekici bir dil kullan.";
    }
  }

  /**
   * Ders içeriği için Gemini prompt'unu oluşturur (Türkçe, seviyeye göre).
   */
  function buildPrompt(topic, grade) {
    var gradeLabel = (App.config.GRADES && App.config.GRADES[grade]) || grade;
    var tone = gradeToneInstruction(grade);

    return [
      "Sen çocuklar ve gençler için harika dersler hazırlayan, çok yaratıcı bir öğretmensin.",
      "Konu: \"" + topic + "\".",
      "Seviye: " + gradeLabel + ".",
      tone,
      "",
      "Bu konuyu anlatan, merak uyandıran ve görsellerle desteklenebilen bir ders hazırla.",
      "3 ile 5 arasında bölüm (section) olsun.",
      "Her bölüm günlük hayattan örnekler ve benzetmeler içersin.",
      "Her bölüm için İNGİLİZCE bir illüstrasyon tarifi (imagePrompt) yaz; renkli, çocuk dostu, eğitsel bir çizim tarif et.",
      "intro merak uyandıran kısa bir giriş olsun.",
      "En az 3 funFacts (şaşırtıcı eğlenceli bilgiler) ve en az 3 keyTerms (anahtar terim + tanım) ekle.",
      "Tüm metinler (imagePrompt hariç) TÜRKÇE olsun.",
      "",
      "SADECE şu JSON şemasında, başka hiçbir açıklama olmadan yanıt ver:",
      "{",
      '  "title": "...",',
      '  "intro": "...",',
      '  "sections": [ { "heading": "...", "text": "...", "imagePrompt": "..." } ],',
      '  "funFacts": ["...", "..."],',
      '  "keyTerms": [ { "term": "...", "definition": "..." } ]',
      "}"
    ].join("\n");
  }

  /**
   * Bir promise'i belirli süre sonra reject eden zaman aşımı sarmalayıcısı.
   */
  function withTimeout(promise, ms) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () {
        reject(new Error("timeout"));
      }, ms);
      Promise.resolve(promise).then(
        function (val) {
          clearTimeout(timer);
          resolve(val);
        },
        function (err) {
          clearTimeout(timer);
          reject(err);
        }
      );
    });
  }

  /**
   * Bir bölüm için renkli CSS placeholder (emoji + gradyan) HTML'i döndürür.
   * index'e göre farklı gradyan/emoji seçer.
   */
  function placeholderMarkup(index) {
    var gradients = [
      "linear-gradient(135deg,#667eea 0%,#764ba2 100%)",
      "linear-gradient(135deg,#f093fb 0%,#f5576c 100%)",
      "linear-gradient(135deg,#4facfe 0%,#00f2fe 100%)",
      "linear-gradient(135deg,#43e97b 0%,#38f9d7 100%)",
      "linear-gradient(135deg,#fa709a 0%,#fee140 100%)",
      "linear-gradient(135deg,#30cfd0 0%,#330867 100%)"
    ];
    var emojis = ["🔬", "🚀", "🌍", "📚", "🧩", "⭐", "🎨", "🔭"];
    var g = gradients[index % gradients.length];
    var e = emojis[index % emojis.length];
    return (
      '<div class="lesson-img-placeholder" ' +
      'style="background:' + g + ';display:flex;align-items:center;justify-content:center;' +
      'min-height:180px;border-radius:14px;font-size:64px;">' +
      '<span aria-hidden="true">' + e + "</span></div>"
    );
  }

  /**
   * Görsel kaynağından <img> ya da placeholder HTML üretir.
   */
  function imageMarkup(dataUrl, index, altText) {
    if (dataUrl) {
      // dataUrl base64 data: URL'dir; alt metni güvenli işlenir.
      return (
        '<img class="lesson-img" src="' + dataUrl + '" ' +
        'alt="' + escapeHtml(altText) + '" loading="lazy" ' +
        'style="width:100%;border-radius:14px;display:block;" />'
      );
    }
    return placeholderMarkup(index);
  }

  /**
   * Tüm ders verisini #lesson-content içine kartlar halinde render eder.
   * images: section index'ine karşılık gelen data URL veya null dizisi.
   */
  function render(container, data, grade) {
    var gradeLabel = (App.config.GRADES && App.config.GRADES[grade]) || grade;
    var sections = Array.isArray(data.sections) ? data.sections : [];
    var funFacts = Array.isArray(data.funFacts) ? data.funFacts : [];
    var keyTerms = Array.isArray(data.keyTerms) ? data.keyTerms : [];
    var images = Array.isArray(data._images) ? data._images : [];

    var html = "";

    // --- Başlık kartı + sınıf rozeti + giriş ---
    html += '<div class="lesson-card lesson-header-card">';
    html += '<div class="lesson-title-row">';
    html += "<h2 class=\"lesson-title\">" + escapeHtml(data.title || "Ders") + "</h2>";
    html += '<span class="grade-badge">' + escapeHtml(gradeLabel) + "</span>";
    html += "</div>";
    if (data.intro) {
      html += '<p class="lesson-intro">' + escapeHtml(data.intro) + "</p>";
    }
    html += "</div>";

    // --- Bölümler (görsel + metin) ---
    sections.forEach(function (section, i) {
      var img = imageMarkup(images[i], i, section.heading || "Bölüm görseli");
      html += '<div class="lesson-card lesson-section">';
      html += '<div class="lesson-section-media">' + img + "</div>";
      html += '<div class="lesson-section-body">';
      html += "<h3 class=\"lesson-heading\">" + escapeHtml(section.heading || "") + "</h3>";
      html += "<p class=\"lesson-text\">" + escapeHtml(section.text || "") + "</p>";
      html += "</div>";
      html += "</div>";
    });

    // --- "Bunları biliyor muydun?" funFacts kutusu ---
    if (funFacts.length) {
      html += '<div class="lesson-card funfacts-box">';
      html += "<h3 class=\"funfacts-title\">💡 Bunları biliyor muydun?</h3>";
      html += '<ul class="funfacts-list">';
      funFacts.forEach(function (fact) {
        html += "<li>" + escapeHtml(fact) + "</li>";
      });
      html += "</ul>";
      html += "</div>";
    }

    // --- Anahtar terimler sözlüğü ---
    if (keyTerms.length) {
      html += '<div class="lesson-card keyterms-box">';
      html += "<h3 class=\"keyterms-title\">📖 Anahtar Terimler</h3>";
      html += '<dl class="keyterms-list">';
      keyTerms.forEach(function (kt) {
        html += "<dt class=\"keyterm-term\">" + escapeHtml(kt.term || "") + "</dt>";
        html += "<dd class=\"keyterm-def\">" + escapeHtml(kt.definition || "") + "</dd>";
      });
      html += "</dl>";
      html += "</div>";
    }

    container.innerHTML = html;
  }

  /**
   * Ana giriş noktası: konuyu ve sınıfı alır, dersi hazırlar ve render eder.
   */
  async function build(topic, grade) {
    var ui = App.ui;
    var gemini = App.gemini;
    var container = document.getElementById("lesson-content");

    try {
      ui.showLoading("Dersin hazırlanıyor...");
      ui.updateLoading(SPINNER_MESSAGES[0], 5);

      // --- Dönen esprili mesajlar (içerik gelene kadar öğrenci sıkılmasın) ---
      var spinIndex = 0;
      var spinTimer = setInterval(function () {
        spinIndex = (spinIndex + 1) % SPINNER_MESSAGES.length;
        // İçerik üretimi aşamasında %10-%30 arası nazikçe ilerle
        ui.updateLoading(SPINNER_MESSAGES[spinIndex], null);
      }, 1800);

      // --- 1) Ders yapısını üret ---
      var data;
      try {
        data = await gemini.generateJSON(buildPrompt(topic, grade));
      } finally {
        clearInterval(spinTimer);
      }

      if (!data || typeof data !== "object") {
        throw new Error("Ders içeriği alınamadı.");
      }

      var sections = Array.isArray(data.sections) ? data.sections : [];
      ui.updateLoading("Ders planı hazır! Şimdi resimler çiziliyor... 🎨", 35);

      // --- 2) Tüm görselleri AYNI ANDA iste; her biri 12 sn timeout ---
      var images = new Array(sections.length).fill(null);
      var completed = 0;
      var total = sections.length;

      // İlerleme: resimler %35 -> %95 aralığını doldurur.
      function bumpProgress() {
        completed += 1;
        var pct = total > 0 ? 35 + Math.round((completed / total) * 60) : 95;
        ui.updateLoading(
          "Resimler hazırlanıyor... (" + completed + "/" + total + ") 🖼️",
          pct
        );
      }

      var imageTasks = sections.map(function (section, i) {
        var prompt = section && section.imagePrompt ? section.imagePrompt : "";
        // Prompt boşsa hemen placeholder kullan, ama yine de ilerlemeyi say.
        var task = prompt
          ? withTimeout(gemini.generateImage(prompt), IMAGE_TIMEOUT_MS)
          : Promise.resolve(null);

        return task
          .then(function (url) {
            images[i] = url || null; // null ise render placeholder koyacak
          })
          .catch(function () {
            // timeout veya hata: placeholder kalsın
            images[i] = null;
          })
          .then(function () {
            // Her tamamlanan (başarılı/başarısız) görselde ilerlemeyi artır
            bumpProgress();
          });
      });

      // Tümü bitene kadar bekle (hiçbiri reject etmez, her biri yutuluyor)
      await Promise.all(imageTasks);

      // --- 3) Render ---
      ui.updateLoading("Son rötuşlar yapılıyor... ✨", 98);
      data._images = images;
      render(container, data, grade);

      ui.updateLoading("Hazır! 🎉", 100);
      ui.hideLoading();
    } catch (err) {
      ui.hideLoading();
      var msg = (err && err.message) ? err.message : "Bilinmeyen bir hata oluştu.";
      ui.toast("Ders hazırlanamadı: " + msg, "error");
      if (container) {
        container.innerHTML =
          '<div class="lesson-card lesson-error">' +
          "<h3>😕 Bir sorun oldu</h3>" +
          "<p>Ders hazırlanırken bir hata oluştu. Lütfen tekrar dene.</p>" +
          '<p class="lesson-error-detail">' + escapeHtml(msg) + "</p>" +
          "</div>";
      }
    }
  }

  return { build: build };
})();
