const path = require("node:path");
const { app, BrowserWindow } = require("electron");

const WINDOW_WIDTH = 720;
const WINDOW_HEIGHT = 405;

let gameWindow = null;

function getDevelopmentUrl() {
  const candidate = process.env.LAUGH_RUNNER_URL;
  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    const isLoopback = url.hostname === "127.0.0.1" || url.hostname === "localhost";
    return url.protocol === "http:" && isLoopback ? url.toString() : null;
  } catch {
    return null;
  }
}

function createGameWindow() {
  gameWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    useContentSize: true,
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    transparent: true,
    hasShadow: false,
    backgroundColor: "#00000000",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: false,
    },
  });

  gameWindow.setMenuBarVisibility(false);
  gameWindow.center();
  gameWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  gameWindow.webContents.on("before-input-event", (event, input) => {
    if (!(input.meta || input.control)) return;
    const key = input.key.toLowerCase();
    if (key === "q") {
      event.preventDefault();
      app.quit();
    } else if (key === "w") {
      event.preventDefault();
      gameWindow?.close();
    }
  });
  gameWindow.once("ready-to-show", () => gameWindow?.show());
  gameWindow.on("closed", () => {
    gameWindow = null;
  });

  const developmentUrl = getDevelopmentUrl();
  if (developmentUrl) {
    void gameWindow.loadURL(developmentUrl);
  } else {
    void gameWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"), {
      query: { compact: "1", desktop: "1" },
    });
  }
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!gameWindow) return;
    if (gameWindow.isMinimized()) gameWindow.restore();
    gameWindow.show();
    gameWindow.focus();
  });

  app.whenReady().then(() => {
    createGameWindow();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createGameWindow();
  });

  app.on("window-all-closed", () => app.quit());
}
