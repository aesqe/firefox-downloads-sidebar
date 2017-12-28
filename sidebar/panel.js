Ractive.DEBUG = false;
Ractive.defaults.allowExpressions = false;

let app;
const DOWNLOAD_PROGRESS_INTERVAL = 500;

fetchFileContentsAsText("template-item.html")
  .then((text) => Ractive.partials.item = text)
  .then(() => fetchFileContentsAsText("template-main.html"))
  .then((text) => Ractive.partials.main = text)
  .then(start);

function start() {
  app = new Ractive({
    target: "#content",
    states: browser.downloads.State,
    interrupts: browser.downloads.InterruptReason,
    template: Ractive.partials.main,

    data() {
      return {
        items: [],
        activeDownloads: [],
      };
    },

    onconfig() {
      this.prepareItems = this.prepareItems.bind(this);
      this.prepareItem = this.prepareItem.bind(this);
      this.setFileIcon = this.setFileIcon.bind(this);
      this.addItem = this.addItem.bind(this);
      this.getItemById = this.getItemById.bind(this);
      this.getDownloadById = this.getDownloadById.bind(this);
      this.updateDownloadItem = this.updateDownloadItem.bind(this);
      this.onChanged = this.onChanged.bind(this);
      this.onErased = this.onErased.bind(this);
      this.clearAllDownloads = this.clearAllDownloads.bind(this);
      this.copyLinkToClipboard = this.copyLinkToClipboard.bind(this);
      this.eraseDownload = this.eraseDownload.bind(this);
      this.determineDownloadActivity = this.determineDownloadActivity.bind(this);
      this.updateActiveDownloads = this.updateActiveDownloads.bind(this);
      this.checkActiveDownloads = this.checkActiveDownloads.bind(this);

      browser.downloads.onCreated.addListener(this.addItem);
      browser.downloads.onChanged.addListener(this.onChanged);
      browser.downloads.onErased.addListener(this.onErased);

      this.on({
        selectItem: this.selectItem,
        openItem: this.openItem,
        showItem: this.showItem,
        changeDownloadState: this.changeDownloadState,
        cancelDownload: this.cancelDownload,
        clearAllDownloads: this.clearAllDownloads,
        copyLinkToClipboard: this.copyLinkToClipboard,
        eraseDownload: this.eraseDownload,
      });

      this.updateItems();
    },

    updateItems() {
      this.getLatestDownloads()
        .then(this.prepareItems)
        .then((items) => {
          this.set("items", items);

          items.forEach(this.setFileIcon);
          items.forEach(this.determineDownloadActivity);
          items.forEach(this.updateDownloadItem);
        });
    },

    determineDownloadActivity(item) {
      const downloadState = this.calculateDownloadState(item);

      if (downloadState === "in_progress") {
        this.addToActiveDownloads(item.id);
      } else {
        this.removeFromActiveDownloads(item.id);
      }
    },

    addToActiveDownloads(itemId) {
      const activeDownloads = this.get("activeDownloads");

      if (activeDownloads.indexOf(itemId) === -1) {
        this.getDownloadById(itemId).then(
          (item) => {
            if (item) {
              this.push("activeDownloads", itemId);
              this.checkActiveDownloads();
            }
          },
          this.onError
        );
      }      
    },

    removeFromActiveDownloads(itemId) {
      const activeDownloads = this.get("activeDownloads");
      const index = activeDownloads.indexOf(itemId);

      if (index > -1) {
        this.splice("activeDownloads", index, 1).then(() => {
          this.updateDownloadItem(itemId);
        });
      }
    },

    checkActiveDownloads() {
      const activeDownloads = this.get("activeDownloads");
      let timeoutId = this.get("downloadsCheckerTimeoutId");

      clearTimeout(timeoutId);

      if (!activeDownloads || activeDownloads.length === 0) {
        return;
      }

      this.updateActiveDownloads();

      timeoutId = setTimeout(
        this.checkActiveDownloads,
        DOWNLOAD_PROGRESS_INTERVAL
      );

      this.set("downloadsCheckerTimeoutId", timeoutId);
    },

    updateActiveDownloads() {
      const activeDownloads = this.get("activeDownloads");

      Promise.all(
        activeDownloads.map(this.getDownloadById)
      ).then((items) => {
        items.forEach(this.updateDownloadItem);
      });
    },

    prepareItem(item) {
      const filePath = item.filename;
      const fileName = this.getFilename(filePath);
      const parsedUrl = new URL(item.url);
      const hostname = parsedUrl.hostname || parsedUrl.href;
      const size = this.getFileSizeString(item.bytesReceived);
      const date = new Date(item.startTime);
      const localeDate = date.toLocaleDateString();
      const localeTime = date.toLocaleTimeString();
      const dateTime = `${localeDate} ${localeTime}`;
      const stateButtonText = this.getStateButtonText(item.state);
      const percentage = item.bytesReceived / item.totalBytes;

      return Object.assign({}, item, {
        size,
        filePath,
        fileName,
        hostname,
        dateTime,
        stateButtonText,
        percentage,
      });
    },

    prepareItems(items) {
      return items.map(this.prepareItem);
    },

    setFileIcon(item) {
      const itemIndex = this.getItemIndexById(item.id);
      const keypath = `items.${itemIndex}.iconUrl`;

      return browser.downloads.getFileIcon(item.id)
        .then((iconUrl) => this.set(keypath, iconUrl));
    },

    search(query){
      return browser.downloads.search(query);
    },

    getItemById(itemId) {
      const items = this.get("items");
      return items.find((item) => item.id === itemId);
    },

    getItemIndexById(itemId) {
      const items = this.get("items");
      return items.findIndex((item) => item.id === itemId);
    },

    getLatestDownloads(limit = 100) {
      return this.search({
        orderBy: ["-startTime"],
        limit,
      });
    },

    getDownloadById(itemId) {
      return this.search({id: itemId}).then((items) => {
        if (items.length) {
          return items.pop();
        }

        return this.removeFromActiveDownloads(itemId);
      });
    },

    getNumber(num) {
      const trynum = Number(num);

      if (isNaN(trynum)) {
        return 0;
      }

      if (trynum < 0) {
        return 0;
      }

      return trynum;
    },

    getFileSizeString(size) {
      size = this.getNumber(size);

      const measure = [
        "bytes", "KB", "MB", "GB", "TB",
        "PB", "EB", "ZB", "YB"
      ];
      let counter = 0;

      while (size >= 1024) {
        size /= 1024;
        counter++;
      }

      size = size.toFixed(1);

      return `${size} ${measure[counter]}`;
    },

    getFilename(path) {
      return path.replace(/\\+/g, "/").split("/").pop();
    },

    deselectAllItems() {
      const items = this.get("items");

      items.forEach((item) => {
        const itemIndex = this.getItemIndexById(item.id);
        const keypath = `items.${itemIndex}.selected`;

        if (this.get(keypath)) {
          this.set(keypath, false);
        }
      });
    },

    selectItem(event) {
      const item = event.get();
      const itemIndex = this.getItemIndexById(item.id);

      this.deselectAllItems();
      this.set(`items.${itemIndex}.selected`, true);
    },

    openItem(event) {
      const item = event.get();
      browser.downloads.open(item.id);
    },

    showItem(event) {
      const item = event.get();
      browser.downloads.show(item.id);
    },

    changeDownloadState(event) {
      const item = event.get();

      switch (item.downloadState) {
        case "in_progress":
          return this.pauseDownload(item.id);
        case "paused":
          return this.resumeDownload(item.id);
        default:
          return this.retryDownload(item);
      }
    },

    pauseDownload(itemId) {
      browser.downloads.pause(itemId)
        .then(
          () => this.removeFromActiveDownloads(itemId),
          this.onError
        );
    },

    resumeDownload(itemId) {
      this.addToActiveDownloads(itemId);

      browser.downloads.resume(itemId)
        .then(
          null,
          this.onError
        );
    },

    retryDownload(item) {
      return this.eraseItem(
        item.id,
        () => this.download(item)
      );
    },

    download(item) {
      const itemData = {
        url: item.url,
        filename: item.fileName,
      };

      browser.downloads.download(itemData)
        .then(
          (itemId) => this.addToActiveDownloads(itemId),
          this.onError
        );
    },

    cancelDownload(event) {
      const item = event.get();

      browser.downloads.cancel(item.id)
        .then(
          () => this.removeFromActiveDownloads(item.id),
          this.onError
        );
    },

    eraseDownload(event) {
      const item = event.get();

      return this.eraseItem(item.id);
    },

    eraseItem(itemId, callback = null) {
      this.removeFromActiveDownloads(itemId);

      browser.downloads.erase({id: itemId})
        .then(
          callback,
          this.onError
        );
    },

    addItem(data) {
      const item = this.prepareItem(data);
      const fileName = this.getFilename(item.filename);

      this.unshift('items', item);

      this.setFileIcon(item);
      this.addToActiveDownloads(item.id);
    },

    onChanged(data) {
      // console.log("onChanged", data);
    },

    onErased(itemId) {
      const itemIndex = this.getItemIndexById(itemId);
      this.splice("items", itemIndex, 1);
    },

    onError(error) {
      // console.log("downloads error:", error);
    },

    calculateDownloadState(item) {
      const complete = (item.state === this.states.COMPLETE);
      const in_progress = (item.state === this.states.IN_PROGRESS);
      const canceled = (item.error === this.interrupts.USER_CANCELED);
      const resumable = item.paused && item.canResume;
      const errored = !!this.interrupts[item.error];

      if (errored) {
        if (canceled) {
          if (resumable) {
            return "paused";
          }

          return "canceled";
        }

        return "failed";
      }

      if (complete) {
        return "complete";
      }
      
      return "in_progress";
    },

    getStateButtonText(state) {
      switch (state) {
        case "paused":
          return "Resume";
        case "canceled":
        case "failed":
          return "Retry?";
        default:
          return "Pause";
      }
    },

    updateDownloadItem(item) {
      if (typeof item === "undefined") {
        return;
      }

      if (typeof item === "number") {
        return this.getDownloadById(item).then(this.updateDownloadItem);
      }

      const itemIndex = this.getItemIndexById(item.id);
      const keypath = `items.${itemIndex}`;
      const oldItem = this.get(keypath) || {};

      const downloadState = this.calculateDownloadState(item);
      const stateButtonText = this.getStateButtonText(downloadState);
      const ratio = item.bytesReceived / item.totalBytes;
      const downloadInProgress = (
        downloadState === "paused" || downloadState === "in_progress"
      );

      let size = oldItem.size;
      let percentage = oldItem.percentage;

      if (item.bytesReceived > 0)
      {
        size = this.getFileSizeString(item.bytesReceived);
        percentage = (ratio * 100).toFixed(1);

        const totalBytes = this.getNumber(item.totalBytes);
        const totalSize = this.getFileSizeString(item.totalBytes);

        if (downloadInProgress && totalBytes) {
          size = `${size} of ${totalSize}`;
        }
      }

      this.set(`${keypath}.downloadInProgress`, downloadInProgress);
      this.set(`${keypath}.stateButtonText`, stateButtonText);
      this.set(`${keypath}.downloadState`, downloadState);
      this.set(`${keypath}.percentage`, percentage);
      this.set(`${keypath}.size`, size);

      if (downloadState !== "in_progress") {
        this.removeFromActiveDownloads(item.id);
      }

      return downloadState;
    },

    clearAllDownloads() {
      return browser.downloads.erase({})
        .then(null, this.onError);
    },

    copyLinkToClipboard(event) {
      const itemId = event.get("id");
      const input = this.find(`#link-${itemId}`);
      input.select();
      document.execCommand("copy");
    },
  });
}

function fetchFileContentsAsText(filePath) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener("loadend", (e) => {
      resolve(e.target.result);
    });

    fetch(filePath)
      .then((response) => response.blob())
      .then((blob) => reader.readAsText(blob));
  });
}
