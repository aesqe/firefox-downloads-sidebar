Ractive.DEBUG = false;
Ractive.defaults.allowExpressions = false;

let app;

const DOWNLOAD_PROGRESS_INTERVAL = 500;
const URL_SUBSTRING_LENGTH = 70;
const ACTIVE_DOWNLOADS = "activeDownloads";
const PAUSED = "paused";
const FAILED = "failed";
const CANCELED = "canceled";
const ITEMS = "items";

const downloadStates = {
  ...browser.downloads.State,
  PAUSED,
  FAILED,
  CANCELED,
};

const measures = [
  "bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"
];

const autobindMethods = [
  "addItem",
  "checkActiveDownloads",
  "clearDownloads",
  "copyLinkToClipboard",
  "determineDownloadActivity",
  "eraseDownload",
  "eraseItem",
  "getDownloadById",
  "getItemById",
  "onChanged",
  "onErased",
  "onError",
  "prepareItem",
  "prepareItems",
  "setFileIcon",
  "updateActiveDownloads",
  "updateDownloadItem",
];

fetchFileContentsAsText("template-item.html")
  .then((text) => Ractive.partials.item = text)
  .then(() => fetchFileContentsAsText("template-main.html"))
  .then((text) => Ractive.partials.main = text)
  .then(start);

function start() {
  app = new Ractive({
    target: "#content",
    states: downloadStates,
    interrupts: browser.downloads.InterruptReason,
    template: Ractive.partials.main,

    data() {
      return {
        items: [],
        activeDownloads: [],
      };
    },

    onconfig() {
      autobindMethods.forEach(
        (name) => this[name] = this[name].bind(this)
      );

      browser.downloads.onCreated.addListener(this.addItem);
      browser.downloads.onChanged.addListener(this.onChanged);
      browser.downloads.onErased.addListener(this.onErased);

      this.on({
        openItem: this.openItem,
        showItem: this.showItem,
        eraseDownload: this.eraseDownload,
        cancelDownload: this.cancelDownload,
        clearDownloads: this.clearDownloads,
        changeDownloadState: this.changeDownloadState,
        copyLinkToClipboard: this.copyLinkToClipboard,
      });

      this.updateItems();
    },

    updateItems() {
      this.getLatestDownloads()
        .then(this.prepareItems)
        .then((items) => {
          this.set(ITEMS, items);

          items.forEach(this.setFileIcon);
          items.forEach(this.determineDownloadActivity);
          items.forEach(this.updateDownloadItem);
        });
    },

    determineDownloadActivity(item) {
      const downloadState = this.calculateDownloadState(item);

      if (downloadState === this.states.IN_PROGRESS) {
        this.addToActiveDownloads(item.id);
      } else {
        this.removeFromActiveDownloads(item.id);
      }
    },

    addToActiveDownloads(itemId) {
      const activeDownloads = this.get(ACTIVE_DOWNLOADS);

      if (activeDownloads.indexOf(itemId) === -1) {
        this.getDownloadById(itemId)
          .then((item) => {
              if (item) {
                this.push(ACTIVE_DOWNLOADS, itemId);
                this.checkActiveDownloads();
              }
            },
            this.onError
          );
      }
    },

    removeFromActiveDownloads(itemId) {
      const activeDownloads = this.get(ACTIVE_DOWNLOADS);
      const index = activeDownloads.indexOf(itemId);

      if (index > -1) {
        this.splice(ACTIVE_DOWNLOADS, index, 1)
          .then(() => this.updateDownloadItem(itemId));
      }
    },

    checkActiveDownloads() {
      const activeDownloads = this.get(ACTIVE_DOWNLOADS);
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
      const activeDownloads = this.get(ACTIVE_DOWNLOADS);

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

      const folderClass = this.getFolderClass(item.state);
      const subUrl = this.getLimitedUrl(item.url);

      const remainingMinutes = this.getRemainingMinutesString(item);
      const currentSpeed = this.getCurrentSpeed(item);

      return {
        ...item,
        size,
        filePath,
        fileName,
        hostname,
        dateTime,
        stateButtonText,
        percentage,
        folderClass,
        subUrl,
        remainingMinutes,
        currentSpeed,
      };
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
      const items = this.get(ITEMS);
      return items.find((item) => item.id === itemId);
    },

    getItemIndexById(itemId) {
      const items = this.get(ITEMS);
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

      if (isNaN(trynum) || trynum < 0) {
        return 0;
      }

      return trynum;
    },

    getFileSizeString(size) {
      let counter = 0;

      size = this.getNumber(size);

      while (size >= 1024) {
        size /= 1024;
        counter++;
      }

      size = size.toFixed(1);

      return `${size} ${measures[counter]}`;
    },

    getFilename(path) {
      return path.replace(/\\+/g, "/").split("/").pop();
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
      const { PAUSED, IN_PROGRESS } = this.states;
      const item = event.get();

      switch (item.downloadState) {
        case IN_PROGRESS:
          return this.pauseDownload(item.id);
        case PAUSED:
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
        .then(null, this.onError);
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

        //doesn't actually add it to active downloads, but it fixes the cancel while paused bug
        this.addToActiveDownloads(item.id);
        this.updateDownloadItem(item);
    },

    eraseDownload(event) {
      const item = event.get();

      return this.eraseItem(item.id);
    },

    eraseItem(itemId, callback = null) {
      this.removeFromActiveDownloads(itemId);

      browser.downloads.erase({ id: itemId })
        .then(callback, this.onError);
    },

    addItem(data) {
      const item = this.prepareItem(data);
      const fileName = this.getFilename(item.filename);

      this.unshift(ITEMS, item);

      this.setFileIcon(item);
      this.addToActiveDownloads(item.id);
    },

    onChanged(data) {
      // console.log("onChanged", data);
    },

    onErased(itemId) {
      const itemIndex = this.getItemIndexById(itemId);
      this.splice(ITEMS, itemIndex, 1);
    },

    onError(error) {
      // console.log("downloads error:", error);
    },

    calculateDownloadState(item) {
      const {
        PAUSED,
        FAILED,
        CANCELED,
        COMPLETE,
        IN_PROGRESS,
      } = this.states;

      const errored = !!this.interrupts[item.error];
      const resumable = item.paused && item.canResume;
      const canceled = (item.error === this.interrupts.USER_CANCELED);
      const in_progress = (item.state === IN_PROGRESS);
      const complete = (item.state === COMPLETE);

      if (errored) {
        if (canceled) {
          if (resumable) {
            return PAUSED;
          }

          return CANCELED;
        }

        return FAILED;
      }

      if (complete) {
        return COMPLETE;
      }
      
      return this.states.IN_PROGRESS;
    },

    getStateButtonText(state) {
      switch (state) {
        case PAUSED:
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
        return this.getDownloadById(item)
          .then(this.updateDownloadItem);
      }

      const { IN_PROGRESS, COMPLETE } = this.states;

      const itemIndex = this.getItemIndexById(item.id);
      const keypath = `items.${itemIndex}`;
      const oldItem = (this.get(keypath) || {});

      const downloadState = this.calculateDownloadState(item);
      const stateButtonText = this.getStateButtonText(downloadState);
      const ratio = (item.bytesReceived / item.totalBytes);
      const downloadInProgress = (
        downloadState === PAUSED || downloadState === IN_PROGRESS
      );
      const folderClass = this.getFolderClass(downloadState);
      const remainingMinutes = this.getRemainingMinutesString(item);
      const currentSpeed = this.getCurrentSpeed(item);
      
      let size = oldItem.size;
      let percentage = oldItem.percentage;

      if (item.bytesReceived > 0) {
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
      this.set(`${keypath}.folderClass`, folderClass);
      this.set(`${keypath}.remainingMinutes`, remainingMinutes);
      this.set(`${keypath}.currentSpeed`, currentSpeed);

      if (downloadState !== IN_PROGRESS) {
        this.removeFromActiveDownloads(item.id);
      }

      return downloadState;
    },

    getInactiveItems() {
      const { IN_PROGRESS, PAUSED } = this.states;
      const items = this.get(ITEMS);

      return items.filter(function (item) {
        const state = item.downloadState;
        return (state !== IN_PROGRESS) && (state !== PAUSED);
      });
    },

    clearDownloads() {
      const eraseInactiveItems = this.getInactiveItems()
        .map(item => item.id)
        .map(this.eraseItem);

      return Promise.all(eraseInactiveItems);
    },

    copyLinkToClipboard(event) {
      const itemId = event.get("id");
      const input = this.find(`#link-${itemId}`);

      input.select();

      document.execCommand("copy");
    },

    getFolderClass(state) {
      const { COMPLETE } = this.states;
      if (state === COMPLETE) {
        return "folderEnabled";
      }
      return "folderDisabled";
    },

    getLimitedUrl(url) {
      if (url.length < URL_SUBSTRING_LENGTH) {
        return url;
      }
      return url.substring(0,URL_SUBSTRING_LENGTH) + "...";
    },

    getCurrentSpeed(item) {
      const downloadState = this.calculateDownloadState(item);
      if (downloadState === PAUSED) {
        return "0";
      }
      const remainingSeconds = this.getRemainingSeconds(item);
      if (remainingSeconds === 0) {
        return "0";
      }

      const remainingMegaBytes = (item.totalBytes - item.bytesReceived) / 1048576;
      const currentSpeed = Math.round(remainingMegaBytes / remainingSeconds);
      return this.checkMinuteToString(currentSpeed);
    },

    getRemainingMinutesString(item) {
      const downloadState = this.calculateDownloadState(item);
      if (downloadState === PAUSED) {
        return "Paused";
      }
      const differenceMinutes = this.getRemainingMinutes(item);
      const remainingMinutes = this.checkMinuteToString(differenceMinutes);
      
      if (remainingMinutes === "<0"){
        return "Less than a minute remaining";
      }

      return remainingMinutes + " minutes remaining";
    },

    getRemainingMinutes(item) {
      return Math.round(this.getRemainingSeconds(item) / 60);
    },

    getRemainingSeconds(item) {
      const endDate = new Date(item.estimatedEndTime);
      const currentDate = new Date();
      return this.getDifferenceInSeconds(currentDate,endDate);
    },

    getDifferenceInSeconds(startDate, endDate) {
      const differenceSeconds = (endDate.getTime() - startDate.getTime()) / 1000;
      return Math.round(differenceSeconds);
    },

    checkMinuteToString(int){
      if (int <= 0){
        return "<0";
      } else if (int > 0) {
        return int.toString();
      }

      return "Calculating";
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
