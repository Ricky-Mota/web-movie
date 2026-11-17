import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifierCourse } from '../src/domaine/antitriche.js';
import { CIRCUIT_TEST, trajetDroit } from './trajets.js';

const course = (tempsMs, trajet = trajetDroit({ tempsMs })) => ({ tempsMs, intervalleMs: 50, trajet });

test('une course honnête est acceptée', () => {
  assert.deepEqual(verifierCourse(course(40000), CIRCUIT_TEST), { valide: true });
});

test('temps annoncé plus court que le trajet enregistré', () => {
  const r = verifierCourse(course(30000, trajetDroit({ tempsMs: 40000 })), CIRCUIT_TEST);
  assert.equal(r.motif, 'temps_incoherent_avec_trajet');
});

test('temps sous le minimum du circuit', () => {
  assert.equal(verifierCourse(course(15000), CIRCUIT_TEST).motif, 'temps_impossible');
});

test('téléportation au milieu du parcours', () => {
  const trajet = trajetDroit({ tempsMs: 40000 });
  for (let i = 100; i < 400; i++) trajet[i] = [...trajet[100]]; // reste sur place...
  trajet[400] = [...trajet[700]];                               // ...puis saute de 600 m
  assert.equal(verifierCourse(course(40000, trajet), CIRCUIT_TEST).motif, 'vitesse_impossible');
});

test('un téléphone qui saccade (positions répétées) n\'est pas pris pour un tricheur', () => {
  const trajet = trajetDroit({ tempsMs: 40000 });
  for (let i = 201; i < 204; i++) trajet[i] = [...trajet[200]]; // 150 ms figées puis rattrapage
  assert.deepEqual(verifierCourse(course(40000, trajet), CIRCUIT_TEST), { valide: true });
});

test('départ ou arrivée hors zone', () => {
  const t1 = trajetDroit({ tempsMs: 40000 });
  t1[0] = [5000, 0, 0, 0, 0, 0];
  assert.equal(verifierCourse(course(40000, t1), CIRCUIT_TEST).motif, 'depart_hors_zone');
  const t2 = trajetDroit({ tempsMs: 40000 });
  t2[t2.length - 1] = [150000, 0, 0, 0, 0, 0];
  assert.equal(verifierCourse(course(40000, t2), CIRCUIT_TEST).motif, 'arrivee_hors_zone');
});

test('trajet mal formé', () => {
  const t = trajetDroit({ tempsMs: 40000 });
  t[5] = [1, 2, 3];
  assert.equal(verifierCourse(course(40000, t), CIRCUIT_TEST).motif, 'trajet_mal_forme');
});
