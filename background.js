const SUPPORTED_URLS = [
  "https://claude.ai/",
  "https://chat.openai.com/",
  "https://chatgpt.com/",
  "https://gemini.google.com/"
];

function isSupportedUrl(url) {
  return SUPPORTED_URLS.some(pattern => url.startsWith(pattern));
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url && isSupportedUrl(tab.url)) {
    chrome.tabs.sendMessage(tabId, { type: "framer-tab-ready", url: tab.url }).catch(() => {
      // Content script may not be ready yet — ignore
    });
  }
});
