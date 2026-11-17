import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculerRepartition, calculerCommission, centimesVersTexte } from '../src/domaine/argent.js';

test('exemple du cahier des charges : 10 $ par équipe, 25 % -> 15 $ au gagnant', () => {
  const r = calculerRepartition({ miseCentimes: 1000, commissionBp: 2500, membres: ['a'], capitaineId: 'a' });
  assert.deepEqual([r.cagnotte, r.commission, r.gain], [2000, 500, 1500]);
  assert.deepEqual(r.parts, [{ joueurId: 'a', montantCentimes: 1500 }]);
});

test('le reste de la division revient au capitaine, aucun centime ne se perd', () => {
  // 3v3, mise 10 $ : gain 15 $ -> 5 $ chacun. Avec 10 % : gain 18 $ -> 6 $ chacun.
  // Mise 7 $, 25 % : cagnotte 14 $, commission 3,50 $, gain 10,50 $ -> 3,50 $ chacun.
  const r = calculerRepartition({ miseCentimes: 1001, commissionBp: 2500, membres: ['a', 'b', 'c'], capitaineId: 'b' });
  const total = r.parts.reduce((s, p) => s + p.montantCentimes, 0);
  assert.equal(total + r.commission, r.cagnotte);
  assert.equal(r.parts.find((p) => p.joueurId === 'b').montantCentimes, r.parts[0].montantCentimes + (r.gain % 3));
});

test('commission arrondie au centime le plus proche', () => {
  assert.equal(calculerCommission(2001, 2500), 500); // 500,25 -> 500
  assert.equal(calculerCommission(2002, 2500), 501); // 500,50 -> 501
  assert.equal(calculerCommission(2000, 0), 0);
});

test('le capitaine doit faire partie des membres', () => {
  assert.throws(() => calculerRepartition({ miseCentimes: 1000, commissionBp: 2500, membres: ['a'], capitaineId: 'z' }));
});

test('format des montants pour les API Mobile Money', () => {
  assert.equal(centimesVersTexte(1500), '15.00');
  assert.equal(centimesVersTexte(5), '0.05');
});
