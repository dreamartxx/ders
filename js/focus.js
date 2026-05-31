// focus.js — Odak seçim modülü
// Konu girildiğinde "Bu konuda neyi öğrenmek istersin?" diye sorar.
// AI, büyük konuyu ilgi çekici alt başlıklara böler; öğrenci birini seçer,
// "tüm konuyu anlat"ı seçebilir ya da kendi sorusunu yazabilir.
//
// Sözleşme: window.App.focus.choose(topic, grade) -> Promise<{label, topic}>
//   label : kullanıcıya gösterilecek kısa odak adı (başlık için)
//   topic : derse/oyunlara/yarışmaya/görevlere aktarılacak etkin konu metni
// İptal edilirse (geri) Promise reddedilir (reason: "cancel").
//
// Bağımlılıklar: App.gemini.generateJSON, App.ui.showLoading/hideLoading/toast
// Saf JS, build/import yok.

window.App = window.App || {};
window.App.focus = (function () {
  "use strict";

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
  function showLoading(m) {
    if (typeof ui().showLoading === "function") ui().showLoading(m);
  }
  function hideLoading() {
    if (typeof ui().hideLoading === "function") ui().hideLoading();
  }
  function toast(m, t) {
    if (typeof ui().toast === "function") ui().toast(m, t);
  }

  function gradeLabel(grade) {
    var grades = (window.App.config && window.App.config.GRADES) || {};
    return grades[grade] || grade || "";
  }

  // AI'den alt başlık önerileri iste.
  function buildPrompt(topic, grade) {
    return [
      "Bir öğrenci \"" + topic + "\" konusunu öğrenmek istiyor.",
      "Seviye: " + gradeLabel(grade) + ".",
      "Bu konuyu, öğrencinin seçebileceği 6 ilgi çekici ve net ALT BAŞLIĞA böl.",
      "Her alt başlık tek bir öğrenme hedefine odaklansın ve merak uyandırsın.",
      "Tüm metinler Türkçe, kısa ve sınıf seviyesine uygun olsun.",
      "Yalnızca şu JSON şemasında, başka hiçbir metin olmadan yanıt ver:",
      '{ "angles": [ { "emoji": "tek emoji", "title": "kısa başlık (2-4 kelime)", "desc": "tek kısa cümle açıklama" } ] }'
    ].join("\n");
  }

  function normalizeAngles(data) {
    var list = (data && data.angles) || [];
    if (!Array.isArray(list)) return [];
    var out = [];
    for (var i = 0; i < list.length && out.length < 6; i++) {
      var a = list[i] || {};
      if (typeof a.title !== "string" || !a.title.trim()) continue;
      out.push({
        emoji: typeof a.emoji === "string" && a.emoji.trim() ? a.emoji.trim() : "✨",
        title: a.title.trim(),
        desc: typeof a.desc === "string" ? a.desc.trim() : ""
      });
    }
    return out;
  }

  // Odak ekranını çiz; seçim yapılınca resolve/reject çağrılır.
  function render(container, topic, grade, angles, resolve, reject) {
    var anglesHtml = angles
      .map(function (a, i) {
        return (
          '<button type="button" class="focus-card" data-index="' + i + '">' +
          '<span class="focus-card-emoji">' + escapeHtml(a.emoji) + "</span>" +
          '<span class="focus-card-title">' + escapeHtml(a.title) + "</span>" +
          (a.desc ? '<span class="focus-card-desc">' + escapeHtml(a.desc) + "</span>" : "") +
          "</button>"
        );
      })
      .join("");

    container.innerHTML =
      '<div class="focus-hero">' +
      '<button type="button" class="focus-back btn btn-ghost">← Geri</button>' +
      '<span class="welcome-badge">🎯 Hadi odaklanalım</span>' +
      '<h1 class="focus-title">"' + escapeHtml(topic) + '" hakkında<br><span class="grad-text">neyi öğrenmek istersin?</span></h1>' +
      '<p class="focus-sub">Aşağıdan ilgini çeken bir başlık seç, ya da kendi sorunu yaz.</p>' +
      '<div class="focus-grid">' + anglesHtml + "</div>" +
      '<div class="focus-or">veya</div>' +
      '<form class="focus-custom" autocomplete="off">' +
      '<input type="text" class="topic-input focus-custom-input" placeholder="Kendi sorunu yaz: örn. ' + escapeHtml(topic) + ' nasıl çalışır?" />' +
      '<button type="submit" class="btn btn-primary">Sor 💬</button>' +
      "</form>" +
      '<button type="button" class="focus-all">📚 Tüm konuyu baştan sona anlat</button>' +
      "</div>";

    // Alt başlık kartları
    var cards = container.querySelectorAll(".focus-card");
    Array.prototype.forEach.call(cards, function (card) {
      card.addEventListener("click", function () {
        var idx = parseInt(card.getAttribute("data-index"), 10);
        var a = angles[idx];
        resolve({
          label: a.title,
          topic: topic + " — " + a.title
        });
      });
    });

    // Tüm konu
    var allBtn = container.querySelector(".focus-all");
    if (allBtn) {
      allBtn.addEventListener("click", function () {
        resolve({ label: "Tüm konu", topic: topic });
      });
    }

    // Kendi sorusu
    var customForm = container.querySelector(".focus-custom");
    if (customForm) {
      customForm.addEventListener("submit", function (e) {
        e.preventDefault();
        var inp = container.querySelector(".focus-custom-input");
        var q = (inp && inp.value ? inp.value : "").trim();
        if (!q) {
          toast("Önce bir soru yaz ✍️", "error");
          if (inp) inp.focus();
          return;
        }
        resolve({ label: q, topic: topic + " — " + q });
      });
    }

    // Geri
    var backBtn = container.querySelector(".focus-back");
    if (backBtn) {
      backBtn.addEventListener("click", function () {
        reject(new Error("cancel"));
      });
    }
  }

  function choose(topic, grade) {
    var screen = document.getElementById("focus");
    var container = document.getElementById("focus-content");
    var welcome = document.getElementById("welcome");

    return new Promise(function (resolve, reject) {
      if (!container || !screen) {
        // Odak ekranı yoksa konuyu olduğu gibi kullan.
        resolve({ label: "", topic: topic });
        return;
      }

      // Karşılamadan odak ekranına geç.
      if (welcome) welcome.classList.add("hidden");
      screen.classList.remove("hidden");

      showLoading("Konu inceleniyor… 🧭");

      window.App.gemini
        .generateJSON(buildPrompt(topic, grade))
        .then(function (data) {
          hideLoading();
          var angles = normalizeAngles(data);
          if (!angles.length) {
            // Öneri üretilemediyse doğrudan tüm konuyu anlat.
            resolve({ label: "", topic: topic });
            return;
          }
          render(container, topic, grade, angles, resolve, reject);
        })
        .catch(function (err) {
          hideLoading();
          if (window.console) console.error("[focus]", err);
          // Hata olsa bile akışı kesme: konuyu olduğu gibi kullan.
          resolve({ label: "", topic: topic });
        });
    });
  }

  // Odak ekranını gizle (app.js geçişlerde kullanır).
  function hide() {
    var screen = document.getElementById("focus");
    if (screen) screen.classList.add("hidden");
  }

  return { choose: choose, hide: hide };
})();
