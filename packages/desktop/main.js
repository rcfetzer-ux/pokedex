/**
 * Desktop shell.
 *
 * The desktop build is meant to be one click, so this process owns the whole
 * stack: it starts the API on a free port, serves the exported web build over
 * loopback HTTP, and points the window at it.
 *
 * The web build is served rather than loaded over file:// because Expo's
 * exported index.html references its bundle by absolute path, which file://
 * resolves against the filesystem root. Serving it also gives the renderer a
 * normal http origin, so fetch and CORS behave the way they do everywhere else.
 */
const { app, BrowserWindow, dialog, shell } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');

const isPackaged = app.isPackaged;

// Without this the app name comes from the package name, and the user data
// directory (which holds the database) ends up at "@pokedex/desktop".
app.setName('Pokedex');

/** Where the built web bundle and server live, dev vs packaged. */
const paths = isPackaged
  ? {
      web: path.join(process.resourcesPath, 'web'),
      serverEntry: path.join(process.resourcesPath, 'server', 'dist', 'index.js'),
      nodeModules: path.join(process.resourcesPath, 'node_modules'),
    }
  : {
      web: path.join(__dirname, '..', 'app', 'dist'),
      serverEntry: path.join(__dirname, '..', 'server', 'dist', 'index.js'),
      nodeModules: path.join(__dirname, '..', '..', 'node_modules'),
    };

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

let apiProcess = null;
let staticServer = null;
let mainWindow = null;

function findFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/**
 * Static file server for the exported web build, with SPA fallback: the Expo
 * export is a single-page app, so an unknown path is a client route, not a 404.
 */
function startStaticServer(root, port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const requestPath = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      let filePath = path.join(root, requestPath);

      // Never serve outside the web root, whatever the URL claims.
      if (!filePath.startsWith(root)) {
        response.writeHead(403).end('Forbidden');
        return;
      }

      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(root, 'index.html');
      }

      fs.readFile(filePath, (error, contents) => {
        if (error) {
          response.writeHead(404).end('Not found');
          return;
        }
        const type = MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
        response.writeHead(200, { 'content-type': type }).end(contents);
      });
    });

    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

/**
 * Which binary runs the API child process.
 *
 * The server loads better-sqlite3, a native module built for exactly one
 * Node ABI. In development node_modules is built for the system Node, so
 * running the server under Electron-as-Node fails to load the binding; in a
 * packaged app there is no system Node to rely on, but electron-builder has
 * rebuilt the module against Electron's ABI. So: system Node in development,
 * Electron-as-Node once packaged. POKEDEX_NODE_BIN overrides either way.
 */
function resolveServerRuntime() {
  const override = process.env.POKEDEX_NODE_BIN;
  if (override && fs.existsSync(override)) {
    return { command: override, runAsNode: false };
  }

  if (!isPackaged) {
    const systemNode = findSystemNode();
    if (systemNode) return { command: systemNode, runAsNode: false };
  }

  return { command: process.execPath, runAsNode: true };
}

function findSystemNode() {
  const candidates =
    process.platform === 'win32'
      ? (process.env.PATH ?? '').split(';').map((dir) => path.join(dir, 'node.exe'))
      : (process.env.PATH ?? '').split(':').map((dir) => path.join(dir, 'node'));

  return candidates.find((candidate) => {
    try {
      return fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
}

function startApiServer(port) {
  if (!fs.existsSync(paths.serverEntry)) {
    throw new Error(
      `The API server has not been built.\n\nExpected: ${paths.serverEntry}\n\n` +
        'Run "npm run build" from the repository root, then start the desktop app again.',
    );
  }

  const runtime = resolveServerRuntime();

  const child = spawn(runtime.command, [paths.serverEntry], {
    env: {
      ...process.env,
      // Only when the runtime IS Electron: tells it to behave as plain Node
      // rather than trying to boot a second Electron app.
      ...(runtime.runAsNode ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
      NODE_PATH: paths.nodeModules,
      PORT: String(port),
      HOST: '127.0.0.1',
      // Keep the database with the user's app data, not inside the bundle.
      DATABASE_PATH: path.join(app.getPath('userData'), 'pokedex.db'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => process.stdout.write(`[api] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[api] ${chunk}`));

  return child;
}

/** Poll until the API answers, so the window never loads against a dead API. */
async function waitForApi(port, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const healthy = await new Promise((resolve) => {
      const request = http.get(
        { host: '127.0.0.1', port, path: '/api/health', timeout: 1_000 },
        (response) => {
          response.resume();
          resolve(response.statusCode === 200);
        },
      );
      request.on('error', () => resolve(false));
      request.on('timeout', () => {
        request.destroy();
        resolve(false);
      });
    });

    if (healthy) return true;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return false;
}

async function createWindow(webUrl, apiUrl) {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 860,
    minWidth: 480,
    minHeight: 600,
    backgroundColor: '#0B1120',
    title: 'Pokedex',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // The renderer needs the API URL before the bundle runs; preload reads it
      // from here rather than from a file the renderer could not reach.
      additionalArguments: [`--pokedex-api-url=${apiUrl}`],
    },
  });

  // External links belong in the user's browser, not in a chrome-less window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  await mainWindow.loadURL(webUrl);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function bootstrap() {
  if (!fs.existsSync(path.join(paths.web, 'index.html'))) {
    throw new Error(
      `The web build is missing.\n\nExpected: ${path.join(paths.web, 'index.html')}\n\n` +
        'Run "npm run build:web -w @pokedex/desktop" and try again.',
    );
  }

  const [apiPort, webPort] = await Promise.all([findFreePort(), findFreePort()]);

  apiProcess = startApiServer(apiPort);
  apiProcess.on('exit', (code) => {
    if (code !== 0 && code !== null && mainWindow) {
      dialog.showErrorBox('Pokedex', `The API server stopped unexpectedly (exit code ${code}).`);
    }
  });

  if (!(await waitForApi(apiPort))) {
    throw new Error('The API server did not start within 30 seconds.');
  }

  staticServer = await startStaticServer(paths.web, webPort);
  await createWindow(`http://127.0.0.1:${webPort}`, `http://127.0.0.1:${apiPort}`);
}

function shutdown() {
  if (apiProcess && !apiProcess.killed) apiProcess.kill();
  apiProcess = null;
  staticServer?.close();
  staticServer = null;
}

app.whenReady().then(() => {
  bootstrap().catch((error) => {
    dialog.showErrorBox('Pokedex could not start', error.message);
    app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void bootstrap();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Covers quit, SIGINT and a crash alike — a stranded API child process would
// hold the database lock and its port.
app.on('before-quit', shutdown);
process.on('exit', shutdown);
