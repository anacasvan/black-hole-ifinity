# Black Hole Infinity — Earth Edition (v1.0)

Gioco mobile 3D in cui un buco nero, partendo da foglie e cartacce, cresce lentamente fino a inghiottire automobili, case e grattacieli di una città viva. Solo il mondo **Terra**: nessun pianeta, nessun timer, nessuna sconfitta.

> **Tecnologia — scostamento dal brief.** Il brief indicava *preferibilmente* Unity 6 LTS. Su questa macchina Unity non è installato, quindi un progetto Unity non si sarebbe potuto compilare né provare, e il brief vieta di dichiarare test non eseguiti. Il gioco è stato quindi sviluppato con **three.js (WebGL 2) + Vite**, impacchettabile per **Android e iOS con Capacitor**. È il motore 3D che il repository già usava (v0.3). Così ogni funzione è stata provata davvero in un browser con GPU, con screenshot reali della build. Le alternative a Unity usate sono elencate nella tabella [Corrispondenza con il brief](#corrispondenza-con-il-brief).

## Avvio rapido

| Modo | Comando | Note |
| --- | --- | --- |
| File singolo, senza server | apri `black-hole-infinity-earth.html` | Generato da `npm run build:standalone`. Funziona da `file://` in Chrome, Edge e Safari recenti. |
| Sviluppo | `npm install` poi `npm run dev` | Dal telefono apri `http://<IP-del-PC>:5173` (stessa rete Wi-Fi). |
| Build web | `npm run build` | Output in `dist/`. |
| Android | `npm run build`, poi `npm run android:add` (solo la prima volta), `npm run android:sync` e `npm run android:open` | Richiede Android Studio. |
| iOS | `npm install @capacitor/ios`, poi `npm run ios:add`, `npm run ios:sync` e `npm run ios:open` | Richiede **macOS + Xcode**. In Xcode imposta il Team di firma e *Portrait* in *Deployment Info*. |

### Web app installabile (iPhone/Android, funziona offline)

`npm run build` genera in `dist/` anche il manifest, le icone e `sw.js`, un service worker che salva tutti i file sul dispositivo. Al primo avvio online il gioco si memorizza sul telefono; da quel momento si apre dall'icona anche senza rete. Ad ogni `git push` sul branch `main`, il workflow `.github/workflows/deploy.yml` esegue i test, compila e pubblica su **GitHub Pages**. In *Settings → Pages* la sorgente deve essere *GitHub Actions*. Su iPhone: apri l'indirizzo in Safari, poi **Condividi → Aggiungi alla schermata Home**.

Prima di pubblicare sostituisci l'`appId` provvisorio `com.example.blackholeinfinity` in `capacitor.config.ts`. Dopo `cap add android` imposta `android:screenOrientation="portrait"` sull'activity in `AndroidManifest.xml`.

## Come si gioca

- **Muoviti** con il joystick, oppure trascina il dito sullo schermo nella modalità *Solo touch*. Su PC usa WASD o le frecce.
- **ATTRAI** (tieni premuto, oppure modalità interruttore; su PC la barra spaziatrice) attiva la gravità. Senza ATTRAI cade nel buco solo ciò che si trova davvero sopra l'apertura.
- In alto: la **massa**, il **progresso verso il prossimo oggetto sbloccabile** e il pulsante **pausa**. Quando sblocchi una nuova classe di oggetti compare un avviso discreto.
- I progressi si salvano automaticamente ogni 8 s, in pausa e quando l'app va in background. Il pulsante del menu diventa *Continua*.

### Le quattro modalità di controllo (Impostazioni → Controlli)

| | Joystick | ATTRAI |
| --- | --- | --- |
| A | in basso a sinistra | in basso a destra |
| B | in basso a destra | in basso a sinistra |
| C | dove vuoi (*Posiziona joystick*: trascinalo), con dimensione e opacità; la posizione viene salvata | sul lato opposto, mai sovrapposto |
| D | nessuno: trascini sulla scena e la velocità è proporzionale al trascinamento | in basso a destra |

Il multitouch è sempre attivo: ci si muove e si attrae contemporaneamente.

## Novità v1.1

- **Primi minuti più gratificanti.** Ci sono più foglie, rifiuti, coni, cestini e vasi attorno al punto di partenza. All'inizio la crescita è circa 2,5 volte più rapida, poi scende fino al ritmo normale, che riprende a 0,8 m di raggio.
- **Missioni facoltative.** Sono 23 obiettivi in ordine di taglia, da "15 foglie" a "100 edifici". Ogni missione completata dà una piccola spinta verso il livello successivo. Il traguardo in corso compare per qualche secondo quando avanza; l'elenco completo è nel menu di pausa. Si possono disattivare.
- **Freccia guida.** Indica gli oggetti della tua taglia quando nell'inquadratura non ce ne sono. Si può disattivare.
- **Crolli più spettacolari.** Pezzi che si staccano dai piani alti, schegge di vetro dai grattacieli e un breve rallentatore sugli edifici più alti di 35 m. Il rallentatore è escluso con "Riduci effetti".
- **Ciclo giorno/notte** di 16 minuti: alba, tramonto e notte con finestre accese, lampioni, fari e insegne luminose. L'ora del giorno viene salvata. Si può disattivare.
- **Città più varia.** Due nuove facciate (porte-finestre con balconcino, vetro scuro con lamelle verticali) e più colori di intonaco. Chiome e siepi si muovono con il vento. Oltre la zona caricata, il terreno mostra tetti stilizzati.
- **Pedoni** che si scansano quando si incrociano e rallentano dietro chi va piano.
- **Oggetti trascinati** che si urtano tra loro. Quelli spostati e poi abbandonati restano dove sono, anche dopo il riavvio.
- **Autobus** che viaggiano sulla corsia esterna e si fermano alle pensiline per qualche secondo.
- **Suoni diversi per materiale:** metallo per i veicoli, fruscio per gli alberi, vetro per gli edifici, legno e metallo per l'arredo urbano. Quando inghiotti qualcosa il bordo si illumina.
- **Statistiche** dal menu e dalla pausa: tempo di gioco, massa e raggio massimo, oggetti, edifici crollati, distanza percorsa, missioni e oggetti più inghiottiti.
- **Accessibilità:** dimensione dell'interfaccia regolabile e intensità della vibrazione.
- **Prestazioni:**
  - **Culling per oggetto:** gli oggetti fuori dall'inquadratura non vengono più disegnati. Nei test i triangoli scendono da 1,8 M a 0,22 M all'inizio del gioco e da 1,9 M a 0,53 M alla taglia delle auto.
  - **Caricamento a pezzi:** le zone dettagliate si costruiscono un pezzo alla volta: terreno, oggetti a gruppi di 150, edifici a gruppi di 3.
  - **Città lontana più estesa** con qualità Media e Alta.

## Cosa è implementato

**Città.** La città è infinita e deterministica, divisa in settori da 64 m. Ogni settore ha un incrocio, due tratti di strada e un isolato. Ci sono cinque zone:

- **residenziale:** case e villette con giardini, recinzioni o siepi, vialetti, piscine e auto parcheggiate; palazzine con balconi;
- **centro:** palazzi a corte con negozi, tende, insegne, tetti a padiglione e piazzette con fontana, dehors ed edicola;
- **commerciale:** supermercato con parcheggio, carrelli e lampioni, oppure magazzini con furgoni e cassonetti;
- **centro direzionale:** grattacieli con facciate in vetro, podi, eliporti, viali a 4 corsie e piazze;
- **parchi:** sentieri, fontana, aiuole, panchine, chiosco, laghetto, 5 specie di alberi e cespugli.

Lungo i marciapiedi ci sono lampioni, semafori, panchine, cestini, idranti, cartelli, bici e scooter parcheggiati, pensiline dell'autobus e rifiuti e foglie da inghiottire. Le strade hanno strisce pedonali, linee di arresto e linee di corsia. Un test automatico verifica che, su 17×17 settori, gli edifici non si sovrappongano e che nessun oggetto stia in strada o dentro un edificio.

**Modelli.** Sono tutti procedurali, senza asset esterni:

- **veicoli:** utilitaria, berlina, SUV, furgone, autobus, scooter, moto e bicicletta, con profilo laterale estruso, archi passaruota, vetri, fari, paraurti, specchietti, targhe e ruote che girano;
- **pedoni:** persone articolate con proporzioni umane, abbigliamento e incarnato variabili e animazioni di camminata e di corsa;
- **edifici:** facciate con finestre, scuri, cornicioni, zoccolature, balconi, vetrine e attrezzature sul tetto.

**Traffico.** I veicoli tengono la destra e restano nelle corsie. Rallentano in curva, si fermano al rosso, mantengono la distanza da veicoli, relitti e pedoni, frenano o scappano se il buco è pericoloso e suonano il clacson. Non si teletrasportano: appaiono e scompaiono solo fuori dall'inquadratura.

**Pedoni.** Camminano sui marciapiedi e attraversano sulle strisce con il verde. Se il buco è abbastanza grande da inghiottirli scappano correndo. Se la gravità li fa cadere agitano le braccia e, se non vengono inghiottiti, si rialzano.

**Gravità.**

- L'attrazione è proporzionale a 1/d², scala con il raggio del buco ed è ridotta per gli oggetti pesanti rispetto al buco.
- Ogni oggetto ha una resistenza (ancoraggio): prima vibra, poi gli oggetti alti (lampioni, alberi, semafori) si inclinano. Quando cede diventa un corpo rigido simulato con contatti agli spigoli, attrito, coppia, parete del pozzo e risucchio. Così le auto perdono aderenza, slittano, ruotano o si ribaltano e scompaiono solo dopo aver attraversato il bordo.
- **Edifici:** tremore, inclinazione, cedimento della base, caduta verso l'apertura, sprofondamento graduale con leggera compressione, polvere, detriti, rombo, vibrazione e un leggero movimento cinematografico della camera.
- Un oggetto troppo grande per il buco reagisce solo con un tremore.

**Buco nero.**

- **Forma:** disco perfettamente circolare che rimuove davvero il terreno (stencil buffer). Sotto c'è un pozzo scuro, dove gli oggetti si oscurano scendendo.
- **Bordo:** contorno netto, alone delicato e particelle a spirale.
- **Lente gravitazionale:** simulata in post-processing (disattivata nella qualità Leggera).
- **Coerenza:** la dimensione visibile coincide con quella fisica; un test misura la circolarità dall'alto a tre scale diverse.

**Crescita.**

- **Raggio:** r = 0,3 m · ∛(1 + massa). La curva è continua, monotona e senza limite.
- **Massa degli oggetti:** è ∝ (raggio richiesto)³, quindi il ritmo resta costante a ogni scala. Per raddoppiare il raggio servono circa 120–200 oggetti della propria taglia.
- **Classi sbloccabili:** foglie → coni e cestini → panchine, bici e pedoni → scooter e lampioni → auto → furgoni e alberi → chioschi → case e autobus → palazzine → grattacieli → isolati, quartieri e scale successive.

**Mondo esteso e ottimizzazione.**

- **Settori:** quelli vicini sono caricati in dettaglio, quelli più lontani in versione semplificata (blocchi, chiome, superfici colorate), e oltre c'è un piano procedurale infinito con le strade. Così non ci sono bordi improvvisi. Gli oggetti già inghiottiti restano inghiottiti, anche dopo ricarica o riavvio.
- **Draw call:** atlanti di texture e materiali "uber" (rugosità, metallo ed emissione per vertice) riducono le draw call a **1 per settore** e **1 per tipo di oggetto**: da ~590 a ~130 nella scena più pesante.
- **Pool e LOD:** tutti gli oggetti usano pool istanziati condivisi. Un LOD a distanza nasconde gli oggetti sotto pochi pixel e toglie le ombre a quelli piccoli. Le costruzioni dei settori sono distribuite su più frame e gli shader sono compilati in anticipo.
- **Precisione:** un'origine mobile mantiene la precisione delle coordinate anche a decine di km dal punto di partenza.
- **Qualità grafica:** Leggera, Media, Alta e Auto. Auto riduce la risoluzione se gli FPS scendono e, se serve, passa a Leggera.

**Interfaccia.**

- **Menu:** città 3D animata sullo sfondo e logo; i pulsanti sono Gioca/Continua, Nuova partita (con conferma) e Impostazioni.
- **HUD:** minimale.
- **Pausa:** mostra le statistiche.
- **Impostazioni:** modalità di controllo, posizione, dimensione e opacità del joystick, sensibilità, tipo di pulsante ATTRAI, qualità, riduzione effetti, musica, effetti, vibrazione e ripristino.
- **Layout:** supporta le *safe area* (notch).

**Audio.** È tutto sintetizzato con WebAudio, senza file audio:

- **musica:** pad ambient delicato con campanelli;
- **città:** ambiente urbano che segue il traffico, uccellini nei parchi;
- **risucchio:** sempre più grave man mano che il buco cresce;
- **eventi:** "plop" di assorbimento proporzionale alla massa, cedimento degli edifici con rombo e crepe, clacson e slittamenti;
- **feedback aptico** discreto.

## Test eseguiti (reali)

`npm test` lancia i test di logica in Node: generazione della città su 17×17 settori e curva di crescita. **306.566 controlli superati**, comprese le missioni.

`npm run test:e2e` esegue un test end-to-end in Microsoft Edge headless con GPU, viewport 390×844 portrait e input touch reali via CDP. **47/47 superati.** Ogni esecuzione salva gli screenshot e `e2e-results.json` in `docs/screenshots/`.

| Verifica | Esito |
| --- | --- |
| Il buco è circolare dall'alto (aspetto 1,00, riempimento 0,97–0,99, a raggio 0,3 m e 38 m) e la dimensione visibile coincide con il raggio fisico | ✔ |
| Nessun pianeta o sfera sopra la città | ✔ |
| La gravità non parte da sola; ATTRAI tieni premuto e interruttore | ✔ |
| Il joystick muove il buco; multitouch (movimento + ATTRAI); la modalità solo touch funziona | ✔ |
| Comandi mai sovrapposti né fuori schermo in tutte le modalità, a 320×568, 390×844 e 844×390 | ✔ |
| Veicoli sempre su strada, pedoni su marciapiedi o strisce; veicoli fermi al rosso | ✔ |
| I pedoni fuggono correndo | ✔ |
| Assorbimento degli oggetti piccoli, la massa e il raggio crescono | ✔ |
| Un'auto viene trascinata nel buco | ✔ |
| Un edificio si inclina, crolla, sprofonda e scompare (stress → collapse → gone) | ✔ |
| Crescita senza limite (r > 30 m); la camera si allontana e resta centrata sul buco | ✔ |
| Teletrasporto a ~11 km: settori caricati e origine mobile riallineata | ✔ |
| Salvataggio e ricarica dei progressi; impostazioni del joystick personalizzato persistenti | ✔ |
| Audio attivo dopo il primo tocco; nessun errore in console | ✔ |

Misure nella scena più pesante (buco da 38 m), sulla GPU desktop di questa macchina: circa **130 draw call** e **1,6 M triangoli** comprese le ombre, a **45–60 FPS**. Nei primi minuti di gioco il carico è molto inferiore.

A raggio 2,8 m, attraversando la città con ATTRAI premuto, il frame time è:

- p50 ≈ 17 ms;
- p99 ≈ 25 ms (prima della v1.1 era 44 ms);
- un solo frame oltre i 50 ms su ~690, durante il caricamento dei settori.

La parte CPU di ogni frame resta sotto i 10 ms (profilo per sezione in `window.__bhi.prof()`), quindi i picchi vengono dal caricamento dei dati sulla GPU o dal browser.

**Non ancora verificato:**

- prestazioni e calore su smartphone Android o iPhone reali (non disponibili qui);
- compilazione con Android Studio e Xcode;
- ascolto reale dell'audio: è stato verificato solo che il motore audio è attivo.

È il primo passo consigliato prima di una pubblicazione.

## Limiti noti e prossimi passi

- **Asset 3D:** i modelli sono procedurali, semi-realistici e stilizzati, non asset artistici professionali. Il prossimo salto di qualità visiva è sostituirli con modelli glTF con licenza compatibile (CC0 o acquistati), mantenendo gli stessi nomi di modello in `src/earth/models.js`.
- **Pedoni:** si scansano solo con una manovra semplice (passo laterale o rallentamento), non con una vera navigazione tra la folla.
- **Collisioni:** tra gli oggetti trascinati sono semplificate a cilindri verticali.
- **Notte:** i negozi restano bui; si accendono solo finestre, lampioni, fari e insegne. Le auto non parcheggiano.
- **Vibrazione su iOS:** Safari non supporta la Vibration API. Nell'app nativa si può aggiungere il plugin `@capacitor/haptics`.
- **Scala estrema:** oltre ~50 m di raggio la città lontana è resa in forma semplificata. Il passo successivo è un'ulteriore rappresentazione "macro" (quartieri o città interi).

## Struttura

| Percorso | Scopo |
| --- | --- |
| `index.html` | Markup di UI, HUD, menu e impostazioni |
| `src/earth/main.js` | Bootstrap, ciclo di gioco, stato, salvataggio, hook di debug e test (`window.__bhi`) |
| `src/earth/citygen.js` | Generazione deterministica della città (dati puri, testata in Node) |
| `src/earth/config.js` | Tipi di oggetti, masse, soglie, curva di crescita, livelli di progressione |
| `src/earth/world.js` | Settori, LOD, registro entità, terreno, piano infinito |
| `src/earth/buildings.js` | Edifici procedurali |
| `src/earth/models.js` | Veicoli, arredo urbano, alberi, rifiuti |
| `src/earth/peds.js` | Pedoni (scheletro istanziato, IA, animazioni) |
| `src/earth/traffic.js` | Traffico, corsie, semafori |
| `src/earth/physics.js` | Gravità, corpi rigidi, crolli |
| `src/earth/hole.js` / `src/earth/post.js` | Buco nero (stencil, pozzo, alone, particelle) e lente gravitazionale |
| `src/earth/camera.js` | Camera, zoom, dissolvenza degli edifici che coprono il buco |
| `src/earth/input.js` / `src/earth/ui.js` | Controlli multitouch e interfaccia |
| `src/earth/audio.js`, `fx.js`, `materials.js`, `textures.js`, `pools.js`, `geo.js`, `origin.js`, `save.js` | Audio, particelle, materiali/atlanti, texture procedurali, pool istanziati, geometrie, origine mobile, persistenza |
| `tests/earth-logic.test.mjs` / `tests/e2e-earth.mjs` | Test di logica e test end-to-end nel browser |
| `scripts/standalone.mjs` | Genera l'HTML a file singolo |
| `scripts/shot.mjs` | Utility di sviluppo: apre il gioco in Edge headless, esegue uno script e salva uno screenshot |
| `docs/screenshots/` | Screenshot reali prodotti dai test |
| `demo.html`, `classic-v2.html`, `src/three-d`, `src/immersive`, `src/game`, `src/ui` | Versioni precedenti (v0.2–v0.3), conservate. `npm run test:legacy` lancia i loro vecchi test. |

## Corrispondenza con il brief

| Richiesta | Implementazione |
| --- | --- |
| Unity 6 LTS, URP, C# | three.js r180 (WebGL 2), JavaScript ES2022, Vite |
| Shader Graph per il buco nero | Shader GLSL: maschera stencil, pozzo, bordo e alone, particelle, lente in post-processing |
| Rigidbody | Simulazione rigida a box propria (contatti agli spigoli, attrito, coppia, sotto-passi a 240 Hz) per gli oggetti liberati, sequenza scriptata per gli edifici |
| NavMesh | Grafo deterministico di marciapiedi e attraversamenti; corsie e incroci per i veicoli |
| Object pooling e LOD | `InstancedMesh` condivisi con slot riciclati; settori dettagliati, semplificati e piano infinito; LOD a distanza |
| Salvataggio locale | `localStorage` (impostazioni + massa, posizione, oggetti inghiottiti per settore) |
| Build Android / iOS (Xcode) | Capacitor: `android:*` e `ios:*` in `package.json` |
