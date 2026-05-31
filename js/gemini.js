/* Akıllı Ders Platformu — Gemini API entegrasyon modülü */
window.App = window.App || {};

window.App.gemini = {
  // Anahtarı localStorage'a yazar
  setApiKey(key) {
    const cfg = window.App.config;
    localStorage.setItem(cfg.STORAGE_KEY, (key || "").trim());
  },

  // Anahtarı localStorage'dan okur
  getApiKey() {
    const cfg = window.App.config;
    return localStorage.getItem(cfg.STORAGE_KEY) || "";
  },

  // Anahtar var mı?
  hasKey() {
    return this.getApiKey().trim().length > 0;
  },

  // Metin üretimi: candidates[0].content.parts[].text birleştirilip string döner
  async generateText(prompt) {
    if (!this.hasKey()) {
      throw new Error("API anahtarı gerekli");
    }
    const cfg = window.App.config;
    const key = encodeURIComponent(this.getApiKey().trim());
    const url = `${cfg.API_BASE}/models/${cfg.TEXT_MODEL}:generateContent?key=${key}`;

    const body = {
      contents: [{ parts: [{ text: prompt }] }]
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      // Hata gövdesini de oku, anlamlı hata mesajı oluştur
      let detail = "";
      try {
        detail = await res.text();
      } catch (e) {
        detail = "(gövde okunamadı)";
      }
      throw new Error(`Gemini metin isteği başarısız (HTTP ${res.status}): ${detail}`);
    }

    const data = await res.json();
    const cand = data && data.candidates && data.candidates[0];
    const parts = cand && cand.content && cand.content.parts;
    if (!Array.isArray(parts)) {
      throw new Error("Gemini yanıtında metin bulunamadı.");
    }
    // Tüm metin parçalarını birleştir
    return parts
      .map((p) => (p && typeof p.text === "string" ? p.text : ""))
      .join("");
  },

  // JSON üretimi: sadece JSON iste, kod çitlerini temizle, parse et
  async generateJSON(prompt) {
    if (!this.hasKey()) {
      throw new Error("API anahtarı gerekli");
    }

    const talimat =
      "\n\nYanıtı SADECE geçerli JSON olarak ver; kod çiti, açıklama veya ekstra metin ekleme.";
    const raw = await this.generateText(prompt + talimat);

    // ```json ... ``` veya ``` ... ``` kod çitlerini temizle
    let temiz = raw.trim();
    temiz = temiz
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    // 1. deneme: doğrudan parse
    try {
      return JSON.parse(temiz);
    } catch (e1) {
      // 2. deneme: metindeki ilk { ... } veya [ ... ] bloğunu regex ile bul
      const blok = this._ilkJsonBlok(raw);
      if (blok) {
        try {
          return JSON.parse(blok);
        } catch (e2) {
          // düşer, aşağıda hata fırlatılır
        }
      }
      throw new Error(
        "Gemini yanıtı geçerli JSON olarak ayrıştırılamadı. Ham yanıt: " +
          raw.slice(0, 500)
      );
    }
  },

  // Metinden ilk dengeli { } veya [ ] bloğunu çıkarır (yardımcı)
  _ilkJsonBlok(metin) {
    if (typeof metin !== "string") return null;
    const acObj = metin.indexOf("{");
    const acArr = metin.indexOf("[");

    // Hangisi önce geliyorsa onunla başla
    let baslangic;
    if (acObj === -1 && acArr === -1) return null;
    if (acObj === -1) baslangic = acArr;
    else if (acArr === -1) baslangic = acObj;
    else baslangic = Math.min(acObj, acArr);

    const acKar = metin[baslangic];
    const kapKar = acKar === "{" ? "}" : "]";

    // Dengeli parantez eşlemesi (string içindeki parantezleri atla)
    let derinlik = 0;
    let stringIci = false;
    let kacis = false;
    for (let i = baslangic; i < metin.length; i++) {
      const c = metin[i];
      if (stringIci) {
        if (kacis) {
          kacis = false;
        } else if (c === "\\") {
          kacis = true;
        } else if (c === '"') {
          stringIci = false;
        }
        continue;
      }
      if (c === '"') {
        stringIci = true;
      } else if (c === acKar) {
        derinlik++;
      } else if (c === kapKar) {
        derinlik--;
        if (derinlik === 0) {
          return metin.slice(baslangic, i + 1);
        }
      }
    }
    return null;
  },

  // Görsel üretimi: başarısızlıkta null döner (throw etmez)
  async generateImage(prompt) {
    try {
      if (!this.hasKey()) {
        return null;
      }
      const cfg = window.App.config;
      const key = encodeURIComponent(this.getApiKey().trim());
      const url = `${cfg.API_BASE}/models/${cfg.IMAGE_MODEL}:generateContent?key=${key}`;

      // Görsel prompt'unu İngilizce, eğitici, renkli, çocuk dostu illüstrasyona güçlendir
      const gucluPrompt =
        "Create a colorful, friendly, educational illustration for children. " +
        "Bright cheerful colors, simple clean cartoon style, no text or letters in the image. " +
        "Subject: " +
        prompt;

      const body = {
        contents: [{ parts: [{ text: gucluPrompt }] }],
        generationConfig: {
          responseModalities: ["IMAGE", "TEXT"]
        }
      };

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        return null;
      }

      const data = await res.json();
      const cands = (data && data.candidates) || [];
      // Tüm candidate'lerin parts'ları içinde inlineData ara
      for (const cand of cands) {
        const parts = (cand && cand.content && cand.content.parts) || [];
        for (const p of parts) {
          const inline = p && (p.inlineData || p.inline_data);
          if (inline && inline.data) {
            const mime = inline.mimeType || inline.mime_type || "image/png";
            return `data:${mime};base64,${inline.data}`;
          }
        }
      }
      // Görsel bulunamadı
      return null;
    } catch (e) {
      // Hata olursa sessizce null
      return null;
    }
  }
};
