var SpotiSync = SpotiSync || {};

(function (ns) {
  'use strict';

  function createPkceVerifier() {
    return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  }

  function createPkceChallenge(verifier) {
    var digest = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      verifier,
      Utilities.Charset.UTF_8
    );
    return Utilities.base64EncodeWebSafe(digest).replace(/=+$/g, '');
  }

  function fetchToken(payload) {
    var response = UrlFetchApp.fetch(ns.Constants.SPOTIFY_ACCOUNTS_BASE + '/api/token', {
      method: 'post',
      contentType: 'application/x-www-form-urlencoded',
      payload: ns.Core.formEncode(payload),
      muteHttpExceptions: true
    });
    var status = response.getResponseCode();
    var text = response.getContentText() || '';
    var body = text ? JSON.parse(text) : {};

    if (status < 200 || status >= 300) {
      var errorCode = body && body.error ? body.error : 'token_request_failed';
      var description = body && body.error_description ? body.error_description : 'Spotify token request failed.';
      var error = new Error(description + ' (' + errorCode + ')');
      error.spotifyCode = errorCode;
      throw error;
    }

    return body;
  }

  ns.Auth = {
    getRedirectUri: function () {
      return 'https://script.google.com/macros/d/' + ScriptApp.getScriptId() + '/usercallback';
    },

    validateClientId: function (clientId) {
      var value = ns.Core.trim(clientId);
      if (!/^[A-Za-z0-9]{16,64}$/.test(value)) {
        throw new Error('Spotify Client ID looks invalid. Copy the Client ID from your Spotify Developer app.');
      }
      return value;
    },

    startAuthorization: function (clientId) {
      var validatedClientId = ns.Auth.validateClientId(clientId || ns.Storage.getClientId());
      var verifier = createPkceVerifier();
      var challenge = createPkceChallenge(verifier);
      var stateToken = ScriptApp.newStateToken()
        .withMethod('spotiSyncOAuthCallback')
        .withTimeout(600)
        .createToken();
      var params;

      ns.Storage.setClientId(validatedClientId);
      ns.Storage.setPkceVerifier(verifier);

      params = {
        client_id: validatedClientId,
        response_type: 'code',
        redirect_uri: ns.Auth.getRedirectUri(),
        code_challenge_method: 'S256',
        code_challenge: challenge,
        state: stateToken,
        scope: ns.Constants.SPOTIFY_SCOPES.join(' '),
        show_dialog: 'true'
      };

      return ns.Constants.SPOTIFY_ACCOUNTS_BASE + '/authorize?' + ns.Core.formEncode(params);
    },

    handleCallback: function (event) {
      var params = event && event.parameter ? event.parameter : {};
      var verifier = ns.Storage.getPkceVerifier();
      var clientId = ns.Storage.getClientId();
      var tokenResponse;

      try {
        if (params.error) {
          throw new Error('Spotify authorization was not completed: ' + params.error);
        }
        ns.Core.assert(params.code, 'Spotify callback did not include an authorization code.');
        ns.Core.assert(verifier, 'PKCE verifier is missing. Start Spotify authorization again from the Sheet.');
        ns.Core.assert(clientId, 'Spotify Client ID is missing. Start setup again.');

        tokenResponse = fetchToken({
          grant_type: 'authorization_code',
          code: params.code,
          redirect_uri: ns.Auth.getRedirectUri(),
          client_id: clientId,
          code_verifier: verifier
        });

        ns.Storage.storeTokenResponse(tokenResponse);
        return {
          ok: true,
          message: 'Spotify is connected. You can close this tab and return to your Google Sheet.'
        };
      } catch (error) {
        return {
          ok: false,
          message: ns.Core.safeErrorMessage(error)
        };
      } finally {
        ns.Storage.clearPkceVerifier();
      }
    },

    isConnected: function () {
      return Boolean(ns.Storage.getTokenState().refreshToken);
    },

    getAccessToken: function (forceRefresh) {
      var tokenState = ns.Storage.getTokenState();
      if (!forceRefresh && tokenState.accessToken && tokenState.expiresAt > Date.now()) {
        return tokenState.accessToken;
      }
      return ns.Auth.refreshAccessToken();
    },

    refreshAccessToken: function () {
      var clientId = ns.Storage.getClientId();
      var tokenState = ns.Storage.getTokenState();
      var tokenResponse;

      if (!clientId || !tokenState.refreshToken) {
        var disconnected = new Error('Spotify is not connected. Open Spoti Sync → Setup and authorize Spotify.');
        disconnected.code = 'SPOTIFY_NOT_CONNECTED';
        throw disconnected;
      }

      try {
        tokenResponse = fetchToken({
          grant_type: 'refresh_token',
          refresh_token: tokenState.refreshToken,
          client_id: clientId
        });
        ns.Storage.storeTokenResponse(tokenResponse);
        return tokenResponse.access_token;
      } catch (error) {
        if (error.spotifyCode === 'invalid_grant') {
          ns.Storage.clearSpotifyAuthorization(true);
          var reauth = new Error('Spotify authorization expired or was revoked. Reconnect Spotify from Spoti Sync → Setup.');
          reauth.code = 'SPOTIFY_REAUTH_REQUIRED';
          throw reauth;
        }
        throw error;
      }
    },

    disconnect: function () {
      ns.Storage.clearSpotifyAuthorization(true);
    }
  };
})(SpotiSync);
