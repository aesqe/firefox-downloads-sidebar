Ractive.DEBUG = false;
Ractive.defaults.allowExpressions = false;

let app;
const DOWNLOAD_PROGRESS_INTERVAL = 500;

fetchFileContentsAsText("template-item.html")
  .then((text) => Ractive.partials.item = text)
  .then(start);

function start() {
  app = new Ractive({
    target: "#content",
    template: `{{#items:i}}
      {{> item}}
    {{/items}}`,

    states: browser.downloads.State,
    interrupts: browser.downloads.InterruptReason,

    data() {
      return {
        items: [],
      };
    },

    onconfig() {
      this.checkDownloadState = this.checkDownloadState.bind(this);
      this.prepareItems = this.prepareItems.bind(this);
      this.prepareItem = this.prepareItem.bind(this);
      this.setFileIcon = this.setFileIcon.bind(this);
      this.addItem = this.addItem.bind(this);
      this.onChanged = this.onChanged.bind(this);
      this.onErased = this.onErased.bind(this);

      browser.downloads.onCreated.addListener(this.addItem);
      browser.downloads.onChanged.addListener(this.onChanged);
      browser.downloads.onErased.addListener(this.onErased);

      this.on({
        selectItem: this.selectItem,
        openItem: this.openItem,
        showItem: this.showItem,
        changeDownloadState: this.changeDownloadState,
        cancelDownload: this.cancelDownload,
      });

      this.updateItems();
    },

    updateItems() {
      this.getLatestDownloads()
        .then(this.prepareItems)
        .then((items) => {
          this.set("items", items);
          items.forEach(this.setFileIcon);
          items.forEach(this.checkDownloadState);
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
      const pauseText = item.state === this.states.INTERRUPTED ? "Resume" : "Pause";
      const percentage = item.bytesReceived / item.totalBytes;

      return Object.assign({}, item, {
        size,
        filePath,
        fileName,
        hostname,
        dateTime,
        pauseText,
        percentage,
      });
    },

    prepareItems(items) {
      return items.map(this.prepareItem);
    },

    getItemById(itemId) {
      const items = this.get("items");
      return items.find((item) => item.id === itemId);
    },

    getItemIndexById(itemId) {
      const items = this.get("items");
      return items.findIndex((item) => item.id === itemId);
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

    getLatestDownloads(limit = 100) {
      return this.search({
        orderBy: ["-startTime"],
        limit,
      });
    },

    getDownloadById(itemId) {
      return this.search({id: itemId});
    },

    getFileSizeString(size) {
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
      return browser.downloads.pause(itemId)
        .then(null, this.onError);
    },

    resumeDownload(itemId) {
      return browser.downloads.resume(itemId)
        .then(null, this.onError);
    },

    retryDownload(item) {
      browser.downloads.erase({id: item.id})
          .then(this.download(item), this.onError);
    },

    download(item) {
      return browser.downloads.download({
        url: item.url,
        filename: item.fileName,
      });
    },

    cancelDownload(event) {
      const item = event.get();

      if (item.downloadState === "canceled") {
        return browser.downloads.erase({id: item.id})
          .then(null, this.onError);
      }

      return browser.downloads.cancel(item.id)
        .then(nu, this.onError);
    },

    addItem(data) {
      const item = this.prepareItem(data);

      this.unshift('items', item);

      this.setFileIcon(item);
      this.checkDownloadState({id: item.id});
    },

    onChanged(data) {
      this.checkDownloadState({id: data.id});
    },

    onErased(itemId) {
      const itemIndex = this.getItemIndexById(itemId);
      this.splice("items", itemIndex, 1);
    },

    onError(error) {
      console.log("downloads error:", error);
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

    checkDownloadState(item) {
      this.downloadChecker(item.id);
    },

    downloadChecker(itemId) {
      const self = this;

      this.search({id: itemId})
        .then((items) => {
          const item = items.pop();
          const downloadState = self.updateDownloadItem(item);

          if (downloadState === "in_progress") {
            setTimeout(
              self.downloadChecker(item.id),
              DOWNLOAD_PROGRESS_INTERVAL
            );
          }
        });
    },

    updateDownloadItem(item) {
      const itemIndex = this.getItemIndexById(item.id);
      const keypath = `items.${itemIndex}`;
      const oldItem = this.get(keypath);
      const downloadState = this.calculateDownloadState(item);
      const stateButtonText = this.getStateButtonText(downloadState);
      const cancelButtonText = downloadState === "canceled" ? "Erase" : "Cancel";
      const ratio = item.bytesReceived / item.totalBytes;
      const downloadInProgress = (
        downloadState === "paused" || downloadState === "in_progress"
      );

      let size = oldItem.size;
      let percentage = oldItem.percentage;

      if (item.bytesReceived > 0) {
        size = this.getFileSizeString(item.bytesReceived);
        percentage = (ratio * 100).toFixed(1)
      }

      this.set(`${keypath}.downloadInProgress`, downloadInProgress);
      this.set(`${keypath}.cancelButtonText`, cancelButtonText);
      this.set(`${keypath}.stateButtonText`, stateButtonText);
      this.set(`${keypath}.downloadState`, downloadState);
      this.set(`${keypath}.percentage`, percentage);
      this.set(`${keypath}.size`, size);

      return downloadState;
    }
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
