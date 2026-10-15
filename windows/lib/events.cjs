'use strict';
const net = require('node:net');
const crypto = require('node:crypto');
const fs = require('node:fs');
const { atomicJSON, readJSON } = require('./storage.cjs');

function parseRequest(data, token, states) {
  if (data.length > 4096) return { status: 413 };
  const boundary = data.indexOf('\r\n\r\n');
  if (boundary < 0) return null;
  const head = data.subarray(0, boundary).toString('latin1').split('\r\n');
  const request = head.shift().split(' ');
  if (request.length !== 3 || request[2] !== 'HTTP/1.1') return { status: 400 };
  if (request[1] !== '/event') return { status: 404 };
  if (request[0] !== 'POST') return { status: 405 };
  const headers = Object.create(null);
  for (const line of head) {
    const colon = line.indexOf(':');
    const key = line.slice(0, colon).toLowerCase();
    if (colon < 1 || !/^[a-z0-9-]+$/.test(key) || Object.hasOwn(headers, key)) return { status: 400 };
    headers[key] = line.slice(colon + 1).trim();
  }
  if ('origin' in headers) return { status: 403 };
  if ('transfer-encoding' in headers) return { status: 400 };
  const wanted = Buffer.from('Bearer ' + token), got = Buffer.from(headers.authorization || '');
  if (got.length !== wanted.length || !crypto.timingSafeEqual(got, wanted)) return { status: 401 };
  if (headers['content-type']?.split(';')[0].toLowerCase() !== 'application/json') return { status: 415 };
  if (!/^\d+$/.test(headers['content-length'] || '')) return { status: 400 };
  const length = Number(headers['content-length']);
  if (length < 1 || length > 512) return { status: 413 };
  const body = data.subarray(boundary + 4);
  if (body.length < length) return null;
  if (body.length !== length) return { status: 400 };
  try {
    const event = JSON.parse(body.toString('utf8'));
    if (!event || Array.isArray(event) || Object.keys(event).sort().join(',') !== 'source,state' ||
      !states.includes(event.state) || !['codex', 'claude', 'manual'].includes(event.source)) return { status: 400 };
    return { status: 204, event };
  } catch { return { status: 400 }; }
}
function response(status) {
  const reasons = { 204: 'No Content', 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed', 413: 'Payload Too Large', 415: 'Unsupported Media Type', 429: 'Too Many Requests' };
  return `HTTP/1.1 ${status} ${reasons[status]}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`;
}
class EventServer {
  constructor(file, states, onEvent) { Object.assign(this, { file, states, onEvent, token: crypto.randomBytes(32).toString('hex'), sockets: new Set() }); }
  start(port = 8766) {
    let count = 0, second = 0;
    this.server = net.createServer(socket => {
      socket.on('error', () => {});
      if (this.sockets.size >= 16) { socket.end(response(429)); return; }
      this.sockets.add(socket);
      socket.on('close', () => this.sockets.delete(socket));
      socket.setTimeout(1000, () => socket.destroy());
      const deadline = setTimeout(() => socket.destroy(), 1000);
      socket.on('close', () => clearTimeout(deadline));
      let data = Buffer.alloc(0), finished = false;
      socket.on('data', part => {
        if (finished) return;
        if (data.length + part.length > 4096) { finished = true; socket.end(response(413)); return; }
        data = Buffer.concat([data, part]);
        const result = parseRequest(data, this.token, this.states);
        if (!result) return;
        finished = true;
        const now = Math.floor(Date.now() / 1000);
        if (now !== second) { second = now; count = 0; }
        if (++count > 50) { socket.end(response(429)); return; }
        socket.end(response(result.status));
        if (result.event) this.onEvent(result.event);
      });
    });
    return new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(port, '127.0.0.1', () => {
        try {
          atomicJSON(this.file, { port: this.server.address().port, token: this.token });
          resolve(this.server.address().port);
        } catch (e) { this.server.close(); reject(e); }
      });
    });
  }
  async close() {
    if (readJSON(this.file, {}).token === this.token) fs.unlinkSync(this.file);
    for (const s of this.sockets) s.destroy();
    if (this.server?.listening) await new Promise(resolve => this.server.close(resolve));
  }
}
module.exports = { parseRequest, response, EventServer };
