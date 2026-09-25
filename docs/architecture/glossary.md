# Glossary: German ERP terms and code names

Use the **code name** in TypeScript identifiers, the **German term** in `de` UI text and the
**English term** in `en` UI text. Header aliases accepted by the parsers are ported from
`reference/python-prototype/loaders.py` (`COLUMN_ALIASES`, `TABLE_FILES`).

## Tables

| German (ERP / UI) | English (UI) | Code name | Typical file stems |
|---|---|---|---|
| Artikel, Materialstamm, Bestand | Materials | `materials` / `Material` | `artikel`, `materialstamm`, `bestand`, `materials` |
| (Offene) Bestellungen | Open purchase orders | `openPurchaseOrders` / `PurchaseOrder` | `bestellungen`, `offene_bestellungen`, `purchase_orders`, `open_purchase_orders` |
| Bedarf, Bedarfe, Fertigungsbedarf | Demand | `demand` / `DemandLine` | `bedarf`, `bedarfe`, `fertigungsbedarf`, `demand` |
| Lieferhistorie, Wareneingänge | Delivery history | `supplierHistory` / `DeliveryRecord` | `lieferhistorie`, `wareneingaenge`, `wareneingänge`, `supplier_history` |
| Lieferanten | Suppliers | `suppliers` / `Supplier` | `lieferanten`, `suppliers` |

## Columns

| German header(s) | English | Code name | Notes |
|---|---|---|---|
| Artikelnummer, Materialnummer, Teilenummer, Artikel | Material number | `materialId` (`MaterialId`) | Branded string |
| Bezeichnung, Artikelbezeichnung, Materialkurztext, Kurztext | Description | `description` | Optional |
| Hauptlieferant | Main supplier | `mainSupplierId` | Optional; used for "place order with ..." |
| Lagerbestand, Bestand, frei verwendbar | On-hand stock | `onHand` | Required |
| Sicherheitsbestand, Mindestbestand | Safety stock | `safetyStock` | Optional, default 0 |
| Mengeneinheit, ME, Einheit | Unit | `unit` | Optional, display only |
| Bestellnummer, Bestellung, Einkaufsbeleg | PO number | `poId` (`PoId`) | |
| Lieferant, Lieferantennummer, Kreditor | Supplier number | `supplierId` (`SupplierId`) | "Kreditor" is the accounting term for a supplier account |
| Bestellmenge, offene Menge, Menge | Quantity | `qty` | Also used in demand (`Bedarfsmenge`) |
| Liefertermin, bestätigter Termin, AB-Termin | Promised (confirmed) date | `promisedDate` | AB = Auftragsbestätigung (order confirmation). The prototype also maps `Wunschtermin` (requested date) here; see open question in backlog |
| Wareneingang, Eingangsdatum, WE-Datum, Lieferdatum | Actual receipt date | `actualDate` | Empty = not yet delivered, row skipped for stats |
| Bedarfsdatum, Bedarfstermin, Datum, Termin | Demand date | `date` | |
| Name, Lieferantenname, Firma, Name1 | Supplier name | `name` | |

## Domain concepts

| German | English | Code name | Meaning |
|---|---|---|---|
| Stichtag | As-of date | `asOf` | "Today" of the export. Passed in, never read from the clock inside the engine |
| Planungshorizont | Horizon | `horizonDays` | Calendar days projected from `asOf` (default 28) |
| Arbeitstag(e) | Working day(s) | `addWorkdays`, `workdaysBetween` | Mon to Fri; public holidays out of scope in Phase 1 |
| Verzug, Lieferverzug | Delay | `delayDays` | Signed working days from promised to actual date |
| P80-Verzug | P80 delay | `p80` | 80th percentile of delays, linear interpolation, `max(0, pyRound(p80))` |
| Termintreue | On-time rate | `onTimeRate` | Share of deliveries with delay <= 0 |
| geringe Aussagekraft | Low confidence | `lowConfidence` / `!reliable` | Fewer than 3 past deliveries |
| Planbestand, projizierter Bestand | Projected stock | `ProjectionSeries`, `minProjectedStock` | Day-by-day stock |
| ERP-Sicht | ERP view | `erpView` | POs arrive on the promised date |
| realistische Sicht | Realistic view | `realisticView` | POs arrive on promised date + supplier P80 working days |
| Fehlteil, Fehlbestand | Stock-out | `CRITICAL` | Projected stock < 0 |
| Unterschreitung Sicherheitsbestand | Below safety stock | `WARNING` | Projected stock < safety stock but never < 0 |
| kritisches Datum | Critical date | `criticalDate` | First stock-out date, or first below-safety date |
| Datum laut ERP | ERP view date | `erpViewDate` | Same kind of date in the ERP view, or `null` |
| verdecktes Risiko | Hidden risk | `hidden` | ERP view shows the problem later or not at all |
| Engpass | Shortage / bottleneck | `ShortageException` | One ranked alert |
| Dringlichkeit, Score | Score | `score` | Ranking value (spec §5.2 step 8) |
| Warum | Why | `reasons: Reason[]` | Structured codes, rendered by i18n |
| nächster Schritt | Next action | `actions: Action[]` | Structured codes, rendered by i18n |
| nachfassen | Expedite | `EXPEDITE` | Chase the supplier for an open PO |
| vorziehen | Pull forward | `PULL_FORWARD` | Ask the supplier to deliver earlier |
| Teillieferung | Partial delivery | (text of `EXPEDITE`) | |
| Disponent | Planner (MRP controller) | persona | Primary user |
| Engpass-Check | Shortage check | CTA | Free consulting offer requested via `/kontakt` |
| Materialbedarfsplanung (MRP) | Material requirements planning | (context) | What the ERP does with promised dates |
