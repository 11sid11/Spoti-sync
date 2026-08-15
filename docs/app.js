(() => {
  'use strict';

  const sourceManifestUrl = new URL('source-files.json', window.location.href).href;
  const versionUrl = new URL('version.json', window.location.href).href;
  const rawSourceBase = 'https://raw.githubusercontent.com/11sid11/Spoti-sync/main/src/';

  const copyButtons = Array.from(document.querySelectorAll('[data-copy-bundle]'));
  const downloadButtons = Array.from(document.querySelectorAll('[data-download-bundle]'));

  let sourceFilesPromise = null;
  let bundlePromise = null;

  function statusElementFor(button) {
    const id = button.dataset.statusTarget;
    return id ? document.getElementById(id) : null;
  }

  function setStatus(target, message, isError = false) {
    if (!target) return;
    target.textContent = message;
    target.dataset.state = isError ? 'error' : 'ok';
  }

  async function loadCurrentVersion() {
    try {
      const response = await fetch(versionUrl, { cache: 'no-store' });
      if (!response.ok) return;
      const metadata = await response.json();
      if (!metadata || typeof metadata.version !== 'string') return;
      document.querySelectorAll('[data-current-version]').forEach((element) => {
        element.textContent = `v${metadata.version}`;
      });
    } catch (_) {
      // The version chip is optional; installer actions remain available.
    }
  }

  function getSourceFiles() {
    if (!sourceFilesPromise) {
      sourceFilesPromise = fetch(sourceManifestUrl, { cache: 'no-store' })
        .then((response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status} while loading source-files.json`);
          return response.json();
        })
        .then((files) => {
          const valid = Array.isArray(files) &&
            files.length > 0 &&
            files.every((filename) => typeof filename === 'string' && /^[0-9A-Za-z_-]+\.gs$/.test(filename));
          if (!valid) throw new Error('source-files.json is invalid.');
          return files.slice();
        })
        .catch((error) => {
          sourceFilesPromise = null;
          throw error;
        });
    }
    return sourceFilesPromise;
  }

  async function fetchSource(filename) {
    const urls = [
      new URL(`../src/${filename}`, window.location.href).href,
      `${rawSourceBase}${filename}`
    ];
    let lastError = null;

    for (const url of urls) {
      try {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
        return await response.text();
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error(`Could not load ${filename}`);
  }

  function getBundle() {
    if (!bundlePromise) {
      bundlePromise = getSourceFiles()
        .then((sourceFiles) => Promise.all(sourceFiles.map(async (filename) => {
          const content = (await fetchSource(filename)).trimEnd();
          return `// ---- ${filename} ----\n${content}`;
        })))
        .then((parts) => [
          '// Spoti Sync — generated install bundle.',
          '// Source: https://github.com/11sid11/Spoti-sync',
          '// Generated in your browser from the committed src/*.gs modules.',
          '',
          parts.join('\n\n'),
          ''
        ].join('\n'))
        .catch((error) => {
          bundlePromise = null;
          throw error;
        });
    }
    return bundlePromise;
  }

  async function copyText(text) {
    if (window.isSecureContext && navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch (_) {
        // Fall through to a selection-based copy for restrictive browsers.
      }
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();

    const copied = document.execCommand('copy');
    textarea.remove();
    if (!copied) throw new Error('Browser blocked clipboard access.');
  }

  function downloadText(filename, text) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  copyButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      const status = statusElementFor(button);
      button.disabled = true;
      setStatus(status, 'Building the Apps Script bundle…');
      try {
        await copyText(await getBundle());
        setStatus(status, 'Copied. Paste it into Code.gs and save.');
      } catch (error) {
        setStatus(status, 'Copy was blocked. Use Download instead.', true);
        console.error('Bundle copy failed:', error);
      } finally {
        button.disabled = false;
      }
    });
  });

  downloadButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      const status = statusElementFor(button);
      button.disabled = true;
      setStatus(status, 'Building the Apps Script bundle…');
      try {
        downloadText('SpotiSync.gs', await getBundle());
        setStatus(status, 'Downloaded SpotiSync.gs.');
      } catch (error) {
        setStatus(status, 'Could not build the bundle. Try again or open the GitHub source.', true);
        console.error('Bundle download failed:', error);
      } finally {
        button.disabled = false;
      }
    });
  });

  loadCurrentVersion();
})();
