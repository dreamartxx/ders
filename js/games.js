// js/games.js
// OYUNLAR modülü → window.App.games
// Eğitim web uygulaması için konuya özel, AI destekli mini oyunlar.
// Saf JavaScript. Tüm mantık bu dosyadadır. Türkçe arayüz.
//
// Sözleşme (docs/ARCHITECTURE.md):
//   - window.App.games.list  : [{id, name, icon, desc}]
//   - window.App.games.mount(containerSel, {topic, grade})
//
// Kullanılan dış API'ler (başka ajanlar yazıyor):
//   - window.App.gemini.generateJSON(prompt) → Promise<nesne>
//   - window.App.ui.showLoading / updateLoading / hideLoading / toast
//   - window.App.config.GRADES

window.App = window.App || {};

window.App.games = (function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // Yardımcılar
  // ---------------------------------------------------------------------------

  /** HTML özel karakterlerini güvenli hale getirir (XSS koruması). */
  function escapeHTML(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /** Diziyi yerinde olmayan biçimde karıştırır (Fisher-Yates). */
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  /** Bir dizeyi harflere göre karıştırır; sonuç orijinalden farklı olmaya çalışır. */
  function scrambleWord(word) {
    var clean = String(word || "");
    if (clean.length < 2) return clean;
    var scrambled = clean;
    var guard = 0;
    while (scrambled === clean && guard < 12) {
      scrambled = shuffle(clean.split("")).join("");
      guard++;
    }
    return scrambled;
  }

  /** Güvenli toast kısayolu (ui hazır değilse sessiz). */
  function toast(msg, type) {
    if (window.App && window.App.ui && typeof window.App.ui.toast === "function") {
      window.App.ui.toast(msg, type || "info");
    }
  }

  function showLoading(msg) {
    if (window.App && window.App.ui && typeof window.App.ui.showLoading === "function") {
      window.App.ui.showLoading(msg);
    }
  }
  function updateLoading(msg) {
    if (window.App && window.App.ui && typeof window.App.ui.updateLoading === "function") {
      window.App.ui.updateLoading(msg);
    }
  }
  function hideLoading() {
    if (window.App && window.App.ui && typeof window.App.ui.hideLoading === "function") {
      window.App.ui.hideLoading();
    }
  }

  /** İçeriği AI ile üret. */
  function generateJSON(prompt) {
    if (!window.App || !window.App.gemini || typeof window.App.gemini.generateJSON !== "function") {
      return Promise.reject(new Error("Gemini servisi hazır değil."));
    }
    return window.App.gemini.generateJSON(prompt);
  }

  /** Sınıf seviyesi etiketi (varsa). */
  function gradeLabel(grade) {
    var grades = (window.App && window.App.config && window.App.config.GRADES) || [];
    for (var i = 0; i < grades.length; i++) {
      if (String(grades[i].value) === String(grade)) return grades[i].label;
    }
    return grade ? grade + ". Sınıf" : "";
  }

  /** Türkçe büyük harfe çevirme (i → İ). */
  function trUpper(s) {
    return String(s || "")
      .replace(/i/g, "İ")
      .replace(/ı/g, "I")
      .toUpperCase();
  }

  /** Dizinin geçerli, boş olmayan dize öğelerini süzer. */
  function cleanStrings(arr) {
    if (!Array.isArray(arr)) return [];
    return arr
      .map(function (x) { return typeof x === "string" ? x.trim() : ""; })
      .filter(function (x) { return x.length > 0; });
  }

  // ---------------------------------------------------------------------------
  // İçerik önbelleği — anahtar: oyunId + topic + grade
  // ---------------------------------------------------------------------------

  var contentCache = {};

  function cacheKey(gameId, topic, grade) {
    return gameId + "|" + String(topic || "").toLowerCase().trim() + "|" + String(grade || "");
  }

  /**
   * İçeriği önbellekten getirir; yoksa üreticiyi çalıştırıp önbelleğe yazar.
   * @param {string} gameId
   * @param {object} ctx {topic, grade}
   * @param {function} builder topic,grade → Promise<içerik>
   * @param {string} loadingMsg
   */
  function getContent(gameId, ctx, builder, loadingMsg) {
    var key = cacheKey(gameId, ctx.topic, ctx.grade);
    if (contentCache[key]) {
      return Promise.resolve(contentCache[key]);
    }
    showLoading(loadingMsg || "İçerik hazırlanıyor...");
    return builder(ctx.topic, ctx.grade)
      .then(function (content) {
        contentCache[key] = content;
        hideLoading();
        return content;
      })
      .catch(function (err) {
        hideLoading();
        throw err;
      });
  }

  // ---------------------------------------------------------------------------
  // Ortak iç durum
  // ---------------------------------------------------------------------------

  var rootEl = null;   // #games-content
  var mountCtx = { topic: "", grade: "" };

  /** Oyun seçiciye geri dönmek için kullanılan ortak başlık. */
  function gameHeader(title, onBack) {
    var wrap = document.createElement("div");
    wrap.style.cssText =
      "display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;flex-wrap:wrap;";

    var backBtn = document.createElement("button");
    backBtn.className = "btn";
    backBtn.type = "button";
    backBtn.textContent = "← Oyunlara dön";
    backBtn.setAttribute("aria-label", "Oyun seçimine dön");
    backBtn.addEventListener("click", onBack);

    var h = document.createElement("h2");
    h.style.cssText = "margin:0;font-size:1.25rem;flex:1;text-align:center;";
    h.textContent = title;

    var spacer = document.createElement("div");
    spacer.style.cssText = "min-width:120px;";

    wrap.appendChild(backBtn);
    wrap.appendChild(h);
    wrap.appendChild(spacer);
    return wrap;
  }

  /** Konu/sınıf rozeti. */
  function topicBadge() {
    var p = document.createElement("p");
    p.style.cssText = "text-align:center;color:#666;margin:0 0 16px;font-size:0.9rem;";
    var bits = [];
    if (mountCtx.topic) bits.push("Konu: " + mountCtx.topic);
    var gl = gradeLabel(mountCtx.grade);
    if (gl) bits.push(gl);
    p.textContent = bits.join("  •  ");
    return p;
  }

  /** Skor/durum çubuğu oluşturur (DOM düğümü + güncelleyici döndürür). */
  function makeStatusBar() {
    var bar = document.createElement("div");
    bar.style.cssText =
      "display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-bottom:16px;";
    var cells = {};
    function add(id, label, value) {
      var box = document.createElement("div");
      box.style.cssText =
        "background:#f3f4f6;border-radius:10px;padding:8px 14px;font-weight:600;min-width:90px;text-align:center;";
      var lab = document.createElement("div");
      lab.style.cssText = "font-size:0.7rem;color:#888;font-weight:500;text-transform:uppercase;letter-spacing:.5px;";
      lab.textContent = label;
      var val = document.createElement("div");
      val.style.cssText = "font-size:1.1rem;";
      val.textContent = value;
      box.appendChild(lab);
      box.appendChild(val);
      bar.appendChild(box);
      cells[id] = val;
    }
    return {
      el: bar,
      add: add,
      set: function (id, value) {
        if (cells[id]) cells[id].textContent = value;
      },
    };
  }

  /** Sonuç ekranı (kazanma/bitiş) — başlık, alt metin ve Tekrar oyna butonu. */
  function resultPanel(opts) {
    // opts: {emoji, title, subtitle, onReplay, onBack}
    var panel = document.createElement("div");
    panel.className = "card";
    panel.style.cssText =
      "text-align:center;padding:28px 20px;margin-top:8px;animation:gamesPop .4s ease;";

    var emoji = document.createElement("div");
    emoji.style.cssText = "font-size:3.5rem;line-height:1;margin-bottom:8px;";
    emoji.textContent = opts.emoji || "🎉";

    var t = document.createElement("h3");
    t.style.cssText = "margin:0 0 6px;font-size:1.4rem;";
    t.textContent = opts.title || "Oyun bitti!";

    var sub = document.createElement("p");
    sub.style.cssText = "margin:0 0 18px;color:#555;";
    sub.textContent = opts.subtitle || "";

    var actions = document.createElement("div");
    actions.style.cssText = "display:flex;gap:10px;justify-content:center;flex-wrap:wrap;";

    var replay = document.createElement("button");
    replay.className = "btn btn-primary";
    replay.type = "button";
    replay.textContent = "🔄 Tekrar oyna";
    replay.addEventListener("click", opts.onReplay);

    var back = document.createElement("button");
    back.className = "btn";
    back.type = "button";
    back.textContent = "← Oyunlara dön";
    back.addEventListener("click", opts.onBack);

    actions.appendChild(replay);
    actions.appendChild(back);

    panel.appendChild(emoji);
    panel.appendChild(t);
    panel.appendChild(sub);
    panel.appendChild(actions);
    return panel;
  }

  /** Hata durumunda standart panel. */
  function errorPanel(message, onRetry, onBack) {
    var panel = document.createElement("div");
    panel.className = "card";
    panel.style.cssText = "text-align:center;padding:28px 20px;";
    var e = document.createElement("div");
    e.style.cssText = "font-size:2.5rem;margin-bottom:8px;";
    e.textContent = "😕";
    var p = document.createElement("p");
    p.style.cssText = "margin:0 0 16px;color:#b91c1c;";
    p.textContent = message || "İçerik üretilirken bir sorun oluştu.";
    var actions = document.createElement("div");
    actions.style.cssText = "display:flex;gap:10px;justify-content:center;flex-wrap:wrap;";
    var retry = document.createElement("button");
    retry.className = "btn btn-primary";
    retry.type = "button";
    retry.textContent = "↻ Tekrar dene";
    retry.addEventListener("click", onRetry);
    var back = document.createElement("button");
    back.className = "btn";
    back.type = "button";
    back.textContent = "← Oyunlara dön";
    back.addEventListener("click", onBack);
    actions.appendChild(retry);
    actions.appendChild(back);
    panel.appendChild(e);
    panel.appendChild(p);
    panel.appendChild(actions);
    return panel;
  }

  /** Ortak animasyon stillerini (bir kez) sayfaya enjekte et. */
  function ensureStyles() {
    if (document.getElementById("games-module-styles")) return;
    var style = document.createElement("style");
    style.id = "games-module-styles";
    style.textContent =
      "@keyframes gamesPop{0%{transform:scale(.85);opacity:0}100%{transform:scale(1);opacity:1}}" +
      "@keyframes gamesShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}" +
      "@keyframes gamesFlip{0%{transform:rotateY(90deg);opacity:.3}100%{transform:rotateY(0);opacity:1}}" +
      ".games-shake{animation:gamesShake .35s ease}" +
      ".games-correct{animation:gamesPop .35s ease}" +
      ".games-grid{display:grid;gap:10px}" +
      ".games-card-btn{cursor:pointer;border:none;font:inherit}";
    document.head.appendChild(style);
  }

  /** rootEl'i temizle. */
  function clearRoot() {
    while (rootEl.firstChild) rootEl.removeChild(rootEl.firstChild);
  }

  // ---------------------------------------------------------------------------
  // OYUN 1 — Hafıza / Eşleştirme
  // ---------------------------------------------------------------------------

  function buildMemoryContent(topic, grade) {
    var prompt =
      "Bir eğitim hafıza/eşleştirme oyunu için içerik üret. " +
      "Konu: \"" + topic + "\". Hedef seviye: " + gradeLabel(grade) + ". " +
      "Konuyla ilgili 6 adet terim-tanım çifti üret. Tanımlar KISA olsun (en fazla 6 kelime). " +
      "Türkçe yanıt ver. SADECE şu JSON şemasında dön: " +
      '{"pairs":[{"term":"terim","def":"kısa tanım"}]} . ' +
      "Tam olarak 6 çift olsun, fazla açıklama ekleme.";
    return generateJSON(prompt).then(function (data) {
      var pairs = (data && data.pairs) || [];
      pairs = pairs
        .filter(function (p) { return p && p.term && p.def; })
        .map(function (p) { return { term: String(p.term).trim(), def: String(p.def).trim() }; })
        .slice(0, 6);
      if (pairs.length < 3) throw new Error("Yeterli eşleştirme çifti üretilemedi.");
      return { pairs: pairs };
    });
  }

  function startMemory(content) {
    clearRoot();
    rootEl.appendChild(gameHeader("🧠 Hafıza Eşleştirme", showSelector));
    rootEl.appendChild(topicBadge());

    var status = makeStatusBar();
    status.add("moves", "Hamle", "0");
    status.add("pairs", "Eşleşen", "0/" + content.pairs.length);
    status.add("time", "Süre", "0sn");
    rootEl.appendChild(status.el);

    var hint = document.createElement("p");
    hint.style.cssText = "text-align:center;color:#777;font-size:.85rem;margin:0 0 12px;";
    hint.textContent = "Terimi tanımıyla eşleştir. İki kartı çevir!";
    rootEl.appendChild(hint);

    // Kart havuzu: her çift için terim ve tanım kartı, ortak matchId.
    var cards = [];
    content.pairs.forEach(function (p, i) {
      cards.push({ matchId: i, text: p.term, kind: "term" });
      cards.push({ matchId: i, text: p.def, kind: "def" });
    });
    cards = shuffle(cards);

    var grid = document.createElement("div");
    grid.className = "games-grid";
    grid.style.gridTemplateColumns = "repeat(auto-fill, minmax(140px, 1fr))";
    rootEl.appendChild(grid);

    var moves = 0;
    var matched = 0;
    var firstCard = null;
    var lock = false;
    var startTime = Date.now();
    var timer = setInterval(function () {
      status.set("time", Math.floor((Date.now() - startTime) / 1000) + "sn");
    }, 1000);

    function cleanup() {
      clearInterval(timer);
    }

    cards.forEach(function (c) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "games-card-btn";
      btn.style.cssText =
        "min-height:78px;border-radius:12px;padding:8px;background:#6366f1;color:#fff;" +
        "display:flex;align-items:center;justify-content:center;text-align:center;" +
        "font-size:.85rem;line-height:1.2;transition:background .2s;word-break:break-word;";
      btn.setAttribute("aria-label", "Kapalı kart");
      btn.dataset.match = String(c.matchId);
      btn.dataset.state = "down";
      var face = document.createElement("span");
      face.textContent = "?";
      face.style.fontSize = "1.6rem";
      btn.appendChild(face);

      function reveal() {
        btn.dataset.state = "up";
        btn.style.background = c.kind === "term" ? "#0ea5e9" : "#10b981";
        btn.style.animation = "gamesFlip .25s ease";
        btn.innerHTML = "";
        var s = document.createElement("span");
        s.textContent = c.text;
        btn.appendChild(s);
        btn.setAttribute("aria-label", c.text);
      }
      function hide() {
        btn.dataset.state = "down";
        btn.style.background = "#6366f1";
        btn.innerHTML = "";
        var s = document.createElement("span");
        s.textContent = "?";
        s.style.fontSize = "1.6rem";
        btn.appendChild(s);
        btn.setAttribute("aria-label", "Kapalı kart");
      }

      btn.addEventListener("click", function () {
        if (lock || btn.dataset.state !== "down") return;
        reveal();
        if (!firstCard) {
          firstCard = { btn: btn, card: c, hide: hide };
          return;
        }
        // İkinci kart
        moves++;
        status.set("moves", String(moves));
        lock = true;
        if (firstCard.card.matchId === c.matchId && firstCard.btn !== btn) {
          // Eşleşti!
          matched++;
          status.set("pairs", matched + "/" + content.pairs.length);
          btn.classList.add("games-correct");
          firstCard.btn.classList.add("games-correct");
          btn.style.background = "#16a34a";
          firstCard.btn.style.background = "#16a34a";
          btn.disabled = true;
          firstCard.btn.disabled = true;
          firstCard = null;
          lock = false;
          if (matched === content.pairs.length) {
            cleanup();
            finishMemory();
          }
        } else {
          // Yanlış
          btn.classList.add("games-shake");
          firstCard.btn.classList.add("games-shake");
          var prev = firstCard;
          setTimeout(function () {
            hide();
            prev.hide();
            btn.classList.remove("games-shake");
            prev.btn.classList.remove("games-shake");
            firstCard = null;
            lock = false;
          }, 750);
        }
      });

      grid.appendChild(btn);
    });

    function finishMemory() {
      var secs = Math.floor((Date.now() - startTime) / 1000);
      toast("Tebrikler! Tüm eşleşmeleri buldun 🎉", "success");
      rootEl.appendChild(
        resultPanel({
          emoji: "🏆",
          title: "Harika! Hepsini buldun!",
          subtitle: moves + " hamle • " + secs + " saniye",
          onReplay: function () { startMemory(content); },
          onBack: showSelector,
        })
      );
    }
  }

  // ---------------------------------------------------------------------------
  // OYUN 2 — Kelime Bulmaca (Scramble)
  // ---------------------------------------------------------------------------

  function buildScrambleContent(topic, grade) {
    var prompt =
      "Bir kelime bulmaca (scramble) oyunu için içerik üret. " +
      "Konu: \"" + topic + "\". Hedef seviye: " + gradeLabel(grade) + ". " +
      "Konuyla ilgili 6 tane TEK kelime ve her biri için kısa bir ipucu üret. " +
      "Kelimeler tek sözcük olsun (boşluk, tire içermesin), 4-9 harf arası tercih et. " +
      "Türkçe yanıt ver. SADECE şu JSON şemasında dön: " +
      '{"items":[{"word":"kelime","hint":"kısa ipucu"}]} . Tam 6 öğe.';
    return generateJSON(prompt).then(function (data) {
      var items = (data && data.items) || [];
      items = items
        .filter(function (it) { return it && it.word && it.hint; })
        .map(function (it) {
          return {
            word: String(it.word).trim().replace(/\s+/g, ""),
            hint: String(it.hint).trim(),
          };
        })
        .filter(function (it) { return it.word.length >= 2; })
        .slice(0, 6);
      if (items.length < 2) throw new Error("Yeterli kelime üretilemedi.");
      return { items: items };
    });
  }

  function startScramble(content) {
    clearRoot();
    rootEl.appendChild(gameHeader("🔤 Kelime Bulmaca", showSelector));
    rootEl.appendChild(topicBadge());

    var status = makeStatusBar();
    status.add("score", "Puan", "0");
    status.add("idx", "Soru", "1/" + content.items.length);
    rootEl.appendChild(status.el);

    var card = document.createElement("div");
    card.className = "card";
    card.style.cssText = "padding:22px;text-align:center;";
    rootEl.appendChild(card);

    var idx = 0;
    var score = 0;

    function render() {
      var item = content.items[idx];
      var scrambled = trUpper(scrambleWord(item.word));
      status.set("idx", (idx + 1) + "/" + content.items.length);
      card.innerHTML = "";

      var lbl = document.createElement("div");
      lbl.style.cssText = "color:#888;font-size:.8rem;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;";
      lbl.textContent = "Karışık harfler";
      card.appendChild(lbl);

      var scr = document.createElement("div");
      scr.style.cssText = "font-size:2rem;font-weight:800;letter-spacing:6px;color:#6366f1;margin-bottom:14px;";
      scr.textContent = scrambled;
      card.appendChild(scr);

      var hint = document.createElement("p");
      hint.style.cssText = "color:#555;margin:0 0 16px;";
      hint.textContent = "💡 İpucu: " + item.hint;
      card.appendChild(hint);

      var form = document.createElement("form");
      form.style.cssText = "display:flex;gap:8px;justify-content:center;flex-wrap:wrap;";
      var input = document.createElement("input");
      input.type = "text";
      input.autocomplete = "off";
      input.setAttribute("aria-label", "Kelime cevabı");
      input.placeholder = "Cevabını yaz...";
      input.style.cssText =
        "padding:10px 14px;border:2px solid #ddd;border-radius:10px;font-size:1rem;text-align:center;min-width:180px;";
      var submit = document.createElement("button");
      submit.type = "submit";
      submit.className = "btn btn-primary";
      submit.textContent = "Kontrol Et";
      form.appendChild(input);
      form.appendChild(submit);
      card.appendChild(form);

      var feedback = document.createElement("div");
      feedback.style.cssText = "min-height:28px;margin-top:12px;font-weight:600;";
      card.appendChild(feedback);

      var actions = document.createElement("div");
      actions.style.cssText = "margin-top:8px;display:flex;gap:8px;justify-content:center;";
      card.appendChild(actions);

      setTimeout(function () { input.focus(); }, 50);

      var answered = false;
      function normalize(s) {
        return trUpper(String(s).trim().replace(/\s+/g, ""));
      }

      function next() {
        idx++;
        if (idx >= content.items.length) finishScramble();
        else render();
      }

      function showNextButton(extraText) {
        var nb = document.createElement("button");
        nb.type = "button";
        nb.className = "btn";
        nb.textContent = idx + 1 >= content.items.length ? "Sonuçları gör →" : "Sonraki →";
        nb.addEventListener("click", next);
        actions.appendChild(nb);
        if (extraText) {
          var reveal = document.createElement("div");
          reveal.style.cssText = "margin-top:6px;color:#555;width:100%;";
          reveal.textContent = extraText;
          actions.appendChild(reveal);
        }
      }

      form.addEventListener("submit", function (e) {
        e.preventDefault();
        if (answered) return;
        answered = true;
        input.disabled = true;
        submit.disabled = true;
        if (normalize(input.value) === normalize(item.word)) {
          score += 10;
          status.set("score", String(score));
          feedback.style.color = "#16a34a";
          feedback.textContent = "✅ Doğru! Aferin!";
          card.classList.add("games-correct");
          toast("Doğru! +10 puan 🎉", "success");
          showNextButton();
        } else {
          feedback.style.color = "#dc2626";
          feedback.textContent = "❌ Olmadı.";
          card.classList.add("games-shake");
          setTimeout(function () { card.classList.remove("games-shake"); }, 400);
          showNextButton("Doğru cevap: " + trUpper(item.word));
        }
      });

      // Pas geç
      var skip = document.createElement("button");
      skip.type = "button";
      skip.className = "btn";
      skip.style.cssText = "background:transparent;color:#888;";
      skip.textContent = "Bilmiyorum, geç";
      skip.addEventListener("click", function () {
        if (answered) return;
        answered = true;
        input.disabled = true;
        submit.disabled = true;
        feedback.style.color = "#888";
        feedback.textContent = "Cevap: " + trUpper(item.word);
        showNextButton();
      });
      form.appendChild(skip);
    }

    function finishScramble() {
      var max = content.items.length * 10;
      toast("Bulmaca bitti! " + score + "/" + max + " puan", "info");
      clearRoot();
      rootEl.appendChild(gameHeader("🔤 Kelime Bulmaca", showSelector));
      rootEl.appendChild(topicBadge());
      rootEl.appendChild(
        resultPanel({
          emoji: score === max ? "🌟" : score >= max / 2 ? "👏" : "💪",
          title: "Puanın: " + score + " / " + max,
          subtitle: score === max ? "Kusursuz!" : "Tekrar deneyerek daha iyisini yapabilirsin.",
          onReplay: function () { startScramble(content); },
          onBack: showSelector,
        })
      );
    }

    render();
  }

  // ---------------------------------------------------------------------------
  // OYUN 3 — Doğru / Yanlış Hız Oyunu
  // ---------------------------------------------------------------------------

  function buildTrueFalseContent(topic, grade) {
    var prompt =
      "Bir doğru/yanlış hız oyunu için içerik üret. " +
      "Konu: \"" + topic + "\". Hedef seviye: " + gradeLabel(grade) + ". " +
      "Konuyla ilgili 8 ifade üret; bazıları doğru bazıları yanlış olsun (karışık). " +
      "İfadeler kısa ve net olsun. Türkçe yanıt ver. " +
      "SADECE şu JSON şemasında dön: " +
      '{"statements":[{"text":"ifade","answer":true}]} . ' +
      'answer alanı boolean (true=doğru, false=yanlış). Tam 8 öğe.';
    return generateJSON(prompt).then(function (data) {
      var st = (data && data.statements) || [];
      st = st
        .filter(function (s) { return s && typeof s.text === "string" && typeof s.answer === "boolean"; })
        .map(function (s) { return { text: s.text.trim(), answer: s.answer }; })
        .filter(function (s) { return s.text.length > 0; })
        .slice(0, 8);
      if (st.length < 3) throw new Error("Yeterli ifade üretilemedi.");
      return { statements: shuffle(st) };
    });
  }

  function startTrueFalse(content) {
    clearRoot();
    rootEl.appendChild(gameHeader("⚡ Doğru / Yanlış Hız", showSelector));
    rootEl.appendChild(topicBadge());

    var status = makeStatusBar();
    status.add("score", "Skor", "0");
    status.add("idx", "Soru", "1/" + content.statements.length);
    status.add("time", "Süre", "10");
    rootEl.appendChild(status.el);

    var card = document.createElement("div");
    card.className = "card";
    card.style.cssText = "padding:24px;text-align:center;min-height:160px;";
    rootEl.appendChild(card);

    var idx = 0;
    var score = 0;
    var perQuestion = 10; // saniye
    var countdown = null;

    function clearTimer() {
      if (countdown) { clearInterval(countdown); countdown = null; }
    }

    function render() {
      var item = content.statements[idx];
      status.set("idx", (idx + 1) + "/" + content.statements.length);
      card.innerHTML = "";
      card.classList.remove("games-shake", "games-correct");

      var stmt = document.createElement("p");
      stmt.style.cssText = "font-size:1.25rem;font-weight:600;margin:0 0 20px;line-height:1.4;";
      stmt.textContent = item.text;
      card.appendChild(stmt);

      var btns = document.createElement("div");
      btns.style.cssText = "display:flex;gap:12px;justify-content:center;flex-wrap:wrap;";
      var trueBtn = document.createElement("button");
      trueBtn.type = "button";
      trueBtn.className = "btn";
      trueBtn.style.cssText = "background:#16a34a;color:#fff;font-size:1.05rem;padding:12px 24px;";
      trueBtn.textContent = "✔ Doğru";
      var falseBtn = document.createElement("button");
      falseBtn.type = "button";
      falseBtn.className = "btn";
      falseBtn.style.cssText = "background:#dc2626;color:#fff;font-size:1.05rem;padding:12px 24px;";
      falseBtn.textContent = "✘ Yanlış";
      btns.appendChild(trueBtn);
      btns.appendChild(falseBtn);
      card.appendChild(btns);

      var feedback = document.createElement("div");
      feedback.style.cssText = "min-height:26px;margin-top:14px;font-weight:600;";
      card.appendChild(feedback);

      var answered = false;
      var remaining = perQuestion;
      status.set("time", String(remaining));
      clearTimer();
      countdown = setInterval(function () {
        remaining--;
        status.set("time", String(remaining));
        if (remaining <= 0) {
          handle(null); // süre doldu
        }
      }, 1000);

      function handle(userAnswer) {
        if (answered) return;
        answered = true;
        clearTimer();
        trueBtn.disabled = true;
        falseBtn.disabled = true;
        var correct = userAnswer === item.answer;
        if (userAnswer === null) {
          feedback.style.color = "#b45309";
          feedback.textContent = "⏰ Süre doldu! Doğru cevap: " + (item.answer ? "Doğru" : "Yanlış");
        } else if (correct) {
          score += 10;
          status.set("score", String(score));
          feedback.style.color = "#16a34a";
          feedback.textContent = "✅ Doğru! +10";
          card.classList.add("games-correct");
        } else {
          feedback.style.color = "#dc2626";
          feedback.textContent = "❌ Yanlış! Doğrusu: " + (item.answer ? "Doğru" : "Yanlış");
          card.classList.add("games-shake");
        }
        setTimeout(function () {
          idx++;
          if (idx >= content.statements.length) finishTF();
          else render();
        }, 1100);
      }

      trueBtn.addEventListener("click", function () { handle(true); });
      falseBtn.addEventListener("click", function () { handle(false); });
    }

    function finishTF() {
      clearTimer();
      var max = content.statements.length * 10;
      toast("Bitti! Skor: " + score + "/" + max, "info");
      clearRoot();
      rootEl.appendChild(gameHeader("⚡ Doğru / Yanlış Hız", showSelector));
      rootEl.appendChild(topicBadge());
      rootEl.appendChild(
        resultPanel({
          emoji: score === max ? "🥇" : score >= max / 2 ? "😎" : "🙂",
          title: "Skorun: " + score + " / " + max,
          subtitle: score === max ? "Mükemmel hız ve isabet!" : "Daha hızlı ve dikkatli olabilirsin.",
          onReplay: function () { startTrueFalse({ statements: shuffle(content.statements) }); },
          onBack: showSelector,
        })
      );
    }

    render();
  }

  // ---------------------------------------------------------------------------
  // OYUN 4 — Adam Asmaca (Hangman)
  // ---------------------------------------------------------------------------

  function buildHangmanContent(topic, grade) {
    var prompt =
      "Bir adam asmaca oyunu için içerik üret. " +
      "Konu: \"" + topic + "\". Hedef seviye: " + gradeLabel(grade) + ". " +
      "Konuyla ilgili 6 kelime ve her biri için kısa ipucu üret. " +
      "Kelimeler tek sözcük olsun (boşluk içermesin), 4-10 harf. " +
      "Türkçe yanıt ver. SADECE şu JSON şemasında dön: " +
      '{"items":[{"word":"kelime","hint":"kısa ipucu"}]} . Tam 6 öğe.';
    return generateJSON(prompt).then(function (data) {
      var items = (data && data.items) || [];
      items = items
        .filter(function (it) { return it && it.word && it.hint; })
        .map(function (it) {
          return {
            word: String(it.word).trim().replace(/\s+/g, ""),
            hint: String(it.hint).trim(),
          };
        })
        .filter(function (it) { return it.word.length >= 2; })
        .slice(0, 6);
      if (items.length < 1) throw new Error("Yeterli kelime üretilemedi.");
      return { items: shuffle(items) };
    });
  }

  var HANGMAN_STAGES = [
    "😀", "🙂", "😐", "😟", "😰", "😨", "💀",
  ];

  function startHangman(content) {
    clearRoot();
    rootEl.appendChild(gameHeader("🎯 Adam Asmaca", showSelector));
    rootEl.appendChild(topicBadge());

    var status = makeStatusBar();
    status.add("score", "Puan", "0");
    status.add("round", "Tur", "1/" + content.items.length);
    status.add("lives", "Can", "");
    rootEl.appendChild(status.el);

    var ALPHABET = "ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ".split("");
    var MAX_WRONG = HANGMAN_STAGES.length - 1; // 6

    var round = 0;
    var totalScore = 0;

    var area = document.createElement("div");
    area.className = "card";
    area.style.cssText = "padding:22px;text-align:center;";
    rootEl.appendChild(area);

    function letterMatch(a, b) {
      return trUpper(a) === trUpper(b);
    }

    function render() {
      var item = content.items[round];
      var target = trUpper(item.word).split("");
      var guessed = {};
      var wrong = 0;
      status.set("round", (round + 1) + "/" + content.items.length);

      function lifeEmoji() {
        var hearts = "";
        var left = MAX_WRONG - wrong;
        for (var i = 0; i < MAX_WRONG; i++) hearts += i < left ? "❤️" : "🖤";
        return hearts;
      }

      function draw() {
        status.set("lives", lifeEmoji());
        area.innerHTML = "";

        var face = document.createElement("div");
        face.style.cssText = "font-size:3rem;line-height:1;margin-bottom:8px;";
        face.textContent = HANGMAN_STAGES[Math.min(wrong, MAX_WRONG)];
        area.appendChild(face);

        var hint = document.createElement("p");
        hint.style.cssText = "color:#555;margin:0 0 14px;";
        hint.textContent = "💡 İpucu: " + item.hint;
        area.appendChild(hint);

        // Kelime gösterimi
        var wordWrap = document.createElement("div");
        wordWrap.style.cssText =
          "display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-bottom:18px;font-size:1.6rem;font-weight:800;letter-spacing:2px;";
        var revealedAll = true;
        target.forEach(function (ch) {
          var slot = document.createElement("span");
          slot.style.cssText =
            "min-width:24px;border-bottom:3px solid #6366f1;display:inline-block;padding:0 2px;color:#1f2937;";
          if (guessed[ch]) {
            slot.textContent = ch;
          } else {
            slot.textContent = " ";
            revealedAll = false;
          }
          wordWrap.appendChild(slot);
        });
        area.appendChild(wordWrap);

        // Klavye
        var kb = document.createElement("div");
        kb.style.cssText =
          "display:flex;flex-wrap:wrap;gap:6px;justify-content:center;max-width:520px;margin:0 auto;";
        ALPHABET.forEach(function (L) {
          var key = document.createElement("button");
          key.type = "button";
          key.className = "btn";
          key.textContent = L;
          key.setAttribute("aria-label", L + " harfini tahmin et");
          key.style.cssText =
            "min-width:38px;padding:8px 0;font-weight:700;background:#eef2ff;color:#3730a3;";
          var used = !!guessed[L] || (wrong >= MAX_WRONG) || revealedAll;
          var inWord = target.indexOf(L) !== -1;
          if (guessed[L]) {
            key.disabled = true;
            key.style.background = inWord ? "#16a34a" : "#9ca3af";
            key.style.color = "#fff";
          }
          key.addEventListener("click", function () { guess(L); });
          kb.appendChild(key);
        });
        area.appendChild(kb);

        var feedback = document.createElement("div");
        feedback.id = "hm-feedback";
        feedback.style.cssText = "min-height:24px;margin-top:14px;font-weight:600;";
        area.appendChild(feedback);
      }

      var finished = false;

      function guess(L) {
        if (finished || guessed[L]) return;
        guessed[L] = true;
        if (target.indexOf(L) === -1) {
          wrong++;
          var f = document.getElementById("hm-feedback");
          if (f) { f.style.color = "#dc2626"; f.textContent = "❌ " + L + " yok!"; }
          area.classList.add("games-shake");
          setTimeout(function () { area.classList.remove("games-shake"); }, 350);
        }
        draw();
        evaluate();
      }

      function evaluate() {
        var won = target.every(function (ch) { return guessed[ch]; });
        if (won) {
          finished = true;
          var pts = (MAX_WRONG - wrong) + 4; // kalan cana göre puan
          totalScore += pts;
          status.set("score", String(totalScore));
          toast("Kelimeyi buldun! +" + pts + " puan 🎉", "success");
          endRound(true, item.word, pts);
        } else if (wrong >= MAX_WRONG) {
          finished = true;
          toast("Canlar bitti 💀", "error");
          endRound(false, item.word, 0);
        }
      }

      function endRound(won, word, pts) {
        var f = document.getElementById("hm-feedback");
        if (f) {
          f.style.color = won ? "#16a34a" : "#dc2626";
          f.textContent = won
            ? "🎉 Doğru! +" + pts + " puan"
            : "💀 Kelime: " + trUpper(word);
        }
        // Klavyeyi kilitle
        var keys = area.querySelectorAll("button");
        for (var i = 0; i < keys.length; i++) keys[i].disabled = true;

        var nextWrap = document.createElement("div");
        nextWrap.style.cssText = "margin-top:14px;";
        var nb = document.createElement("button");
        nb.type = "button";
        nb.className = "btn btn-primary";
        nb.textContent = round + 1 >= content.items.length ? "Sonuçları gör →" : "Sonraki kelime →";
        nb.addEventListener("click", function () {
          round++;
          if (round >= content.items.length) finishHangman();
          else render();
        });
        nextWrap.appendChild(nb);
        area.appendChild(nextWrap);
      }

      // Fiziksel klavye desteği
      function onKeyDown(e) {
        if (finished) return;
        var ch = trUpper(e.key);
        if (ch.length === 1 && ALPHABET.indexOf(ch) !== -1) {
          guess(ch);
        }
      }
      // Önceki dinleyiciyi temizlemek için sakla
      if (rootEl._hmKeyHandler) document.removeEventListener("keydown", rootEl._hmKeyHandler);
      rootEl._hmKeyHandler = onKeyDown;
      document.addEventListener("keydown", onKeyDown);

      draw();
    }

    function finishHangman() {
      if (rootEl._hmKeyHandler) {
        document.removeEventListener("keydown", rootEl._hmKeyHandler);
        rootEl._hmKeyHandler = null;
      }
      clearRoot();
      rootEl.appendChild(gameHeader("🎯 Adam Asmaca", showSelector));
      rootEl.appendChild(topicBadge());
      rootEl.appendChild(
        resultPanel({
          emoji: "🏁",
          title: "Toplam puan: " + totalScore,
          subtitle: content.items.length + " kelime oynandı.",
          onReplay: function () { startHangman({ items: shuffle(content.items) }); },
          onBack: showSelector,
        })
      );
    }

    render();
  }

  // ---------------------------------------------------------------------------
  // OYUN 5 (opsiyonel) — Quiz Yarışı
  // ---------------------------------------------------------------------------

  function buildQuizContent(topic, grade) {
    var prompt =
      "Bir çoktan seçmeli quiz yarışı için içerik üret. " +
      "Konu: \"" + topic + "\". Hedef seviye: " + gradeLabel(grade) + ". " +
      "Konuyla ilgili 6 soru üret. Her sorunun 4 şıkkı (options) ve doğru şıkkın indeksi (answer, 0-3) olsun. " +
      "Türkçe yanıt ver. SADECE şu JSON şemasında dön: " +
      '{"questions":[{"q":"soru","options":["a","b","c","d"],"answer":0}]} . Tam 6 soru.';
    return generateJSON(prompt).then(function (data) {
      var qs = (data && data.questions) || [];
      qs = qs
        .filter(function (q) {
          return q && q.q && Array.isArray(q.options) && q.options.length >= 2 &&
            typeof q.answer === "number" && q.answer >= 0 && q.answer < q.options.length;
        })
        .map(function (q) {
          return {
            q: String(q.q).trim(),
            options: cleanStrings(q.options),
            answer: q.answer,
          };
        })
        .filter(function (q) { return q.options.length >= 2 && q.answer < q.options.length; })
        .slice(0, 6);
      if (qs.length < 2) throw new Error("Yeterli soru üretilemedi.");
      return { questions: qs };
    });
  }

  function startQuiz(content) {
    clearRoot();
    rootEl.appendChild(gameHeader("🏆 Quiz Yarışı", showSelector));
    rootEl.appendChild(topicBadge());

    var status = makeStatusBar();
    status.add("score", "Puan", "0");
    status.add("idx", "Soru", "1/" + content.questions.length);
    rootEl.appendChild(status.el);

    var card = document.createElement("div");
    card.className = "card";
    card.style.cssText = "padding:22px;";
    rootEl.appendChild(card);

    var idx = 0;
    var score = 0;

    function render() {
      var q = content.questions[idx];
      status.set("idx", (idx + 1) + "/" + content.questions.length);
      card.innerHTML = "";

      var qEl = document.createElement("p");
      qEl.style.cssText = "font-size:1.15rem;font-weight:700;margin:0 0 16px;line-height:1.4;";
      qEl.textContent = (idx + 1) + ". " + q.q;
      card.appendChild(qEl);

      var list = document.createElement("div");
      list.style.cssText = "display:grid;gap:10px;";
      card.appendChild(list);

      var feedback = document.createElement("div");
      feedback.style.cssText = "min-height:26px;margin-top:14px;font-weight:600;";

      var answered = false;
      var optBtns = [];

      q.options.forEach(function (opt, oi) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "btn";
        b.style.cssText =
          "text-align:left;padding:12px 16px;background:#f3f4f6;color:#1f2937;font-size:1rem;width:100%;";
        b.textContent = String.fromCharCode(65 + oi) + ") " + opt;
        b.addEventListener("click", function () {
          if (answered) return;
          answered = true;
          optBtns.forEach(function (x) { x.disabled = true; });
          if (oi === q.answer) {
            score += 10;
            status.set("score", String(score));
            b.style.background = "#16a34a";
            b.style.color = "#fff";
            feedback.style.color = "#16a34a";
            feedback.textContent = "✅ Doğru! +10";
            card.classList.add("games-correct");
            setTimeout(function () { card.classList.remove("games-correct"); }, 350);
            toast("Doğru! 🎉", "success");
          } else {
            b.style.background = "#dc2626";
            b.style.color = "#fff";
            optBtns[q.answer].style.background = "#16a34a";
            optBtns[q.answer].style.color = "#fff";
            feedback.style.color = "#dc2626";
            feedback.textContent = "❌ Yanlış. Doğru cevap işaretlendi.";
            card.classList.add("games-shake");
            setTimeout(function () { card.classList.remove("games-shake"); }, 350);
          }
          var nb = document.createElement("button");
          nb.type = "button";
          nb.className = "btn btn-primary";
          nb.style.marginTop = "12px";
          nb.textContent = idx + 1 >= content.questions.length ? "Sonuçları gör →" : "Sonraki soru →";
          nb.addEventListener("click", function () {
            idx++;
            if (idx >= content.questions.length) finishQuiz();
            else render();
          });
          card.appendChild(nb);
        });
        optBtns.push(b);
        list.appendChild(b);
      });

      card.appendChild(feedback);
    }

    function finishQuiz() {
      var max = content.questions.length * 10;
      toast("Quiz bitti! " + score + "/" + max, "info");
      clearRoot();
      rootEl.appendChild(gameHeader("🏆 Quiz Yarışı", showSelector));
      rootEl.appendChild(topicBadge());
      rootEl.appendChild(
        resultPanel({
          emoji: score === max ? "🥇" : score >= max / 2 ? "👍" : "📚",
          title: "Puanın: " + score + " / " + max,
          subtitle: score === max ? "Tam isabet!" : "Tekrar oynayarak pekiştir.",
          onReplay: function () { startQuiz(content); },
          onBack: showSelector,
        })
      );
    }

    render();
  }

  // ---------------------------------------------------------------------------
  // Oyun kaydı (list + başlatıcılar)
  // ---------------------------------------------------------------------------

  var GAMES = [
    {
      id: "memory",
      name: "Hafıza Eşleştirme",
      icon: "🧠",
      desc: "Terimleri tanımlarıyla eşleştir; hamle ve sürene meydan oku.",
      build: buildMemoryContent,
      start: startMemory,
      loading: "Eşleştirme kartları hazırlanıyor...",
    },
    {
      id: "scramble",
      name: "Kelime Bulmaca",
      icon: "🔤",
      desc: "Karışık harfleri çöz, ipucundan kelimeyi bul.",
      build: buildScrambleContent,
      start: startScramble,
      loading: "Bulmaca kelimeleri hazırlanıyor...",
    },
    {
      id: "truefalse",
      name: "Doğru / Yanlış Hız",
      icon: "⚡",
      desc: "Geri sayım dolmadan ifadelere doğru mu yanlış mı de.",
      build: buildTrueFalseContent,
      start: startTrueFalse,
      loading: "İfadeler hazırlanıyor...",
    },
    {
      id: "hangman",
      name: "Adam Asmaca",
      icon: "🎯",
      desc: "İpucuyla harf tahmin et, canların bitmeden kelimeyi bul.",
      build: buildHangmanContent,
      start: startHangman,
      loading: "Asmaca kelimeleri hazırlanıyor...",
    },
    {
      id: "quiz",
      name: "Quiz Yarışı",
      icon: "🏆",
      desc: "Çoktan seçmeli sorularla bilgini yarıştır.",
      build: buildQuizContent,
      start: startQuiz,
      loading: "Quiz soruları hazırlanıyor...",
    },
  ];

  function findGame(id) {
    for (var i = 0; i < GAMES.length; i++) if (GAMES[i].id === id) return GAMES[i];
    return null;
  }

  // Sözleşmedeki sade liste (build/start sızdırmadan).
  var publicList = GAMES.map(function (g) {
    return { id: g.id, name: g.name, icon: g.icon, desc: g.desc };
  });

  // ---------------------------------------------------------------------------
  // Bir oyunu başlat (içerik üret/cache + start)
  // ---------------------------------------------------------------------------

  function launchGame(game) {
    if (!mountCtx.topic) {
      toast("Önce bir konu seçilmeli.", "error");
      return;
    }
    getContent(game.id, mountCtx, game.build, game.loading)
      .then(function (content) {
        game.start(content);
      })
      .catch(function (err) {
        clearRoot();
        rootEl.appendChild(gameHeader(game.icon + " " + game.name, showSelector));
        rootEl.appendChild(topicBadge());
        rootEl.appendChild(
          errorPanel(
            (err && err.message) ? err.message : "İçerik üretilemedi.",
            function () { launchGame(game); },
            showSelector
          )
        );
      });
  }

  // ---------------------------------------------------------------------------
  // Oyun seçici ekran
  // ---------------------------------------------------------------------------

  function showSelector() {
    // Adam asmaca klavye dinleyicisi kalmışsa temizle
    if (rootEl._hmKeyHandler) {
      document.removeEventListener("keydown", rootEl._hmKeyHandler);
      rootEl._hmKeyHandler = null;
    }
    clearRoot();

    var title = document.createElement("h2");
    title.style.cssText = "text-align:center;margin:0 0 4px;";
    title.textContent = "🎮 Oyunlar";
    rootEl.appendChild(title);
    rootEl.appendChild(topicBadge());

    if (!mountCtx.topic) {
      var warn = document.createElement("div");
      warn.className = "card";
      warn.style.cssText = "text-align:center;padding:24px;color:#b45309;";
      warn.textContent = "Oyunları oynamak için önce bir konu seçin.";
      rootEl.appendChild(warn);
      return;
    }

    var grid = document.createElement("div");
    grid.className = "games-grid";
    grid.style.gridTemplateColumns = "repeat(auto-fill, minmax(220px, 1fr))";
    rootEl.appendChild(grid);

    GAMES.forEach(function (g) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "card games-card-btn";
      btn.setAttribute("aria-label", g.name + " oyununu başlat");
      btn.style.cssText =
        "text-align:left;padding:18px;display:flex;flex-direction:column;gap:6px;" +
        "transition:transform .15s, box-shadow .15s;background:#fff;";
      btn.addEventListener("mouseenter", function () {
        btn.style.transform = "translateY(-3px)";
        btn.style.boxShadow = "0 8px 20px rgba(0,0,0,.12)";
      });
      btn.addEventListener("mouseleave", function () {
        btn.style.transform = "";
        btn.style.boxShadow = "";
      });

      var icon = document.createElement("div");
      icon.style.cssText = "font-size:2.2rem;line-height:1;";
      icon.textContent = g.icon;

      var name = document.createElement("div");
      name.style.cssText = "font-weight:700;font-size:1.05rem;";
      name.textContent = g.name;

      var desc = document.createElement("div");
      desc.style.cssText = "color:#666;font-size:.85rem;line-height:1.3;";
      desc.textContent = g.desc;

      btn.appendChild(icon);
      btn.appendChild(name);
      btn.appendChild(desc);
      btn.addEventListener("click", function () { launchGame(g); });
      grid.appendChild(btn);
    });
  }

  // ---------------------------------------------------------------------------
  // Genel API
  // ---------------------------------------------------------------------------

  function mount(containerSel, opts) {
    opts = opts || {};
    var el = typeof containerSel === "string"
      ? document.querySelector(containerSel)
      : containerSel;
    if (!el) {
      console.error("[games] Hedef eleman bulunamadı:", containerSel);
      return;
    }
    ensureStyles();
    rootEl = el;
    mountCtx = { topic: (opts.topic || "").trim(), grade: opts.grade || "" };
    showSelector();
  }

  return {
    list: publicList,
    mount: mount,
  };
})();
