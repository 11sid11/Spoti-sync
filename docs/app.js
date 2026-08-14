(() => {
  'use strict';

  const storageKey = 'spoti-sync-setup-progress-v1';
  const sourceFiles = [
    '00_Core.gs',
    '10_Storage.gs',
    '20_SpotifyAuth.gs',
    '30_SpotifyApi.gs',
    '40_Sources.gs',
    '50_Strategies.gs',
    '60_SheetStore.gs',
    '70_SyncEngine.gs',
    '80_Scheduler.gs',
    '90_Ui.gs',
    '99_Entrypoints.gs'
  ];
  const rawSourceBase = 'https://raw.githubusercontent.com/11sid11/Spoti-sync/main/src/';

  const checkboxes = Array.from(document.querySelectorAll('.step-check input[type="checkbox"]'));
  const progressText = document.getElementById('progressText');
  const progressBar = document.getElementById('progressBar');
  const resetButton = document.getElementById('resetProgress');
  const copyButton = document.getElementById('copyBundle');
  const downloadButtons = Array.from(
    document.querySelectorAll('[data-download-bundle], a[href$="downloads/SpotiSync.gs"]')
  );
  const copyStatus = document.getElementById('copyStatus');

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
    progressText.textContent = `${complete} of ${checkboxes.length} complete`;
    progressBar.style.width = `${percent}%`;
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
      bundlePromise = Promise.all(sourceFiles.map(async (filename) => {
        const content = (await fetchSource(filename)).trimEnd();
        return `// ---- ${filename} ----\n${content}`;
      }))
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

  function setStatus(message, isError = false) {
    if (!copyStatus) {
      return;
    }
    copyStatus.textContent = message;
    copyStatus.dataset.state = isError ? 'error' : 'ok';
  }

  const saved = readProgress();
  checkboxes.forEach((checkbox) => {
    checkbox.checked = Boolean(saved[checkbox.id]);
    checkbox.addEventListener('change', writeProgress);
  });
  renderProgress();

  resetButton.addEventListener('click', () => {
    checkboxes.forEach((checkbox) => {
      checkbox.checked = false;
    });
    writeProgress();
  });

  copyButton.addEventListener('click', async () => {
    copyButton.disabled = true;
    setStatus('Building Apps Script from the source modules…');
    try {
      const bundle = await getBundle();
      await copyText(bundle);
      setStatus('Copied. Paste it into Code.gs in Apps Script.');
    } catch (error) {
      setStatus('Automatic copy was blocked. Use “Download Apps Script” instead.', true);
      console.error('Bundle copy failed:', error);
    } finally {
      copyButton.disabled = false;
    }
  });

  downloadButtons.forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      if (button.dataset.busy === 'true') {
        return;
      }

      button.dataset.busy = 'true';
      const originalText = button.textContent;
      button.textContent = 'Preparing…';
      setStatus('Building Apps Script from the source modules…');
      try {
        const bundle = await getBundle();
        downloadText('SpotiSync.gs', bundle);
        setStatus('Downloaded SpotiSync.gs.');
      } catch (error) {
        setStatus('Could not build the installer. Open the GitHub source and try again.', true);
        console.error('Bundle download failed:', error);
      } finally {
        delete button.dataset.busy;
        button.textContent = originalText;
      }
    });
  });
})();
