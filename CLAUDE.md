# Gioco di traffico urbano – contesto del progetto

Rispondi e commenta in italiano. Il documento di design completo è su Claude Docs; questo file ne è il riassunto operativo.

## Il gioco

Puzzle per telefono, a livelli: ogni livello è una città ispirata a una città reale (Roma, Napoli, Milano…). Le stazioni compaiono nel tempo e il giocatore disegna strade e incroci per tenere scorrevole il traffico. Ispirazioni: Mini Metro, Mini Motorways, Freeways. Nome, grafica e icone devono essere originali.

## Regole decise

- Ogni stazione ha una forma e genera veicoli di una forma diversa dalla propria. Ogni veicolo deve raggiungere una stazione della sua forma, sul percorso più rapido; può attraversare stazioni di altre forme.
- I veicoli in attesa restano in coda nella stazione d'origine; la coda si vede come una fila di forme grigie sopra la stazione.
- I veicoli sono fisici (auto, furgoni, autobus visti dall'alto, col colore e la forma della destinazione): ognuno nella sua corsia, mantiene la distanza, rallenta in curva e agli incroci svolta seguendo una curva. Agli incroci e nelle stazioni attraversate passa chi arriva prima, purché la sua curva non incroci quella di chi è dentro e ci sia spazio per uscire. Le strade lente si velano di un rosso tenue.
- Strade e incroci si disegnano col dito, nessun menu: la forma disegnata decide il tipo di incrocio (a raso, rotatoria, cavalcavia, semaforo).
- Tutti i tipi di incrocio esistono da subito ma in quantità limitata; ogni settimana di gioco si sceglie un premio fra varie opzioni.
- Congestione visibile (verde → rosso). Ogni stazione ha una capienza (di base 6 veicoli in coda); oltre la capienza parte un conto alla rovescia e, se si esaurisce, il livello fallisce.
- I tratti di strada sono limitati e aumentano nel tempo: il giocatore deve scegliere bene dove costruire.
- Fra i premi di fine settimana: migliorare una stazione per aumentarne la capienza, ottenere più tratti di strada, ottenere un ponte (nei livelli con acqua).
- Le strade non attraversano l'acqua: una strada che attraversa un fiume diventa un ponte e consuma un ponte (risorsa limitata). Un ponte non può superare 2 volte la larghezza del fiume.
- La mappa è ampia (mondo 520×1040) per lasciare spazio alla crescita della città.
- Tre stelle per livello: 1 = viaggi minimi, 2 = giorni sopravvissuti, 3 = condizione speciale della città.
- Telefono in verticale. Gesti: trascina = strada, pressione lunga = rimuovi, due dita = spostamento e zoom facoltativo.

## Scelte tecniche

- JavaScript puro con moduli ES (`import`/`export`), nessun Node.js, nessun bundler, nessuna dipendenza npm.
- Tipi documentati con commenti JSDoc (`/** @typedef ... */`, `/** @param ... */`) al posto di TypeScript.
- Rendering su Canvas 2D, Pointer Events per il touch.
- La simulazione (grafo stradale, generatore di stazioni, veicoli e incroci) è separata dal rendering e non importa nulla del disegno.
- I livelli sono file JSON (geografia, ritmo di crescita, obiettivi): aggiungere una città non richiede codice nuovo.
- Server locale per provare il gioco: `python server.py` dalla cartella del progetto (come `python -m http.server 8000`, ma senza cache, così il telefono vede sempre l'ultima versione). Dal telefono sulla stessa rete Wi‑Fi: `http://<IP del computer>:8000`.
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
- v0.5 Fisica dei veicoli e scorrimento del traffico: distanza fra le auto, code sulle strade e agli incroci, rallentamenti.

## Come lavoriamo

- Una funzionalità alla volta. Prima di scrivere codice, proponi in breve come la implementi.
- Dopo ogni modifica spiega come provarla, anche dal telefono in rete locale.
- Commit solo quando la funzionalità funziona; messaggi di commit in italiano.
- Non aggiungere funzionalità non richieste: segnalale come proposte.
