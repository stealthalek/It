const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || null;
const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID || null;
const MICROSOFT_TENANT_ID = process.env.MICROSOFT_TENANT_ID || 'common';

const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

const microsoftJwks = jwksClient({
  jwksUri: 'https://login.microsoftonline.com/common/discovery/v2.0/keys',
  cache: true,
  cacheMaxAge: 60 * 60 * 1000,
});

function getMicrosoftSigningKey(header, callback) {
  microsoftJwks.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    callback(null, key.getPublicKey());
  });
}

function getSsoConfig() {
  return {
    google: GOOGLE_CLIENT_ID ? { clientId: GOOGLE_CLIENT_ID } : null,
    microsoft: MICROSOFT_CLIENT_ID ? { clientId: MICROSOFT_CLIENT_ID, tenant: MICROSOFT_TENANT_ID } : null,
  };
}

async function verifyGoogleCredential(credential) {
  if (!googleClient) {
    throw new Error('Accesso con Google non configurato');
  }
  const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
  const payload = ticket.getPayload();
  if (!payload || !payload.email) {
    throw new Error('Token Google non valido');
  }
  return { email: payload.email.toLowerCase(), name: payload.name || payload.email };
}

function verifyMicrosoftToken(idToken) {
  if (!MICROSOFT_CLIENT_ID) {
    return Promise.reject(new Error('Accesso con Microsoft non configurato'));
  }
  return new Promise((resolve, reject) => {
    jwt.verify(idToken, getMicrosoftSigningKey, { audience: MICROSOFT_CLIENT_ID }, (err, decoded) => {
      if (err) return reject(err);

      const restrictedTenant = !['common', 'organizations', 'consumers'].includes(MICROSOFT_TENANT_ID);
      const expectedIssuer = restrictedTenant
        ? `https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/v2.0`
        : null;
      const issuerPattern = /^https:\/\/login\.microsoftonline\.com\/[^/]+\/v2\.0$/;

      if (restrictedTenant && decoded.iss !== expectedIssuer) {
        return reject(new Error('Tenant Microsoft non autorizzato'));
      }
      if (!restrictedTenant && !issuerPattern.test(decoded.iss || '')) {
        return reject(new Error('Emittente del token non valido'));
      }

      const email = decoded.email || decoded.preferred_username;
      if (!email) {
        return reject(new Error('Token Microsoft privo di email'));
      }
      resolve({ email: email.toLowerCase(), name: decoded.name || email });
    });
  });
}

module.exports = { getSsoConfig, verifyGoogleCredential, verifyMicrosoftToken };
