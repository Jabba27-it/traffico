# Gioco di traffico urbano – contesto del progetto

Rispondi e commenta in italiano. Il documento di design completo è su Claude Docs; questo file ne è il riassunto operativo.

## Il gioco

Puzzle per telefono, a livelli: ogni livello è una città ispirata a una città reale (Roma, Napoli, Milano…). Le stazioni compaiono nel tempo e il giocatore disegna strade e incroci per tenere scorrevole il traffico. Ispirazioni: Mini Metro, Mini Motorways, Freeways. Nome, grafica e icone devono essere originali.

## Regole decise

- Ogni stazione ha una forma. Il veicolo prende la forma della stazione d'origine e deve raggiungere una stazione della stessa forma, sul percorso più rapido.
- Strade e incroci si disegnano col dito, nessun menu: la forma disegnata decide il tipo di incrocio (a raso, rotatoria, cavalcavia, semaforo).
- Tutti i tipi di incrocio esistono da subito ma in quantità limitata; ogni settimana di gioco si sceglie un premio fra varie opzioni.
- Congestione visibile (verde → rosso). Se una stazione resta congestionata troppo a lungo, il livello fallisce.
- Tre stelle per livello: 1 = viaggi minimi, 2 = giorni sopravvissuti, 3 = condizione speciale della città.
- Telefono in verticale. Gesti: trascina = strada, pressione lunga = rimuovi, due dita = spostamento e zoom facoltativo.

## Scelte tecniche

- JavaScript puro con moduli ES (`import`/`export`), nessun Node.js, nessun bundler, nessuna dipendenza npm.
- Tipi documentati con commenti JSDoc (`/** @typedef ... */`, `/** @param ... */`) al posto di TypeScript.
- Rendering su Canvas 2D, Pointer Events per il touch.
- La simulazione (grafo stradale, generatore di stazioni, veicoli e incroci) è separata dal rendering e non importa nulla del disegno.
- I livelli sono file JSON (geografia, ritmo di crescita, obiettivi): aggiungere una città non richiede codice nuovo.
- Server locale per provare il gioco: `python -m http.server 8000` dalla cartella del progetto. Dal telefono sulla stessa rete Wi‑Fi: `http://<IP del computer>:8000`.
- Git per salvare le versioni: lo gestisci tu (Claude Code), l'utente non conosce i comandi. Spiega in una riga cosa hai salvato.

## Struttura cartelle (proposta)

```
index.html
src/
  sim/      grafo, pathfinding, stazioni, veicoli, incroci
  render/   disegno su canvas
  input/    gesti touch
  ui/       interfaccia (risorse, pausa, velocità)
  main.js
levels/     file JSON delle città
```

## Tappe

- v0.1 Strade e veicoli: disegno strade col dito, stazioni con forme, veicoli da stazione a stazione della stessa forma, incrocio semplice. Grafica a forme semplici.
- v0.2 Città che cresce: stazioni nel tempo, code e congestione, sconfitta del livello.
- v0.3 Primo livello: risorse settimanali, Roma con il Tevere, ponti, stelle.
- v0.4 Tipi di incrocio: rotatoria, cavalcavia, semaforo, disegnati a mano.

## Come lavoriamo

- Una funzionalità alla volta. Prima di scrivere codice, proponi in breve come la implementi.
- Dopo ogni modifica spiega come provarla, anche dal telefono in rete locale.
- Commit solo quando la funzionalità funziona; messaggi di commit in italiano.
- Non aggiungere funzionalità non richieste: segnalale come proposte.
