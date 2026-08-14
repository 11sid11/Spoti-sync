var SpotiSync = SpotiSync || {};

(function (ns) {
  'use strict';

  function headerValue(headers, name) {
    var target = String(name).toLowerCase();
    var found = '';
    Object.keys(headers || {}).some(function (key) {
      if (String(key).toLowerCase() === target) {
        found = headers[key];
        return true;
      }
      return false;
    });
    return found;
  }

  function parseResponseBody(response) {
    var text = response.getContentText() || '';
    if (!text) {
      return null;
    }
    try {
      return JSON.parse(text);
    } catch (error) {
      return { raw: text.slice(0, 500) };
    }
  }

  function spotifyErrorMessage(status, body) {
    var message = '';
    if (body && body.error) {
      if (typeof body.error === 'string') {
        message = body.error_description || body.error;
      } else if (body.error.message) {
        message = body.error.message;
      }
    }
    return 'Spotify API request failed with HTTP ' + status + (message ? ': ' + message : '.');
  }

  function request(method, pathOrUrl, options) {
    var opts = options || {};
    var url = /^https?:\/\//i.test(pathOrUrl)
      ? pathOrUrl
      : ns.Constants.SPOTIFY_API_BASE + pathOrUrl;
    var maxAttempts = 4;
    var attempt = 0;
    var refreshedAfter401 = false;

    while (attempt < maxAttempts) {
      attempt += 1;
      var token = ns.Auth.getAccessToken(false);
      var fetchOptions = {
        method: method.toLowerCase(),
        headers: {
          Authorization: 'Bearer ' + token
        },
        muteHttpExceptions: true
      };

      if (opts.body !== undefined) {
        fetchOptions.contentType = 'application/json';
        fetchOptions.payload = JSON.stringify(opts.body);
      }

      var response = UrlFetchApp.fetch(url, fetchOptions);
      var status = response.getResponseCode();
      var body = parseResponseBody(response);

      if (status >= 200 && status < 300) {
        return body;
      }

      if (status === 401 && !refreshedAfter401) {
        ns.Auth.getAccessToken(true);
        refreshedAfter401 = true;
        attempt -= 1;
        continue;
      }

      if (status === 429 && attempt < maxAttempts) {
        var retryAfter = Number(headerValue(response.getHeaders(), 'Retry-After') || 1);
        if (retryAfter > ns.Constants.MAX_RETRY_AFTER_SECONDS) {
          throw new Error(
            'Spotify rate limited this sync for ' + retryAfter +
            ' seconds. The run stopped to stay within Apps Script execution limits; the scheduler will retry later.'
          );
        }
        Utilities.sleep(Math.max(1, retryAfter) * 1000);
        continue;
      }

      if ([500, 502, 503, 504].indexOf(status) !== -1 && attempt < maxAttempts) {
        Utilities.sleep(Math.pow(2, attempt - 1) * 1000);
        continue;
      }

      throw new Error(spotifyErrorMessage(status, body));
    }

    throw new Error('Spotify API request failed after retries.');
  }

  function getAllPages(path) {
    var next = path;
    var items = [];
    while (next) {
      var page = request('get', next);
      if (!page || !Array.isArray(page.items)) {
        throw new Error('Spotify returned an unexpected paginated response.');
      }
      items = items.concat(page.items);
      next = page.next || null;
    }
    return items;
  }

  ns.SpotifyApi = {
    request: request,

    getLikedTrackRows: function () {
      return getAllPages('/me/tracks?limit=' + ns.Constants.PAGE_SIZE + '&offset=0');
    },

    getPlaylistItemRows: function (playlistId) {
      var id = encodeURIComponent(ns.Core.parsePlaylistId(playlistId));
      return getAllPages('/playlists/' + id + '/items?limit=' + ns.Constants.PAGE_SIZE + '&offset=0');
    },

    addPlaylistItems: function (playlistId, uris, position) {
      var id = encodeURIComponent(ns.Core.parsePlaylistId(playlistId));
      var body = { uris: uris.slice() };
      ns.Core.assert(uris.length > 0 && uris.length <= ns.Constants.WRITE_BATCH_SIZE, 'Spotify add batch size must be 1–100 items.');
      if (position !== undefined && position !== null) {
        body.position = position;
      }
      return request('post', '/playlists/' + id + '/items', { body: body });
    },

    removePlaylistItems: function (playlistId, uris) {
      var id = encodeURIComponent(ns.Core.parsePlaylistId(playlistId));
      ns.Core.assert(uris.length > 0 && uris.length <= ns.Constants.WRITE_BATCH_SIZE, 'Spotify remove batch size must be 1–100 items.');
      return request('delete', '/playlists/' + id + '/items', {
        body: {
          items: uris.map(function (uri) {
            return { uri: uri };
          })
        }
      });
    },

    updatePlaylistDescription: function (playlistId, description) {
      var id = encodeURIComponent(ns.Core.parsePlaylistId(playlistId));
      var text = ns.Core.trim(description);
      ns.Core.assert(text, 'Playlist description cannot be empty.');
      return request('put', '/playlists/' + id, {
        body: {
          description: text
        }
      });
    }
  };
})(SpotiSync);
