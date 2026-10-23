(() => {
  const host = window.location.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1';
  window.BUSINESSPILOT_API_URL = isLocal ? window.location.origin : 'https://businesspilot-ai-backend-yf1s.onrender.com';
})();
