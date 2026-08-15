(() => {
  'use strict';

  const storageKey = 'spoti-sync-setup-progress-v1';
  const sourceManifestUrl = new URL('source-files.json', window.location.href).href;
  const rawSourceBase = 'https://raw.githubusercontent.com/11sid11/Spoti-sync/main/src/';

  const checkboxes = Array.from(document.querySelectorAll('.step-check input[type="checkbox"]'));
  const progressText = document.getElementById('progressText');
  const progressBar = document.getElementById('progressBar');
  const resetButton = document.getElementById('resetProgress');
  const copyButtons = Array.from(document.querySelectorAll('[data-copy-bundle], #copyBundle'));
  const downloadButtons = Array.from(
    document.querySelectorAll('[data-download-bundle], a[href$="downloads/SpotiSync.gs"]')
  );
  const copyStatus = document.getElementById('copyStatus');

  let sourceFilesPromise = null;
  let bundlePromise = null;

  function readProgress() {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || '{}');
    } catch (_) {
      return {};
    }
  }

  function writeProgress() {
    const value = {};
    checkboxes.forEach((checkbox) => {
      value[checkbox.id] = checkbox.checked;
    });
    localStorage.setItem(storageKey, JSON.stringify(value));
    renderProgress();
  }

  function renderProgress() {
    const complete = checkboxes.filter((checkbox) => checkbox.checked).length;
    const percent = checkboxes.length === 0 ? 0 : Math.round((complete / checkboxes.length) * 100);
    if (progressText) {
      progressText.textContent = `${complete} of ${checkboxes.length} complete`;
    }
    if (progressBar) {
      progressBar.style.width = `${percent}%`;
    }
  }

  function getSourceFiles() {
    if (!sourceFilesPromise) {
      sourceFilesPromise = fetch(sourceManifestUrl, { cache: 'no-store' })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`HTTP ${response.status} while loading source-files.json`);
          }
          return response.json();
        })
        .then((files) => {
          if (!Array.isArray(files) || files.length === 0 ||
              files.some((filename) => typeof filename !== 'string' || !/^[0-9A-Za-z_-]+\.gs$/.test(filename))) {
            throw new Error('source-files.json is invalid.');
          }
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
    const sameOriginUrl = new URL(`../src/${filename}`, window.location.href).href;
    const rawUrl = `${rawSourceBase}${filename}`;
    const urls = [sameOriginUrl, rawUrl];
    let lastError = null;

    for (const url of urls) {
      try {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} from ${url}`);
        }
        return await response.text();
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error(`Could not load ${filename}`);
  }

  function buildBanner() {
    return [
      '// Spoti Sync — generated install bundle.',
      '// Source: https://github.com/11sid11/Spoti-sync',
      '// Generated in your browser from the committed src/*.gs modules.',
      ''
    ].join('\n');
  }

  function getBundle() {
    if (!bundlePromise) {
      bundlePromise = getSourceFiles()
        .then((sourceFiles) => Promise.all(sourceFiles.map(async (filename) => {
          const content = (await fetchSource(filename)).trimEnd();
          return `// ---- ${filename} ----\n${content}`;
        })))
        .then((parts) => `${buildBanner()}${parts.join('\n\n')}\n`)
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
        // Fall through to the textarea path. Some browsers block clipboard
        // writes even in secure contexts depending on permissions/policy.
      }
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.setAttribute('aria-hidden', 'true');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);

    let copied = false;
    try {
      copied = document.execCommand('copy');
    } finally {
      textarea.remove();
    }

    if (!copied) {
      throw new Error('Browser blocked automatic clipboard access.');
    }
  }

  function downloadText(filename, text) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function statusElementFor(button) {
    const targetId = button && button.dataset ? button.dataset.statusTarget : '';
    return targetId ? document.getElementById(targetId) : copyStatus;
  }

  function setStatus(message, isError = false, target = copyStatus) {
    if (!target) {
      return;
    }
    target.textContent = message;
    target.dataset.state = isError ? 'error' : 'ok';
  }

  const saved = readProgress();
  checkboxes.forEach((checkbox) => {
    checkbox.checked = Boolean(saved[checkbox.id]);
    checkbox.addEventListener('change', writeProgress);
  });
  renderProgress();

  if (resetButton) {
    resetButton.addEventListener('click', () => {
      checkboxes.forEach((checkbox) => {
        checkbox.checked = false;
      });
      writeProgress();
    });
  }

  copyButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      const status = statusElementFor(button);
      button.disabled = true;
      setStatus('Building Apps Script from the source modules…', false, status);
      try {
        const bundle = await getBundle();
        await copyText(bundle);
        setStatus('Copied. Paste it into Code.gs in Apps Script.', false, status);
      } catch (error) {
        setStatus('Automatic copy was blocked. Use “Download Apps Script” instead.', true, status);
        console.error('Bundle copy failed:', error);
      } finally {
        button.disabled = false;
      }
    });
  });

  downloadButtons.forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      if (button.dataset.busy === 'true') {
        return;
      }

      const status = statusElementFor(button);
      button.dataset.busy = 'true';
      const originalText = button.textContent;
      button.textContent = 'Preparing…';
      setStatus('Building Apps Script from the source modules…', false, status);
      try {
        const bundle = await getBundle();
        downloadText('SpotiSync.gs', bundle);
        setStatus('Downloaded SpotiSync.gs.', false, status);
      } catch (error) {
        setStatus('Could not build the installer. Open the GitHub source and try again.', true, status);
        console.error('Bundle download failed:', error);
      } finally {
        delete button.dataset.busy;
        button.textContent = originalText;
      }
    });
  });
})();
