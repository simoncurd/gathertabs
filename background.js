// Listen for extension icon click
chrome.action.onClicked.addListener(async (tab) => {
  // Get all tabs in the current window
  const tabs = await chrome.tabs.query({ currentWindow: true });
  
  // Check if GatherTabs is already open in this window
  const existingTab = tabs.find(t => 
    t.url.startsWith('chrome-extension://') && 
    t.url.includes('tabs.html')
  );
  
  if (existingTab) {
    // If it exists, move it to the first position and focus it
    await chrome.tabs.move(existingTab.id, { index: 0 });
    await chrome.tabs.update(existingTab.id, { active: true });
  } else {
    // If it doesn't exist, create it as the first tab
    await chrome.tabs.create({
      url: 'tabs.html',
      index: 0,
      active: true
    });
  }
});

// Listen for tab activation
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  if (tab.url.startsWith('chrome-extension://') && tab.url.includes('tabs.html')) {
    // Send a message to the content script to refresh the view
    chrome.tabs.sendMessage(activeInfo.tabId, { action: 'refresh' });
  }
});

// Listen for tab reordering
chrome.tabs.onMoved.addListener(async (tabId, moveInfo) => {
  const tab = await chrome.tabs.get(tabId);
  if (tab.url.startsWith('chrome-extension://') && tab.url.includes('tabs.html')) {
    // If the GatherTabs tab was moved, move it back to the first position
    await chrome.tabs.move(tabId, { index: 0 });
  }
}); 