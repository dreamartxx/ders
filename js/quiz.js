// quiz.js — Bilgi Yarışması (Quiz) modülü
// Sözleşme: window.App.quiz.start(containerSel, {topic, grade}) async
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

  // HTML kaçışı — AI/kullanıcı metnini innerHTML'e gömerken XSS engellemek için.
  function escapeHtml(value) {
    if (value === null || value === undefined) return "";
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // UI köprüleri — modül bağımsız bozulmasın diye güvenli sarmalayıcılar.
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

  // Sınıf seviyesini kabaca üç kademeye eşle (ilkokul / ortaokul / lise).
  // Sözleşme gereği grade değeri "ilkokul|ortaokul|lise"dir; sayısal sınıf
  // (ör. "3", "7") gelirse de geriye dönük uyumluluk için desteklenir.
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

  // Seviyeye göre dil/zorluk yönergesi.
  function difficultyHint(level) {
    switch (level.ad) {
      case "ilkokul":
        return "Çok basit, kısa ve net cümleler kullan. Günlük hayattan somut örnekler ver. Soyut kavramlardan kaçın.";
      case "lise":
        return "Analitik düşünme gerektiren, kavramları derinlemesine sınayan, gerektiğinde çıkarım isteyen sorular hazırla.";
      default:
        return "Orta zorlukta, kavram bilgisini ve basit uygulamayı ölçen sorular hazırla.";
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
        ") seviyesine uygun bir BİLGİ YARIŞMASI hazırla.",
      difficultyHint(level),
      "5 ile 10 arasında çoktan seçmeli soru üret. Her soru 4 şıklı olsun.",
      "Tüm metinler Türkçe olsun.",
      "Her soru için kısa ve öğretici bir açıklama (explanation) yaz.",
      "answerIndex doğru şıkkın 0 tabanlı indeksidir (0-3).",
      "Yalnızca şu JSON şemasında, başka hiçbir metin olmadan çıktı ver:",
      '{ "questions": [ { "question": "...", "options": ["A","B","C","D"], "answerIndex": 0, "explanation": "..." } ] }'
    ].join("\n");
  }

  // Gelen veriyi doğrula/temizle — bozuk soruları ele.
  function normalizeQuestions(data) {
    var list = (data && data.questions) || [];
    if (!Array.isArray(list)) return [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var q = list[i] || {};
      var opts = Array.isArray(q.options) ? q.options.slice(0, 4) : [];
      if (typeof q.question !== "string" || opts.length < 2) continue;
      var idx = parseInt(q.answerIndex, 10);
      if (isNaN(idx) || idx < 0 || idx >= opts.length) idx = 0;
      out.push({
        question: q.question,
        options: opts,
        answerIndex: idx,
        explanation: typeof q.explanation === "string" ? q.explanation : ""
      });
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Render / etkileşim
  // ---------------------------------------------------------------------------

  // Tek bir oturumun durumunu tutar.
  function createState(questions) {
    return { questions: questions, current: 0, score: 0, answered: false };
  }

  // Skora göre motive edici mesaj + emoji.
  function scoreMessage(percent) {
    if (percent === 100) return { emoji: "🏆", msg: "Mükemmel! Tam isabet, harikasın!" };
    if (percent >= 80) return { emoji: "🌟", msg: "Çok iyi! Konuya gerçekten hâkimsin." };
    if (percent >= 60) return { emoji: "👍", msg: "Güzel iş! Biraz daha çalışmayla zirvedesin." };
    if (percent >= 40) return { emoji: "💪", msg: "Fena değil! Tekrar edersen çok daha iyi olacak." };
    return { emoji: "📚", msg: "Üzülme! Konuyu tekrar edip yeniden deneyelim." };
  }

  // İçinde bulunulan soruyu çiz.
  function renderQuestion(container, state, onRestart, onNew) {
    var q = state.questions[state.current];
    var total = state.questions.length;
    var num = state.current + 1;
    var progress = Math.round((num / total) * 100);

    var optionsHtml = q.options
      .map(function (opt, i) {
        return (
          '<button type="button" class="quiz-option" data-index="' +
          i +
          '">' +
          '<span class="quiz-option-letter">' +
          String.fromCharCode(65 + i) +
          "</span>" +
          '<span class="quiz-option-text">' +
          escapeHtml(opt) +
          "</span>" +
          "</button>"
        );
      })
      .join("");

    container.innerHTML =
      '<div class="quiz-card">' +
      '<div class="quiz-progress">' +
      '<div class="quiz-progress-bar"><div class="quiz-progress-fill" style="width:' +
      progress +
      '%"></div></div>' +
      '<div class="quiz-progress-text">Soru ' +
      num +
      " / " +
      total +
      "  •  Skor: " +
      state.score +
      "</div>" +
      "</div>" +
      '<h3 class="quiz-question">' +
      escapeHtml(q.question) +
      "</h3>" +
      '<div class="quiz-options">' +
      optionsHtml +
      "</div>" +
      '<div class="quiz-feedback" hidden></div>' +
      '<div class="quiz-actions" hidden>' +
      '<button type="button" class="quiz-next">' +
      (num < total ? "Sonraki soru ➡️" : "Sonuçları gör 🎉") +
      "</button>" +
      "</div>" +
      "</div>";

    state.answered = false;

    var optionButtons = container.querySelectorAll(".quiz-option");
    var feedbackEl = container.querySelector(".quiz-feedback");
    var actionsEl = container.querySelector(".quiz-actions");
    var nextBtn = container.querySelector(".quiz-next");

    // Şık seçimi — anında geri bildirim.
    Array.prototype.forEach.call(optionButtons, function (btn) {
      btn.addEventListener("click", function () {
        if (state.answered) return; // tek seçim
        state.answered = true;
        var chosen = parseInt(btn.getAttribute("data-index"), 10);
        var correct = q.answerIndex;
        var isCorrect = chosen === correct;
        if (isCorrect) state.score++;

        // Tüm şıkları kilitle, doğru/yanlış işaretle.
        Array.prototype.forEach.call(optionButtons, function (b) {
          b.disabled = true;
          var bi = parseInt(b.getAttribute("data-index"), 10);
          if (bi === correct) b.classList.add("is-correct");
          if (bi === chosen && !isCorrect) b.classList.add("is-wrong");
        });

        feedbackEl.hidden = false;
        feedbackEl.className =
          "quiz-feedback " + (isCorrect ? "is-correct-fb" : "is-wrong-fb");
        feedbackEl.innerHTML =
          '<div class="quiz-feedback-head">' +
          (isCorrect ? "✅ Doğru!" : "❌ Yanlış") +
          "</div>" +
          (q.explanation
            ? '<div class="quiz-feedback-body">' +
              escapeHtml(q.explanation) +
              "</div>"
            : "");

        actionsEl.hidden = false;
      });
    });

    // Sonraki soru / sonuç.
    nextBtn.addEventListener("click", function () {
      if (state.current < total - 1) {
        state.current++;
        renderQuestion(container, state, onRestart, onNew);
      } else {
        renderSummary(container, state, onRestart, onNew);
      }
    });
  }

  // Final skor özeti.
  function renderSummary(container, state, onRestart, onNew) {
    var total = state.questions.length;
    var percent = total ? Math.round((state.score / total) * 100) : 0;
    var info = scoreMessage(percent);

    container.innerHTML =
      '<div class="quiz-card quiz-summary">' +
      '<div class="quiz-summary-emoji">' +
      info.emoji +
      "</div>" +
      '<h3 class="quiz-summary-title">Yarışma bitti!</h3>' +
      '<div class="quiz-summary-score">' +
      state.score +
      " / " +
      total +
      ' doğru <span class="quiz-summary-percent">(%' +
      percent +
      ")</span></div>" +
      '<p class="quiz-summary-msg">' +
      escapeHtml(info.msg) +
      "</p>" +
      '<div class="quiz-summary-actions">' +
      '<button type="button" class="quiz-retry">🔁 Tekrar dene</button>' +
      '<button type="button" class="quiz-new">✨ Yeni sorular</button>' +
      "</div>" +
      "</div>";

    container.querySelector(".quiz-retry").addEventListener("click", function () {
      onRestart();
    });
    container.querySelector(".quiz-new").addEventListener("click", function () {
      onNew();
    });
  }

  // Container'a hata mesajı bas.
  function renderError(container) {
    if (!container) return;
    container.innerHTML =
      '<div class="quiz-error">' +
      "😕 Sorular oluşturulurken bir sorun oluştu. Lütfen tekrar deneyin." +
      "</div>";
  }

  // ---------------------------------------------------------------------------
  // Genel API
  // ---------------------------------------------------------------------------

  window.App.quiz = {
    // async: containerSel içine interaktif quiz yükler.
    start: function (containerSel, opts) {
      opts = opts || {};
      var topic = opts.topic || "";
      var grade = opts.grade || "";
      var container = document.querySelector(containerSel);

      if (!container) {
        toast("Quiz alanı bulunamadı.", "error");
        return Promise.reject(new Error("Container bulunamadı: " + containerSel));
      }
      if (!topic) {
        toast("Lütfen bir konu girin.", "error");
        renderError(container);
        return Promise.resolve();
      }

      var self = this;

      // Mevcut soru kümesiyle interaktif oturumu başlat.
      function play(questions) {
        var state = createState(questions);
        renderQuestion(
          container,
          state,
          function onRestart() {
            // Aynı sorularla baştan.
            play(questions.slice());
          },
          function onNew() {
            // Yeni sorular üret.
            self.start(containerSel, { topic: topic, grade: grade });
          }
        );
      }

      showLoading("Sorular hazırlanıyor… 🧠");

      return (window.App.gemini.generateJSON(buildPrompt(topic, grade)))
        .then(function (data) {
          hideLoading();
          var questions = normalizeQuestions(data);
          if (!questions.length) {
            toast("Geçerli soru üretilemedi, tekrar deneyin.", "error");
            renderError(container);
            return;
          }
          play(questions);
        })
        .catch(function (err) {
          hideLoading();
          toast("Sorular oluşturulamadı. Lütfen tekrar deneyin.", "error");
          renderError(container);
          // Sessizce yutmayalım; geliştirici konsolda görsün.
          if (window.console && console.error) console.error("[quiz]", err);
        });
    }
  };
})();
