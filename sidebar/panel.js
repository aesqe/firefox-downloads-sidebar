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

const SECOND_INT = 1;
const MINUTE_INT = SECOND_INT * 60;
const HOUR_INT   = MINUTE_INT * 60;
const DAY_INT    = HOUR_INT * 60;

const SPEED_KILOBYTE = 1024;
const SPEED_MEGABYTE = SPEED_KILOBYTE * 1024;
const SPEED_GIGABYTE = SPEED_MEGABYTE * 1024;

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
      const dateTime = this.getDateTime(item);
      const stateButtonText = this.getStateButtonText(item.state);
      const percentage = item.bytesReceived / item.totalBytes;

      const folderClass = this.getFolderClass(item.state);
      const subUrl = this.getLimitedUrl(item.url);

      const remainingTime = this.getRemainingTimeString(item);
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
        remainingTime,
        currentSpeed,
      };
    },

    getDateTime(item) {
      const date = new Date(item.startTime);
      if (date.getTime() === 0) {
        return "Unknown"; //epoch case
      }

      const localeDate = date.toLocaleDateString();
      const localeTime = date.toLocaleTimeString();
      return `${localeDate} ${localeTime}`;
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
      const remainingTime = this.getRemainingTimeString(item);
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
      this.set(`${keypath}.remainingTime`, remainingTime);
      this.set(`${keypath}.currentSpeed`, currentSpeed);
      
      if (downloadInProgress) {
        const dateTime = this.getDateTime(item);
        this.set(`${keypath}.dateTime`, dateTime);
      }

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
      return "folderEnabled";
      /*
      In the past we had this code checking the state
      of the download. It looks like the application is better
      if we always report a folderEnabled state.

      This code is here in case this behaviour wants to be
      changed in the future.
      
      const { COMPLETE } = this.states;
      if (state === COMPLETE) {
        return "folderEnabled";
      }
      return "folderDisabled";
      */
    },

    getLimitedUrl(url) {
      if (url.length < URL_SUBSTRING_LENGTH) {
        return url;
      }
      return url.substring(0,URL_SUBSTRING_LENGTH) + "...";
    },

    getCurrentSpeed(item) {
      const { PAUSED, COMPLETE, FAILED } = this.states;
      const downloadState = this.calculateDownloadState(item);
      if (downloadState === PAUSED) {
        return "Paused";
      } else if (downloadState === COMPLETE) {
        return "Completed";
      } else if (downloadState === FAILED) {
        return "Failed";
      }

      const remainingSeconds = this.getRemainingSeconds(item);

      if (isNaN(remainingSeconds)){
        return "Calculating"
      } else if (remainingSeconds === 0) {
        return "Finishing";
      }

      const remainingBytes = item.totalBytes - item.bytesReceived;
      const currentSpeed = Math.round(remainingBytes / remainingSeconds);

      if (currentSpeed > SPEED_GIGABYTE) {
        return this.divideAndRound(currentSpeed, SPEED_GIGABYTE) + " GB/s";
      } else if (currentSpeed > SPEED_MEGABYTE) {
        return this.divideAndRound(currentSpeed, SPEED_MEGABYTE) + " MB/s";
      }

      const kiloSpeed = this.divideAndRound(currentSpeed, SPEED_KILOBYTE);

      if (kiloSpeed <= 0) {
        return "< 1 KB/s";
      }

      return kiloSpeed + " KB/s";
    },

    getRemainingTimeString(item) {
      const { PAUSED, COMPLETE, FAILED } = this.states;
      const downloadState = this.calculateDownloadState(item);
      if (downloadState === PAUSED   ||
          downloadState === COMPLETE ||
          downloadState === FAILED) {
        return "";
      }

      const remainingSeconds = this.getRemainingSeconds(item);
      const prefixSeparator = "- ";

      if (isNaN(remainingSeconds) || remainingSeconds <= SECOND_INT) {
        return "";
      } else if (remainingSeconds > DAY_INT) {
        return `${prefixSeparator} Over a day remaining`;
      }

      let timeUnit = 0;
      let suffix = '';

      if (remainingSeconds > HOUR_INT) {
        timeUnit = HOUR_INT;
        suffix = "h remaining";
      } else if (remainingSeconds > MINUTE_INT) {
        timeUnit = MINUTE_INT;
        suffix = "m remaining";
      } else
      {
        timeUnit = SECOND_INT;
        suffix = "s remaining";
      }
      const remaining = this.divideAndRound(remainingSeconds, timeUnit);
      return `${prefixSeparator}${remaining}${suffix}`;
    },

    divideAndRound(unit, divide) {
      return Math.round(unit / divide);
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
