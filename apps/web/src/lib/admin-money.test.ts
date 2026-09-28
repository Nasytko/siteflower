import assert from 'node:assert/strict';
import test from 'node:test';
import { isMajorInputValid, majorInputToMinor, minorToMajorInput } from './admin-money';

test('minorToMajorInput renders major BYN with comma', () => {
  assert.equal(minorToMajorInput('12990'), '129,90');
  assert.equal(minorToMajorInput('100'), '1,00');
  assert.equal(minorToMajorInput('7'), '0,07');
  assert.equal(minorToMajorInput(null), '');
  assert.equal(minorToMajorInput('abc'), '');
});

test('majorInputToMinor accepts comma and dot', () => {
  assert.equal(majorInputToMinor('129,90'), '12990');
  assert.equal(majorInputToMinor('129.9'), '12990');
  assert.equal(majorInputToMinor('129'), '12900');
  assert.equal(majorInputToMinor(' 1 200,50 '), '120050');
});

test('majorInputToMinor rejects malformed input', () => {
  assert.equal(majorInputToMinor(''), null);
  assert.equal(majorInputToMinor('-5'), null);
  assert.equal(majorInputToMinor('12,345'), null);
  assert.equal(majorInputToMinor('сто'), null);
});

test('isMajorInputValid allows blank fields', () => {
  assert.equal(isMajorInputValid(''), true);
  assert.equal(isMajorInputValid('10,00'), true);
  assert.equal(isMajorInputValid('10,000'), false);
});
