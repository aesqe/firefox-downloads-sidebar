# Downloads sidebar web extension

This extension will display a list of your latest downloads in the Firefox sidebar.

The latest version is **0.6**

## How do I use this?

Open your Firefox sidebar and choose "Downloads" from the top drop-down list.

Keyboard shortcut is **F4**.

There is also a browser toolbar button which opens the Downloads sidebar.

### Features

* pause, resume, cancel, retry, erase download
* copy download link
* open download page link
* show downloaded item in folder
* erase all recent downloads that are not active (active = downloading or paused)

### Screenshot

![](screenshot.png)

### Credits

* uses Ractive.js (https://github.com/ractivejs/ractive)
* play and pause icons by ionicons (http://ionicons.com)
* folder icon by Smashicons on flaticon (https://www.flaticon.com/authors/smashicons)
* downloads icon by Pixel perfect on flaticon (https://www.flaticon.com/authors/pixel-perfect)
* retry icon by Artyom Khamitov (https://www.iconfinder.com/Kh.Artyom)
* cancel icon by Egor Rumyantsev on flaticon (https://www.flaticon.com/authors/egor-rumyantsev)
* external link icon by Cole Bemis (https://www.iconfinder.com/colebemis)
* copy icon by Google (http://google.com/design/)

### Requested features

* dark theme
* download speed indicator

### Features that are not possible to implement

As of 2018/04/14 it's not possible to implement the following features, because the API is intentionally limiting them or offers no replacement:

* auto-opening panel after downloading is done
* auto-opening file after downloading is done
* drag and droping using the official sidebar API doesn't seem possible