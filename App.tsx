import React, { useState, useRef, useEffect } from 'react';
import { Analytics } from "@vercel/analytics/react";
import { jsPDF } from 'jspdf';
import { 
  Trash2, Loader2, FileScan, 
  Plus, Minus, ArrowRight, ArrowDown, ArrowUp, 
  CheckCircle2, X, Download, BookOpen, ChevronLeft, ChevronRight,
  Gift, Check, Truck, Store, Tag, Sparkles, AlertTriangle, HelpCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  BINDING_TYPES, 
  BINDING_LIMITS_TIPS,
  PRICING_CONFIG, 
  WA_PHONE, 
  LOGO_URL, 
  OXFORD_LOGO_URL,
  GSHEET_URL, 
  SDA_SHIPPING_PRICE,
  CONVENZIONE_OXFORD_DISCOUNT,
  CONVENZIONE_OXFORD_FREE_THRESHOLD,
  BindingType 
} from './data';
import { savePreventivoToFirestore, PreventivoItem } from './firebase';

const fmt = (v: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(v);
const safeNum = (v: any) => parseInt(v?.toString() || '0') || 0;

interface PrintJob {
  id: string;
  name: string;
  bwPages: number;
  colorPages: number;
  cps: number;
  bindingId: string;
  fileName?: string;
}

const slideVariants = {
  initial: (direction: 'up' | 'down') => ({
    y: direction === 'up' ? 80 : -80,
    opacity: 0,
    scale: 0.98,
  }),
  animate: {
    y: 0,
    opacity: 1,
    scale: 1,
    transition: {
      y: { type: "spring", stiffness: 320, damping: 28 },
      opacity: { duration: 0.25 },
      scale: { duration: 0.25 }
    }
  },
  exit: (direction: 'up' | 'down') => ({
    y: direction === 'up' ? -80 : 80,
    opacity: 0,
    scale: 0.98,
    transition: {
      y: { type: "spring", stiffness: 320, damping: 28 },
      opacity: { duration: 0.2 },
      scale: { duration: 0.2 }
    }
  })
};

const NumIn = ({ v, onChange, min = 0 }: { v: number, onChange: (v: number | '') => void, min?: number }) => (
  <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden h-11 bg-gray-50 shadow-inner">
    <button 
      type="button"
      onClick={() => onChange(Math.max(min, safeNum(v) - 1))} 
      className="w-11 h-full flex justify-center items-center active:bg-gray-200 border-r border-gray-200 text-gray-500 hover:text-gray-800 transition-colors"
      aria-label="Diminuisci"
    >
      <Minus size={15} />
    </button>
    <input 
      type="number" 
      value={v} 
      onChange={e => onChange(e.target.value === '' ? '' : Math.max(min, parseInt(e.target.value)))} 
      className="w-full text-center font-bold bg-transparent focus:outline-none text-sm text-gray-900" 
    />
    <button 
      type="button"
      onClick={() => onChange(safeNum(v) + 1)} 
      className="w-11 h-full flex justify-center items-center active:bg-gray-200 border-l border-gray-200 text-gray-500 hover:text-gray-800 transition-colors"
      aria-label="Aumenta"
    >
      <Plus size={15} />
    </button>
  </div>
);

const App: React.FC = () => {
  // Rilevamento marker convenzione Oxford da pathname, search o hash
  const [isOxford, setIsOxford] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const path = window.location.pathname.toLowerCase();
    const search = window.location.search.toLowerCase();
    const hash = window.location.hash.toLowerCase();
    const stored = sessionStorage.getItem('oxford_convenzione') === 'true';

    const hasOxfordMarker = path.includes('/oxford') || search.includes('oxford') || hash.includes('oxford');
    if (hasOxfordMarker) {
      sessionStorage.setItem('oxford_convenzione', 'true');
      setIsOxford(true);
    } else if (stored) {
      setIsOxford(true);
    }
  }, []);

  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [customer, setCustomer] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState<'ritiro' | 'spedizione_sda'>('spedizione_sda');
  const [shippingAddress, setShippingAddress] = useState('');
  const [isStarted, setIsStarted] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [direction, setDirection] = useState<'up' | 'down'>('up');
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [selectedBindingDetail, setSelectedBindingDetail] = useState<BindingType | null>(null);
  const [activeEditingJobId, setActiveEditingJobId] = useState<string | null>(null);
  const [showLimitsModal, setShowLimitsModal] = useState(false);
  const [showSavedToast, setShowSavedToast] = useState(false);

  const carouselRef = useRef<HTMLDivElement>(null);
  const detailsRef = useRef<HTMLDivElement>(null);

  // Calcolo totale dinamico per stampe e rilegature A4 standard + Convenzione Oxford
  const calculateTotals = () => {
    // 1. Pagine colore complessive tra tutti i lavori per sconto volume (>50 pag colore totali = 0.25 anziche 0.30)
    let totalColorPagesAllJobs = 0;
    jobs.forEach(j => {
      totalColorPagesAllJobs += safeNum(j.colorPages) * Math.max(1, safeNum(j.cps || 1));
    });

    const isColorBulk = totalColorPagesAllJobs > PRICING_CONFIG.printColorThreshold;
    const colorRateA4 = isColorBulk ? PRICING_CONFIG.printColorBulk : PRICING_CONFIG.printColorBase;
    const bwRateA4 = PRICING_CONFIG.printBwStandard;

    // Calcolo preliminare lordo di stampe e rilegature
    let totalPrintGross = 0;
    let totalBindGross = 0;

    const preliminaryDetails = jobs.map(j => {
      const b = safeNum(j.bwPages);
      const c = safeNum(j.colorPages);
      const totalPages = b + c;
      const copies = Math.max(1, safeNum(j.cps || 1));

      // Costo stampa singola copia (A4 standard)
      const singleCopyPrintCost = (b * bwRateA4) + (c * colorRateA4);
      const jobPrintCost = singleCopyPrintCost * copies;

      const binding = BINDING_TYPES.find(bt => bt.id === j.bindingId) || BINDING_TYPES[0];
      const unitBindPrice = binding.basePrice + (totalPages * binding.perPagePrice);
      const jobBindCost = unitBindPrice * copies;

      // Verifica limite minimo 30 pagine
      const isUnder30Issue = totalPages > 0 && totalPages < 30 && !!binding.notUnder30;

      totalPrintGross += jobPrintCost;
      totalBindGross += jobBindCost;

      return {
        job: j,
        binding,
        b,
        c,
        totalPages,
        copies,
        bwRate: bwRateA4,
        colorRate: colorRateA4,
        singleCopyPrintCost,
        jobPrintCost,
        unitBindPrice,
        jobBindCost,
        isUnder30Issue
      };
    });

    const grossEstimateBeforeDiscounts = totalPrintGross + totalBindGross;

    // --- LOGICA CONVENZIONE OXFORD ---
    if (isOxford) {
      // 1. Sconto del 20% su tutti i preventivi
      const discount20Rate = CONVENZIONE_OXFORD_DISCOUNT;
      const discountedTotalBeforeThreshold = grossEstimateBeforeDiscounts * (1 - discount20Rate);

      // 2. Soglia su totale già scontato: ordini superiori ai 60 euro
      const isOver60 = discountedTotalBeforeThreshold >= CONVENZIONE_OXFORD_FREE_THRESHOLD;

      // Se superati i 60 euro:
      // - Rilegatura GRATIS (costo rilegature = 0)
      // - Spedizione SDA GRATIS (costo spedizione = 0)
      const freeBindingsInConvention = isOver60;
      const freeShippingInConvention = isOver60;

      let actualShippingCost = 0;
      if (deliveryMethod === 'spedizione_sda') {
        actualShippingCost = freeShippingInConvention ? 0 : SDA_SHIPPING_PRICE;
      }

      const jobDetails = preliminaryDetails.map(d => {
        const bindCost = freeBindingsInConvention ? 0 : d.jobBindCost;
        const jobGross = d.jobPrintCost + bindCost;
        const jobDiscount = jobGross * discount20Rate;
        const jobFinalCost = jobGross - jobDiscount;

        return {
          ...d,
          totalPrintCost: d.jobPrintCost,
          unitBindPrice: d.unitBindPrice,
          totalBindCost: bindCost,
          isOmaggio: freeBindingsInConvention && d.binding.id !== 'none',
          freeBindingsCount: freeBindingsInConvention ? d.copies : 0,
          allOmaggio: freeBindingsInConvention,
          missingForPromo: 0,
          discount: freeBindingsInConvention ? d.jobBindCost : 0,
          jobFinalCost
        };
      });

      const effectiveGross = totalPrintGross + (freeBindingsInConvention ? 0 : totalBindGross);
      const totalConventionDiscount = effectiveGross * discount20Rate;
      const netTotal = Math.max(0, (effectiveGross - totalConventionDiscount) + actualShippingCost);

      const missingForOver60 = isOver60 ? 0 : Math.max(0, CONVENZIONE_OXFORD_FREE_THRESHOLD - discountedTotalBeforeThreshold);

      return {
        isColorBulk,
        colorRateA4,
        grossTotal: grossEstimateBeforeDiscounts,
        totalDiscounts: (freeBindingsInConvention ? totalBindGross : 0) + totalConventionDiscount,
        netTotal,
        totalCopies: jobs.reduce((acc, j) => acc + Math.max(1, safeNum(j.cps || 1)), 0),
        shippingCost: actualShippingCost,
        isOver60,
        missingForOver60,
        freeBindingsInConvention,
        freeShippingInConvention,
        totalConventionDiscount,
        jobDetails
      };
    }

    // --- LOGICA STANDARD (senza convenzione) ---
    // Promo rilegatura: ogni 15 euro di stampe per tutti i tipi di rilegatura
    let grossTotal = 0;
    let totalDiscounts = 0;
    let netTotal = 0;

    const jobDetails = preliminaryDetails.map(d => {
      const binding = d.binding;
      const promoThreshold = 15; // 15 euro per tutti i tipi di rilegatura
      const hasPromo = binding.id !== 'none' && binding.id !== 'staple';
      
      // Calcolo: 1 rilegatura in omaggio ogni 15 euro di stampe nel documento
      const freeBindingsCount = hasPromo ? Math.min(d.copies, Math.floor(d.jobPrintCost / promoThreshold)) : 0;
      const isOmaggio = freeBindingsCount > 0;
      const allOmaggio = freeBindingsCount >= d.copies;
      const discount = freeBindingsCount * d.unitBindPrice;
      const missingForPromo = (!allOmaggio && hasPromo)
        ? Math.max(0, ((freeBindingsCount + 1) * promoThreshold) - d.jobPrintCost)
        : 0;
      const jobFinalCost = Math.max(0, d.jobPrintCost + d.jobBindCost - discount);

      grossTotal += (d.jobPrintCost + d.jobBindCost);
      totalDiscounts += discount;
      netTotal += jobFinalCost;

      return {
        ...d,
        totalPrintCost: d.jobPrintCost,
        isOmaggio,
        freeBindingsCount,
        allOmaggio,
        missingForPromo,
        discount,
        jobFinalCost
      };
    });

    const standardShippingCost = deliveryMethod === 'spedizione_sda' ? SDA_SHIPPING_PRICE : 0;
    netTotal += standardShippingCost;

    return {
      isColorBulk,
      colorRateA4,
      grossTotal,
      totalDiscounts,
      netTotal,
      totalCopies: jobs.reduce((acc, j) => acc + Math.max(1, safeNum(j.cps || 1)), 0),
      shippingCost: standardShippingCost,
      isOver60: false,
      missingForOver60: 0,
      freeBindingsInConvention: false,
      freeShippingInConvention: false,
      totalConventionDiscount: 0,
      jobDetails
    };
  };

  const calculated = calculateTotals();

  // Scroll automatico sui cambi di step
  useEffect(() => {
    if (isStarted) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [isStarted, currentStep]);

  // Telemetria di apertura
  useEffect(() => {
    const logOpening = async () => {
      if (!GSHEET_URL) return;
      try {
        const payload = {
          azione: "APERTURA",
          cliente: isOxford ? "VISITATORE CONVENZIONE OXFORD" : "VISITATORE STANDARD",
          categoria: isOxford ? "CONVENZIONE OXFORD" : "STAMPE E RILEGATURE",
          totale: "0.00",
          copie: 0,
          dettagli: `Accesso ${isOxford ? 'Convenzione Oxford College' : 'Preventivo Standard'}`,
          dispositivo: typeof navigator !== 'undefined' ? navigator.userAgent : '',
          risoluzione: typeof window !== 'undefined' ? `${window.screen.width}x${window.screen.height}` : '',
          lingua: typeof navigator !== 'undefined' ? navigator.language : 'it'
        };
        await fetch(GSHEET_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload)
        });
      } catch (e) {
        console.warn("Telemetry ignore:", e);
      }
    };
    logOpening();
  }, [isOxford]);

  const handleSelectBindingFromCarousel = (bindingId: string) => {
    setJobs(prev => {
      // 1. Se stiamo modificando un fascicolo specifico selezionato dall'utente
      if (activeEditingJobId) {
        const found = prev.some(j => j.id === activeEditingJobId);
        if (found) {
          return prev.map(j => j.id === activeEditingJobId ? { ...j, bindingId } : j);
        }
      }

      // 2. Se c'è già esattamente 1 fascicolo esistente, aggiorniamo la rilegatura di quello
      if (prev.length === 1) {
        return [{ ...prev[0], bindingId }];
      }

      // 3. Se l'ultimo fascicolo ha ancora 0 pagine (non ancora configurato), aggiorniamo la sua rilegatura
      if (prev.length > 1 && prev[prev.length - 1].bwPages === 0 && prev[prev.length - 1].colorPages === 0) {
        return prev.map((j, idx) => idx === prev.length - 1 ? { ...j, bindingId } : j);
      }

      // 4. Se non ci sono fascicoli o tutti sono già compilati, creiamo il nuovo fascicolo con la rilegatura scelta
      const newJob: PrintJob = {
        id: Date.now().toString(),
        name: `Fascicolo #${prev.length + 1}`,
        bwPages: 0,
        colorPages: 0,
        cps: 1,
        bindingId: bindingId
      };
      return [...prev, newJob];
    });

    setActiveEditingJobId(null);
    setDirection('up');
    setIsStarted(true);
    setCurrentStep(1);

    setTimeout(() => {
      detailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const analyzePdf = async (id: string, file: File) => {
    setAnalyzingId(id);
    const pdfjsLib = (window as any).pdfjsLib;
    if (!pdfjsLib) {
      console.error("PDF.js not loaded");
      setAnalyzingId(null);
      return;
    }
    try {
      const url = URL.createObjectURL(file);
      const doc = await pdfjsLib.getDocument(url).promise;
      let bw = 0, col = 0;
      for (let i = 1; i <= doc.numPages; i++) {
        const p = await doc.getPage(i);
        const vp = p.getViewport({ scale: 0.15 });
        const cvs = document.createElement('canvas');
        const ctx = cvs.getContext('2d');
        if (!ctx) continue;
        cvs.width = vp.width; cvs.height = vp.height;
        await p.render({ canvasContext: ctx, viewport: vp }).promise;
        const d = ctx.getImageData(0, 0, cvs.width, cvs.height).data;
        let isC = false;
        for (let j = 0; j < d.length; j += 40) {
          if (Math.abs(d[j] - d[j+1]) > 20 || Math.abs(d[j+1] - d[j+2]) > 20) { isC = true; break; }
        }
        isC ? col++ : bw++;
        p.cleanup();
      }
      setJobs(prev => prev.map(j => j.id === id ? { 
        ...j, 
        bwPages: bw, 
        colorPages: col, 
        fileName: file.name,
        name: file.name.replace(/\.[^/.]+$/, "") 
      } : j));
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Errore analisi file PDF:", err);
    } finally {
      setAnalyzingId(null);
    }
  };

  const saveToBackend = async () => {
    if (jobs.length === 0) return;

    try {
      const items: PreventivoItem[] = calculated.jobDetails.map(d => ({
        id: d.job.id,
        name: d.job.name,
        rilegatura: d.binding.title,
        rilegaturaId: d.binding.id,
        rilegaturaPrezzo: d.unitBindPrice,
        isOmaggio: !!d.isOmaggio,
        bwPages: d.b,
        colorPages: d.c,
        cps: d.copies,
        costoSubtotale: d.jobFinalCost
      }));

      await savePreventivoToFirestore({
        cliente: customer.trim().toUpperCase() || (isOxford ? 'CLIENTE CONVENZIONE OXFORD' : 'CLIENTE WEB'),
        totale: calculated.netTotal,
        totaleLordo: calculated.grossTotal,
        totaleScontoRilegature: calculated.totalDiscounts,
        scontoConvenzione: calculated.totalConventionDiscount,
        isConvenzione: isOxford,
        ...(isOxford ? { convenzioneNome: 'Oxford College Mita' } : {}),
        tipoConsegna: deliveryMethod,
        costoSpedizione: calculated.shippingCost,
        copieTotali: calculated.totalCopies,
        items,
        stato: 'nuovo'
      });
    } catch (err) {
      console.error("Errore salvataggio Firestore:", err);
    }

    if (GSHEET_URL) {
      try {
        const dettagliLavori = calculated.jobDetails.map((d, idx) => {
          const promoInfo = d.isOmaggio ? " [RILEGATURA OMAGGIO]" : "";
          return `#${idx + 1} ${d.job.name}: ${d.copies} copie | ${d.binding.title}${promoInfo} | B&N: ${d.b} | Colore: ${d.c} | Subtotale: ${fmt(d.jobFinalCost)}`;
        }).join('; ');

        const payload = {
          azione: "PREVENTIVO",
          cliente: customer.trim().toUpperCase() || (isOxford ? 'CLIENTE OXFORD' : 'CLIENTE WEB'),
          categoria: isOxford ? 'CONVENZIONE OXFORD' : 'STAMPE E RILEGATURE',
          totale: calculated.netTotal.toFixed(2),
          sconto: calculated.totalDiscounts.toFixed(2),
          copie: calculated.totalCopies,
          consegna: deliveryMethod === 'spedizione_sda' ? `Spedizione SDA (${fmt(calculated.shippingCost)})` : 'Ritiro in sede',
          dettagli: `${dettagliLavori} | Consegna: ${deliveryMethod === 'spedizione_sda' ? 'SDA' : 'Ritiro'}${isOxford ? ' [CONVENZIONE 20%]' : ''}`,
          dispositivo: typeof navigator !== 'undefined' ? navigator.userAgent : '',
          risoluzione: typeof window !== 'undefined' ? `${window.screen.width}x${window.screen.height}` : '',
          lingua: typeof navigator !== 'undefined' ? navigator.language : 'it'
        };

        await fetch(GSHEET_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload)
        });
      } catch (e) {
        console.warn("Spreadsheet log notice:", e);
      }
    }
  };

  const generateReceiptCanvas = (): HTMLCanvasElement | null => {
    saveToBackend();

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const width = 760;
    const headerHeight = 330;
    const itemHeight = 150;
    const footerHeight = 390;
    const height = headerHeight + (calculated.jobDetails.length * itemHeight) + footerHeight;

    canvas.width = width;
    canvas.height = height;

    // Sfondo carta
    ctx.fillStyle = '#FAF9F6';
    ctx.fillRect(0, 0, width, height);

    // Bordi
    ctx.strokeStyle = isOxford ? '#0F172A' : '#E2E8F0';
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, width - 10, height - 10);
    ctx.strokeStyle = '#D1D5DB';
    ctx.lineWidth = 2;
    ctx.strokeRect(18, 18, width - 36, height - 36);

    // Logo & Header
    ctx.beginPath();
    ctx.arc(width / 2, 85, 38, 0, 2 * Math.PI);
    ctx.fillStyle = isOxford ? '#0C2340' : '#0F172A';
    ctx.fill();

    ctx.font = 'bold 30px sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(isOxford ? 'OC' : 'SP', width / 2, 86);

    ctx.font = 'bold 26px sans-serif';
    ctx.fillStyle = '#0F172A';
    ctx.fillText(isOxford ? 'OXFORD COLLEGE MITA' : 'SUDPEN', width / 2, 160);

    ctx.font = 'bold 13px sans-serif';
    ctx.fillStyle = isOxford ? '#059669' : '#64748B';
    ctx.fillText(
      isOxford ? 'CONVENZIONE RISERVATA • SCONTO 20% ATTIVO' : 'CENTRO STAMPE E RILEGATURE DIGITALI', 
      width / 2, 
      188
    );

    ctx.beginPath();
    ctx.setLineDash([6, 5]);
    ctx.moveTo(35, 215);
    ctx.lineTo(width - 35, 215);
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);

    // Info preventivo
    ctx.textAlign = 'left';
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = '#475569';
    const currentDate = new Date().toLocaleString('it-IT', { 
      day: '2-digit', month: '2-digit', year: 'numeric', 
      hour: '2-digit', minute: '2-digit' 
    });
    ctx.fillText(`DATA: ${currentDate}`, 45, 250);
    ctx.fillText(`PREVENTIVO N.: ${isOxford ? 'OX' : 'ST'}-${Math.floor(100000 + Math.random() * 900000)}`, 45, 275);

    ctx.textAlign = 'right';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillStyle = '#0F172A';
    ctx.fillText(customer ? `CLIENTE: ${customer.toUpperCase()}` : (isOxford ? 'CLIENTE CONVENZIONE' : 'PREVENTIVO ONLINE'), width - 45, 250);
    ctx.font = 'italic 12px monospace';
    ctx.fillStyle = '#64748B';
    ctx.fillText('Riepilogo preventivo non fiscale', width - 45, 275);

    // Linea solida
    ctx.beginPath();
    ctx.moveTo(35, 305);
    ctx.lineTo(width - 35, 305);
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Elenco articoli
    let curY = 345;
    calculated.jobDetails.forEach((d, idx) => {
      ctx.textAlign = 'left';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillStyle = '#1E3A8A';
      ctx.fillText(`#${idx + 1} ${d.job.name.toUpperCase()}`, 45, curY);

      ctx.textAlign = 'right';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillStyle = '#0F172A';
      ctx.fillText(fmt(d.jobFinalCost), width - 45, curY);

      ctx.textAlign = 'left';
      ctx.font = '14px sans-serif';
      ctx.fillStyle = '#334155';
      const promoText = d.isOmaggio ? " (IN OMAGGIO)" : "";
      ctx.fillText(`• Rilegatura: ${d.binding.title.toUpperCase()}${promoText} (${fmt(d.unitBindPrice)} cad.)`, 55, curY + 28);
      ctx.fillText(`• Copie: ${d.copies}  |  Pagg. B&N: ${d.b} (${fmt(d.b * d.bwRate)})  |  Pagg. Colore: ${d.c} (${fmt(d.c * d.colorRate)})`, 55, curY + 52);

      ctx.font = 'italic 12px sans-serif';
      ctx.fillStyle = '#64748B';
      ctx.fillText(`Subtotale stampe: ${fmt(d.totalPrintCost)} | Rilegatura: ${fmt(d.totalBindCost)}`, 55, curY + 74);

      if (idx < calculated.jobDetails.length - 1) {
        ctx.beginPath();
        ctx.setLineDash([4, 4]);
        ctx.moveTo(45, curY + 98);
        ctx.lineTo(width - 45, curY + 98);
        ctx.strokeStyle = '#CBD5E1';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);
      }

      curY += itemHeight;
    });

    curY += 15;
    ctx.beginPath();
    ctx.moveTo(35, curY);
    ctx.lineTo(width - 35, curY);
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    curY += 35;
    ctx.textAlign = 'left';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillStyle = '#334155';
    ctx.fillText(`COPIE TOTALI: ${calculated.totalCopies}`, 45, curY);

    // Consegna
    curY += 24;
    const consegnaLabel = deliveryMethod === 'spedizione_sda'
      ? `CONSEGNA: Spedizione Corriere Espresso SDA (${calculated.shippingCost === 0 ? 'GRATIS!' : fmt(calculated.shippingCost)})`
      : 'CONSEGNA: Ritiro in sede Ostuni (Gratuito)';
    ctx.fillText(consegnaLabel, 45, curY);

    if (isOxford) {
      curY += 24;
      ctx.fillStyle = '#059669';
      ctx.fillText(`CONVENZIONE OXFORD (-20%): -${fmt(calculated.totalConventionDiscount)}`, 45, curY);
      if (calculated.isOver60) {
        curY += 22;
        ctx.fillText(`PREMIO OLTRE 60 €: Rilegatura & Spedizione SDA GRATUITE!`, 45, curY);
      }
    } else if (calculated.totalDiscounts > 0) {
      curY += 24;
      ctx.fillStyle = '#059669';
      ctx.fillText(`SCONTI RILEGATURE OMAGGIO: -${fmt(calculated.totalDiscounts)}`, 45, curY);
    }

    ctx.textAlign = 'right';
    ctx.font = 'black 30px sans-serif';
    ctx.fillStyle = '#059669';
    ctx.fillText(`TOTALE: ${fmt(calculated.netTotal)}`, width - 45, curY);

    // Box WhatsApp
    curY += 55;
    ctx.fillStyle = '#ECFDF5';
    ctx.fillRect(35, curY - 15, width - 70, 52);
    ctx.strokeStyle = '#10B981';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(35, curY - 15, width - 70, 52);

    ctx.textAlign = 'center';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillStyle = '#065F46';
    ctx.fillText('PER INFO E INVIO FILE (WHATSAPP): 391 7972545', width / 2, curY + 18);

    // Footer
    curY += 85;
    ctx.beginPath();
    ctx.setLineDash([6, 4]);
    ctx.moveTo(100, curY);
    ctx.lineTo(width - 100, curY);
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);

    curY += 35;
    ctx.font = 'bold 16px sans-serif';
    ctx.fillStyle = '#1E3A8A';
    ctx.fillText(isOxford ? 'GRAZIE PER AVER SCELTO LA NOSTRA CONVENZIONE!' : 'GRAZIE PER AVER SCELTO SUDPEN!', width / 2, curY);

    ctx.font = 'italic 13px sans-serif';
    ctx.fillStyle = '#64748B';
    ctx.fillText('Invia questo preventivo su WhatsApp per confermare la lavorazione e allegare i PDF.', width / 2, curY + 26);

    return canvas;
  };

  const saveReceiptPng = () => {
    const canvas = generateReceiptCanvas();
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `${isOxford ? 'OXFORD_COLLEGE' : 'SUDPEN'}_PREVENTIVO_${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();

    setShowSavedToast(true);
    setTimeout(() => setShowSavedToast(false), 4000);
  };

  const saveReceiptPdf = () => {
    const canvas = generateReceiptCanvas();
    if (!canvas) return;
    try {
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: [canvas.width, canvas.height]
      });
      pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width, canvas.height);
      pdf.save(`${isOxford ? 'OXFORD_COLLEGE' : 'SUDPEN'}_PREVENTIVO_${Date.now()}.pdf`);

      setShowSavedToast(true);
      setTimeout(() => setShowSavedToast(false), 4000);
    } catch (error) {
      console.error('Failed to generate PDF:', error);
    }
  };

  const getWhatsAppMessage = () => {
    let msg = isOxford 
      ? `Ciao, vorrei confermare questo preventivo in *CONVENZIONE OXFORD COLLEGE MITA*:\n\n`
      : `Ciao SUDPEN, vorrei confermare questo preventivo per stampe e rilegature:\n\n`;

    if (customer.trim()) {
      msg += `👤 *Cliente:* ${customer.trim()}\n\n`;
    }

    calculated.jobDetails.forEach((d, idx) => {
      const promoInfo = d.isOmaggio ? " 🎁 *(RILEGATURA IN OMAGGIO)*" : "";
      msg += `📄 *DOCUMENTO #${idx + 1}: ${d.job.name.toUpperCase()}*\n`;
      msg += `• Rilegatura: *${d.binding.title}*${promoInfo}\n`;
      msg += `• Copie: *x${d.copies}*\n`;
      msg += `• Pagine B&N: ${d.b} (${fmt(d.b * d.bwRate)})\n`;
      msg += `• Pagine Colore: ${d.c} (${fmt(d.c * d.colorRate)})\n`;
      msg += `• Subtotale: *${fmt(d.jobFinalCost)}*\n\n`;
    });

    msg += `📦 *Modalità Consegna:* ${deliveryMethod === 'spedizione_sda' ? 'Spedizione Corriere Espresso SDA' : 'Ritiro in sede Ostuni'}\n`;
    if (deliveryMethod === 'spedizione_sda') {
      msg += `• Spedizione SDA: *${calculated.shippingCost === 0 ? 'GRATUITA (Promo > 60€)' : fmt(calculated.shippingCost)}*\n`;
      if (shippingAddress.trim()) {
        msg += `• Indirizzo: ${shippingAddress.trim()}\n`;
      }
    }

    if (isOxford) {
      msg += `\n🏷️ *Sconto Convenzione Oxford 20%:* -${fmt(calculated.totalConventionDiscount)}\n`;
      if (calculated.isOver60) {
        msg += `🎉 *Soglia 60€ superata:* Rilegatura e Spedizione SDA GRATUITE!\n`;
      }
    } else if (calculated.totalDiscounts > 0) {
      msg += `🎁 *Sconti Rilegature Omaggio applicati:* -${fmt(calculated.totalDiscounts)}\n`;
    }

    msg += `💰 *TOTALE DA PAGARE: ${fmt(calculated.netTotal)}* (IVA inclusa)\n\nVi invio a breve i file PDF da stampare. Grazie!`;
    return `https://api.whatsapp.com/send?phone=${WA_PHONE}&text=${encodeURIComponent(msg)}`;
  };

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col p-4 sm:p-6 space-y-6">
      
      {/* Modale TABELLA LIMITI E CONSIGLI RILEGATURE */}
      <AnimatePresence>
        {showLimitsModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setShowLimitsModal(false)}
          >
            <motion.div 
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-5 bg-slate-900 text-white flex justify-between items-center shrink-0">
                <div className="flex items-center gap-2">
                  <BookOpen size={20} className="text-amber-400" />
                  <h3 className="font-black text-sm uppercase tracking-wide">
                    Tabella Limiti e Consigli Rilegature
                  </h3>
                </div>
                <button 
                  onClick={() => setShowLimitsModal(false)}
                  className="text-white/60 hover:text-white p-1 rounded-full cursor-pointer"
                  aria-label="Chiudi"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Banner Evidenziato Regola Chiave */}
              <div className="bg-amber-50 border-b border-amber-200 p-3.5 text-xs text-amber-950 font-bold flex items-start gap-2.5">
                <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={18} />
                <div className="leading-snug">
                  <span className="font-black uppercase text-amber-900 block text-[11px]">Regola fondamentale spessore:</span>
                  <strong>Spirale in metallo, in plastica e brossura: non disponibili sotto le 30 pagine</strong> (per fascicoli brevi sotto le 30 pagine sono disponibili solo <strong>Opuscolo Spillato</strong> e <strong>Doppia Spilla Laterale</strong>).
                </div>
              </div>

              {/* Tabella dettagliata */}
              <div className="p-4 overflow-y-auto space-y-3">
                <div className="divide-y divide-gray-150 border border-gray-200 rounded-2xl overflow-hidden bg-white text-xs">
                  {BINDING_LIMITS_TIPS.map((item, idx) => (
                    <div key={idx} className="p-3.5 space-y-1.5 hover:bg-gray-50/60 transition-colors">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-black text-slate-900 uppercase text-xs">
                          {item.title}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className={`px-2 py-0.5 rounded-md font-black text-[10px] uppercase ${
                            item.isAvailableUnder30 
                              ? 'bg-emerald-100 text-emerald-800' 
                              : 'bg-rose-100 text-rose-800'
                          }`}>
                            {item.isAvailableUnder30 ? '✅ Anche < 30 pag' : '⚠️ Min. 30 pag'}
                          </span>
                          <span className="bg-slate-100 px-2 py-0.5 rounded-md font-bold text-slate-700 text-[10px]">
                            {item.rangeText}
                          </span>
                        </div>
                      </div>

                      <p className="text-[11px] text-gray-600 leading-normal font-medium">
                        {item.consiglio}
                      </p>

                      <div className="text-[10px] text-slate-400 font-bold italic pt-0.5">
                        {item.note}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 bg-gray-50 border-t border-gray-100 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowLimitsModal(false)}
                  className="w-full h-11 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-black text-xs uppercase cursor-pointer"
                >
                  Ho capito, chiudi guida
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. Modale dettagli tecnici singola rilegatura */}
      <AnimatePresence>
        {selectedBindingDetail && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setSelectedBindingDetail(null)}
          >
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-white w-full max-w-md rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
              onClick={e => e.stopPropagation()}
            >
              <div className="relative w-full aspect-video bg-gray-900 overflow-hidden shrink-0">
                <img 
                  src={selectedBindingDetail.imageUrl} 
                  alt={selectedBindingDetail.title} 
                  className="w-full h-full object-cover"
                />
                <button 
                  onClick={() => setSelectedBindingDetail(null)}
                  className="absolute top-3 right-3 bg-black/40 hover:bg-black/60 text-white p-2 rounded-full backdrop-blur-md transition-colors z-10 cursor-pointer"
                  aria-label="Chiudi"
                >
                  <X size={18} />
                </button>
                {selectedBindingDetail.badge && (
                  <span className="absolute top-3 left-3 bg-brandBlue text-white text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full shadow">
                    {selectedBindingDetail.badge}
                  </span>
                )}
              </div>

              <div className="p-6 space-y-4 overflow-y-auto">
                <div>
                  <h3 className="text-xl font-black text-gray-900 uppercase">
                    {selectedBindingDetail.title}
                  </h3>
                  <p className="text-emerald-700 text-xs font-black uppercase tracking-wide mt-1">
                    {isOxford 
                      ? 'Gratuita per ordini oltre 60 € già scontati' 
                      : selectedBindingDetail.subtitle}
                  </p>
                </div>

                {/* Box Limiti Pagine */}
                <div className={`p-3 rounded-2xl border text-xs font-bold ${
                  selectedBindingDetail.notUnder30 
                    ? 'bg-amber-50 border-amber-200 text-amber-900' 
                    : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                }`}>
                  {selectedBindingDetail.notUnder30 ? (
                    <div className="flex items-center gap-2">
                      <AlertTriangle size={16} className="text-amber-600 shrink-0" />
                      <span><strong>Minimo 30 pagine:</strong> Non disponibile per fascicoli sotto le 30 facciate.</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                      <span><strong>Disponibile anche sotto le 30 pagine</strong> (da {selectedBindingDetail.minPages} a {selectedBindingDetail.maxPages} facciate).</span>
                    </div>
                  )}
                </div>

                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-150 space-y-2 text-xs">
                  <div className="flex justify-between items-center text-slate-700">
                    <span className="font-bold">Tariffa base:</span>
                    <span className="font-black text-brandBlue">{selectedBindingDetail.priceInfo}</span>
                  </div>
                  {isOxford ? (
                    <div className="flex justify-between items-center text-emerald-800 bg-emerald-100/60 p-2.5 rounded-xl border border-emerald-200">
                      <span className="font-bold flex items-center gap-1.5">
                        <Gift size={15} /> Promo Oxford:
                      </span>
                      <span className="font-black">GRATIS sopra 60 €</span>
                    </div>
                  ) : (
                    selectedBindingDetail.promoThreshold > 0 && (
                      <div className="flex justify-between items-center text-emerald-800 bg-emerald-100/60 p-2 rounded-xl border border-emerald-200">
                        <span className="font-bold flex items-center gap-1">
                          <Gift size={14} /> Soglia Omaggio:
                        </span>
                        <span className="font-black">Da {fmt(selectedBindingDetail.promoThreshold)} di stampe</span>
                      </div>
                    )
                  )}
                  <div className="flex justify-between items-center text-slate-700">
                    <span className="font-bold">Range consentito:</span>
                    <span className="font-bold">{selectedBindingDetail.minPages} - {selectedBindingDetail.maxPages} facciate</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Descrizione & Utilizzo</span>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    {selectedBindingDetail.description}
                  </p>
                </div>
              </div>

              <div className="p-4 bg-gray-50 border-t border-gray-100 shrink-0">
                <button 
                  onClick={() => {
                    handleSelectBindingFromCarousel(selectedBindingDetail.id);
                    setSelectedBindingDetail(null);
                  }}
                  className="w-full h-12 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20 active:scale-[0.98] transition-transform cursor-pointer"
                >
                  Seleziona & Configura <ArrowRight size={16} />
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SCHERMATA INIZIALE CON CAROSELLO RILEGATURE */}
      <AnimatePresence mode="wait" custom={direction} initial={false}>
        {!isStarted && (
          <motion.div
            key="screen-bindings-carousel"
            custom={direction}
            variants={slideVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="space-y-6"
          >
            {/* Header Brand Esclusivo */}
            <div className={`bg-white rounded-4xl p-7 sm:p-8 card-shadow flex flex-col items-center animate-slide border ${isOxford ? 'border-amber-200 shadow-xl shadow-amber-900/5' : 'border-gray-100'} text-center relative overflow-hidden`}>
              
              {isOxford && (
                <div className="w-full mb-3 flex items-center justify-center gap-1.5 bg-gradient-to-r from-amber-500 to-amber-600 text-white text-[10px] font-black uppercase tracking-widest py-1 px-4 rounded-full shadow-sm">
                  <Sparkles size={13} />
                  Convenzione Esclusiva Attiva • Oxford College Mita
                </div>
              )}

              {/* Logo Esclusivo Oxford se convenzione, altrimenti SUDPEN */}
              <div className="my-2 flex justify-center">
                <img 
                  src={isOxford ? OXFORD_LOGO_URL : LOGO_URL} 
                  className={isOxford ? "h-32 w-auto object-contain drop-shadow-md" : "h-28 w-auto mb-2"} 
                  alt={isOxford ? "Oxford College Mita" : "Sudpen"} 
                />
              </div>

              <div className="space-y-1.5 mt-2">
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-gray-900 uppercase">
                  {isOxford ? 'Oxford College Mita' : 'Stampe & Rilegature'}
                </h1>
                <p className="text-gray-500 text-xs sm:text-sm font-medium max-w-xs mx-auto">
                  {isOxford 
                    ? 'Preventivatore convenzionato per studenti e docenti Oxford College.'
                    : 'Calcola il preventivo in tempo reale con analisi PDF automatica e rilegature in omaggio.'}
                </p>
              </div>

              {/* Promo Banner Oxford vs Standard */}
              {isOxford ? (
                <div className="w-full mt-5 p-4 bg-gradient-to-br from-amber-50 to-orange-50/80 border border-amber-300/80 rounded-3xl text-left space-y-2">
                  <div className="flex items-center gap-2 text-amber-900">
                    <Tag size={16} className="text-amber-700" />
                    <span className="font-black text-xs uppercase tracking-wide">
                      Termini della Convenzione Oxford:
                    </span>
                  </div>
                  <ul className="text-xs space-y-1.5 text-amber-950 font-medium pl-1">
                    <li className="flex items-start gap-2">
                      <span className="text-amber-600 font-black">✓</span>
                      <span><strong>Sconto del 20%</strong> applicato su tutti i preventivi.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-600 font-black">✓</span>
                      <span><strong>Rilegatura GRATIS</strong> su ordini superiori a 60 € già scontati.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-600 font-black">✓</span>
                      <span><strong>Spedizione SDA GRATIS</strong> su ordini superiori a 60 € già scontati.</span>
                    </li>
                  </ul>
                </div>
              ) : (
                <div className="w-full mt-6 p-3.5 bg-gradient-to-r from-emerald-500/10 via-emerald-500/15 to-emerald-500/10 border border-emerald-200 rounded-2xl flex items-center gap-3 text-left">
                  <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-md">
                    <Gift size={20} className="animate-bounce" />
                  </div>
                  <div className="text-xs">
                    <p className="font-black text-emerald-900 uppercase tracking-wide text-[11px]">Promo Rilegatura Gratuita</p>
                    <p className="text-emerald-700 font-medium text-[11px]">1 rilegatura in omaggio ogni € 15 di stampe per tutti i tipi di rilegatura!</p>
                  </div>
                </div>
              )}

              <div className="w-full mt-6">
                <button 
                  onClick={() => {
                    setTimeout(() => {
                      document.getElementById('bindings-reel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 100);
                  }}
                  className={`relative overflow-hidden w-full h-14 ${isOxford ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-900/20' : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/20'} text-white rounded-2xl font-black text-base flex items-center justify-center gap-2.5 shadow-lg active:scale-[0.98] transition-all cursor-pointer`}
                >
                  <motion.div
                    className="absolute inset-0 w-[200%] h-full bg-gradient-to-r from-transparent via-white/30 to-transparent -skew-x-12 pointer-events-none"
                    initial={{ x: '-100%' }}
                    animate={{ x: '100%' }}
                    transition={{ repeat: Infinity, duration: 1.8, ease: 'linear', repeatDelay: 1 }}
                  />
                  <span className="relative z-10 flex items-center gap-2">
                    Inizia Configurazione <ArrowDown size={18} />
                  </span>
                </button>
              </div>
            </div>

            {/* Carosello orizzontale Rilegature */}
            <div id="bindings-reel" className="space-y-3 relative group/carousel">
              <div className="flex items-center justify-between px-2">
                <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                  Tipologie di Rilegatura Disponibili
                </span>
                <span className="text-[10px] font-bold text-slate-400">
                  Scorri 👉
                </span>
              </div>

              {/* Frecce Desktop */}
              <button
                type="button"
                onClick={() => carouselRef.current?.scrollBy({ left: -310, behavior: 'smooth' })}
                className="absolute left-2 top-[160px] z-30 bg-white/90 hover:bg-white text-brandBlue p-2 rounded-full border border-gray-200 shadow-md active:scale-90 transition-all md:flex hidden items-center justify-center cursor-pointer"
                aria-label="Precedente"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                onClick={() => carouselRef.current?.scrollBy({ left: 310, behavior: 'smooth' })}
                className="absolute right-2 top-[160px] z-30 bg-white/90 hover:bg-white text-brandBlue p-2 rounded-full border border-gray-200 shadow-md active:scale-90 transition-all md:flex hidden items-center justify-center cursor-pointer"
                aria-label="Successivo"
              >
                <ChevronRight size={18} />
              </button>

              <div 
                ref={carouselRef} 
                className="overflow-x-auto snap-x snap-mandatory scroll-smooth no-scrollbar -mx-4 px-4 py-2 flex flex-row gap-4"
              >
                {BINDING_TYPES.map(b => (
                  <motion.div 
                    key={b.id} 
                    className="w-[82vw] max-w-[290px] snap-center snap-always flex flex-col bg-white rounded-3xl overflow-hidden shadow-xl border border-gray-100 shrink-0"
                  >
                    <div className="w-full aspect-[4/3] relative bg-gray-900 overflow-hidden shrink-0">
                      <img 
                        src={b.imageUrl} 
                        alt={b.title} 
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                      {b.badge && (
                        <div className={`absolute top-3 left-3 ${b.notUnder30 ? 'bg-amber-600' : 'bg-brandBlue'} backdrop-blur-md text-white text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full shadow-md`}>
                          {b.badge}
                        </div>
                      )}
                      <div className="absolute bottom-2 right-2 bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/20 text-white text-[9px] font-black uppercase">
                        {isOxford ? 'Sconto 20% + Gratis >60€' : b.priceInfo}
                      </div>
                    </div>

                    <div className="p-4 flex flex-col justify-between flex-1 space-y-3 bg-white">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <h4 className="font-black text-slate-900 text-sm tracking-wide uppercase leading-tight">
                            {b.title}
                          </h4>
                          <span className="text-[9px] font-bold text-slate-400">
                            {b.minPages}-{b.maxPages} pag
                          </span>
                        </div>
                        <p className="text-emerald-700 font-extrabold text-[10px] uppercase">
                          {isOxford ? 'Inclusa gratis per ordini > 60 €' : b.subtitle}
                        </p>
                        <p className="text-gray-500 text-[11px] font-normal line-clamp-2 pt-1 leading-normal">
                          {b.description}
                        </p>
                      </div>

                      <div className="space-y-2 pt-2 border-t border-gray-100">
                        <button
                          type="button"
                          onClick={() => setSelectedBindingDetail(b)}
                          className="w-full py-1.5 text-center text-slate-500 hover:text-slate-800 text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <BookOpen size={12} /> Dettagli Rilegatura
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSelectBindingFromCarousel(b.id)}
                          className={`w-full h-11 ${isOxford ? 'bg-amber-600 hover:bg-amber-500' : 'bg-emerald-600 hover:bg-emerald-500'} text-white font-black text-xs uppercase rounded-xl shadow-md active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer`}
                        >
                          Seleziona & Configura <ArrowRight size={14} />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* STEP 1: CONFIGURAZIONE STAMPE & PAGINE */}
        {isStarted && currentStep === 1 && (
          <motion.div
            key="screen-step1-calc"
            custom={direction}
            variants={slideVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            ref={detailsRef}
            className="space-y-6"
          >
            {/* Tasto Torna alle rilegature */}
            <button
              onClick={() => {
                if (jobs.length > 0) {
                  setActiveEditingJobId(jobs[0].id);
                }
                setDirection('down');
                setIsStarted(false);
              }}
              className="w-full h-11 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xs uppercase rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] border border-slate-200 cursor-pointer shadow-sm"
            >
              <ArrowUp size={16} /> Torna a Tutte le Rilegature
            </button>

            {/* Banner Oxford Convenzione in cima allo Step 1 */}
            {isOxford && (
              <div className="bg-amber-50 border border-amber-300 rounded-3xl p-4 space-y-2 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase text-amber-900 tracking-wider flex items-center gap-1.5">
                    <Tag size={14} className="text-amber-600" />
                    Convenzione Oxford (-20%)
                  </span>
                  <span className="text-xs font-black text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-lg">
                    {calculated.isOver60 ? 'Soglia 60€ Raggiunta!' : `Soglia 60€`}
                  </span>
                </div>

                {calculated.isOver60 ? (
                  <div className="bg-emerald-100/80 border border-emerald-300 rounded-2xl p-2.5 text-xs text-emerald-900 font-black flex items-center gap-2">
                    <Gift size={16} className="text-emerald-700 shrink-0" />
                    <span>Complimenti! Rilegatura e Spedizione SDA sono ora GRATIS per il tuo ordine!</span>
                  </div>
                ) : (
                  <div className="text-[11px] text-amber-900 font-medium">
                    Totale già scontato: <strong>{fmt(calculated.grossTotal * 0.8)}</strong>. 
                    Mancano solo <strong className="text-emerald-700">{fmt(calculated.missingForOver60)}</strong> per azzerare Rilegatura e Spedizione SDA!
                  </div>
                )}
              </div>
            )}

            {/* Avviso promozionale colore per grandi quantità */}
            {calculated.isColorBulk && (
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3 flex items-center gap-2 text-blue-900 text-xs">
                <span className="text-base">🎉</span>
                <span className="font-bold">
                  Sconto quantità Colori attivo! Tariffa € 0,25 per aver superato 50 pagine a colori.
                </span>
              </div>
            )}

            {jobs.length > 0 ? (
              <div className="space-y-6">
                {jobs.map((j, idx) => {
                  const currentBinding = BINDING_TYPES.find(b => b.id === j.bindingId) || BINDING_TYPES[0];
                  const detail = calculated.jobDetails.find(d => d.job.id === j.id);

                  return (
                    <div key={j.id} className="bg-white rounded-4xl p-5 sm:p-6 card-shadow space-y-5 border border-gray-100 relative">
                      {/* Header Fascicolo */}
                      <div className="flex justify-between items-start border-b border-gray-100 pb-3 gap-2">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-xl overflow-hidden border border-gray-200 shrink-0 bg-slate-900">
                            <img src={currentBinding.imageUrl} className="w-full h-full object-cover" alt="" />
                          </div>
                          <div>
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">
                              Documento #{idx + 1}
                            </span>
                            <input 
                              type="text" 
                              value={j.name} 
                              onChange={e => setJobs(prev => prev.map(x => x.id === j.id ? { ...x, name: e.target.value } : x))}
                              placeholder="Nome documento o file"
                              className="font-black text-sm uppercase text-brandBlue focus:outline-none border-b border-transparent focus:border-brandBlue bg-transparent"
                            />
                            
                            {/* Rilegatura assegnata */}
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              <span className="text-[10px] font-bold text-gray-500">Rilegatura:</span>
                              <select 
                                value={j.bindingId}
                                onChange={e => setJobs(prev => prev.map(x => x.id === j.id ? { ...x, bindingId: e.target.value } : x))}
                                className="text-[10px] font-black uppercase text-gray-800 bg-gray-50 border border-gray-200 rounded-lg px-2 py-0.5 focus:outline-none"
                              >
                                {BINDING_TYPES.map(bt => (
                                  <option key={bt.id} value={bt.id}>
                                    {bt.title} ({bt.minPages}-{bt.maxPages} pag)
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveEditingJobId(j.id);
                                  setDirection('down');
                                  setIsStarted(false);
                                }}
                                className="text-[9px] font-black uppercase text-brandBlue hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-md border border-blue-200 transition-colors cursor-pointer"
                                title="Sfoglia tutte le rilegature nel carosello con foto e dettagli"
                              >
                                🖼️ Catalogo
                              </button>
                            </div>
                          </div>
                        </div>

                        <button 
                          onClick={() => setJobs(prev => prev.filter(x => x.id !== j.id))} 
                          className="text-gray-300 p-1.5 hover:text-red-500 transition-colors cursor-pointer"
                          aria-label="Rimuovi"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>

                      {/* Tasto Carica & Analizza PDF */}
                      <div>
                        <button 
                          onClick={() => {
                            const el = document.getElementById(`file-input-${j.id}`) as HTMLInputElement;
                            el?.click();
                          }} 
                          className="w-full h-12 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-2xl font-black text-xs uppercase flex items-center justify-center gap-2.5 active:scale-[0.98] transition-all border border-emerald-200 cursor-pointer shadow-sm" 
                        >
                          {analyzingId === j.id ? <Loader2 className="animate-spin" size={18} /> : <FileScan size={18} />}
                          {analyzingId === j.id ? 'Analisi PDF in corso...' : 'Carica & Analizza PDF'}
                        </button>
                        <input 
                          id={`file-input-${j.id}`} 
                          type="file" 
                          className="hidden" 
                          accept="application/pdf" 
                          onChange={e => {
                            if (e.target.files?.[0]) analyzePdf(j.id, e.target.files[0]);
                          }} 
                        />
                        {j.fileName && (
                          <div className="mt-1.5 text-center text-[10px] text-emerald-600 font-extrabold uppercase tracking-wide flex items-center justify-center gap-1.5">
                            <Check size={12} className="text-emerald-500" />
                            File analizzato: {j.fileName}
                          </div>
                        )}
                      </div>

                      {/* Inputs Pagine e Copie */}
                      <div className="space-y-3 pt-2">
                        <div className="flex items-center justify-between gap-4 bg-gray-50/70 p-3 rounded-2xl border border-gray-100 hover:bg-gray-50">
                          <div className="flex flex-col">
                            <span className="text-xs font-black text-gray-800 uppercase tracking-tight">Pagine B&N</span>
                            <span className="text-[10px] text-gray-400 font-bold leading-tight">€ {PRICING_CONFIG.printBwStandard.toFixed(2)} cad.</span>
                          </div>
                          <div className="w-32 shrink-0">
                            <NumIn 
                              v={j.bwPages} 
                              onChange={v => setJobs(prev => prev.map(x => x.id === j.id ? { ...x, bwPages: v as number } : x))} 
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-4 bg-gray-50/70 p-3 rounded-2xl border border-gray-100 hover:bg-gray-50">
                          <div className="flex flex-col">
                            <span className="text-xs font-black text-gray-800 uppercase tracking-tight">Pagine a Colori</span>
                            <span className="text-[10px] text-gray-400 font-bold leading-tight">€ {calculated.colorRateA4.toFixed(2)} cad.</span>
                          </div>
                          <div className="w-32 shrink-0">
                            <NumIn 
                              v={j.colorPages} 
                              onChange={v => setJobs(prev => prev.map(x => x.id === j.id ? { ...x, colorPages: v as number } : x))} 
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-4 bg-gray-50/70 p-3 rounded-2xl border border-gray-100 hover:bg-gray-50">
                          <div className="flex flex-col">
                            <span className="text-xs font-black text-gray-800 uppercase tracking-tight">Numero Copie</span>
                            <span className="text-[10px] text-gray-400 font-bold leading-tight">Fascicoli da produrre</span>
                          </div>
                          <div className="w-32 shrink-0">
                            <NumIn 
                              v={j.cps} 
                              min={1} 
                              onChange={v => setJobs(prev => prev.map(x => x.id === j.id ? { ...x, cps: v as number } : x))} 
                            />
                          </div>
                        </div>
                      </div>

                      {/* ALERT SOTTO LE 30 PAGINE - CON TASTO CONSULTA GUIDA (ESATTAMENTE COME DA IMMAGINE) */}
                      {detail?.isUnder30Issue && (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.96 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="bg-[#FFFBEB] border-2 border-[#F59E0B] rounded-3xl p-5 space-y-3.5 text-gray-900 shadow-md"
                        >
                          <div className="flex items-center gap-2.5 text-[#B45309] font-black uppercase text-xs tracking-wide">
                            <AlertTriangle size={22} className="text-[#D97706] shrink-0" />
                            <span>ATTENZIONE: LIMITE MINIMO 30 PAGINE</span>
                          </div>
                          
                          <p className="text-xs leading-relaxed text-gray-800 font-medium">
                            La <strong className="font-extrabold text-gray-900">{currentBinding.title}</strong> non è disponibile sotto le 30 pagine (questo fascicolo ne ha <strong className="font-extrabold text-gray-900">{detail.totalPages}</strong>). Sotto le 30 pagine puoi scegliere l'<strong className="font-extrabold text-gray-900">Opuscolo Spillato</strong> o la <strong className="font-extrabold text-gray-900">Doppia Spilla Laterale</strong>.
                          </p>

                          <div className="flex items-center gap-2.5 pt-1 flex-wrap">
                            <button
                              type="button"
                              onClick={() => setJobs(prev => prev.map(x => x.id === j.id ? { ...x, bindingId: 'stitch' } : x))}
                              className="px-4 py-2.5 bg-[#C67100] hover:bg-[#A85E00] text-white font-extrabold text-xs uppercase rounded-xl shadow transition-transform active:scale-95 cursor-pointer"
                            >
                              PASSA A OPUSCOLO SPILLATO
                            </button>
                            <button
                              type="button"
                              onClick={() => setJobs(prev => prev.map(x => x.id === j.id ? { ...x, bindingId: 'staple' } : x))}
                              className="px-4 py-2.5 bg-[#1E293B] hover:bg-[#0F172A] text-white font-extrabold text-xs uppercase rounded-xl shadow transition-transform active:scale-95 cursor-pointer"
                            >
                              PASSA A SPILLA (GRATIS)
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowLimitsModal(true)}
                              className="px-4 py-2.5 bg-white hover:bg-amber-100/60 text-[#92400E] border border-[#F59E0B] font-extrabold text-xs uppercase rounded-xl shadow-sm transition-transform active:scale-95 cursor-pointer flex items-center gap-1.5"
                            >
                              <HelpCircle size={15} className="text-[#D97706]" />
                              CONSULTA GUIDA
                            </button>
                          </div>
                        </motion.div>
                      )}

                      {/* Box promozionale OMAGGIO per fascicolo */}
                      {detail && (
                        <div className="space-y-2 pt-1">
                          {detail.isOmaggio && (
                            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 flex items-center justify-between text-emerald-800 text-xs font-black uppercase">
                              <span className="flex items-center gap-1.5">
                                <Gift size={16} className="text-emerald-600" />
                                {detail.allOmaggio 
                                  ? 'Rilegatura in Omaggio (Promo 15€)!' 
                                  : `${detail.freeBindingsCount} Rilegatur${detail.freeBindingsCount > 1 ? 'e' : 'a'} in Omaggio!`}
                              </span>
                              <span className="text-emerald-700 font-black">-{fmt(detail.discount)}</span>
                            </div>
                          )}

                          {!detail.isOmaggio && detail.missingForPromo > 0 && !isOxford && (
                            <div className="bg-emerald-50/50 border border-emerald-200/60 rounded-2xl p-2.5 flex items-center justify-between text-emerald-800 text-[11px] font-medium">
                              <span className="flex items-center gap-1.5">
                                <Gift size={14} className="text-emerald-600 shrink-0" />
                                <span>Promo Rilegatura:</span>
                              </span>
                              <span>Aggiungi <strong>{fmt(detail.missingForPromo)}</strong> di stampe per 1 rilegatura GRATIS!</span>
                            </div>
                          )}

                          {/* Subtotale Fascicolo */}
                          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-150 flex justify-between items-center text-xs">
                            <span className="font-bold text-slate-500 uppercase text-[10px]">
                              Subtotale {isOxford ? 'Fascicolo (scontato 20%)' : 'Fascicolo'}
                            </span>
                            <span className="text-brandBlue font-black text-base">{fmt(detail.jobFinalCost)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Scelta Modalità di Consegna (Ritiro in sede o Spedizione SDA) */}
                <div className="bg-white rounded-4xl p-5 card-shadow space-y-3 border border-gray-150">
                  <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider block">
                    Modalità di Ricezione
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setDeliveryMethod('spedizione_sda')}
                      className={`p-3.5 rounded-2xl border text-left flex items-start gap-3 transition-all cursor-pointer ${
                        deliveryMethod === 'spedizione_sda'
                          ? 'border-emerald-600 bg-emerald-50/70 ring-1 ring-emerald-600'
                          : 'border-gray-200 bg-gray-50/50 hover:bg-gray-50'
                      }`}
                    >
                      <Truck className={`mt-0.5 shrink-0 ${deliveryMethod === 'spedizione_sda' ? 'text-emerald-600' : 'text-gray-400'}`} size={20} />
                      <div className="space-y-0.5">
                        <p className="font-black text-xs text-gray-900 uppercase">Spedizione SDA</p>
                        <p className="text-[11px] text-gray-500">
                          {isOxford && calculated.freeShippingInConvention ? (
                            <span className="text-emerald-700 font-bold">GRATIS (Promo &gt; 60 €)</span>
                          ) : (
                            `€ ${SDA_SHIPPING_PRICE.toFixed(2)} con corriere espresso`
                          )}
                        </p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDeliveryMethod('ritiro')}
                      className={`p-3.5 rounded-2xl border text-left flex items-start gap-3 transition-all cursor-pointer ${
                        deliveryMethod === 'ritiro'
                          ? 'border-emerald-600 bg-emerald-50/70 ring-1 ring-emerald-600'
                          : 'border-gray-200 bg-gray-50/50 hover:bg-gray-50'
                      }`}
                    >
                      <Store className={`mt-0.5 shrink-0 ${deliveryMethod === 'ritiro' ? 'text-emerald-600' : 'text-gray-400'}`} size={20} />
                      <div className="space-y-0.5">
                        <p className="font-black text-xs text-gray-900 uppercase">Ritiro in sede</p>
                        <p className="text-[11px] text-emerald-700 font-bold">Gratuito • Ostuni</p>
                      </div>
                    </button>
                  </div>

                  {deliveryMethod === 'spedizione_sda' && (
                    <div className="pt-2">
                      <input 
                        type="text" 
                        value={shippingAddress}
                        onChange={e => setShippingAddress(e.target.value)}
                        placeholder="Indirizzo e CAP per la spedizione SDA (facoltativo qui)"
                        className="w-full h-11 px-3.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-800 focus:outline-none focus:border-brandBlue"
                      />
                    </div>
                  )}
                </div>

                {/* Pulsante aggiungi altro documento */}
                <button 
                  onClick={() => {
                    const newJob: PrintJob = {
                      id: Date.now().toString(),
                      name: `Fascicolo #${jobs.length + 1}`,
                      bwPages: 0,
                      colorPages: 0,
                      cps: 1,
                      bindingId: 'plastic'
                    };
                    setJobs([...jobs, newJob]);
                  }}
                  className="w-full py-4 border-2 border-dashed border-gray-200 hover:border-gray-300 text-gray-600 hover:text-gray-800 rounded-3xl font-black text-xs uppercase flex items-center justify-center gap-2 transition-all cursor-pointer bg-gray-50 active:scale-[0.98]"
                >
                  ➕ Aggiungi un altro file / documento
                </button>

                {/* Banner Totale Provvisorio */}
                <div className="bg-emerald-50 rounded-3xl p-5 border border-emerald-100 flex justify-between items-center mt-6">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase text-emerald-800/60 tracking-wider">Totale Preventivo</span>
                    {isOxford ? (
                      <span className="text-[11px] text-emerald-700 font-black">
                        Convenzione Oxford (-20% applicato)
                      </span>
                    ) : (
                      calculated.totalDiscounts > 0 && (
                        <span className="text-[11px] text-emerald-700 font-black">
                          Include {fmt(calculated.totalDiscounts)} di sconti!
                        </span>
                      )
                    )}
                  </div>
                  <span className="text-3xl font-black text-emerald-700">{fmt(calculated.netTotal)}</span>
                </div>

                {/* Pulsante Procedi a Step 2 */}
                <button
                  onClick={() => {
                    setDirection('up');
                    setCurrentStep(2);
                  }}
                  className={`relative overflow-hidden w-full h-16 ${isOxford ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-900/20' : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/20'} text-white rounded-2xl font-bold text-lg flex items-center justify-center gap-3 btn-touch shadow-lg cursor-pointer mt-4`}
                >
                  <motion.div
                    className="absolute inset-0 w-[200%] h-full bg-gradient-to-r from-transparent via-white/30 to-transparent -skew-x-12 pointer-events-none"
                    initial={{ x: '-100%' }}
                    animate={{ x: '100%' }}
                    transition={{ repeat: Infinity, duration: 1.8, ease: 'linear', repeatDelay: 1 }}
                  />
                  <span className="relative z-10 flex items-center gap-3">
                    Vai al Riepilogo e Ordine <ArrowRight size={20} />
                  </span>
                </button>
              </div>
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded-4xl p-8 text-center space-y-4">
                <p className="text-gray-500 text-sm">Nessun documento configurato.</p>
                <button 
                  onClick={() => setIsStarted(false)}
                  className="bg-brandBlue text-white font-bold text-xs uppercase px-5 py-3 rounded-xl cursor-pointer"
                >
                  Scegli Rilegatura
                </button>
              </div>
            )}
          </motion.div>
        )}

        {/* STEP 2: RIEPILOGO, WHATSAPP & SCONTRINO */}
        {isStarted && currentStep === 2 && (
          <motion.div
            key="screen-step2-summary"
            custom={direction}
            variants={slideVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="space-y-6"
          >
            {/* Tasto Modifica Pagine */}
            <button
              onClick={() => {
                setDirection('down');
                setCurrentStep(1);
              }}
              className="w-full h-11 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xs uppercase rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] border border-slate-200 cursor-pointer shadow-sm"
            >
              <ArrowUp size={16} /> Modifica Pagine e Copie
            </button>

            <div className="bg-white rounded-4xl p-6 card-shadow space-y-6 border border-gray-100">
              <div>
                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">
                  {isOxford ? 'Riepilogo Preventivo • Convenzione Oxford' : 'Riepilogo Stampe e Rilegature'}
                </h4>

                {/* Input Nome Cliente facoltativo per la ricevuta */}
                <div className="mb-4">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1">
                    Nome e Cognome per il preventivo:
                  </label>
                  <input 
                    type="text" 
                    value={customer}
                    onChange={e => setCustomer(e.target.value)}
                    placeholder="Es. Mario Rossi"
                    className="w-full h-11 px-3.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-800 focus:outline-none focus:border-brandBlue"
                  />
                </div>

                <div className="space-y-4 divide-y divide-gray-100">
                  {calculated.jobDetails.map((d, idx) => (
                    <div key={d.job.id} className="pt-4 first:pt-0 space-y-2 text-xs">
                      <div className="flex justify-between items-start">
                        <span className="font-black text-gray-900 uppercase">
                          #{idx + 1} {d.job.name}
                        </span>
                        <span className="font-black text-brandBlue text-sm">
                          {fmt(d.jobFinalCost)}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-1 text-[11px] text-gray-600">
                        <div>Rilegatura: <span className="font-bold text-gray-800">{d.binding.title}</span></div>
                        <div className="text-right">Copie: <span className="font-bold text-gray-800">x{d.copies}</span></div>
                        <div>Pagine B&N: <span className="font-bold">{d.b}</span> ({fmt(d.b * d.bwRate)})</div>
                        <div className="text-right">Pagine Colore: <span className="font-bold">{d.c}</span> ({fmt(d.c * d.colorRate)})</div>
                      </div>
                      {d.isOmaggio && (
                        <div className="text-emerald-700 font-black text-[10px] uppercase flex items-center gap-1 bg-emerald-50 px-2 py-1 rounded-md">
                          <Gift size={12} /> Rilegatura In Omaggio!
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Dettagli Consegna & Sconti nel riepilogo */}
                <div className="mt-4 pt-3 border-t border-dashed border-gray-200 space-y-1.5 text-xs text-gray-600">
                  <div className="flex justify-between items-center">
                    <span>Modalità Consegna:</span>
                    <span className="font-bold text-gray-900">
                      {deliveryMethod === 'spedizione_sda' ? 'Spedizione SDA' : 'Ritiro in sede Ostuni'}
                    </span>
                  </div>
                  {deliveryMethod === 'spedizione_sda' && (
                    <div className="flex justify-between items-center">
                      <span>Costo Spedizione SDA:</span>
                      <span className={`font-black ${calculated.shippingCost === 0 ? 'text-emerald-600' : 'text-gray-900'}`}>
                        {calculated.shippingCost === 0 ? 'GRATIS (Ordine > 60€)' : fmt(calculated.shippingCost)}
                      </span>
                    </div>
                  )}
                  {isOxford && (
                    <div className="flex justify-between items-center text-emerald-700 font-bold">
                      <span>Sconto Convenzione Oxford (20%):</span>
                      <span>-{fmt(calculated.totalConventionDiscount)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Box WhatsApp Contatto */}
              <div className="bg-emerald-50/60 border border-emerald-100 rounded-3xl p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-emerald-600 fill-current" viewBox="0 0 24 24">
                    <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.455L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.42 9.864-9.864.002-2.637-1.03-5.114-2.906-6.99C16.546 1.866 14.072 1.83 11.43 1.83c-5.44 0-9.866 4.418-9.87 9.864 0 1.902.504 3.75 1.464 5.362l-.993 3.628 3.717-.975zm11.167-7.464c-.309-.155-1.829-.902-2.107-1.002-.278-.1-.48-.15-.68.15-.2.3-.775.976-.95 1.176-.175.2-.351.225-.66.07-.309-.155-1.305-.48-2.485-1.534-.918-.818-1.538-1.829-1.718-2.137-.18-.31-.02-.477.135-.632.14-.139.31-.35.465-.525.155-.175.206-.3.309-.5.103-.2.051-.375-.025-.525-.077-.15-1.002-2.414-1.378-3.32-.367-.88-.74-.76-.102-.76-.2-.05-.401-.05-.575.125-.175.175-.68.665-.68 1.62s.696 1.874.794 2.005c.1.13 1.369 2.091 3.316 2.93.463.2.824.32 1.107.41.466.147.89.126 1.226.076.375-.056 1.143-.467 1.302-.917.16-.45.16-.837.113-.917-.047-.08-.175-.13-.484-.285z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-black text-emerald-800 uppercase tracking-widest leading-none mb-1">Per Info e Ordini WhatsApp</p>
                  <a href={`https://api.whatsapp.com/send?phone=${WA_PHONE}`} target="_blank" rel="noopener noreferrer" className="text-sm font-black text-emerald-700 hover:underline">
                    391 7972545
                  </a>
                </div>
              </div>

              {/* Totale Complessivo */}
              <div className="bg-emerald-50 rounded-3xl p-5 border border-emerald-100 flex justify-between items-center">
                <div className="flex flex-col">
                  <span className="text-[10px] font-black uppercase text-emerald-800/60 tracking-wider">Totale da Pagare</span>
                  <span className="text-xs text-emerald-800/80 font-medium">IVA inclusa</span>
                </div>
                <span className="text-3xl font-black text-emerald-700">{fmt(calculated.netTotal)}</span>
              </div>

              {/* Pulsanti di Azione: WhatsApp & Download */}
              <div className="space-y-3 pt-2">
                <a 
                  onClick={() => saveToBackend()}
                  href={getWhatsAppMessage()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`relative overflow-hidden w-full h-15 ${isOxford ? 'bg-amber-600 hover:bg-amber-500' : 'bg-emerald-600 hover:bg-emerald-500'} text-white rounded-2xl font-bold text-base flex items-center justify-center gap-2.5 transition-all btn-touch cursor-pointer shadow-xl`}
                >
                  <svg className="w-5 h-5 fill-current text-white" viewBox="0 0 24 24">
                    <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.455L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.42 9.864-9.864.002-2.637-1.03-5.114-2.906-6.99C16.546 1.866 14.072 1.83 11.43 1.83c-5.44 0-9.866 4.418-9.87 9.864 0 1.902.504 3.75 1.464 5.362l-.993 3.628 3.717-.975zm11.167-7.464c-.309-.155-1.829-.902-2.107-1.002-.278-.1-.48-.15-.68.15-.2.3-.775.976-.95 1.176-.175.2-.351.225-.66.07-.309-.155-1.305-.48-2.485-1.534-.918-.818-1.538-1.829-1.718-2.137-.18-.31-.02-.477.135-.632.14-.139.31-.35.465-.525.155-.175.206-.3.309-.5.103-.2.051-.375-.025-.525-.077-.15-1.002-2.414-1.378-3.32-.367-.88-.74-.76-.102-.76-.2-.05-.401-.05-.575.125-.175.175-.68.665-.68 1.62s.696 1.874.794 2.005c.1.13 1.369 2.091 3.316 2.93.463.2.824.32 1.107.41.466.147.89.126 1.226.076.375-.056 1.143-.467 1.302-.917.16-.45.16-.837.113-.917-.047-.08-.175-.13-.484-.285z" />
                  </svg>
                  Invia Preventivo su WhatsApp
                </a>

                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={saveReceiptPng} 
                    className="h-12 bg-slate-800 hover:bg-slate-700 text-white font-black text-xs uppercase rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow"
                  >
                    <Download size={14} /> Scarica PNG
                  </button>
                  <button 
                    onClick={saveReceiptPdf} 
                    className="h-12 bg-slate-100 hover:bg-slate-200 text-slate-800 font-black text-xs uppercase rounded-xl flex items-center justify-center gap-1.5 cursor-pointer border border-slate-200"
                  >
                    <Download size={14} /> Scarica PDF
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer listino */}
      <div className="pt-6 pb-10 text-center space-y-1">
        <p className="text-slate-400 text-[10px] font-bold uppercase tracking-[0.25em]">
          {isOxford 
            ? 'convenzione oxford college mita • stampe e rilegature' 
            : 'sudpen listino stampe e rilegature • ostuni'}
        </p>
        {isOxford && (
          <p className="text-amber-600/70 text-[9px] font-extrabold uppercase tracking-wider">
            Sconto 20% applicato automaticamente • Rilegatura & Spedizione SDA gratis &gt; 60€
          </p>
        )}
      </div>

      {/* Toast Conferma */}
      <AnimatePresence>
        {showSavedToast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed bottom-6 left-4 right-4 md:left-auto md:right-6 md:w-96 z-50 bg-slate-900 border border-emerald-500/30 text-white rounded-3xl p-4 shadow-2xl flex items-center gap-3 backdrop-blur-md"
          >
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-emerald-400 shrink-0">
              <CheckCircle2 size={20} />
            </div>
            <div className="flex-1">
              <p className="font-extrabold text-xs text-emerald-400 uppercase tracking-wider">Preventivo Salvato!</p>
              <p className="text-white/70 text-[11px] font-medium">Documento scaricato con successo sul tuo dispositivo.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Analytics />
    </div>
  );
};

export default App;
