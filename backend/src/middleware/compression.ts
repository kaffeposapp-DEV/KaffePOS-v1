import type { NextFunction, Request, Response } from 'express';
import { createGzip } from 'node:zlib';

export function compression(req: Request, res: Response, next: NextFunction) {
  const acceptEncoding = req.headers['accept-encoding'] || '';
  
  if (!acceptEncoding.includes('gzip')) {
    return next();
  }

  const originalWrite = res.write.bind(res);
  const originalEnd = res.end.bind(res);
  const chunks: Buffer[] = [];

  res.write = function (chunk: any, ...args: any[]): boolean {
    if (chunk) chunks.push(Buffer.from(chunk));
    return true;
  };

  res.end = function (chunk?: any, ...args: any[]): Response {
    if (chunk) chunks.push(Buffer.from(chunk));
    
    const contentType = res.getHeader('content-type') as string || '';
    const shouldCompress = 
      contentType.includes('application/json') ||
      contentType.includes('text/') ||
      contentType.includes('application/javascript');

    if (!shouldCompress || chunks.length === 0) {
      res.write = originalWrite;
      res.end = originalEnd;
      if (chunk) return originalEnd(chunk, ...args);
      return originalEnd(...args);
    }

    const buffer = Buffer.concat(chunks);
    
    if (buffer.length < 1024) {
      res.write = originalWrite;
      res.end = originalEnd;
      return originalEnd(buffer, ...args);
    }

    res.setHeader('Content-Encoding', 'gzip');
    res.removeHeader('Content-Length');
    
    const gzip = createGzip();
    const compressed: Buffer[] = [];
    
    gzip.on('data', (chunk) => compressed.push(chunk));
    gzip.on('end', () => {
      res.write = originalWrite;
      res.end = originalEnd;
      originalEnd(Buffer.concat(compressed));
    });
    
    gzip.end(buffer);
    return res;
  };

  next();
}
