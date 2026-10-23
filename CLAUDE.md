# Gioco di traffico urbano – contesto del progetto

Rispondi e commenta in italiano. Il documento di design completo è su Claude Docs; questo file ne è il riassunto operativo.

## Il gioco

Puzzle per telefono, a livelli: ogni livello è una città ispirata a una città reale (Roma, Napoli, Milano…). Le stazioni compaiono nel tempo e il giocatore disegna strade e incroci per tenere scorrevole il traffico. Ispirazioni: Mini Metro, Mini Motorways, Freeways. Nome, grafica e icone devono essere originali.

## Regole decise

- Ogni stazione ha una forma e genera veicoli di una forma diversa dalla propria. Ogni veicolo deve raggiungere una stazione della sua forma, sul percorso più rapido. Le stazioni non si attraversano: le usano solo i veicoli che ne partono o che ci arrivano (possono avere più strade in entrata e in uscita).
- Le stazioni nate a caso prendono il nome del quartiere più vicino raggiungibile senza attraversare l'acqua (lista "quartieri" nel livello), numerato se già usato ("Prati 2"); i luoghi fissi hanno il loro nome.
- I veicoli in attesa restano in coda nella stazione d'origine; la coda si vede come una fila di forme grigie sopra la stazione. Chi era su una strada cancellata torna in testa alla coda come "rientrato" (forma col solo contorno): riparte per primo e non conta per la capienza, così rifare una strada non fa perdere la partita.
- I veicoli sono fisici (auto, furgoni, autobus visti dall'alto, col colore e la forma della destinazione): ognuno nella sua corsia, mantiene la distanza, rallenta in curva e agli incroci svolta seguendo una curva. Agli incroci e nelle stazioni attraversate passa chi arriva prima, purché la sua curva non incroci quella di chi è dentro e ci sia spazio per uscire. Le strade lente si velano di un rosso tenue.
- Strade e incroci si disegnano col dito, nessun menu: la forma disegnata decide il tipo di incrocio (a raso, rotatoria, cavalcavia). I semafori sono stati tolti: non aggiungevano nulla al gioco.
- Tutti i tipi di incrocio esistono da subito ma in quantità limitata; ogni settimana di gioco si sceglie un premio fra varie opzioni.
- Congestione visibile (verde → rosso). Ogni stazione ha una capienza (di base 6 veicoli in coda); oltre la capienza parte un conto alla rovescia e, se si esaurisce, il livello fallisce. A fine partita il riquadro dice quale stazione ha fatto perdere; con "Guarda la mappa" si vede la città ferma in quel momento (la stazione colpevole pulsa in rosso, si può spostare e ingrandire ma non costruire) e una barra riporta al riepilogo.
- I tratti di strada sono limitati e aumentano nel tempo: il giocatore deve scegliere bene dove costruire.
- I veicoli nascono un po' più spesso ogni giorno (voce "aumento" dei veicoli nel livello: 0.02 = +2% al giorno, fino ad "aumentoMassimo": 0.5 = al più +50%), così la difficoltà cresce col tempo. Le rotonde non hanno un limite proprio: costano già i tratti dell'anello (provato col bot: aiutano poco, fra −6% e +8% di punti).
- Fra i premi di fine settimana: migliorare una stazione per aumentarne la capienza, ottenere più tratti di strada (15), ottenere un ponte (nei livelli con acqua).
- Acqua del livello: "fiume" (linea con una larghezza), "mare" (area dove non si costruisce, con o senza spiaggia) e "baia" (area dalla forma libera che si attraversa coi ponti, con una "larghezza" di riferimento per i ponti: serve per porti con insenature, come Sydney). Le insenature devono essere larghe almeno 30, se no una strada disegnata le salta.
- Le strade non attraversano l'acqua: una strada che attraversa un fiume diventa un ponte e consuma un ponte (risorsa limitata). Un ponte non può superare 2 volte la larghezza del fiume (se passa su più fiumi di fila, come dove una baia si apre sul porto, 2 volte la somma delle loro larghezze). I ponti iniziali sono almeno le terre separate dall'acqua meno una, così si possono sempre collegare tutte le rive; un livello può rinunciarci con "minimoTerre": false nella voce "ponti" (New York: 3 ponti su 5 terre).
- La mappa è ampia (mondo 520×1040) per lasciare spazio alla crescita della città.
- Tocco breve su una strada: doppio senso → senso unico → senso unico al contrario → superstrada (più veloce, con la precedenza, costa altrettanti tratti) → doppio senso.
- Incroci: la strada più dritta è la principale e ha la precedenza; chi arriva dalle laterali si immette quando sulla principale non arriva nessuno la cui curva incroci la sua (chi sulla principale è fermo non conta: aspetta il suo turno nella coda dei permessi). Tocco breve su un incrocio a croce: incrocio → cavalcavia → incrocio (sugli altri incroci un avviso spiega che il cavalcavia vuole una croce).
- Cavalcavia: le due strade si scavalcano, niente precedenze né svolte; sopra si va più piano, i mezzi pesanti di più. Risorsa limitata, fra i premi settimanali; ogni settimana si propongono 3 carte a caso fra quelle possibili.
- Rotatoria: si disegna un cerchio (dove si vuole) e diventa una rotonda percorsa nel verso in cui è stato disegnato; le strade che entrano nel cerchio si attaccano all'anello; chi è dentro ha la precedenza; costa i tratti dell'anello; tocco al centro per toglierla. Guidando a destra conviene il senso antiorario. Una rotonda non può sovrapporsi a un'altra (nemmeno ai resti di una smontata) né contenere un cavalcavia.
- Terreno (voce "terreno" del livello): nelle ville e sui monumenti non si costruisce e non nascono stazioni, bisogna passare attorno; sui colli i veicoli rallentano (i mezzi pesanti di più); le mura sono solo decorazione; sulla mappa si scrivono i nomi di ville e monumenti, quelli dei quartieri vanno solo alle stazioni.
- I monumenti si disegnano sopra l'acqua. I nomi di monumenti e parchi non si sovrappongono fra loro né a stazioni, code e nomi delle stazioni: cercano un posto libero (sotto, sopra, di lato) e se non c'è si saltano.
- Stile grafico "carta di Roma": toni caldi (travertino, terracotta, verde pino) ma colori piatti e ben leggibili; tutti i colori in src/render/style.js.
- Efficienza dei viaggi (tempo minimo in linea d'aria / tempo reale) negli obiettivi, a fine partita e come possibile condizione di stella.
- Tre stelle per livello: 1 = viaggi minimi, 2 = giorni sopravvissuti, 3 = traffico lento attuale (quota dei veicoli in strada sotto il 30% della velocità massima, ammorbidita sugli ultimi secondi) sotto una soglia per 40 secondi di gioco di fila (20 a velocità doppia); si comincia a misurare solo quando ci sono tutte le stazioni del livello e l'ultima nata ha generato almeno 6 veicoli. Le stelle prese restano prese. Soglie tarate col bot (tools/bot.js, non salvato in Git): viaggi sopra la media; giorni dopo il giorno in cui il bot fa i viaggi, con un paio di giorni di margine; il traffico partendo da una partita vera, perché il bot congestiona molto più di una persona. Prese tutte e tre, il livello è completato e la partita finisce (in futuro: modalità sandbox). Stella di platino (voce "platino": {"efficienza": N} in "stelle"): quando arriva la terza stella, l'efficienza dei viaggi di tutta la partita deve essere almeno N%; si vede come quarta stella azzurra accanto alle altre, negli obiettivi, a fine partita (con l'efficienza mancata), nel record del menu e nella foto. Soglie circa 15 punti sopra la media del bot (51–58%), perché una persona brava fa reti più dritte: Roma, New York e Rio 70%, Sydney 66% (il porto allunga i giri), Istanbul 72%.
- Ogni città ha il suo stile di ponti, cavalcavia e rotonde (voce "stile" del livello: {"ponte", "cavalcavia", "rotonda"}, disegni in src/render/looks.js; senza voce resta semplice). Roma: ponte in pietra coi piloni tondi, cavalcavia con parapetti in terracotta, rotonda con la piazza e l'obelisco. New York: ponte sospeso con torri in pietra ad archi (Brooklyn), cavalcavia con travi d'acciaio della sopraelevata, rotonda con colonna e alberi (Columbus Circle). Sydney: ponte ad arco d'acciaio con piloni in granito (Harbour Bridge), cavalcavia in arenaria, rotonda con jacarande in fiore. Rio: ponte strallato bianco, cavalcavia con palme, rotonda col pavimento a onde di Copacabana. Istanbul: ponte sospeso con torri snelle (Bosforo), cavalcavia con maioliche turchesi, rotonda con fontana ottomana ottagonale. Le rotonde si alternano: tipica della città, aiuola fiorita classica, tipica, fontana classica ("classiche" nella voce "stile" può cambiarle: a Istanbul, che ha già la fontana, al posto della fontana classica c'è il pino).
- Le stazioni hanno raggio 15 unità di mondo.
- A fine partita "Foto della città" crea un'immagine della rete costruita (senza veicoli) con città, giorni, viaggi e stelle, da condividere o scaricare.
- Suoni generati col codice (Web Audio, src/audio/sounds.js, niente file): tic a ogni tratto mentre si disegna (sale di tono coi tratti), colpo pieno quando la strada è costruita, colpo più profondo con eco per il ponte, tre note che salgono per la rotatoria, "bup" sordo quando non si può costruire, campanella per la nuova stazione, "fsss" di gomma quando si toglie una strada o una rotonda, clic di altezza diversa per ogni tocco su strade e incroci (doppio clic per il cavalcavia), battito che si fa più fitto e forte con una stazione oltre la capienza, accordo a fine settimana, scintillio per una stella presa. Il pulsante con l'altoparlante accanto al menu li toglie, e la scelta resta salvata.
- Quando nasce una stazione compare un pop-up con forma e nome, che si chiude con un tocco.
- Nel menu ogni città ha disegnato il suo monumento simbolo (voce "icona" in levels/indice.json, con le stesse icone dei monumenti della mappa): Roma il Colosseo, New York la Statua della Libertà, Sydney l'Opera House, Rio il Cristo, Istanbul una moschea, il tutorial le tre forme.
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
