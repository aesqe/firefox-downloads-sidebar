const sidebarDownloadsPanel = {
  panel: browser.extension.getURL("sidebar/panel.html")
};

browser.browserAction.onClicked.addListener(() => {
  browser.sidebarAction.setPanel(sidebarDownloadsPanel);
  browser.sidebarAction.open();
});
