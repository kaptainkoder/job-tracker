import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PDF_LINK_REVIEW_WARNING,
  appendPdfLinkAnnotations,
  extractSafePdfLinkUrls,
} from './resumePdfLinks';

test('extracts and deduplicates safe HTTP(S) PDF link annotations', () => {
  const linkedin = 'https://www.linkedin.com/in/karan-virender-mahajan-frm-800755146';
  assert.deepEqual(
    extractSafePdfLinkUrls([
      { url: linkedin },
      { unsafeUrl: linkedin },
      { url: 'http://example.com/portfolio' },
      { url: 'javascript:alert(1)' },
      { url: 'mailto:owner@example.com' },
      { url: '' },
      null,
    ]),
    [linkedin, 'http://example.com/portfolio'],
  );
});

test('appends preserved URLs as an explicit parser instruction without duplicates', () => {
  const linkedin = 'https://www.linkedin.com/in/example';
  const text = appendPdfLinkAnnotations('Karan Mahajan\nLinkedIn', [linkedin, linkedin]);
  assert.match(text, /PDF link annotations \(preserve these URLs in contact\.links\):/);
  assert.equal(text.match(new RegExp(linkedin, 'g'))?.length, 1);
});

test('leaves text unchanged when a PDF has no external annotations', () => {
  assert.equal(appendPdfLinkAnnotations('  résumé text  ', []), 'résumé text');
  assert.match(PDF_LINK_REVIEW_WARNING, /Manually verify LinkedIn/);
});
