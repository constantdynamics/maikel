# Debrief: Welke Aandelen Komen het Hoogst Uit de Scanners?

## Een uitgebreide analyse van de selectiecriteria, algoritmen en rangschikking

---

## Inleiding

Dit document beschrijft in detail hoe de drie stock-scanning algoritmen — **Kuifje**, **Professor Zonnebloem** en de **Sector Scanner** — aandelen zoeken, filteren, analyseren en rangschikken. Elk algoritme benadert de markt vanuit een andere invalshoek, maar ze delen dezelfde kernfilosofie: aandelen identificeren die een bewezen patroon van prijsherstel of explosieve prijsbewegingen vertonen, en die momenteel op een aantrekkelijk instapniveau zitten.

---

## 1. Kuifje Scanner: De Hersteller

### Kernfilosofie

Kuifje zoekt naar aandelen die zwaar gedaald zijn ten opzichte van hun all-time high (ATH), maar in het verleden hebben bewezen dat ze meerdere keren kunnen herstellen. De kerngedachte is simpel: een aandeel dat drie keer 200% is gestegen vanuit een dieptepunt, heeft een grotere kans om dat opnieuw te doen dan een aandeel zonder zo'n trackrecord.

### Hoe worden kandidaten gevonden?

De scanner begint met het ophalen van twee lijsten via de TradingView Scanner API:

1. **Top Verliezers**: Tot 200 aandelen per markt die recent het meest in waarde zijn gedaald.
2. **Hoge ATH-Daling**: Tot 300 aandelen per markt met de grootste procentuele daling ten opzichte van hun all-time high (minimaal 60%).

Deze twee bronnen worden samengevoegd en ontdubbeld. Het resultaat is een bruto-lijst van honderden tot duizenden kandidaten die potentieel interessant zijn.

### Welke filters worden toegepast?

Voordat een aandeel überhaupt diep geanalyseerd wordt, moet het door een reeks voorfilters:

- **Beurs**: Alleen ondersteunde beurzen (NYSE, NASDAQ, AMEX, TSX, LSE, XETRA, Euronext, HKEX, KRX en meer — in totaal 41 beurzen wereldwijd).
- **Geen hefboomproducten**: Leveraged en inverse ETFs (ProShares, Direxion en dergelijke) worden automatisch uitgesloten.
- **Sectorfilter**: Bepaalde volatiele sectoren zoals Cannabis, Cryptocurrency, SPACs, Shell Companies en Penny Stocks worden standaard uitgesloten, tenzij expliciet ingeschakeld. Biotechnologie en Farmaceutica zijn wél standaard toegestaan.
- **Marktkapitalisatie**: Optioneel filterbaar op Micro (<$300M), Small ($300M–$2B), Mid ($2B–$10B) of Large ($10B+).
- **Prijs > $0**: Aandelen met een nulprijs worden uitgesloten.
- **ATH-daling in bereik**: De daling moet tussen 60% en 100% liggen (met een tolerantie van 10% aan de onderkant).

### De diepte-analyse

Aandelen die door de voorfilters komen, worden in batches van 5 stuks parallel geanalyseerd. Voor elk aandeel wordt 5 jaar aan dagelijkse koershistorie opgehaald via Yahoo Finance. Vervolgens:

1. **Minimale leeftijd**: Het aandeel moet minstens 1 jaar beursgenoteerd zijn.
2. **ATH-berekening**: Het effectieve all-time high wordt bepaald als het maximum van de TradingView ATH en de Yahoo Finance historische ATH.
3. **Huidige daling**: De actuele daling ten opzichte van het effectieve ATH wordt herberekend en moet binnen het bereik van 60–100% vallen.
4. **Aandelensplitsing-detectie**: Het systeem controleert op veelvoorkomende split-ratio's (2:1, 3:1, etc.) en reverse splits.
5. **Groei-event analyse**: Dit is het hart van Kuifje.

### Groei-events: het selectiecriterium

Een groei-event is een periode waarin de koers vanuit een dieptepunt (trough) minstens 30% stijgt en deze stijging minimaal 2 opeenvolgende handelsdagen vasthoudt. Het detectie-algoritme werkt als volgt:

- **Dieptepunten vinden**: Het systeem identificeert lokale minima via een 7-daags venster, het absolute minimum van de hele dataset, en significante dalingen van 50% of meer ten opzichte van een recent piek.
- **Herstelcyclus volgen**: Vanuit elk dieptepunt wordt vooruit gekeken. Als de koers het doelpercentage bereikt (dieptepunt × 1,30 bij 30% drempel), wordt het als potentieel groei-event gemarkeerd.
- **Validatie**: Het event wordt alleen geteld als de koers minimaal 2 dagen boven het doelniveau blijft en niet overlapt met een eerder gedetecteerd event.

### Hoe worden de hoogst scorende aandelen bepaald?

De score wordt berekend met een **driehoeksgetal-formule**: score = n × (n + 1) / 2, waarbij n het aantal groei-events is. Dit betekent:

| Groei-events | Score |
|:---:|:---:|
| 1 | 1 |
| 2 | 3 |
| 3 | 6 |
| 4 | 10 |
| 5 | 15 |

Deze formule beloont aandelen met meerdere onafhankelijke herstelcycli disproportioneel. Een aandeel met 5 groei-events scoort 15 keer hoger dan een aandeel met slechts 1 event.

### Visuele rangschikking: het Medaillespiegel-systeem

In de gebruikersinterface worden aandelen gerangschikt via een "medaillespiegel" (zoals bij de Olympische Spelen):

- **Groene stippen**: Groei-events met een piekgroei van 500% of meer.
- **Gele stippen**: Groei-events met een piekgroei van 300–499%.
- **Witte stippen**: Groei-events met een groei onder 300%.

De sortering gaat eerst op het aantal groene stippen (aflopend), dan gele, dan witte. Een aandeel met 2 groene en 1 gele stip staat hoger dan een aandeel met 3 gele stippen.

---

## 2. Professor Zonnebloem Scanner: De Spike-Jager

### Kernfilosofie

Waar Kuifje zoekt naar herstel vanuit diepe dalen, zoekt Zonnebloem naar aandelen met een stabiele basisprijs die periodiek **explosieve opwaartse pieken** (spikes) vertonen. Het idee: als een aandeel herhaaldelijk korte maar krachtige uitbraken laat zien, is de kans groot dat dit patroon zich herhaalt.

### Wereldwijde dekking

Zonnebloem scant veel breder dan Kuifje: meer dan 30 TradingView-markten worden systematisch doorzocht, van de VS en Canada tot Europa, Azië-Pacific en Zuid-Afrika. Uitgesloten landen zijn Rusland, Noord-Korea, Iran, Syrië, Belarus, Myanmar, Venezuela en Cuba.

### Kandidaatselectie

Kandidaten worden geselecteerd op basis van:

- **Koersbereik**: De verhouding tussen het 52-weeks hoogtepunt en dieptepunt moet minimaal 1,5 zijn (50% prijsbeweging over het afgelopen jaar).
- **Liquiditeit**: Gemiddeld dagelijks handelsvolume over 30 dagen moet minimaal 10.000 aandelen zijn.
- **Minimumprijs**: Minstens $0,10 om echte penny stocks uit te sluiten.
- **Type**: Alleen gewone aandelen — geen ETFs, warrants, fondsen of trusts.

Per markt worden tot 5.000 kandidaten opgehaald, gesorteerd op handelsvolume (meest liquide eerst).

### Het tijdbudget-mechanisme

Zonnebloem werkt met een strikt tijdbudget van 240 seconden voor de diepte-analyse (binnen de 300 seconden Vercel-limiet). Aandelen worden in batches van 10 parallel verwerkt. Als het tijdbudget op is, retourneert de scan een "partial" status en pakt de volgende geplande cron-run de draad op met nog niet gescande aandelen. Een rotatiesysteem zorgt ervoor dat nooit-gescande aandelen voorrang krijgen.

### Spike-detectie: het hart van het algoritme

Voor elk kandidaat-aandeel wordt 24 maanden koershistorie opgehaald. De spike-detectie werkt in drie stappen:

1. **Basisprijs berekenen**: Een rollend 60-dagen mediaan wordt berekend, waarbij uitschieters (>2× de mediaan) worden uitgesloten. Dit geeft een "schone" basisprijs die de normale handelsrange weerspiegelt.

2. **Spike-zones identificeren**: Het systeem scant de koershistorie op momenten waar de prijs meer dan 37,5% boven de basisprijs stijgt (de helft van de 75% drempel). Zodra deze instapdrempel wordt bereikt, wordt de spike gevolgd totdat de prijs weer terugzakt.

3. **Spike valideren**: Een spike telt alleen als:
   - De piekprijs minimaal 75% boven de basisprijs ligt.
   - De spike minimaal 4 dagen aanhoudt.
   - De spike niet overlapt met een eerder gedetecteerde spike.

### Aanvullende stabiliteitschecks

Na spike-detectie worden twee stabiliteitscriteria gecontroleerd:

- **12-maanden prijsstabiliteit**: De koers mag in de afgelopen 12 maanden niet meer dan 40% zijn gedaald. Dit voorkomt selectie van aandelen in een structureel dalende trend.
- **Basisprijsstabiliteit**: De mediane basisprijs mag van het eerste kwartaal naar het laatste kwartaal van de analysedperiode niet meer dan 50% zijn gedaald.

### Scoring en ranking

De spike-score wordt berekend als de som van alle individuele spike-bijdragen:

```
Per spike: (spike_percentage / 100) × (duur_in_dagen / minimale_duur)
```

Voorbeeld: een spike van 150% die 8 dagen duurt levert (1,5 × 2,0) = 3,0 punten op. Een spike van 75% over 4 dagen levert (0,75 × 1,0) = 0,75 punten. Als de basisprijs stabiel is of groeit, wordt een bonus van 20% toegepast op de totaalscore.

Het medaillespiegel-systeem werkt hier met andere drempels:

- **Groene stippen**: Spikes van 200% of meer.
- **Gele stippen**: Spikes van 100–199%.
- **Witte stippen**: Spikes onder 100%.

De hoogst scorende aandelen combineren meerdere grote, langdurige spikes met een stabiele of stijgende basisprijs.

---

## 3. Sector Scanner: De Specialist

### Kernfilosofie

De Sector Scanner past **beide algoritmen** (Kuifje én Zonnebloem) toe op aandelen binnen specifieke sectoren. Een aandeel hoeft maar aan **één** van de twee sets criteria te voldoen om geselecteerd te worden. Dit geeft de breedste dekking binnen een specifiek marktsegment.

### Ondersteunde sectoren

Vier sectoren worden momenteel gescand:

- **BioPharma**: Gezondheidstechnologie en -diensten. Zoekwoorden: biotechnology, pharmaceutical, therapeutics, oncology, genomics, gene therapy, vaccines, immunology. Markten: VS en Canada.
- **Mining**: Niet-energetische mineralen. Zoekwoorden: gold, silver, copper, mining, lithium, cobalt, uranium, rare earth, precious metals, exploration. Markten: VS, Canada, Australië, Zuid-Afrika, VK, Europa, Brazilië, Mexico, Peru, Chili.
- **Hydrogen**: Elektronische technologie en procesindustrie. Markten: VS, Canada, Australië, Europa, VK.
- **Shipping**: Transport en maritieme logistiek. Markten: VS, Canada, VK, Europa, Hong Kong.

### Gecombineerde analyse

Elke kandidaat wordt getest tegen beide algoritmische criteria:

**Kuifje-criteria**: ATH-daling van 60–100%, minstens 1 groei-event van 30%+ over 5 jaar historische data.

**Zonnebloem-criteria**: Minstens 1 spike van 75%+ boven de basisprijs over 24 maanden, met een maximale 12-maanden prijsdaling van 40% en een maximale basisprijsdaling van 50%.

Het resultaat wordt gelabeld als `kuifje` (alleen Kuifje-criteria voldaan), `zonnebloem` (alleen Zonnebloem-criteria voldaan), of `both` (beide criteria voldaan — zeldzaam maar zeer hoog vertrouwen).

---

## 4. Welk Type Aandeel Scoort het Hoogst?

### Profiel van het ideale Kuifje-aandeel

Het aandeel dat het hoogst uit de Kuifje-scanner komt, heeft het volgende profiel:

- **Zwaar gedaald**: 60–80% onder zijn all-time high (genoeg ruimte voor herstel, maar niet faillissementswaardig).
- **Meerdere herstelcycli**: 4 of 5 onafhankelijke groei-events in de afgelopen 5 jaar, elk met minstens 30% stijging.
- **Hoge piekgroei**: Het sterkste groei-event laat een stijging zien van 500% of meer (resulterend in groene stippen).
- **Consistentie**: De groei-events zijn verspreid over de tijd, wat aantoont dat het niet om een eenmalige gebeurtenis gaat maar om een terugkerend patroon.
- **Gevestigde markt**: Genoteerd op een grote beurs (NYSE, NASDAQ), minimaal 1 jaar beurshistorie.

### Profiel van het ideale Zonnebloem-aandeel

- **Stabiele basisprijs**: Een vlakke of licht stijgende mediane koers, wat duidt op een voorspelbare handelsrange.
- **Meerdere grote spikes**: 2 of meer spikes van 150%+ boven de basis, elk 8+ dagen aanhoudend.
- **Geen structurele daling**: De koers is over 12 maanden niet meer dan 40% gedaald.
- **Hoge liquiditeit**: Dagelijks handelsvolume van ver boven de 10.000 aandelen.
- **Breed koersbereik**: De 52-weeks hoog/laag-verhouding is ruim boven 1,5.

### Profiel van het ideale Sector Scanner-aandeel

Het allerhoogst scorende sectoraandeel voldoet aan **beide** sets criteria: het is zowel zwaar gedaald ten opzichte van zijn ATH met bewezen herstelgeschiedenis, als in het bezit van een stabiele basisprijs met explosieve spike-patronen. Dit "both"-label is zeldzaam en geeft het hoogste vertrouwen.

---

## 5. Databronnen en Betrouwbaarheid

### TradingView Scanner API

Gebruikt voor de initiële kandidaatselectie. Levert actuele koersdata, marktkapitalisatie, sectorclassificatie, 52-weeks hoog/laag en all-time highs. Beperking: geen gedetailleerde historische data.

### Yahoo Finance

De primaire bron voor historische koersdata (dagelijkse open, hoog, laag, slot en volume). Levert tot 5 jaar geschiedenis voor Kuifje en 2–3 jaar voor Zonnebloem. Rate limit: 200ms tussen verzoeken, 15 seconden timeout per aandeel.

### Alpha Vantage

Optionele verificatiebron. Wordt gebruikt om Yahoo Finance-prijzen te cross-valideren (maximaal 5% afwijking toegestaan). Beperkt tot 25 gratis aanvragen per dag. Verhoogt de betrouwbaarheidsscore wanneer de prijzen overeenkomen.

---

## 6. Automatisering en Planning

De scanners draaien volledig geautomatiseerd via Vercel cron jobs:

| Scanner | Tijdstip (UTC) | Frequentie |
|:---|:---|:---|
| Kuifje | 21:00 | Maandag t/m vrijdag |
| Zonnebloem | 16:00 | Maandag t/m vrijdag |
| Sector Scanner | 12:00 | Alleen zondag |

Elke scan heeft een maximale looptijd van 300 seconden. Het tijdbudget-mechanisme zorgt ervoor dat onvoltooide scans automatisch worden hervat bij de volgende geplande run, waarbij nog niet gescande aandelen voorrang krijgen.

---

## Conclusie

De drie scanners vullen elkaar aan in hun benadering van de markt. Kuifje zoekt naar bewezen herstellers die momenteel op een dieptepunt handelen. Zonnebloem identificeert aandelen met een voorspelbare basisprijs die periodiek exploderen. De Sector Scanner combineert beide benaderingen voor gerichte sectoranalyse. De aandelen die het hoogst scoren zijn die met het meest consistente, herhaalde patroon van significante prijsbewegingen — niet eenmalige uitschieters, maar aandelen die keer op keer bewijzen dat ze in staat zijn tot substantieel herstel of explosieve pieken.
