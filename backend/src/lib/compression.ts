/**
 * Response compression middleware using built-in zlib
 */
import { type Request, type Response, type NextFunction } from 'express';
import { gzip, deflate } from 'node:zlib';
import { promisify } from 'node:util';

const gzipAsync = promisify(gzip);
const deflateAsync = promisify(deflate);

const MIN_COMPRESS_LENGTH = 1024; // 1KB

export function compressionMiddleware() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const originalSend = res.send;

    res.send = function (body: any): Response {
      void compressAndSend(this, body, originalSend);
      return this;
    };

    res.json = function (body: any): Response {
      const jsonString = JSON.stringify(body);
      void compressAndSend(this, jsonString, originalSend);
      return this;
    };

    next();
  };
}

async function compressAndSend(res: Response, body: any, originalSend: Function) {
  if (res.headersSent) return;

  const acceptEncoding = res.req.headers['accept-encoding'] || '';
  let buffer: Buffer;

  if (typeof body === 'string') {
    buffer = Buffer.from(body, 'utf-8');
  } else if (Buffer.isBuffer(body)) {
    buffer = body;
  } else {
    buffer = Buffer.from(String(body), 'utf-8');
  }

  if (buffer.length < MIN_COMPRESS_LENGTH) {
    originalSend.call(res, body);
    return;
  }

  try {
    if (acceptEncoding.includes('gzip')) {
      const compressed = await gzipAsync(buffer);
      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Content-Length', compressed.length);
      originalSend.call(res, compressed);
    } else if (acceptEncoding.includes('deflate')) {
      const compressed = await deflateAsync(buffer);
      res.setHeader('Content-Encoding', 'deflate');
      res.setHeader('Content-Length', compressed.length);
      originalSend.call(res, compressed);
    } else {
      originalSend.call(res, body);
    }
  } catch (error) {
    console.error('[Compression] Error compressing response:', error);
    originalSend.call(res, body);
  }
}
