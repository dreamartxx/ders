/* Akıllı Ders Platformu — global yapılandırma */
window.App = window.App || {};
window.App.config = {
  TEXT_MODEL: "gemini-2.5-flash",
  IMAGE_MODEL: "gemini-2.5-flash-image",
  API_BASE: "https://generativelanguage.googleapis.com/v1beta",
  GRADES: { ilkokul: "İlkokul", ortaokul: "Ortaokul", lise: "Lise" },
  STORAGE_KEY: "gemini_api_key"
};
window.App.state = { topic: "", grade: "ilkokul" };
