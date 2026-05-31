/* ============================================================
   ui.js · Arayüz yardımcıları
   window.App.ui üzerine genel UX fonksiyonları tanımlar.
   Buton bağlamaları burada YAPILMAZ; onu app.js üstlenir.
   ============================================================ */

window.App = window.App || {};

window.App.ui = {

  /* --------------------------------------------------------
     Yükleme katmanını gösterir.
     title: yükleme kutusundaki durum metni (#loading-status)
     -------------------------------------------------------- */
  showLoading: function (title) {
    var overlay = document.getElementById("loading-overlay");
    var status = document.getElementById("loading-status");
    var bar = document.getElementById("loading-bar");

    if (status) status.textContent = title || "Hazırlanıyor...";
    if (bar) bar.style.width = "0%";          // çubuğu sıfırla
    if (overlay) overlay.classList.remove("hidden");
  },

  /* --------------------------------------------------------
     Yükleme durumunu günceller.
     text: yeni durum metni (boşsa metin değişmez)
     percent: ilerleme yüzdesi 0-100 (boşsa çubuk değişmez)
     -------------------------------------------------------- */
  updateLoading: function (text, percent) {
    var status = document.getElementById("loading-status");
    var bar = document.getElementById("loading-bar");

    if (status && typeof text === "string" && text.length) {
      status.textContent = text;
    }
    if (bar && typeof percent === "number") {
      // Yüzdeyi 0-100 aralığına sıkıştır
      var p = Math.max(0, Math.min(100, percent));
      bar.style.width = p + "%";
    }
  },

  /* --------------------------------------------------------
     Yükleme katmanını gizler.
     -------------------------------------------------------- */
  hideLoading: function () {
    var overlay = document.getElementById("loading-overlay");
    if (overlay) overlay.classList.add("hidden");
  },

  /* --------------------------------------------------------
     Sekmeler arasında geçiş yapar.
     name: "lesson" | "games" | "quiz" | "homework"
     - #tab-nav butonlarındaki .active sınıfını ayarlar
     - ilgili paneli gösterir, diğerlerini .hidden ile gizler
     -------------------------------------------------------- */
  switchTab: function (name) {
    var nav = document.getElementById("tab-nav");
    if (nav) {
      var buttons = nav.querySelectorAll(".tab-btn");
      for (var i = 0; i < buttons.length; i++) {
        var btn = buttons[i];
        if (btn.getAttribute("data-tab") === name) {
          btn.classList.add("active");
        } else {
          btn.classList.remove("active");
        }
      }
    }

    // Tüm panelleri gez; eşleşeni göster, diğerlerini gizle
    var tabs = ["lesson", "games", "quiz", "homework"];
    for (var j = 0; j < tabs.length; j++) {
      var panel = document.getElementById("panel-" + tabs[j]);
      if (!panel) continue;
      if (tabs[j] === name) {
        panel.classList.remove("hidden");
      } else {
        panel.classList.add("hidden");
      }
    }
  },

  /* --------------------------------------------------------
     Geçici bildirim (toast) gösterir.
     msg: gösterilecek metin
     type: "success" | "error" | "info" (varsayılan: nötr)
     Kendi DOM elemanını oluşturur ve birkaç saniye sonra kaldırır.
     -------------------------------------------------------- */
  toast: function (msg, type) {
    // Toast kapsayıcısını bul ya da oluştur
    var container = document.querySelector(".toast-container");
    if (!container) {
      container = document.createElement("div");
      container.className = "toast-container";
      document.body.appendChild(container);
    }

    // Toast elemanını oluştur
    var el = document.createElement("div");
    el.className = "toast";
    if (type) el.classList.add("toast-" + type);
    el.textContent = msg;
    container.appendChild(el);

    // Belirli süre sonra çıkış animasyonu ile kaldır
    setTimeout(function () {
      el.classList.add("toast-out");
      setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
        // Kapsayıcı boşaldıysa onu da temizle
        if (container && !container.children.length && container.parentNode) {
          container.parentNode.removeChild(container);
        }
      }, 300); // çıkış animasyonu süresi
    }, 3200); // ekranda kalma süresi
  }

};
