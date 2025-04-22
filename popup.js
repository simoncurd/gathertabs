document.addEventListener('DOMContentLoaded', () => {
  const domainsList = document.getElementById('domains-list');
  const tabsList = document.getElementById('tabs-list');
  let currentDomain = null;

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
      const domain = getDomain(tab.url);
      if (!domainGroups[domain]) {
        domainGroups[domain] = [];
      }
      domainGroups[domain].push(tab);
    });

    return domainGroups;
  }

  // Function to render domains list
  function renderDomains(domainGroups) {
    domainsList.innerHTML = '';
    Object.keys(domainGroups).sort().forEach(domain => {
      const domainItem = document.createElement('div');
      domainItem.className = 'domain-item';
      domainItem.textContent = domain;
      domainItem.addEventListener('click', () => {
        currentDomain = domain;
        document.querySelectorAll('.domain-item').forEach(item => {
          item.classList.remove('active');
        });
        domainItem.classList.add('active');
        renderTabs(domainGroups[domain]);
      });
      domainsList.appendChild(domainItem);
    });
  }

  // Function to render tabs for a domain
  function renderTabs(tabs) {
    tabsList.innerHTML = '';
    tabs.forEach(tab => {
      const tabItem = document.createElement('div');
      tabItem.className = 'tab-item';
      
      const favicon = document.createElement('img');
      favicon.src = tab.favIconUrl || 'icons/default-favicon.png';
      favicon.onerror = () => {
        favicon.src = 'icons/default-favicon.png';
      };
      
      const title = document.createElement('span');
      title.textContent = tab.title;
      
      tabItem.appendChild(favicon);
      tabItem.appendChild(title);
      
      tabItem.addEventListener('click', () => {
        chrome.tabs.update(tab.id, { active: true });
        window.close();
      });
      
      tabsList.appendChild(tabItem);
    });
  }

  // Get all tabs and initialize the interface
  chrome.tabs.query({}, (tabs) => {
    const domainGroups = groupTabsByDomain(tabs);
    renderDomains(domainGroups);
    
    // Select the first domain by default
    const firstDomain = Object.keys(domainGroups)[0];
    if (firstDomain) {
      currentDomain = firstDomain;
      const firstDomainItem = domainsList.querySelector('.domain-item');
      if (firstDomainItem) {
        firstDomainItem.classList.add('active');
        renderTabs(domainGroups[firstDomain]);
      }
    }
  });
}); 