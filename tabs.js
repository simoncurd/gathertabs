document.addEventListener('DOMContentLoaded', async () => {
  const domainsList = document.getElementById('domains-list');
  const tabsList = document.getElementById('tabs-list');
  const gatherButton = document.getElementById('gather-all-tabs');
  const refreshButton = document.getElementById('refresh-view-button');
  let currentDomain = null;
  let draggedItem = null;
  let isRefreshing = false;

  // Debounced refresh function
  async function debouncedRefresh() {
    if (isRefreshing) return;
    isRefreshing = true;
    try {
      await refreshTabs();
    } finally {
      isRefreshing = false;
    }
  }

  // Add message listener for refresh command
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'refresh') {
      debouncedRefresh();
    }
  });

  // Add click handler for refresh button
  refreshButton.addEventListener('click', debouncedRefresh);

  // Function to ensure GatherTabs is the first tab
  async function ensureGatherTabsIsFirst() {
    const allTabs = await chrome.tabs.query({});
    const gatherTabsTab = allTabs.find(tab => 
      tab.url.startsWith('chrome-extension://') && 
      tab.url.includes('tabs.html')
    );
    
    if (gatherTabsTab && gatherTabsTab.index !== 0) {
      await chrome.tabs.move(gatherTabsTab.id, { index: 0 });
    }
  }

  // Function to handle drag start
  function handleDragStart(e) {
    draggedItem = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');
  }

  // Function to handle drag over
  function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    const draggingItem = document.querySelector('.dragging');
    const siblings = [...domainsList.querySelectorAll('.domain-item:not(.dragging)')];
    
    const nextSibling = siblings.find(sibling => {
      const box = sibling.getBoundingClientRect();
      return e.clientY < box.top + box.height / 2;
    });
    
    domainsList.insertBefore(draggingItem, nextSibling);
  }

  // Function to handle drag end
  async function handleDragEnd() {
    this.classList.remove('dragging');
    draggedItem = null;
    
    try {
      // Get the new order of domains
      const newOrder = [...domainsList.querySelectorAll('.domain-item')].map(item => 
        item.querySelector('.domain-name').textContent
      );
      
      // Save the new order
      await chrome.storage.local.set({ domainOrder: newOrder });
      
      // Get all tabs and group them by domain
      const allTabs = await chrome.tabs.query({});
      const domainGroups = groupTabsByDomain(allTabs);
      
      // Calculate the new tab order
      let newTabOrder = [];
      newOrder.forEach(domain => {
        if (domainGroups[domain]) {
          newTabOrder = newTabOrder.concat(domainGroups[domain]);
        }
      });
      
      // Move tabs to match the new order
      for (let i = 0; i < newTabOrder.length; i++) {
        try {
          await chrome.tabs.move(newTabOrder[i].id, { index: i + 1 });
        } catch (error) {
          console.log(`Tab ${newTabOrder[i].id} no longer exists, skipping...`);
        }
      }
      
      // Update the current domain's tabs if it exists
      if (currentDomain && domainGroups[currentDomain]) {
        renderTabs(domainGroups[currentDomain]);
      }
    } catch (error) {
      console.error('Error during drag end:', error);
    }
  }

  // Function to extract domain from URL
  function getDomain(url) {
    try {
      const domain = new URL(url).hostname;
      return domain.startsWith('www.') ? domain.substring(4) : domain;
    } catch (e) {
      return url;
    }
  }

  // Function to group tabs by domain
  function groupTabsByDomain(tabs) {
    const domainGroups = {};
    
    tabs.forEach(tab => {
      if (tab.url.startsWith('chrome-extension://')) return;
      
      const domain = getDomain(tab.url);
      if (!domainGroups[domain]) {
        domainGroups[domain] = [];
      }
      domainGroups[domain].push(tab);
    });

    return domainGroups;
  }

  // Function to render tabs for a domain
  function renderTabs(tabs) {
    tabsList.innerHTML = '';
    tabs.forEach(tab => {
      const tabItem = document.createElement('div');
      tabItem.className = 'tab-item';
      
      const favicon = document.createElement('img');
      favicon.src = tab.favIconUrl || 'icons/default-favicon.png';
      favicon.onerror = () => favicon.src = 'icons/default-favicon.png';
      
      const title = document.createElement('span');
      title.className = 'tab-title';
      title.textContent = tab.title;

      const url = document.createElement('span');
      url.className = 'tab-url';
      url.textContent = tab.url;
      
      const content = document.createElement('div');
      content.className = 'tab-content';
      content.appendChild(title);
      content.appendChild(url);

      const closeButton = document.createElement('button');
      closeButton.className = 'close-tab';
      closeButton.title = 'Close tab';
      closeButton.innerHTML = `
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>
      `;
      
      closeButton.addEventListener('click', async (e) => {
        e.stopPropagation();
        const selectedDomain = currentDomain;
        try {
          await chrome.tabs.remove(tab.id);
          // Get updated tabs and domain groups
          const allTabs = await chrome.tabs.query({});
          const domainGroups = groupTabsByDomain(allTabs);
          
          // Update the current domain's tabs if it exists
          if (currentDomain && domainGroups[currentDomain]) {
            renderTabs(domainGroups[currentDomain]);
          }
          
          // Update the domain item's tab count
          const domainItem = document.querySelector('.domain-item.active');
          if (domainItem) {
            const tabCount = domainItem.querySelector('.tab-count');
            const newCount = domainGroups[currentDomain]?.length || 0;
            tabCount.textContent = newCount;
            
            // If this was the last tab in the domain, remove the domain item
            if (newCount === 0) {
              domainItem.remove();
              currentDomain = null;
              tabsList.innerHTML = '';
            }
          }
        } catch (error) {
          console.error('Error closing tab:', error);
        }
      });
      
      tabItem.appendChild(favicon);
      tabItem.appendChild(content);
      tabItem.appendChild(closeButton);
      
      tabItem.addEventListener('click', () => {
        chrome.tabs.update(tab.id, { active: true });
        chrome.windows.update(tab.windowId, { focused: true });
      });
      
      tabsList.appendChild(tabItem);
    });
  }

  // Function to refresh the tab list
  async function refreshTabs() {
    try {
      domainsList.innerHTML = '';
      tabsList.innerHTML = '';
      
      const tabs = await chrome.tabs.query({});
      const domainGroups = groupTabsByDomain(tabs);
      
      // Get saved order from storage
      const result = await chrome.storage.local.get(['domainOrder']);
      const savedOrder = result.domainOrder || [];
      
      // Filter out domains that no longer exist and remove duplicates
      const validOrder = [...new Set(savedOrder.filter(domain => domainGroups[domain]))];
      
      // Sort domains according to saved order
      const sortedDomains = Object.keys(domainGroups).sort((a, b) => {
        const aIndex = validOrder.indexOf(a);
        const bIndex = validOrder.indexOf(b);
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      });
      
      // Save the updated order
      await chrome.storage.local.set({ domainOrder: sortedDomains });
      
      // Create domain items
      const fragment = document.createDocumentFragment();
      
      for (const domain of sortedDomains) {
        const domainItem = document.createElement('div');
        domainItem.className = 'domain-item';
        domainItem.draggable = true;
        const count = domainGroups[domain].length;
        
        const domainContent = document.createElement('div');
        domainContent.className = 'domain-content';
        
        const dragHandle = document.createElement('div');
        dragHandle.className = 'domain-drag-handle';
        dragHandle.innerHTML = `
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M10 9h4V6h3l-5-5-5 5h3v3zm-1 1H6V7l-5 5 5 5v-3h3v-4zm14 2l-5-5v3h-3v4h3v3l5-5zm-9 3h-4v3H7l5 5 5-5h-3v-3z"/>
          </svg>
        `;
        
        const firstTab = domainGroups[domain][0];
        const favicon = document.createElement('img');
        favicon.className = 'domain-favicon';
        favicon.src = firstTab.favIconUrl || 'icons/default-favicon.png';
        favicon.onerror = () => favicon.src = 'icons/default-favicon.png';
        
        const domainName = document.createElement('span');
        domainName.className = 'domain-name';
        domainName.textContent = domain;
        
        const tabCount = document.createElement('span');
        tabCount.className = 'tab-count';
        tabCount.textContent = count;
        
        const closeButton = document.createElement('button');
        closeButton.className = 'close-domain';
        closeButton.title = 'Close all tabs for this domain';
        closeButton.innerHTML = `
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        `;
        
        closeButton.addEventListener('click', async (e) => {
          e.stopPropagation();
          await closeDomainTabs(domain, domainGroups);
        });
        
        domainContent.appendChild(dragHandle);
        domainContent.appendChild(favicon);
        domainContent.appendChild(domainName);
        domainContent.appendChild(tabCount);
        
        domainItem.appendChild(domainContent);
        domainItem.appendChild(closeButton);
        
        domainItem.addEventListener('dragstart', handleDragStart);
        domainItem.addEventListener('dragover', handleDragOver);
        domainItem.addEventListener('dragend', handleDragEnd);
        
        domainItem.addEventListener('click', () => {
          currentDomain = domain;
          document.querySelectorAll('.domain-item').forEach(item => {
            item.classList.remove('active');
          });
          domainItem.classList.add('active');
          renderTabs(domainGroups[domain]);
        });
        
        if (domain === currentDomain) {
          domainItem.classList.add('active');
        }
        
        fragment.appendChild(domainItem);
      }
      
      domainsList.appendChild(fragment);
      
      if (sortedDomains.length > 0 && !currentDomain) {
        const firstDomain = sortedDomains[0];
        currentDomain = firstDomain;
        const firstDomainItem = domainsList.querySelector('.domain-item');
        if (firstDomainItem) {
          firstDomainItem.classList.add('active');
          renderTabs(domainGroups[firstDomain]);
        }
      }
    } catch (error) {
      console.error('Error refreshing tabs:', error);
    }
  }

  // Function to close all tabs for a domain
  async function closeDomainTabs(domain, domainGroups) {
    const tabs = domainGroups[domain];
    if (!tabs) return;

    try {
      // Remove the domain from storage first
      const currentOrder = await chrome.storage.local.get(['domainOrder']);
      const newOrder = (currentOrder.domainOrder || []).filter(d => d !== domain);
      await chrome.storage.local.set({ domainOrder: newOrder });

      // Close all tabs for the domain
      for (const tab of tabs) {
        try {
          await chrome.tabs.remove(tab.id);
        } catch (error) {
          console.log(`Tab ${tab.id} no longer exists, skipping...`);
        }
      }

      // If this was the current domain, clear the selection
      if (currentDomain === domain) {
        currentDomain = null;
        tabsList.innerHTML = '';
      }
    } catch (error) {
      console.error('Error closing domain tabs:', error);
    }
  }

  // Initial load
  await ensureGatherTabsIsFirst();
  await refreshTabs();

  // Refresh when tabs change
  chrome.tabs.onCreated.addListener(debouncedRefresh);
  chrome.tabs.onRemoved.addListener(debouncedRefresh);
  chrome.tabs.onUpdated.addListener(debouncedRefresh);

  // Function to gather all tabs into current window
  async function gatherAllTabs() {
    const currentWindow = await chrome.windows.getCurrent();
    const allTabs = await chrome.tabs.query({});
    
    // Find the GatherTabs tab
    const gatherTabsTab = allTabs.find(tab => 
      tab.url.startsWith('chrome-extension://') && 
      tab.url.includes('gathertabs.html')
    );
    
    // Move the GatherTabs tab to the first position if it exists
    if (gatherTabsTab) {
      await chrome.tabs.move(gatherTabsTab.id, { index: 0 });
    }
    
    // Move other tabs to the current window
    const tabsToMove = allTabs.filter(tab => 
      tab.windowId !== currentWindow.id && 
      !(tab.url.startsWith('chrome-extension://') && tab.url.includes('gathertabs.html'))
    );
    
    for (const tab of tabsToMove) {
      await chrome.tabs.move(tab.id, {
        windowId: currentWindow.id,
        index: -1
      });
    }
    
    refreshTabs();
  }

  // Add click handler for gather button
  gatherButton.addEventListener('click', gatherAllTabs);
}); 