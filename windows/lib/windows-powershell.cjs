'use strict';
// Windows PowerShell 5.1 di sistema, usato per estrarre ZIP (aggiornamenti, runtime llama.cpp). Due accorgimenti:
// - niente PSModulePath ereditato: se Mascotte parte da un terminale PowerShell 7 (o da un runner CI), il 5.1
//   caricherebbe i moduli di PowerShell 7, Expand-Archive compreso. Senza la variabile usa i propri predefiniti;
// - $ErrorActionPreference = 'Stop': con -Command un errore «non bloccante» di Expand-Archive uscirebbe con
//   codice 0 senza estrarre nulla; così diventa un errore vero, con il suo messaggio.
// scripts/install-update.cjs (pubblicato come file singolo) ripete la stessa logica: tenerli allineati.
const path = require('node:path');

const executable = (env = process.env) => path.join(env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');

function environment(env = process.env) {
  const copy = { ...env };
  for (const key of Object.keys(copy)) if (key.toLowerCase() === 'psmodulepath') delete copy[key];
  return copy;
}

const quote = value => "'" + String(value).replace(/'/g, "''") + "'";
const expandArchiveCommand = (archive, destination) =>
  `$ErrorActionPreference = 'Stop'; Expand-Archive -LiteralPath ${quote(archive)} -DestinationPath ${quote(destination)} -Force`;

module.exports = { executable, environment, expandArchiveCommand };
