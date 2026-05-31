// lesson.js — Ders oluşturucu modül (sayfa sayfa / slayt deneyimi)
// Sözleşme: window.App.lesson.build(topic, grade)
// Bağımlılıklar: App.gemini.generateJSON, App.gemini.generateImage,
//   App.ui.showLoading/updateLoading/hideLoading/toast, App.config.GRADES
// Ders tek sayfa değil; ileri/geri gezilen slaytlar halinde sunulur.
// Görsel ağırlıklı: büyük resim + kısa, vurucu metin.
// Saf JS, build/import yok.

window.App = window.App || {};
window.App.lesson = (function () {
  "use strict";

  // -------------------------------------------------------------------------
  // Yardımcılar
  // -------------------------------------------------------------------------

  function escapeHtml(s) {
    if (s === null || s === undefined) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function ui() {
    return (window.App && window.App.ui) || {};
  }
  function showLoading(msg) {
    if (typeof ui().showLoading === "function") ui().showLoading(msg);
  }
  function updateLoading(text, percent) {
    if (typeof ui().updateLoading === "function") ui().updateLoading(text, percent);
  }
  function hideLoading() {
    if (typeof ui().hideLoading === "function") ui().hideLoading();
  }
  function toast(msg, type) {
    if (typeof ui().toast === "function") ui().toast(msg, type);
  }

  // Sınıf kademesini sadeleştir.
  function gradeKey(grade) {
    var g = String(grade || "").toLowerCase();
    if (g.indexOf("ilkokul") !== -1) return "ilkokul";
    if (g.indexOf("ortaokul") !== -1) return "ortaokul";
    if (g.indexOf("lise") !== -1) return "lise";
    var n = parseInt(g.replace(/[^0-9]/g, ""), 10);
    if (!isNaN(n)) {
      if (n <= 4) return "ilkokul";
      if (n <= 8) return "ortaokul";
      return "lise";
    }
    return "ortaokul";
  }

  function gradeLabel(grade) {
    var grades = (window.App.config && window.App.config.GRADES) || {};
    return grades[grade] || grade || "";
  }

  // -------------------------------------------------------------------------
  // İstem (prompt) üretimi — AZ YAZI, GÖRSEL AĞIRLIKLI
  // -------------------------------------------------------------------------

  function textRuleForGrade(key) {
    switch (key) {
      case "ilkokul":
        return "Çok basit, kısa ve neşeli cümleler kur. Günlük hayattan somut örnekler ver.";
      case "lise":
        return "Net, bilgi yoğun ama kısa cümleler kur. Gerçek hayattan/teknolojiden örnek ver.";
      default:
        return "Açık ve kısa cümleler kur. Günlük hayattan örneklerle destekle.";
    }
  }

  function buildPrompt(topic, grade) {
    var key = gradeKey(grade);
    var label = gradeLabel(grade);
    return [
      "Sen uzman ve eğlenceli bir öğretmensin.",
      '"' + topic + '" konusunu ' + label + " seviyesindeki bir öğrenciye GÖRSEL AĞIRLIKLI anlat.",
      textRuleForGrade(key),
      "Yanıtı SADECE şu JSON şemasıyla ver:",
      "{",
      '  "title": "kısa, ilgi çekici ders başlığı",',
      '  "intro": "tek cümlelik merak uyandıran giriş",',
      '  "sections": [',
      "    {",
      '      "heading": "çok kısa bölüm başlığı (2-4 kelime)",',
      '      "text": "EN FAZLA 2 KISA cümle. Resmi açıklayan ya da somut örnek veren bir detay.",',
      '      "imagePrompt": "ingilizce, somut, görselde neyin görüneceğini net anlatan betimleme"',
      "    }",
      "  ],",
      '  "funFacts": ["kısa şaşırtıcı bilgi 1", "kısa şaşırtıcı bilgi 2", "kısa şaşırtıcı bilgi 3"],',
      '  "keyTerms": [{"term": "kavram", "definition": "tek cümlelik kısa tanım"}]',
      "}",
      "Kurallar:",
      "- 4 ila 6 bölüm üret. Her bölüm tek bir fikre odaklansın.",
      "- ÇOK ÖNEMLİ: text alanı kısa olsun; uzun paragraf YAZMA. Görsel ana anlatımı taşısın, yazı sadece açıklasın/örnek versin.",
      "- imagePrompt İngilizce, somut ve görsel olsun; konuyu net göstersin.",
      "- Tüm Türkçe metinler sınıf seviyesine uygun olsun."
    ].join("\n");
  }

  // -------------------------------------------------------------------------
  // Görsel stili — sınıf seviyesine göre
  // -------------------------------------------------------------------------

  function imageStyleForGrade(key) {
    switch (key) {
      case "ilkokul":
        return (
          "Cute adorable cartoon illustration for young children, soft rounded shapes, " +
          "bright cheerful colors, friendly smiling characters, playful storybook style, kawaii"
        );
      case "lise":
        return (
          "Photorealistic, highly detailed and realistic educational illustration, " +
          "professional, cinematic lighting, vivid and engaging, science/textbook quality"
        );
      default: // ortaokul
        return (
          "Realistic and detailed engaging illustration, semi-realistic educational style, " +
          "vivid colors, clear and modern, appealing to teenagers"
        );
    }
  }

  // Bölüm görseli için tam prompt (stil + içerik).
  function fullImagePrompt(sec, topic, key) {
    var base = sec.imagePrompt || sec.heading || topic;
    return imageStyleForGrade(key) + ". Subject: " + base;
  }

  // -------------------------------------------------------------------------
  // Slayt verisi hazırlama
  // -------------------------------------------------------------------------

  // JSON + görsellerden gezilebilir slayt listesi üret.
  function buildSlides(data, imageMap, topic, grade) {
    var slides = [];

    // Kapak slaytı
    slides.push({
      type: "cover",
      title: data.title || topic,
      intro: data.intro || "",
      grade: gradeLabel(grade)
    });

    // Bölüm slaytları
    if (Array.isArray(data.sections)) {
      data.sections.forEach(function (sec, i) {
        slides.push({
          type: "section",
          heading: sec.heading || "",
          text: sec.text || "",
          image: imageMap[i] || null
        });
      });
    }

    // Şaşırtıcı bilgiler slaytı
    if (Array.isArray(data.funFacts) && data.funFacts.length) {
      slides.push({ type: "facts", items: data.funFacts });
    }

    // Anahtar kavramlar slaytı
    if (Array.isArray(data.keyTerms) && data.keyTerms.length) {
      slides.push({ type: "terms", items: data.keyTerms });
    }

    return slides;
  }

  // -------------------------------------------------------------------------
  // Render — tek slayt + gezinme
  // -------------------------------------------------------------------------

  function placeholder() {
    return (
      '<div class="slide-img-ph">' +
      '<span>🖼️</span>' +
      "<small>Görsel bu sefer üretilemedi</small>" +
      "</div>"
    );
  }

  function renderSlideBody(slide) {
    if (slide.type === "cover") {
      return (
        '<div class="slide slide-cover">' +
        '<div class="slide-cover-badge">📖 ' + escapeHtml(slide.grade) + " Dersi</div>" +
        '<h1 class="slide-cover-title">' + escapeHtml(slide.title) + "</h1>" +
        (slide.intro
          ? '<p class="slide-cover-intro">' + escapeHtml(slide.intro) + "</p>"
          : "") +
        '<div class="slide-cover-hint">👉 Başlamak için ilerle</div>' +
        "</div>"
      );
    }

    if (slide.type === "section") {
      return (
        '<div class="slide slide-section">' +
        (slide.image
          ? '<div class="slide-img-wrap"><img class="slide-img" src="' +
            slide.image +
            '" alt="' + escapeHtml(slide.heading) + '" loading="lazy"></div>'
          : placeholder()) +
        '<div class="slide-text-wrap">' +
        (slide.heading ? '<h2 class="slide-heading">' + escapeHtml(slide.heading) + "</h2>" : "") +
        (slide.text ? '<p class="slide-text">' + escapeHtml(slide.text) + "</p>" : "") +
        "</div>" +
        "</div>"
      );
    }

    if (slide.type === "facts") {
      var facts = slide.items
        .map(function (f) {
          return '<li><span class="fact-star">🌟</span>' + escapeHtml(f) + "</li>";
        })
        .join("");
      return (
        '<div class="slide slide-facts">' +
        '<h2 class="slide-heading">🤩 Bunları biliyor muydun?</h2>' +
        '<ul class="slide-facts-list">' + facts + "</ul>" +
        "</div>"
      );
    }

    if (slide.type === "terms") {
      var terms = slide.items
        .map(function (t) {
          return (
            '<div class="term-card">' +
            '<div class="term-name">' + escapeHtml(t.term) + "</div>" +
            '<div class="term-def">' + escapeHtml(t.definition) + "</div>" +
            "</div>"
          );
        })
        .join("");
      return (
        '<div class="slide slide-terms">' +
        '<h2 class="slide-heading">📚 Anahtar Kavramlar</h2>' +
        '<div class="terms-grid">' + terms + "</div>" +
        "</div>"
      );
    }

    return "";
  }

  // Tüm deck'i (slayt gösterisi) çiz ve gezinmeyi bağla.
  function renderDeck(container, slides) {
    var current = 0;
    var total = slides.length;

    container.innerHTML =
      '<div class="deck">' +
      '<div class="deck-progress"><div class="deck-progress-fill"></div></div>' +
      '<div class="deck-stage"></div>' +
      '<div class="deck-nav">' +
      '<button type="button" class="deck-btn deck-prev">← Geri</button>' +
      '<div class="deck-dots"></div>' +
      '<button type="button" class="deck-btn deck-next btn-primary">İleri →</button>' +
      "</div>" +
      "</div>";

    var stage = container.querySelector(".deck-stage");
    var fill = container.querySelector(".deck-progress-fill");
    var prevBtn = container.querySelector(".deck-prev");
    var nextBtn = container.querySelector(".deck-next");
    var dotsWrap = container.querySelector(".deck-dots");

    // Noktalar
    var dots = [];
    for (var i = 0; i < total; i++) {
      var d = document.createElement("button");
      d.type = "button";
      d.className = "deck-dot";
      d.setAttribute("aria-label", (i + 1) + ". sayfa");
      (function (idx) {
        d.addEventListener("click", function () { go(idx); });
      })(i);
      dotsWrap.appendChild(d);
      dots.push(d);
    }

    function go(idx) {
      current = Math.max(0, Math.min(total - 1, idx));
      stage.innerHTML = renderSlideBody(slides[current]);
      // ilerleme + butonlar
      fill.style.width = Math.round(((current + 1) / total) * 100) + "%";
      prevBtn.disabled = current === 0;
      nextBtn.textContent = current === total - 1 ? "Bitti 🎉" : "İleri →";
      dots.forEach(function (dot, di) {
        if (di === current) dot.classList.add("is-active");
        else dot.classList.remove("is-active");
      });
      // Sahneyi yukarı kaydır (uzun slaytlarda).
      if (stage.scrollIntoView) stage.scrollIntoView({ block: "nearest" });
    }

    prevBtn.addEventListener("click", function () { go(current - 1); });
    nextBtn.addEventListener("click", function () {
      if (current === total - 1) {
        toast("Dersi bitirdin! 🎉 Şimdi oyunları ve yarışmayı dene.", "success");
      } else {
        go(current + 1);
      }
    });

    // Klavye okları
    function onKey(e) {
      if (e.key === "ArrowRight") go(current + 1);
      else if (e.key === "ArrowLeft") go(current - 1);
    }
    document.addEventListener("keydown", onKey);
    // Yeni ders kurulunca eski dinleyiciyi temizleyebilmek için sakla.
    if (container._lessonKeyHandler) {
      document.removeEventListener("keydown", container._lessonKeyHandler);
    }
    container._lessonKeyHandler = onKey;

    go(0);
  }

  // -------------------------------------------------------------------------
  // Ana akış
  // -------------------------------------------------------------------------

  function build(topic, grade) {
    var container = document.getElementById("lesson-content");
    if (!container) {
      toast("Ders alanı bulunamadı.", "error");
      return Promise.reject(new Error("lesson-content yok"));
    }

    var key = gradeKey(grade);
    showLoading("Ders hazırlanıyor…");

    var data;
    return window.App.gemini
      .generateJSON(buildPrompt(topic, grade))
      .then(function (res) {
        data = res;
        var sections = Array.isArray(data.sections) ? data.sections : [];
        if (!sections.length) throw new Error("Bölüm üretilemedi");

        // Görselleri sırayla üret (ilerleme göster).
        var imageMap = {};
        var total = sections.length;
        var chain = Promise.resolve();
        sections.forEach(function (sec, i) {
          chain = chain.then(function () {
            updateLoading(
              "Görseller çiziliyor… (" + (i + 1) + "/" + total + ")",
              Math.round(((i + 1) / total) * 100)
            );
            return window.App.gemini
              .generateImage(fullImagePrompt(sec, topic, key))
              .then(function (url) {
                if (url) imageMap[i] = url;
              });
          });
        });
        return chain.then(function () { return imageMap; });
      })
      .then(function (imageMap) {
        hideLoading();
        var slides = buildSlides(data, imageMap, topic, grade);
        renderDeck(container, slides);
      })
      .catch(function (err) {
        hideLoading();
        toast("Ders oluşturulamadı: " + (err && err.message ? err.message : err), "error");
        if (window.console) console.error("[lesson]", err);
      });
  }

  return { build: build };
})();
