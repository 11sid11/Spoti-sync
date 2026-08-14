var SpotiSync = SpotiSync || {};

(function (ns) {
  'use strict';

  var KEYS = Object.freeze({
    CLIENT_ID: 'SPOTIFY_CLIENT_ID',
    REFRESH_TOKEN: 'SPOTIFY_REFRESH_TOKEN',
    ACCESS_TOKEN: 'SPOTIFY_ACCESS_TOKEN',
    ACCESS_EXPIRES_AT: 'SPOTIFY_ACCESS_TOKEN_EXPIRES_AT',
    AUTHORIZED_AT: 'SPOTIFY_AUTHORIZED_AT',
    PKCE_VERIFIER: 'SPOTIFY_PKCE_VERIFIER'
  });

  ns.Storage = {
    keys: KEYS,

    userProperties: function () {
      return PropertiesService.getUserProperties();
    },

    documentProperties: function () {
      return PropertiesService.getDocumentProperties();
    },

    getClientId: function () {
      return ns.Core.trim(ns.Storage.userProperties().getProperty(KEYS.CLIENT_ID));
    },

    setClientId: function (clientId) {
      ns.Storage.userProperties().setProperty(KEYS.CLIENT_ID, ns.Core.trim(clientId));
    },

    getTokenState: function () {
      var props = ns.Storage.userProperties();
      return {
        accessToken: props.getProperty(KEYS.ACCESS_TOKEN) || '',
        refreshToken: props.getProperty(KEYS.REFRESH_TOKEN) || '',
        expiresAt: Number(props.getProperty(KEYS.ACCESS_EXPIRES_AT) || 0),
        authorizedAt: props.getProperty(KEYS.AUTHORIZED_AT) || ''
      };
    },

    storeTokenResponse: function (tokenResponse) {
      var props = ns.Storage.userProperties();
      var values = {};
      var expiresIn = Number(tokenResponse.expires_in || 3600);
      var existingRefreshToken = props.getProperty(KEYS.REFRESH_TOKEN) || '';

      ns.Core.assert(tokenResponse.access_token, 'Spotify token response did not include an access token.');

      values[KEYS.ACCESS_TOKEN] = tokenResponse.access_token;
      values[KEYS.ACCESS_EXPIRES_AT] = String(
        Date.now() + expiresIn * 1000 - ns.Constants.TOKEN_EXPIRY_SKEW_MS
      );
      values[KEYS.REFRESH_TOKEN] = tokenResponse.refresh_token || existingRefreshToken;

      if (!props.getProperty(KEYS.AUTHORIZED_AT)) {
        values[KEYS.AUTHORIZED_AT] = ns.Core.nowIso();
      }

      props.setProperties(values, false);
    },

    setPkceVerifier: function (verifier) {
      ns.Storage.userProperties().setProperty(KEYS.PKCE_VERIFIER, verifier);
    },

    getPkceVerifier: function () {
      return ns.Storage.userProperties().getProperty(KEYS.PKCE_VERIFIER) || '';
    },

    clearPkceVerifier: function () {
      ns.Storage.userProperties().deleteProperty(KEYS.PKCE_VERIFIER);
    },

    clearSpotifyAuthorization: function (keepClientId) {
      var props = ns.Storage.userProperties();
      var clientId = keepClientId ? props.getProperty(KEYS.CLIENT_ID) : null;
      props.deleteProperty(KEYS.REFRESH_TOKEN);
      props.deleteProperty(KEYS.ACCESS_TOKEN);
      props.deleteProperty(KEYS.ACCESS_EXPIRES_AT);
      props.deleteProperty(KEYS.AUTHORIZED_AT);
      props.deleteProperty(KEYS.PKCE_VERIFIER);
      if (!keepClientId) {
        props.deleteProperty(KEYS.CLIENT_ID);
      } else if (clientId) {
        props.setProperty(KEYS.CLIENT_ID, clientId);
      }
    },

    setDocumentStatus: function (values) {
      var props = ns.Storage.documentProperties();
      if (props) {
        props.setProperties(values, false);
      }
    },

    getDocumentStatus: function () {
      var props = ns.Storage.documentProperties();
      return props ? props.getProperties() : {};
    }
  };
})(SpotiSync);
