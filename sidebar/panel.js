const contentEl = document.querySelector("#content");
const { IN_PROGRESS, INTERRUPTED, COMPLETE } = browser.downloads.State;

function itemTemplate(item) {
  const filename = getFilename(item.filename);
  const parsedUrl = new URL(item.url);
  const hostname = parsedUrl.hostname || parsedUrl.href;
  const size = getFileSizeString(item.totalBytes);
  const date = new Date(item.startTime);
  const localeDate = date.toLocaleDateString();
  const localeTime = date.toLocaleTimeString();

  return `
    <img class="item-icon" src="" />
    <div class="item-info overflow-ellipsis">
      <div class="item-filename overflow-ellipsis" title="${item.filename}">${filename}</div>
      <span class="item-size">${size}</span>
      &mdash;
      <span class="item-domain" title="${item.url}">${hostname}</span>
      &mdash;
      <span class="item-datetime">${localeDate} ${localeTime}</span>
      <div class="progress">
        <span class="loader"></span>
        <span class="percentage"></span>
      </div>
    </div>
    <a class="item-show" title="Show file in folder: ${item.filename}"></a>
  `;
}

function getFileSizeString(size) {
  const measure = [
    "bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"
  ];
  let counter = 0;

  while (size >= 1024) {
    size /= 1024;
    counter++;
  }

  size = size.toFixed(1);

  return `${size} ${measure[counter]}`;
}

function getFilename(path) {
  return path.replace(/\\+/g, "/").split("/").pop();
}

function updateIconUrl(itemId, iconUrl) {
  const downloadIcon = document.querySelector(`#item-${itemId} .item-icon`);

  if (downloadIcon) {
    downloadIcon.setAttribute("src", iconUrl);
  }
}

function onError(error) {
  console.log(`Error: ${error}`);
}

function getLatestDownloads(limit = 10, orderBy = ["-startTime"]) {
  return browser.downloads.search({
    orderBy,
    limit,
  });
}

function updateContent(item = null) {
  getLatestDownloads()
    .then(processDownloads, onError);
}

function getDownloadById(itemId) {
  return browser.downloads.search({id: itemId});
}

function trackItemDownloadProgress(itemId) {
  const itemEl = document.querySelector(`#item-${itemId}`);
  const progressEl = document.querySelector(`#item-${itemId} .progress`);

  itemEl.classList.add("in_progress");

  const intervalId = setInterval(function() {
    getDownloadById(itemId).then((items) => {
      const item = items.pop();
      const downloadComplete = (item.bytesReceived === item.totalBytes);

      updateItemDownloadProgress(item, progressEl);

      if (downloadComplete) {
        clearInterval(intervalId);
        itemEl.classList.remove("in_progress");
      }
    })
  }, 1000);
}

function updateItemDownloadProgress(item, progressEl) {
  const ratio = item.bytesReceived / item.totalBytes;
  const percentage = (ratio * 100).toFixed(1);

  progressEl.querySelector(".loader").style = `width: ${percentage}%`;
  progressEl.querySelector(".percentage").innerText = `${percentage}%`;
}

function processDownloads(items) {
  contentEl.innerHTML = "";

  items.forEach((item) => {
    const itemId = item.id;
    const itemEl = document.createElement("div");

    itemEl.id = `item-${itemId}`;
    itemEl.className = "item";
    itemEl.innerHTML = itemTemplate(item);
    itemEl.title = "Double-click to open the file directly";

    const showItemEl = itemEl.querySelector(".item-show");

    itemEl.addEventListener("click", selectItem);
    itemEl.addEventListener("dblclick", openItem);
    showItemEl.addEventListener("click", showItem);

    contentEl.appendChild(itemEl);

    if (item.state === IN_PROGRESS) {
      trackItemDownloadProgress(item.id);
    } else if (item.state === INTERRUPTED) {
      itemEl.classList.add("interrupted");
    } else {
      itemEl.classList.add("complete");
    }

    return browser.downloads.getFileIcon(itemId)
      .then((iconUrl) => updateIconUrl(itemId, iconUrl));
  });
}

function selectItem(event) {
  const el = getEventItem(event);
  const selected = document.querySelector(".selected");

  if (selected) {
    selected.classList.remove("selected");
  }

  el.classList.add("selected");
}

function openItem(event) {
  event.preventDefault();
  browser.downloads.open(getEventItemId(event));
}

function showItem(event) {
  event.preventDefault();
  browser.downloads.show(getEventItemId(event));
}

function getEventItem(event) {
  let el = event.target;

  while (!el.classList.contains("item")) {
    el = el.parentElement;
  }

  return el;
}

function getEventItemId(event) {
  const el = getEventItem(event);

  return parseInt(el.id.replace("item-", ""), 10);
}

browser.windows.getCurrent({populate: true})
  .then((windowInfo) => {
    updateContent();
  });

browser.downloads.onCreated.addListener(updateContent);
browser.downloads.onChanged.addListener(updateContent);
browser.downloads.onErased.addListener(updateContent);
