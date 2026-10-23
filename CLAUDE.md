# Gioco di traffico urbano – contesto del progetto

Rispondi e commenta in italiano. Il documento di design completo è su Claude Docs; questo file ne è il riassunto operativo.

## Il gioco

Puzzle per telefono, a livelli: ogni livello è una città ispirata a una città reale (Roma, Napoli, Milano…). Le stazioni compaiono nel tempo e il giocatore disegna strade e incroci per tenere scorrevole il traffico. Ispirazioni: Mini Metro, Mini Motorways, Freeways. Nome, grafica e icone devono essere originali.

## Regole decise

- Ogni stazione ha una forma e genera veicoli di una forma diversa dalla propria. Ogni veicolo deve raggiungere una stazione della sua forma, sul percorso più rapido. Le stazioni non si attraversano: le usano solo i veicoli che ne partono o che ci arrivano (possono avere più strade in entrata e in uscita).
- Le stazioni nate a caso prendono il nome del quartiere più vicino raggiungibile senza attraversare l'acqua (lista "quartieri" nel livello), numerato se già usato ("Prati 2"); i luoghi fissi hanno il loro nome.
- I veicoli in attesa restano in coda nella stazione d'origine; la coda si vede come una fila di forme grigie sopra la stazione.
- I veicoli sono fisici (auto, furgoni, autobus visti dall'alto, col colore e la forma della destinazione): ognuno nella sua corsia, mantiene la distanza, rallenta in curva e agli incroci svolta seguendo una curva. Agli incroci e nelle stazioni attraversate passa chi arriva prima, purché la sua curva non incroci quella di chi è dentro e ci sia spazio per uscire. Le strade lente si velano di un rosso tenue.
- Strade e incroci si disegnano col dito, nessun menu: la forma disegnata decide il tipo di incrocio (a raso, rotatoria, cavalcavia, semaforo).
- Tutti i tipi di incrocio esistono da subito ma in quantità limitata; ogni settimana di gioco si sceglie un premio fra varie opzioni.
- Congestione visibile (verde → rosso). Ogni stazione ha una capienza (di base 6 veicoli in coda); oltre la capienza parte un conto alla rovescia e, se si esaurisce, il livello fallisce.
- I tratti di strada sono limitati e aumentano nel tempo: il giocatore deve scegliere bene dove costruire.
- I veicoli nascono un po' più spesso ogni giorno (voce "aumento" dei veicoli nel livello: 0.02 = +2% al giorno), così la difficoltà cresce col tempo. Le rotonde non hanno un limite proprio: costano già i tratti dell'anello (provato col bot: aiutano poco, fra −6% e +8% di punti).
- Fra i premi di fine settimana: migliorare una stazione per aumentarne la capienza, ottenere più tratti di strada, ottenere un ponte (nei livelli con acqua).
- Acqua del livello: "fiume" (linea con una larghezza), "mare" (area dove non si costruisce, con o senza spiaggia) e "baia" (area dalla forma libera che si attraversa coi ponti, con una "larghezza" di riferimento per i ponti: serve per porti con insenature, come Sydney). Le insenature devono essere larghe almeno 30, se no una strada disegnata le salta.
- Le strade non attraversano l'acqua: una strada che attraversa un fiume diventa un ponte e consuma un ponte (risorsa limitata). Un ponte non può superare 2 volte la larghezza del fiume (se passa su più fiumi di fila, come dove una baia si apre sul porto, 2 volte la somma delle loro larghezze).
- La mappa è ampia (mondo 520×1040) per lasciare spazio alla crescita della città.
- Tocco breve su una strada: doppio senso → senso unico → senso unico al contrario → superstrada (più veloce, con la precedenza, costa altrettanti tratti) → doppio senso.
- Incroci: la strada più dritta è la principale e ha la precedenza; chi arriva dalle laterali si immette quando sulla principale non arriva nessuno. Tocco breve su un incrocio: incrocio → semaforo (verde più lungo alla principale) → cavalcavia (solo sulle croci) → incrocio.
- Cavalcavia: le due strade si scavalcano, niente precedenze né svolte; sopra si va più piano, i mezzi pesanti di più. Risorsa limitata, fra i premi settimanali; ogni settimana si propongono 3 carte a caso fra quelle possibili.
- Rotatoria: si disegna un cerchio (dove si vuole) e diventa una rotonda percorsa nel verso in cui è stato disegnato; le strade che entrano nel cerchio si attaccano all'anello; chi è dentro ha la precedenza; costa i tratti dell'anello; tocco al centro per toglierla. Guidando a destra conviene il senso antiorario.
- Terreno (voce "terreno" del livello): nelle ville e sui monumenti non si costruisce e non nascono stazioni, bisogna passare attorno; sui colli i veicoli rallentano (i mezzi pesanti di più); le mura sono solo decorazione; sulla mappa si scrivono i nomi di ville e monumenti, quelli dei quartieri vanno solo alle stazioni.
- I monumenti si disegnano sopra l'acqua. I nomi di monumenti e parchi non si sovrappongono fra loro né a stazioni, code e nomi delle stazioni: cercano un posto libero (sotto, sopra, di lato) e se non c'è si saltano.
- Stile grafico "carta di Roma": toni caldi (travertino, terracotta, verde pino) ma colori piatti e ben leggibili; tutti i colori in src/render/style.js.
- Efficienza dei viaggi (tempo minimo in linea d'aria / tempo reale) negli obiettivi, a fine partita e come possibile condizione di stella.
- Tre stelle per livello: 1 = viaggi minimi, 2 = giorni sopravvissuti, 3 = traffico lento medio (quota del tempo in strada sotto il 30% della velocità massima) sotto una soglia; la terza conta solo quando sono comparse tutte le stazioni del livello ("massimo" della crescita) e si può riperdere fino a fine partita. Soglie tarate col bot (tools/bot.js, non salvato in Git): viaggi sopra la media; giorni dopo il giorno in cui il bot fa i viaggi, con un paio di giorni di margine; il traffico partendo da una partita vera, perché il bot congestiona molto più di una persona. Prese tutte e tre, il livello è completato e la partita finisce (in futuro: modalità sandbox).
- Quando nasce una stazione compare un pop-up con forma e nome, che si chiude con un tocco.
- Se una strada, un ponte o una rotonda non si possono costruire, il tratto bloccato diventa rosso e, quando si alza il dito, un riquadro (chiuso con un tocco) spiega il motivo.
- Dieci forme di stazione (cerchio, quadrato, triangolo, pentagono, esagono, stella, rombo, croce, mezzaluna, goccia); ogni livello sceglie quali usare. Nei livelli con l'acqua le stazioni di una forma nascono di preferenza sulla stessa terra (riva o isola), così per arrivare a destinazione bisogna attraversare.
- Telefono in verticale. Gesti: trascina = strada, pressione lunga = rimuovi, due dita = spostamento e zoom facoltativo.

## Scelte tecniche

- JavaScript puro con moduli ES (`import`/`export`), nessun Node.js, nessun bundler, nessuna dipendenza npm.
- Tipi documentati con commenti JSDoc (`/** @typedef ... */`, `/** @param ... */`) al posto di TypeScript.
- Rendering su Canvas 2D, Pointer Events per il touch.
- La simulazione (grafo stradale, generatore di stazioni, veicoli e incroci) è separata dal rendering e non importa nulla del disegno.
- I livelli sono file JSON (geografia, ritmo di crescita, obiettivi): aggiungere una città non richiede codice nuovo.
- Server locale per provare il gioco: `python server.py` dalla cartella del progetto (come `python -m http.server 8000`, ma senza cache, così il telefono vede sempre l'ultima versione). Dal telefono sulla stessa rete Wi‑Fi: `http://<IP del computer>:8000`.
- Git per salvare le versioni: lo gestisci tu (Claude Code), l'utente non conosce i comandi. Spiega in una riga cosa hai salvato.
- Il gioco è una PWA installabile: manifest.webmanifest, icone in icons/ (originali, disegnate con le forme del gioco), sw.js che salva una copia per giocare offline (prima la rete, poi la copia).
- Pubblicazione su GitHub Pages con .github/workflows/pages.yml: a ogni push su main va online solo ciò che serve per giocare (index.html, manifest, sw.js, icons, src, levels); il flusso scrive la versione in sw.js e l'elenco dei file da salvare offline (precache.json), quindi aggiungere file non richiede di aggiornare elenchi a mano.

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
