(() => {
  'use strict';

  const storageKey = 'spoti-sync-setup-progress-v1';
  const checkboxes = Array.from(document.querySelectorAll('.step-check input[type="checkbox"]'));
  const progressText = document.getElementById('progressText');
  const progressBar = document.getElementById('progressBar');
  const resetButton = document.getElementById('resetProgress');
  const copyButton = document.getElementById('copyBundle');
  const copyStatus = document.getElementById('copyStatus');

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
    const percent = Math.round((complete / checkboxes.length) * 100);
    progressText.textContent = `${complete} of ${checkboxes.length} complete`;
    progressBar.style.width = `${percent}%`;
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
    copyStatus.textContent = 'Loading install bundle…';
    try {
      const response = await fetch('downloads/SpotiSync.gs', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const bundle = await response.text();
      await navigator.clipboard.writeText(bundle);
      copyStatus.textContent = 'Copied. Paste it into Code.gs in Apps Script.';
    } catch (error) {
      copyStatus.textContent = 'Could not copy automatically. Use “Download file” instead.';
      console.error('Bundle copy failed:', error);
    } finally {
      copyButton.disabled = false;
    }
  });
})();
