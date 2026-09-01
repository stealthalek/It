const crypto = require('crypto');

const endpoint = process.env.S3_ENDPOINT;
const bucket = process.env.S3_BUCKET;
const region = process.env.S3_REGION || 'auto';
const accessKeyId = process.env.S3_ACCESS_KEY_ID;
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

const enabled = Boolean(endpoint && bucket && accessKeyId && secretAccessKey);
const host = enabled ? new URL(endpoint).host : null;

function sha256Hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function hmac(key, data) {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

function signingKey(dateStamp) {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, 's3');
  return hmac(kService, 'aws4_request');
}

function signedRequest(method, key, body, extraHeaders) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(body || '');
  const canonicalUri = `/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;

  const headers = { host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate, ...extraHeaders };
  const headerNames = Object.keys(headers).sort();
  const canonicalHeaders = headerNames.map((n) => `${n}:${headers[n]}\n`).join('');
  const signedHeaders = headerNames.join(';');

  const canonicalRequest = `${method}\n${canonicalUri}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${sha256Hex(canonicalRequest)}`;
  const signature = crypto.createHmac('sha256', signingKey(dateStamp)).update(stringToSign, 'utf8').digest('hex');

  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return { url: `${endpoint}${canonicalUri}`, headers: { ...headers, Authorization: authorization } };
}

async function putObject(key, buffer, contentType) {
  const { url, headers } = signedRequest('PUT', key, buffer, { 'content-type': contentType || 'application/octet-stream' });
  const res = await fetch(url, { method: 'PUT', headers, body: buffer });
  if (!res.ok) throw new Error(`Upload allegato fallito (${res.status})`);
}

async function getObject(key) {
  const { url, headers } = signedRequest('GET', key, '');
  const res = await fetch(url, { method: 'GET', headers });
  if (!res.ok) throw new Error(`Recupero allegato fallito (${res.status})`);
  const arrayBuffer = await res.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), contentType: res.headers.get('content-type') || 'application/octet-stream' };
}

async function deleteObject(key) {
  const { url, headers } = signedRequest('DELETE', key, '');
  const res = await fetch(url, { method: 'DELETE', headers });
  if (!res.ok && res.status !== 404) throw new Error(`Eliminazione allegato fallita (${res.status})`);
}

module.exports = { enabled, putObject, getObject, deleteObject };
