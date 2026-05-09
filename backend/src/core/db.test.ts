import { describe, expect, it } from 'vitest';
import { buildDatabaseSslConfig } from './db';

describe('database SSL config', () => {
  it('keeps SSL disabled unless DB_SSL is explicitly true', () => {
    expect(buildDatabaseSslConfig({
      DB_SSL: 'false',
      DB_SSL_REJECT_UNAUTHORIZED: 'true',
      DB_SSL_CA: undefined,
    })).toBe(false);
  });

  it('verifies database certificates by default when SSL is enabled', () => {
    expect(buildDatabaseSslConfig({
      DB_SSL: 'true',
      DB_SSL_REJECT_UNAUTHORIZED: 'true',
      DB_SSL_CA: undefined,
    })).toMatchObject({ rejectUnauthorized: true });
  });

  it('supports CA material from env strings with escaped newlines', () => {
    expect(buildDatabaseSslConfig({
      DB_SSL: 'true',
      DB_SSL_REJECT_UNAUTHORIZED: 'true',
      DB_SSL_CA: '-----BEGIN CERT-----\\nabc\\n-----END CERT-----',
    })).toMatchObject({
      rejectUnauthorized: true,
      ca: '-----BEGIN CERT-----\nabc\n-----END CERT-----',
    });
  });

  it('keeps the insecure SSL bypass explicit for temporary provider migrations', () => {
    expect(buildDatabaseSslConfig({
      DB_SSL: 'true',
      DB_SSL_REJECT_UNAUTHORIZED: 'false',
      DB_SSL_CA: undefined,
    })).toMatchObject({ rejectUnauthorized: false });
  });
});
