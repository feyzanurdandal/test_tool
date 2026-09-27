import './setup-env.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { parseCookies, requireCsrfHeader } = await import('../middleware/auth.js');

test('çerez ayrıştırma', () => {
    assert.deepEqual(parseCookies('a=1; tt_session=abc.def; bozuk=%E0%A4%A'), { a: '1', tt_session: 'abc.def', bozuk: '%E0%A4%A' });
    assert.deepEqual(parseCookies(''), {});
    assert.deepEqual(parseCookies(undefined), {});
});

function fakeRes() {
    return { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
}

test('CSRF başlığı olmayan POST reddedilir, GET serbesttir', () => {
    let called = 0;
    const next = () => { called++; };

    const post = { method: 'POST', get: () => undefined };
    const res1 = fakeRes();
    requireCsrfHeader(post, res1, next);
    assert.equal(res1.code, 403);

    const postOk = { method: 'POST', get: (h) => (h === 'X-Requested-With' ? 'fetch' : undefined) };
    requireCsrfHeader(postOk, fakeRes(), next);

    requireCsrfHeader({ method: 'GET', get: () => undefined }, fakeRes(), next);
    assert.equal(called, 2);
});
