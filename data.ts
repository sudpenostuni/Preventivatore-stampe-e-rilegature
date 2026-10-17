export interface BindingType {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  priceInfo: string;
  basePrice: number;
  perPagePrice: number;
  promoThreshold: number; // Spesa minima di stampa per avere la rilegatura omaggio standard
  minPages: number;
  maxPages: number;
  imageUrl: string;
  badge?: string;
  notUnder30?: boolean;
}

export const BINDING_TYPES: BindingType[] = [
  {
    id: "plastic",
    title: "Spirale in Plastica",
    subtitle: "in omaggio una ogni 15 euro di stampe",
    description: "L'opzione più versatile e amata dagli studenti. Perché sceglierla: Permette di aggiungere o rimuovere fogli in un secondo momento e ha un’apertura a 180° comodissima per studiare.",
    priceInfo: "da € 2,50 (30 - 600 pag)",
    basePrice: 2.50,
    perPagePrice: 0.01,
    promoThreshold: 15,
    minPages: 30,
    maxPages: 600,
    imageUrl: "https://www.mondocopia.it/cms/contenuto/c_234/img/spirale-plastica.jpg",
    badge: "Min. 30 pag.",
    notUnder30: true
  },
  {
    id: "metal",
    title: "Anelli Metallici",
    subtitle: "in omaggio una ogni 15 euro di stampe",
    description: "Stabile, professionale e moderna. Perché sceglierla: Resistente e dal design pulito, è perfetta per presentazioni aziendali, calendari o portfolio che devono durare nel tempo.",
    priceInfo: "da € 3,50 (30 - 450 pag)",
    basePrice: 3.50,
    perPagePrice: 0.01,
    promoThreshold: 15,
    minPages: 30,
    maxPages: 450,
    imageUrl: "https://transform.octanecdn.com/crop/1400x984/https://octanecdn.com/colorvisionprintingcom/colorvisionprintingcom_335300815.jpg",
    badge: "Min. 30 pag.",
    notUnder30: true
  },
  {
    id: "thermal",
    title: "Brossura a Caldo",
    subtitle: "in omaggio una ogni 15 euro di stampe",
    description: "L’effetto \"libro\" che cercavi. Perché sceglierla: È la rilegatura per eccellenza per tesi di laurea e volumi importanti. Una finitura impeccabile e una tenuta ultra-resistente per un risultato da libreria.",
    priceInfo: "da € 5,00 (30 - 500 pag)",
    basePrice: 5.00,
    perPagePrice: 0.01,
    promoThreshold: 15,
    minPages: 30,
    maxPages: 500,
    imageUrl: "https://www.agfsolutions.it/wp-content/uploads/2021/08/Rilegatura-brossura-cucita-filo-refe.jpg.webp",
    badge: "Min. 30 pag.",
    notUnder30: true
  },
  {
    id: "stitch",
    title: "Opuscolo Spillato",
    subtitle: "in omaggio una ogni 15 euro di stampe",
    description: "Sottile e funzionale, trasforma i tuoi fogli in un vero libretto con piega centrale e doppie graffette. Ideale per dispense brevi, cataloghi o programmi.",
    priceInfo: "da € 1,50 (4 - 60 pag)",
    basePrice: 1.50,
    perPagePrice: 0.00,
    promoThreshold: 15,
    minPages: 4,
    maxPages: 60,
    imageUrl: "https://static.multigrafica.net/front/img/slider/stampa-cataloghi-spillati-slider-01.webp",
    badge: "Anche < 30 pag.",
    notUnder30: false
  },
  {
    id: "staple",
    title: "Doppia Spilla Laterale",
    subtitle: "Semplice e gratuita",
    description: "Semplice, rapida e gratuita. Perfetta per fascicoli da studio, dispense quotidiane e fogli di consultazione veloce.",
    priceInfo: "€ 0,00 (2 - 150 pag)",
    basePrice: 0.00,
    perPagePrice: 0.00,
    promoThreshold: 0,
    minPages: 2,
    maxPages: 150,
    imageUrl: "https://printo-s3.dietpixels.net/cloudinary/res/dxivtqnri/image/upload/Document-printing/Side-Staple-Binding/1649412507.jpg?quality=70&format=webp&w=1080",
    badge: "Anche < 30 pag.",
    notUnder30: false
  },
  {
    id: "none",
    title: "NESSUNA RILEGATURA",
    subtitle: "Solo stampe sciolte",
    description: "Riceverai le tue stampe non rilegate in fogli sciolti suddivisi con cura. Nessun costo aggiuntivo di rilegatura.",
    priceInfo: "€ 0,00",
    basePrice: 0.00,
    perPagePrice: 0.00,
    promoThreshold: 0,
    minPages: 1,
    maxPages: 9999,
    imageUrl: "https://static.multigrafica.net/front/img/slider/stampa-fascicoli-copiativi-slider-01.webp",
    badge: "Fogli Sciolti",
    notUnder30: false
  }
];

export interface BindingLimitTip {
  title: string;
  minPages: number;
  maxPages: number;
  badge: string;
  rangeText: string;
  consiglio: string;
  note: string;
  isAvailableUnder30: boolean;
}

export const BINDING_LIMITS_TIPS: BindingLimitTip[] = [
  {
    title: "Spirale in Plastica",
    minPages: 30,
    maxPages: 600,
    badge: "Minimo 30 pag.",
    rangeText: "30 – 600 pagine",
    consiglio: "Apertura a 180° ideale per lo studio e possibilità di aggiungere/rimuovere fogli.",
    note: "Non disponibile sotto le 30 pagine.",
    isAvailableUnder30: false
  },
  {
    title: "Anelli Metallici",
    minPages: 30,
    maxPages: 450,
    badge: "Minimo 30 pag.",
    rangeText: "30 – 450 pagine",
    consiglio: "Finitura moderna e professionale per relazioni, calendari, tesi e cataloghi.",
    note: "Non disponibile sotto le 30 pagine.",
    isAvailableUnder30: false
  },
  {
    title: "Brossura a Caldo",
    minPages: 30,
    maxPages: 500,
    badge: "Minimo 30 pag.",
    rangeText: "30 – 500 pagine",
    consiglio: "Effetto libro con dorso fresato e incollato per volumi importanti e tesi.",
    note: "Non disponibile sotto le 30 pagine.",
    isAvailableUnder30: false
  },
  {
    title: "Opuscolo Spillato",
    minPages: 4,
    maxPages: 60,
    badge: "Anche < 30 pag.",
    rangeText: "4 – 60 pagine",
    consiglio: "Consigliato per documenti brevi, fascicoli informativi e libretti (pagine multiple di 4).",
    note: "Disponibile e consigliato sotto le 30 pagine.",
    isAvailableUnder30: true
  },
  {
    title: "Doppia Spilla Laterale",
    minPages: 2,
    maxPages: 150,
    badge: "Anche < 30 pag.",
    rangeText: "2 – 150 pagine",
    consiglio: "Pratico ed economico per dispense veloci e appunti da consultazione.",
    note: "Disponibile sotto le 30 pagine (gratuita).",
    isAvailableUnder30: true
  },
  {
    title: "Nessuna Rilegatura",
    minPages: 1,
    maxPages: 9999,
    badge: "Tutte le pagine",
    rangeText: "1 – illimitate",
    consiglio: "Stampe sciolte ordinate e fascicolate senza punti metallici o foratura.",
    note: "Sempre disponibile.",
    isAvailableUnder30: true
  }
];

export const PRICING_CONFIG = {
  printBwStandard: 0.05,        // B&N A4 (€ 0,05 / pag)
  printColorBase: 0.30,         // Colore A4 base (€ 0,30 / pag)
  printColorBulk: 0.25,         // Colore A4 sconto oltre 50 pag complessive (€ 0,25 / pag)
  printColorThreshold: 50       // Soglia per sconto volume colore (> 50 pag)
};

export const WA_PHONE = "393917972545";
export const LOGO_URL = "https://sudpen.weebly.com/uploads/5/1/0/3/51034189/editor/logo-2020.png?1761932030";
export const OXFORD_LOGO_URL = "https://www.oxfordcollegemita.it/wp-content/uploads/2021/02/LOGO-OXFORD-round.png";
export const GSHEET_URL = "https://script.google.com/macros/s/AKfycbwF6i92Gzk_auVGtT7s-8zR4AHR5lRc6MZTweA-R7YB4EDXNR9lCHXD1jxmrgCz8zOf/exec";

// Parametri convenzione Oxford
export const SDA_SHIPPING_PRICE = 7.80;
export const CONVENZIONE_OXFORD_DISCOUNT = 0.20; // 20% di sconto su tutti i preventivi
export const CONVENZIONE_OXFORD_FREE_THRESHOLD = 60.00; // Rilegatura e spedizione gratis oltre 60€ scontati
