// Le "Feu Vert" et les mises à jour en direct, via Socket.IO.
// Le jeu se connecte avec { auth: { token: '<jeton>' } }, ou avec ?token=<jeton> dans l'adresse
// (plus simple depuis Unreal), puis rejoint les salons de ses duels.
import { Server } from 'socket.io';
import { joueurDuJeton } from './auth.js';
import { installerSalons } from './salons.js';

let io = null;

export function demarrerTempsReel(serveurHttp) {
  // Messages de 10 Ko au plus : personne ne peut saturer la mémoire avec un message géant.
  io = new Server(serveurHttp, { cors: { origin: '*' }, maxHttpBufferSize: 10_000 });
  io.use((socket, next) => {
    joueurDuJeton(String(socket.handshake.auth?.token || socket.handshake.query?.token || ''))
      .then((j) => { socket.data.joueur = j; next(); }, () => next(new Error('jeton_invalide')));
  });
  io.on('connection', (socket) => {
    socket.join(`joueur:${socket.data.joueur.id}`);
    socket.on('suivre_duel', (duelId) => {
      if (typeof duelId === 'string') socket.join(`duel:${duelId}`);
    });
    installerSalons(io, socket);
  });
  return io;
}

export function annoncerAuxJoueurs(joueurIds, evenement, donnees) {
  if (!io) return;
  for (const id of joueurIds) io.to(`joueur:${id}`).emit(evenement, donnees);
}

export function annoncerDuel(duelId, evenement, donnees) {
  if (io) io.to(`duel:${duelId}`).emit(evenement, donnees);
}
