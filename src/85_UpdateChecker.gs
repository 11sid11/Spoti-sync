var SpotiSync = SpotiSync || {};

(function (ns) {
  'use strict';

  var STATUS_KEYS = Object.freeze({
    LAST_CHECK_AT: 'UPDATE_LAST_CHECK_AT',
    CHECK_STATUS: 'UPDATE_CHECK_STATUS',
    LATEST_VERSION: 'UPDATE_LATEST_VERSION',
    AVAILABLE: 'UPDATE_AVAILABLE',
    INSTALLER_URL: 'UPDATE_INSTALLER_URL',
    CHANGELOG_URL: 'UPDATE_CHANGELOG_URL',
    NOTES: 'UPDATE_NOTES',
    LAST_ERROR: 'UPDATE_LAST_ERROR'
  });

  function parseVersion(version) {
    var value = ns.Core.trim(version);
    var match = value.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
    if (!match) {
      throw new Error('Invalid Spoti Sync version: ' + value);
    }
    return {
      raw: value,
      major: Number(match[1]),
      minor: Number(match[2]),
      patch: Number(match[3]),
      prerelease: match[4] || ''
    };
  }

  function compareIdentifiers(left, right) {
    var leftNumeric = /^\d+$/.test(left);
    var rightNumeric = /^\d+$/.test(right);
    if (leftNumeric && rightNumeric) {
      return Number(left) - Number(right);
    }
    if (leftNumeric !== rightNumeric) {
      return leftNumeric ? -1 : 1;
    }
    return left === right ? 0 : (left < right ? -1 : 1);
  }

  function comparePrerelease(left, right) {
    if (!left && !right) {
      return 0;
    }
    if (!left) {
      return 1;
    }
    if (!right) {
      return -1;
    }

    var leftParts = left.split('.');
    var rightParts = right.split('.');
    var length = Math.max(leftParts.length, rightParts.length);
    var index;
    for (index = 0; index < length; index += 1) {
      if (leftParts[index] === undefined) {
        return -1;
      }
      if (rightParts[index] === undefined) {
        return 1;
      }
      var compared = compareIdentifiers(leftParts[index], rightParts[index]);
      if (compared !== 0) {
        return compared;
      }
    }
    return 0;
  }

  function compareVersions(left, right) {
    var a = parseVersion(left);
    var b = parseVersion(right);
    var fields = ['major', 'minor', 'patch'];
    var index;
    for (index = 0; index < fields.length; index += 1) {
      var field = fields[index];
      if (a[field] !== b[field]) {
        return a[field] - b[field];
      }
    }
    return comparePrerelease(a.prerelease, b.prerelease);
  }

  function validateHttpsUrl(value, fieldName) {
    var url = ns.Core.trim(value);
    if (!/^https:\/\//i.test(url)) {
      throw new Error('Update metadata field ' + fieldName + ' must be an HTTPS URL.');
    }
    return url;
  }

  function validateMetadata(metadata) {
    if (!metadata || Number(metadata.schema) !== 1) {
      throw new Error('Unsupported Spoti Sync update metadata schema.');
    }

    var version = parseVersion(metadata.version).raw;
    var notes = Array.isArray(metadata.notes)
      ? metadata.notes.slice(0, 5).map(function (note) {
          return ns.Core.trim(note).slice(0, 240);
        }).filter(Boolean)
      : [];

    return {
      version: version,
      channel: ns.Core.trim(metadata.channel) || 'stable',
      releasedAt: ns.Core.trim(metadata.released_at),
      installerUrl: validateHttpsUrl(metadata.installer_url, 'installer_url'),
      changelogUrl: validateHttpsUrl(metadata.changelog_url, 'changelog_url'),
      notes: notes
    };
  }

  function fetchMetadata() {
    var response = UrlFetchApp.fetch(ns.Constants.UPDATE_METADATA_URL, {
      method: 'get',
      muteHttpExceptions: true,
      headers: {
        Accept: 'application/json'
      }
    });
    var status = response.getResponseCode();
    if (status !== 200) {
      throw new Error('GitHub update check returned HTTP ' + status + '.');
    }

    var parsed;
    try {
      parsed = JSON.parse(response.getContentText() || '{}');
    } catch (error) {
      throw new Error('GitHub update metadata was not valid JSON.');
    }
    return validateMetadata(parsed);
  }

  function parseNotes(value) {
    if (!value) {
      return [];
    }
    try {
      var parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (ignored) {
      return [];
    }
  }

  function cachedStatus() {
    var status = ns.Storage.getDocumentStatus();
    var latestVersion = status[STATUS_KEYS.LATEST_VERSION] || '';
    var checkStatus = status[STATUS_KEYS.CHECK_STATUS] || 'Not checked';
    var updateAvailable = false;

    if (latestVersion) {
      try {
        updateAvailable = compareVersions(latestVersion, ns.VERSION) > 0;
        if (!updateAvailable && checkStatus === 'Update available') {
          checkStatus = 'Up to date';
        }
      } catch (ignored) {
        latestVersion = '';
      }
    }

    return {
      currentVersion: ns.VERSION,
      latestVersion: latestVersion,
      updateAvailable: updateAvailable,
      checkStatus: checkStatus,
      checkedAt: status[STATUS_KEYS.LAST_CHECK_AT] || '',
      installerUrl: status[STATUS_KEYS.INSTALLER_URL] || '',
      changelogUrl: status[STATUS_KEYS.CHANGELOG_URL] || '',
      notes: parseNotes(status[STATUS_KEYS.NOTES]),
      error: status[STATUS_KEYS.LAST_ERROR] || ''
    };
  }

  function shouldCheck(force) {
    if (force) {
      return true;
    }
    var cached = cachedStatus();
    if (!cached.checkedAt) {
      return true;
    }
    var checkedAt = new Date(cached.checkedAt);
    if (isNaN(checkedAt.getTime())) {
      return true;
    }
    var interval = cached.checkStatus === 'Check failed'
      ? ns.Constants.UPDATE_ERROR_RETRY_MS
      : ns.Constants.UPDATE_CHECK_INTERVAL_MS;
    return Date.now() - checkedAt.getTime() >= interval;
  }

  function persistSuccess(metadata) {
    var updateAvailable = compareVersions(metadata.version, ns.VERSION) > 0;
    var values = {};
    values[STATUS_KEYS.LAST_CHECK_AT] = ns.Core.nowIso();
    values[STATUS_KEYS.CHECK_STATUS] = updateAvailable ? 'Update available' : 'Up to date';
    values[STATUS_KEYS.LATEST_VERSION] = metadata.version;
    values[STATUS_KEYS.AVAILABLE] = updateAvailable ? 'true' : 'false';
    values[STATUS_KEYS.INSTALLER_URL] = metadata.installerUrl;
    values[STATUS_KEYS.CHANGELOG_URL] = metadata.changelogUrl;
    values[STATUS_KEYS.NOTES] = JSON.stringify(metadata.notes);
    values[STATUS_KEYS.LAST_ERROR] = '';
    ns.Storage.setDocumentStatus(values);
    return cachedStatus();
  }

  function persistError(error) {
    var values = {};
    values[STATUS_KEYS.LAST_CHECK_AT] = ns.Core.nowIso();
    values[STATUS_KEYS.CHECK_STATUS] = 'Check failed';
    values[STATUS_KEYS.LAST_ERROR] = ns.Core.safeErrorMessage(error);
    ns.Storage.setDocumentStatus(values);
    return cachedStatus();
  }

  ns.UpdateChecker = {
    getCachedStatus: cachedStatus,

    compareVersions: compareVersions,

    check: function (options) {
      var opts = options || {};
      if (!shouldCheck(Boolean(opts.force))) {
        return cachedStatus();
      }

      try {
        return persistSuccess(fetchMetadata());
      } catch (error) {
        var result = persistError(error);
        if (opts.throwOnError) {
          throw error;
        }
        return result;
      }
    },

    statusLabel: function (status) {
      var value = status || cachedStatus();
      if (value.updateAvailable && value.latestVersion) {
        return 'Update available · ' + value.currentVersion + ' → ' + value.latestVersion;
      }
      if (value.checkStatus === 'Up to date') {
        return 'Up to date · ' + value.currentVersion;
      }
      if (value.checkStatus === 'Check failed') {
        return 'Check failed · current ' + value.currentVersion;
      }
      return 'Not checked · current ' + value.currentVersion;
    },

    _validateMetadata: validateMetadata,
    _shouldCheck: shouldCheck
  };
})(SpotiSync);
