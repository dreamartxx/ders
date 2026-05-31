// homework.js — Ödev / Görevler modülü
// Sözleşme: window.App.homework.generate(containerSel, {topic, grade}) async
// Bağımlılıklar:
//   - window.App.gemini.generateJSON(prompt)
//   - window.App.ui.showLoading / hideLoading / toast
//   - window.App.config.GRADES
// Ödev, tıklanınca çevrilen (flip) görsel GÖREV KARTLARI olarak sunulur.
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
        return "Görevler çok basit, kısa, somut ve eğlenceli olsun. Günlük hayattan örnekler kullan.";
      case "lise":
        return "Görevler düşündürücü, analiz ve sentez gerektiren nitelikte olsun.";
      default:
        return "Görevler orta düzeyde; kavram bilgisini ve basit uygulamayı ölçsün.";
    }
  }

  function gradeLabel(grade) {
    var grades = (window.App.config && window.App.config.GRADES) || {};
    return grades[grade] || gradeLevel(grade).ad;
  }

  // ---------------------------------------------------------------------------
  // İstem (prompt) üretimi
  // ---------------------------------------------------------------------------

  function buildPrompt(topic, grade) {
    var level = gradeLevel(grade);
    return [
      "Sen yaratıcı ve eğlenceli bir Türk öğretmenisin.",
      '"' + topic + '" konusunda ' + gradeLabel(grade) + ' (' + level.aralik + ", " + level.ad +
        ") seviyesine uygun EĞLENCELİ GÖREVLER hazırla.",
      difficultyHint(level),
      "Tüm metinler Türkçe olsun ve görevler merak uyandırıcı, motive edici bir dille yazılsın.",
      "İçerik:",
      "- 3-5 kısa cevaplı soru görevi (shortAnswer) ve bunların cevap anahtarı (answerKey, aynı sırada ve aynı sayıda).",
      "- 2-4 klasik/açık uçlu düşündürücü görev (openEnded).",
      "- 1 adet eğlenceli araştırma/proje görevi (project).",
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
  // Görev listesi oluşturma
  // ---------------------------------------------------------------------------

  // Üç tür içeriği tek bir "görev kartı" listesine dönüştür.
  // Her görev: {kind, icon, label, text, answer}
  function buildTasks(hw) {
    var tasks = [];
    var icons = ["🧩", "🔍", "⭐", "💫", "🎈", "🚀", "🎯", "🌈"];

    hw.shortAnswer.forEach(function (q, i) {
      tasks.push({
        kind: "short",
        label: "Hızlı Görev",
        icon: icons[i % icons.length],
        text: q,
        answer: hw.answerKey[i] || ""
      });
    });

    hw.openEnded.forEach(function (q, i) {
      tasks.push({
        kind: "open",
        label: "Düşün & Yaz",
        icon: "✍️",
        text: q,
        answer: ""
      });
    });

    if (hw.project) {
      tasks.push({
        kind: "project",
        label: "Büyük Macera",
        icon: "🏆",
        text: hw.project,
        answer: ""
      });
    }

    return tasks;
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  function renderTaskCard(task, index) {
    var num = index + 1;

    // Arka yüz: görev metni + (kısa cevaplılarda) gizli ipucu/cevap.
    var backExtra = "";
    if (task.kind === "short" && task.answer) {
      backExtra =
        '<button type="button" class="task-answer-toggle">💡 İpucunu gör</button>' +
        '<div class="task-answer" hidden>' + escapeHtml(task.answer) + "</div>";
    } else if (task.kind === "open") {
      backExtra = '<div class="task-tip">✏️ Bu görevi defterine kendi cümlelerinle yaz.</div>';
    } else if (task.kind === "project") {
      backExtra = '<div class="task-tip">🔎 Araştır, keşfet ve sonucunu paylaş!</div>';
    }

    return (
      '<div class="task-card task-' + task.kind + '" data-index="' + index + '" tabindex="0" ' +
      'role="button" aria-label="Görev ' + num + ' — çevirmek için tıkla">' +
      '<div class="task-card-inner">' +
      // ÖN YÜZ
      '<div class="task-face task-front">' +
      '<div class="task-icon">' + escapeHtml(task.icon) + "</div>" +
      '<div class="task-badge">' + escapeHtml(task.label) + "</div>" +
      '<div class="task-num">Görev ' + num + "</div>" +
      '<div class="task-flip-hint">👆 Aç</div>' +
      "</div>" +
      // ARKA YÜZ
      '<div class="task-face task-back">' +
      '<div class="task-back-num">Görev ' + num + "</div>" +
      '<div class="task-text">' + escapeHtml(task.text) + "</div>" +
      backExtra +
      "</div>" +
      "</div>" +
      "</div>"
    );
  }

  function renderHomework(container, hw, topic, grade) {
    var tasks = buildTasks(hw);

    var cardsHtml = tasks
      .map(function (t, i) {
        return renderTaskCard(t, i);
      })
      .join("");

    container.innerHTML =
      '<div class="tasks-wrap">' +
      '<div class="tasks-header">' +
      '<div>' +
      '<h2 class="tasks-title">🎒 Görev Panosu</h2>' +
      '<p class="tasks-sub">' +
      escapeHtml(topic) +
      " • " +
      escapeHtml(gradeLabel(grade)) +
      ' • <strong>' + tasks.length + ' görev</strong>' +
      "</p>" +
      "</div>" +
      '<button type="button" class="btn btn-ghost tasks-print">🖨️ Yazdır</button>' +
      '<button type="button" class="btn btn-primary tasks-download">⬇️ HTML indir</button>' +
      "</div>" +
      '<p class="tasks-hint">💡 Bir kartı görevi görmek için tıkla. Hadi başlayalım!</p>' +
      '<div class="tasks-board">' +
      cardsHtml +
      "</div>" +
      "</div>";

    // Kartı çevirme — tıklama ve klavye (Enter/Space).
    var cards = container.querySelectorAll(".task-card");
    Array.prototype.forEach.call(cards, function (card) {
      function flip(e) {
        // İpucu butonuna basıldıysa kartı çevirme.
        if (e.target.closest(".task-answer-toggle")) return;
        card.classList.toggle("is-flipped");
      }
      card.addEventListener("click", flip);
      card.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          card.classList.toggle("is-flipped");
        }
      });
    });

    // İpucu/cevap göster-gizle.
    var toggles = container.querySelectorAll(".task-answer-toggle");
    Array.prototype.forEach.call(toggles, function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var ans = btn.parentNode.querySelector(".task-answer");
        if (!ans) return;
        var hidden = ans.hidden;
        ans.hidden = !hidden;
        btn.textContent = hidden ? "🙈 İpucunu gizle" : "💡 İpucunu gör";
      });
    });

    // Yazdır.
    var printBtn = container.querySelector(".tasks-print");
    if (printBtn) {
      printBtn.addEventListener("click", function () {
        window.print();
      });
    }

    // HTML olarak indir.
    var dlBtn = container.querySelector(".tasks-download");
    if (dlBtn) {
      dlBtn.addEventListener("click", function () {
        downloadHtml(hw, topic, grade);
      });
    }
  }

  // -------------------------------------------------------------------------
  // İndirme — bağımsız (offline açılabilen) HTML ödev belgesi üret
  // -------------------------------------------------------------------------

  function listSection(title, items, ordered) {
    if (!items || !items.length) return "";
    var tag = ordered ? "ol" : "ul";
    var lis = items
      .map(function (it) {
        return "<li>" + escapeHtml(it) + "</li>";
      })
      .join("");
    return "<h2>" + escapeHtml(title) + "</h2><" + tag + ">" + lis + "</" + tag + ">";
  }

  // Dosya adı için güvenli sadeleştirme.
  function slugify(s) {
    return String(s || "odev")
      .toLowerCase()
      .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g")
      .replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "odev";
  }

  function buildDocument(hw, topic, grade) {
    var parts = [];
    parts.push(listSection("📝 Kısa Cevaplı Sorular", hw.shortAnswer, true));
    parts.push(listSection("✍️ Klasik / Açık Uçlu Sorular", hw.openEnded, true));
    if (hw.project) {
      parts.push(
        "<h2>🏆 Proje / Araştırma Görevi</h2><p class='project'>" +
          escapeHtml(hw.project) +
          "</p>"
      );
    }
    if (hw.answerKey && hw.answerKey.length) {
      parts.push(
        '<details class="answers"><summary>🔑 Cevap Anahtarı (göstermek için tıkla)</summary>' +
          listSection("", hw.answerKey, true) +
          "</details>"
      );
    }

    var heading = escapeHtml(topic) + " — " + escapeHtml(gradeLabel(grade)) + " Ödevi";

    return [
      "<!DOCTYPE html>",
      '<html lang="tr"><head><meta charset="UTF-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
      "<title>" + heading + "</title>",
      "<style>",
      "body{font-family:'Segoe UI',system-ui,sans-serif;max-width:760px;margin:0 auto;",
      "padding:32px 20px;color:#2d3436;line-height:1.6;background:#fff;}",
      "h1{font-size:1.6rem;border-bottom:3px solid #6c5ce7;padding-bottom:10px;}",
      "h2{font-size:1.2rem;margin-top:28px;color:#5546d6;}",
      "ol,ul{padding-left:22px;} li{margin:8px 0;}",
      ".project{background:#fff3d6;padding:14px 16px;border-radius:10px;}",
      ".answers{margin-top:28px;background:#f6f5ff;padding:12px 16px;border-radius:10px;}",
      ".answers summary{cursor:pointer;font-weight:700;color:#5546d6;}",
      ".meta{color:#636e72;font-size:.9rem;} @media print{.answers{display:block;}}",
      "</style></head><body>",
      "<h1>" + heading + "</h1>",
      '<p class="meta">Konu: ' + escapeHtml(topic) + " &nbsp;•&nbsp; Seviye: " +
        escapeHtml(gradeLabel(grade)) + "</p>",
      parts.join("\n"),
      "</body></html>"
    ].join("\n");
  }

  function downloadHtml(hw, topic, grade) {
    try {
      var html = buildDocument(hw, topic, grade);
      var blob = new Blob([html], { type: "text/html;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = slugify(topic) + "-odev.html";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Belleği serbest bırak.
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      toast("Ödev indirildi 📥", "success");
    } catch (err) {
      if (window.console) console.error("[homework] indirme hatası", err);
      toast("İndirme başarısız oldu.", "error");
    }
  }

  function renderError(container) {
    if (!container) return;
    container.innerHTML =
      '<div class="state-msg state-error">' +
      "😕 Görevler oluşturulurken bir sorun oluştu. Lütfen tekrar deneyin." +
      "</div>";
  }

  // ---------------------------------------------------------------------------
  // Genel API
  // ---------------------------------------------------------------------------

  window.App.homework = {
    // async: containerSel içine görevleri üretip render eder.
    generate: function (containerSel, opts) {
      opts = opts || {};
      var topic = opts.topic || "";
      var grade = opts.grade || "";
      var container = document.querySelector(containerSel);

      if (!container) {
        toast("Görev alanı bulunamadı.", "error");
        return Promise.reject(new Error("Container bulunamadı: " + containerSel));
      }
      if (!topic) {
        toast("Lütfen bir konu girin.", "error");
        renderError(container);
        return Promise.resolve();
      }

      showLoading("Görevler hazırlanıyor… 🎒");

      return window.App.gemini
        .generateJSON(buildPrompt(topic, grade))
        .then(function (data) {
          hideLoading();
          var hw = normalize(data);
          if (!hw.shortAnswer.length && !hw.openEnded.length && !hw.project) {
            toast("Geçerli görev üretilemedi, tekrar deneyin.", "error");
            renderError(container);
            return;
          }
          renderHomework(container, hw, topic, grade);
        })
        .catch(function (err) {
          hideLoading();
          toast("Görevler oluşturulamadı. Lütfen tekrar deneyin.", "error");
          renderError(container);
          if (window.console && console.error) console.error("[homework]", err);
        });
    }
  };
})();
