// homework.js — Ödev modülü
// Sözleşme: window.App.homework.generate(containerSel, {topic, grade}) async
// Bağımlılıklar (başka ajanlar yazıyor):
//   - window.App.gemini.generateJSON(prompt)
//   - window.App.ui.showLoading / updateLoading / hideLoading / toast
//   - window.App.config.GRADES
// Saf JS, build/import yok.

window.App = window.App || {};

(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // Yardımcılar
  // ---------------------------------------------------------------------------

  // HTML kaçışı — AI/kullanıcı metnini güvenle innerHTML'e gömmek için (XSS yok).
  function escapeHtml(value) {
    if (value === null || value === undefined) return "";
    return String(value)
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
  function hideLoading() {
    if (typeof ui().hideLoading === "function") ui().hideLoading();
  }
  function toast(msg, type) {
    if (typeof ui().toast === "function") ui().toast(msg, type);
  }

  // Sözleşme gereği grade "ilkokul|ortaokul|lise"dir; sayısal sınıf da desteklenir.
  function gradeLevel(grade) {
    var g = String(grade).toLowerCase();
    if (g.indexOf("ilkokul") !== -1) return { ad: "ilkokul", aralik: "1-4. sınıf" };
    if (g.indexOf("ortaokul") !== -1) return { ad: "ortaokul", aralik: "5-8. sınıf" };
    if (g.indexOf("lise") !== -1) return { ad: "lise", aralik: "9-12. sınıf" };
    var n = parseInt(g.replace(/[^0-9]/g, ""), 10);
    if (isNaN(n)) return { ad: "ortaokul", aralik: "5-8. sınıf" };
    if (n <= 4) return { ad: "ilkokul", aralik: "1-4. sınıf" };
    if (n <= 8) return { ad: "ortaokul", aralik: "5-8. sınıf" };
    return { ad: "lise", aralik: "9-12. sınıf" };
  }

  function difficultyHint(level) {
    switch (level.ad) {
      case "ilkokul":
        return "Sorular çok basit, kısa ve somut olsun. Günlük hayattan örnekler kullan.";
      case "lise":
        return "Sorular düşündürücü, analiz ve sentez gerektiren nitelikte olsun.";
      default:
        return "Sorular orta düzeyde; kavram bilgisini ve basit uygulamayı ölçsün.";
    }
  }

  // ---------------------------------------------------------------------------
  // İstem (prompt) üretimi
  // ---------------------------------------------------------------------------

  // İnsana okunaklı sınıf adı (config.GRADES); yoksa ham değere düş.
  function gradeLabel(grade) {
    var grades = (window.App.config && window.App.config.GRADES) || {};
    return grades[grade] || gradeLevel(grade).ad;
  }

  function buildPrompt(topic, grade) {
    var level = gradeLevel(grade);
    return [
      "Sen deneyimli bir Türk öğretmenisin.",
      '"' + topic + '" konusunda ' + gradeLabel(grade) + ' (' + level.aralik + ", " + level.ad +
        ") seviyesine uygun bir ÖDEV hazırla.",
      difficultyHint(level),
      "Tüm metinler Türkçe olsun.",
      "İçerik: 3-5 kısa cevaplı soru (shortAnswer), 2-4 klasik/açık uçlu soru (openEnded),",
      "1 adet araştırma/proje görevi (project) ve kısa cevaplı sorular için cevap anahtarı (answerKey).",
      "answerKey dizisi shortAnswer ile aynı sırada ve aynı sayıda olsun.",
      "Yalnızca şu JSON şemasında, başka hiçbir metin olmadan çıktı ver:",
      '{ "shortAnswer": ["..."], "openEnded": ["..."], "project": "...", "answerKey": ["..."] }'
    ].join("\n");
  }

  // Gelen veriyi güvenli hale getir.
  function normalize(data) {
    data = data || {};
    function arr(x) {
      return Array.isArray(x)
        ? x.filter(function (v) {
            return typeof v === "string" && v.trim() !== "";
          })
        : [];
    }
    return {
      shortAnswer: arr(data.shortAnswer),
      openEnded: arr(data.openEnded),
      project: typeof data.project === "string" ? data.project : "",
      answerKey: arr(data.answerKey)
    };
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // Numaralı liste (ol) üret.
  function olList(items, extraClass) {
    if (!items.length) return "";
    var lis = items
      .map(function (item) {
        return "<li>" + escapeHtml(item) + "</li>";
      })
      .join("");
    return '<ol class="hw-list ' + (extraClass || "") + '">' + lis + "</ol>";
  }

  function renderHomework(container, hw, topic, grade) {
    var sections = [];

    sections.push(
      '<div class="hw-header">' +
        '<h2 class="hw-title">📝 Ödev: ' +
        escapeHtml(topic) +
        "</h2>" +
        '<div class="hw-meta">' +
        escapeHtml(gradeLabel(grade)) +
        "</div>" +
        '<button type="button" class="hw-print">🖨️ Yazdır</button>' +
        "</div>"
    );

    if (hw.shortAnswer.length) {
      sections.push(
        '<section class="hw-section">' +
          "<h3>Kısa Cevaplı Sorular</h3>" +
          olList(hw.shortAnswer) +
          "</section>"
      );
    }

    if (hw.openEnded.length) {
      sections.push(
        '<section class="hw-section">' +
          "<h3>Klasik / Açık Uçlu Sorular</h3>" +
          olList(hw.openEnded) +
          "</section>"
      );
    }

    if (hw.project) {
      sections.push(
        '<section class="hw-section">' +
          "<h3>Proje / Araştırma Görevi</h3>" +
          '<div class="hw-project-box">🔍 ' +
          escapeHtml(hw.project) +
          "</div>" +
          "</section>"
      );
    }

    if (hw.answerKey.length) {
      sections.push(
        '<section class="hw-section hw-answerkey">' +
          '<button type="button" class="hw-answer-toggle">🔑 Cevap anahtarını göster</button>' +
          '<div class="hw-answer-content" hidden>' +
          "<h3>Cevap Anahtarı</h3>" +
          olList(hw.answerKey) +
          "</div>" +
          "</section>"
      );
    }

    container.innerHTML = '<div class="hw-card">' + sections.join("") + "</div>";

    // Yazdır butonu.
    var printBtn = container.querySelector(".hw-print");
    if (printBtn) {
      printBtn.addEventListener("click", function () {
        window.print();
      });
    }

    // Cevap anahtarı göster/gizle (başta gizli).
    var toggleBtn = container.querySelector(".hw-answer-toggle");
    var answerContent = container.querySelector(".hw-answer-content");
    if (toggleBtn && answerContent) {
      toggleBtn.addEventListener("click", function () {
        var hidden = answerContent.hidden;
        answerContent.hidden = !hidden;
        toggleBtn.textContent = hidden
          ? "🔑 Cevap anahtarını gizle"
          : "🔑 Cevap anahtarını göster";
      });
    }
  }

  function renderError(container) {
    if (!container) return;
    container.innerHTML =
      '<div class="hw-error">' +
      "😕 Ödev oluşturulurken bir sorun oluştu. Lütfen tekrar deneyin." +
      "</div>";
  }

  // ---------------------------------------------------------------------------
  // Genel API
  // ---------------------------------------------------------------------------

  window.App.homework = {
    // async: containerSel içine ödevi üretip render eder.
    generate: function (containerSel, opts) {
      opts = opts || {};
      var topic = opts.topic || "";
      var grade = opts.grade || "";
      var container = document.querySelector(containerSel);

      if (!container) {
        toast("Ödev alanı bulunamadı.", "error");
        return Promise.reject(new Error("Container bulunamadı: " + containerSel));
      }
      if (!topic) {
        toast("Lütfen bir konu girin.", "error");
        renderError(container);
        return Promise.resolve();
      }

      showLoading("Ödev hazırlanıyor… ✍️");

      return (window.App.gemini.generateJSON(buildPrompt(topic, grade)))
        .then(function (data) {
          hideLoading();
          var hw = normalize(data);
          if (
            !hw.shortAnswer.length &&
            !hw.openEnded.length &&
            !hw.project
          ) {
            toast("Geçerli ödev üretilemedi, tekrar deneyin.", "error");
            renderError(container);
            return;
          }
          renderHomework(container, hw, topic, grade);
        })
        .catch(function (err) {
          hideLoading();
          toast("Ödev oluşturulamadı. Lütfen tekrar deneyin.", "error");
          renderError(container);
          if (window.console && console.error) console.error("[homework]", err);
        });
    }
  };
})();
