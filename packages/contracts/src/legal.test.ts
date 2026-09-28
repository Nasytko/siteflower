import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BELARUS_LEGAL_REVIEW_FLAGS,
  LEGAL_DOCUMENT_KINDS,
  OWNER_PROVIDED_SELLER,
  buildComplianceStatus,
  defaultLegalEntitySettings,
} from './legal.js';

test('owner-provided seller defaults include UNP and bank IBAN', () => {
  const d = defaultLegalEntitySettings();
  assert.equal(d.unp, OWNER_PROVIDED_SELLER.unp);
  assert.equal(d.bankAccountIban, OWNER_PROVIDED_SELLER.bankAccountIban);
  assert.equal(d.tradeRegisterNumber, null);
  assert.equal(d.stateRegistrationDate, null);
});

test('compliance status flags missing trade register and registration', () => {
  const entity = {
    ...defaultLegalEntitySettings(),
    version: 1,
    updatedAt: new Date().toISOString(),
  };
  const status = buildComplianceStatus({
    entity,
    storefrontPhone: '+375 (29) 798-22-22',
    storefrontEmail: null,
    storefrontHours: '9:00–21:00',
    pickupEnabled: true,
    documents: LEGAL_DOCUMENT_KINDS.map((kind) => ({
      kind,
      hasPublished: kind === 'ORDER_TERMS',
      hasDraft: kind !== 'ORDER_TERMS',
    })),
  });

  assert.equal(status.readyForProduction, false);
  const trade = status.items.find((i) => i.id === 'trade_register');
  assert.equal(trade?.status, 'missing');
  assert.match(trade?.detail ?? '', /Требует заполнения/);
  const email = status.items.find((i) => i.id === 'seller_email');
  assert.equal(email?.status, 'missing');
  const pickup = status.items.find((i) => i.id === 'pickup_address');
  assert.equal(pickup?.status, 'missing');
  assert.ok(status.legalReviewFlags.length >= BELARUS_LEGAL_REVIEW_FLAGS.length);
});

test('compliance passes when all required fields and docs published', () => {
  const entity = {
    ...defaultLegalEntitySettings(),
    stateRegistrationDate: '2020-01-15',
    registeringAuthority: 'Test authority',
    tradeRegisterNumber: 'TR-1',
    tradeRegisterDate: '2020-02-01',
    sellerPhone: '+375291111111',
    sellerEmail: 'shop@example.by',
    businessHours: '9-21',
    pickupAddress: 'пр-т Янки Купалы, 67А',
    actualOfflinePaymentDescription: 'Оплата по реквизитам после подтверждения менеджером',
    version: 2,
    updatedAt: new Date().toISOString(),
  };
  const status = buildComplianceStatus({
    entity,
    storefrontPhone: null,
    storefrontEmail: null,
    storefrontHours: null,
    pickupEnabled: true,
    documents: LEGAL_DOCUMENT_KINDS.map((kind) => ({
      kind,
      hasPublished: true,
      hasDraft: false,
    })),
  });
  assert.equal(status.readyForProduction, true);
  assert.equal(status.missingRequiredCount, 0);
});
