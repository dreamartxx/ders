/* ============================================================
   Akıllı Ders Platformu — Uygulama Orkestrasyonu (app.js)
   Tüm modülleri birbirine bağlar. En son yüklenir.
   Sözleşme: docs/ARCHITECTURE.md
   ============================================================ */
(function () {
  "use strict";
  window.App = window.App || {};
  const App = window.App;

  // Sekme içerikleri ilk açılışta üretilsin diye durum takibi
  const loaded = { lesson: false, games: false, quiz: false, homework: false };

  function $(sel) { return document.querySelector(sel); }

  /* --- API anahtarı / ayarlar paneli --- */
  function initSettings() {
    const toggle = $("#settings-toggle");
    const panel = $("#settings-panel");
    const input = $("#api-key-input");
    const saveBtn = $("#save-key-btn");

    if (input && App.gemini && App.gemini.hasKey && App.gemini.hasKey()) {
      input.value = App.gemini.getApiKey();
    }
    if (toggle && panel) {
      toggle.addEventListener("click", () => panel.classList.toggle("hidden"));
    }
    if (saveBtn && input) {
      saveBtn.addEventListener("click", () => {
        const key = input.value.trim();
        if (!key) { App.ui.toast("Lütfen bir API anahtarı girin.", "error"); return; }
        App.gemini.setApiKey(key);
        App.ui.toast("API anahtarı kaydedildi! ✅", "success");
        if (panel) panel.classList.add("hidden");
      });
    }
  }

  /* --- Örnek konu çipleri --- */
  function initExamples() {
    document.querySelectorAll(".example-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        const t = chip.dataset.topic || chip.textContent.trim();
        const input = $("#topic-input");
        if (input) { input.value = t; input.focus(); }
      });
    });
  }

  /* --- Sekme gezinmesi (tembel yükleme ile) --- */
  function initTabs() {
    document.querySelectorAll("#tab-nav .tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const name = btn.dataset.tab;
        App.ui.switchTab(name);
        ensureTabContent(name);
      });
    });
  }

  // Bir sekme ilk kez açıldığında içeriğini üret
  function ensureTabContent(name) {
    if (loaded[name]) return;
    const opts = { topic: App.state.topic, grade: App.state.grade };
    try {
      if (name === "games") { App.games.mount("#games-content", opts); loaded.games = true; }
      else if (name === "quiz") { App.quiz.start("#quiz-content", opts); loaded.quiz = true; }
      else if (name === "homework") { App.homework.generate("#homework-content", opts); loaded.homework = true; }
    } catch (err) {
      console.error(err);
      App.ui.toast("Bir hata oluştu: " + err.message, "error");
    }
  }

  /* --- Konu formu / ders başlatma --- */
  function initTopicForm() {
    const form = $("#topic-form");
    if (form) {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const topic = ($("#topic-input").value || "").trim();
        const grade = $("#grade-select").value || "ilkokul";
        startLesson(topic, grade);
      });
    }
    const newBtn = $("#new-topic-btn");
    if (newBtn) newBtn.addEventListener("click", goWelcome);
  }

  function goWelcome() {
    const ws = $("#workspace"); if (ws) ws.classList.add("hidden");
    const wc = $("#welcome"); if (wc) wc.classList.remove("hidden");
    const input = $("#topic-input"); if (input) input.focus();
  }

  async function startLesson(topic, grade) {
    if (!topic) { App.ui.toast("Lütfen bir konu yaz. ✍️", "error"); return; }

    // API anahtarı yoksa ayarları aç
    if (!App.gemini || !App.gemini.hasKey || !App.gemini.hasKey()) {
      App.ui.toast("Önce Gemini API anahtarını ekle. ⚙️", "error");
      const panel = $("#settings-panel"); if (panel) panel.classList.remove("hidden");
      const keyInput = $("#api-key-input"); if (keyInput) keyInput.focus();
      return;
    }

    App.state.topic = topic;
    App.state.grade = grade;

    // Yeni konu: sekme önbelleklerini sıfırla ve panelleri temizle
    loaded.lesson = loaded.games = loaded.quiz = loaded.homework = false;
    ["games", "quiz", "homework"].forEach((t) => {
      const c = document.getElementById(t + "-content");
      if (c) c.innerHTML = "";
    });

    // Karşılamadan çalışma alanına geç
    const wc = $("#welcome"); if (wc) wc.classList.add("hidden");
    const ws = $("#workspace"); if (ws) ws.classList.remove("hidden");
    const title = $("#workspace-title");
    if (title) title.textContent = topic + " · " + (App.config.GRADES[grade] || grade);
    App.ui.switchTab("lesson");

    try {
      await App.lesson.build(topic, grade);
      loaded.lesson = true;
    } catch (err) {
      console.error(err);
      App.ui.hideLoading();
      App.ui.toast("Ders oluşturulamadı: " + err.message, "error");
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    initSettings();
    initExamples();
    initTabs();
    initTopicForm();
  });
})();
