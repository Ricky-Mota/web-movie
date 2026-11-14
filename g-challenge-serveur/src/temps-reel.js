// Le "Feu Vert" et les mises à jour en direct, via Socket.IO.
// Le jeu se connecte avec { auth: { token: '<jeton>' } }, ou avec ?token=<jeton> dans l'adresse
// (plus simple depuis Unreal), puis rejoint les salons de ses duels.
import { Server } from 'socket.io';
import { lireJeton } from './auth.js';

let io = null;

export function demarrerTempsReel(serveurHttp) {
  io = new Server(serveurHttp, { cors: { origin: '*' } });
  io.use((socket, next) => {
    try {
      socket.data.joueur = lireJeton(socket.handshake.auth?.token || socket.handshake.query?.token);
      next();
    } catch {
      next(new Error('jeton_invalide'));
    }
  });
  io.on('connection', (socket) => {
    socket.join(`joueur:${socket.data.joueur.id}`);
    socket.on('suivre_duel', (duelId) => {
      if (typeof duelId === 'string') socket.join(`duel:${duelId}`);
    });
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
