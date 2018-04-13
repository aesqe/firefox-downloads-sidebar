const sidebarDownloadsPanel = {
  panel: browser.extension.getURL("sidebar/panel.html")
};

browser.browserAction.onClicked.addListener(() => {
  browser.sidebarAction.setPanel(sidebarDownloadsPanel);
  browser.sidebarAction.open();
});

/* This is not allowed by the API, we can't bring up the panel.

browser.downloads.onChanged.addListener((item) => {
  browser.sidebarAction.setPanel(sidebarDownloadsPanel);
  browser.sidebarAction.open();
});*/