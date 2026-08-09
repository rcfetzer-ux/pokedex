import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import type { FastifyInstance } from 'fastify';

import { buildApp } from '../app.js';
import { checkDeploymentSafety } from '../auth.js';
import { syncCatalog } from '../services/catalog.js';
import { createTestContext, testConfig, type TestContext } from './helpers.js';

const TOKEN = 'a'.repeat(64);

describe('api token auth', () => {
  let context: TestContext;
  let app: FastifyInstance;

  beforeEach(async () => {
    context = createTestContext({ apiToken: TOKEN });
    await syncCatalog(context.db, context.provider, { ingestPrices: false });
    app = await buildApp(context);
  });

  afterEach(async () => {
    await app.close();
    context.close();
  });

  it('rejects a request with no token', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/collection' });
    assert.equal(response.statusCode, 401);
    assert.equal(response.json().error, 'unauthorized');
  });

  it('rejects a wrong token of the same length', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/collection',
      headers: { authorization: `Bearer ${'b'.repeat(64)}` },
    });
    assert.equal(response.statusCode, 401);
  });

  it('rejects a token that is a prefix of the real one', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/collection',
      headers: { authorization: `Bearer ${TOKEN.slice(0, 32)}` },
    });
    assert.equal(response.statusCode, 401);
  });

  it('accepts a bearer token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/collection',
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    assert.equal(response.statusCode, 200);
  });

  it('accepts an x-api-key header', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/collection',
      headers: { 'x-api-key': TOKEN },
    });
    assert.equal(response.statusCode, 200);
  });

  it('protects mutating routes too', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/inventory',
      payload: { cardId: 'base1-4', variant: 'holofoil' },
    });
    assert.equal(response.statusCode, 401);
  });

  it('protects the admin sync route', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/admin/sync' });
    assert.equal(response.statusCode, 401);
  });

  it('leaves health open for container health checks', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    assert.equal(response.statusCode, 200);
  });

  it('does not let a query string smuggle past the public-route check', async () => {
    // "/api/status?x=1" must not match by prefix or by raw-URL comparison.
    const response = await app.inject({ method: 'GET', url: '/api/status?x=1' });
    assert.equal(response.statusCode, 401);
  });

  it('does not treat a lookalike path as the public health route', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/healthz' });
    assert.equal(response.statusCode, 401);
  });

  it('reports auth as required once a token is set', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/check',
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().authRequired, true);
  });
});

describe('no token configured', () => {
  let context: TestContext;
  let app: FastifyInstance;

  beforeEach(async () => {
    context = createTestContext();
    await syncCatalog(context.db, context.provider, { ingestPrices: false });
    app = await buildApp(context);
  });

  afterEach(async () => {
    await app.close();
    context.close();
  });

  it('serves requests without credentials', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/collection' });
    assert.equal(response.statusCode, 200);
  });

  it('reports auth as not required', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/auth/check' });
    assert.equal(response.json().authRequired, false);
  });
});

describe('checkDeploymentSafety', () => {
  it('refuses to start in production without a token', () => {
    const report = checkDeploymentSafety(testConfig({ apiToken: null }), {
      NODE_ENV: 'production',
    });
    assert.match(report.error ?? '', /API_TOKEN is not set/);
  });

  it('allows production when a token is set', () => {
    const report = checkDeploymentSafety(testConfig({ apiToken: TOKEN }), {
      NODE_ENV: 'production',
    });
    assert.equal(report.error, null);
    assert.equal(report.warning, null);
  });

  it('warns but allows a LAN-bound dev server with no token', () => {
    // This is the phone-on-the-same-wifi case, which must keep working.
    const report = checkDeploymentSafety(testConfig({ apiToken: null, host: '0.0.0.0' }), {});
    assert.equal(report.error, null);
    assert.match(report.warning ?? '', /anyone on your network/);
  });

  it('is silent for a loopback dev server', () => {
    const report = checkDeploymentSafety(testConfig({ apiToken: null, host: '127.0.0.1' }), {});
    assert.equal(report.error, null);
    assert.equal(report.warning, null);
  });
});
