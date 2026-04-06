// Open side panel when the extension icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
  // Only work on arxiv pages
  if (!tab.url?.match(/arxiv\.org/)) {
    // Still open the panel but it will show a message
  }
  await chrome.sidePanel.open({ tabId: tab.id });
  // Send the current tab URL to the side panel
  setTimeout(() => {
    chrome.runtime.sendMessage({ type: "TAB_URL", url: tab.url });
  }, 500);
});

// Allow side panel to request the current tab URL
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_TAB_URL") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      sendResponse({ url: tabs[0]?.url || "" });
    });
    return true; // async response
  }
});
