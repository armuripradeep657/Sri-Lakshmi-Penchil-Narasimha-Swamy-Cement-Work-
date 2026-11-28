import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  Calculator,
  ChevronDown,
  FilePlus2,
  HelpCircle,
  History,
  MessageCircle,
  Phone,
  ReceiptText,
  ScanBarcode,
  Search,
  Settings,
  ShieldAlert,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useBillingData } from '../context/BillingDataContext';
import { formatCurrency } from '../lib/upiAndExport';
import { tr, translateBusinessName, translateProprietor } from '../lib/i18n';
import { LegalFooterLinks } from '../components/LegalModals';
import { NavPageId } from '../types/billing';

type FaqCategory = 'all' | 'billing' | 'whatsapp' | 'receipts';

interface FaqItem {
  id: string;
  category: Exclude<FaqCategory, 'all'>;
  questionEn: string;
  questionTe: string;
  answerEn: string;
  answerTe: string;
  stepsEn?: string[];
  stepsTe?: string[];
  actionPage?: NavPageId;
  actionLabelEn?: string;
  actionLabelTe?: string;
}

const FAQ_ITEMS: FaqItem[] = [
  {
    id: 'bill-edit-cancel',
    category: 'billing',
    questionEn: 'How do I fix a wrong item, quantity, or price after saving a bill?',
    questionTe: 'బిల్ సేవ్ చేసిన తర్వాత తప్పు వస్తువు, పరిమాణం లేదా ధరను ఎలా సరిదిద్దాలి?',
    answerEn:
      'Staff cannot alter saved financial totals directly for audit safety. Depending on what needs correction, ask an Admin to edit the bill or cancel and create a fresh one.',
    answerTe:
      'ఆడిట్ భద్రత కోసం సిబ్బంది సేవ్ చేసిన బిల్ లెక్కలను నేరుగా మార్చలేరు. అవసరాన్ని బట్టి అడ్మిన్‌తో బిల్ సవరించండి లేదా రద్దు చేసి కొత్త బిల్ చేయండి.',
    stepsEn: [
      'Open Bill History and locate the bill by customer name, mobile number, or verification barcode.',
      'Admin can tap Edit Bill to update items, quantities, prices, labour/auto charges, or payment details.',
      'If the entire bill was a mistake, tap Cancel to automatically restock all products into inventory.',
      'Use Delete only when moving a bill to the 10-day Removed Bills recovery bin in Business Settings.',
    ],
    stepsTe: [
      'బిల్లుల చరిత్ర తెరిచి కస్టమర్ పేరు, మొబైల్ నంబర్ లేదా బార్‌కోడ్‌తో బిల్లును కనుగొనండి.',
      'అడ్మిన్ "బిల్ సవరించు" నొక్కి వస్తువులు, పరిమాణం, ధరలు, లేబర్/ఆటో ఛార్జీలు లేదా చెల్లింపు వివరాలు మార్చవచ్చు.',
      'బిల్ పూర్తిగా పొరపాటు అయితే "రద్దు" నొక్కితే ఉత్పత్తుల స్టాక్ స్వయంచాలకంగా తిరిగి చేరుతుంది.',
      'బిల్లును 10 రోజుల తొలగించిన బిల్లుల జాబితాలోకి తరలించడానికి మాత్రమే "తొలగించు" వాడండి.',
    ],
    actionPage: 'bill-history',
    actionLabelEn: 'Open Bill History',
    actionLabelTe: 'బిల్లుల చరిత్ర తెరవండి',
  },
  {
    id: 'bill-labour-auto',
    category: 'billing',
    questionEn: 'How do Labour Charges and Auto Charges work on a new bill?',
    questionTe: 'కొత్త బిల్‌లో లేబర్ ఛార్జీలు మరియు ఆటో ఛార్జీలు ఎలా లెక్కించబడతాయి?',
    answerEn:
      'In New Billing, you can toggle Labour Charges and Auto Charges independently whenever loading or transport applies to an order.',
    answerTe:
      'కొత్త బిల్లింగ్‌లో లోడింగ్ లేదా రవాణా వర్తించేటప్పుడు లేబర్ ఛార్జీలు మరియు ఆటో ఛార్జీలను వేర్వేరుగా ఆన్ చేయవచ్చు.',
    stepsEn: [
      'Turn on Labour Charges and choose Per Piece (rate × total cart quantity) or Fixed Total amount.',
      'Turn on Auto Charges and enter the transport or delivery fare if applicable.',
      'Both charges appear on A4 invoices, 58mm/80mm thermal receipts, PNG bill cards, and WhatsApp messages.',
    ],
    stepsTe: [
      'లేబర్ ఛార్జీలను ఆన్ చేసి, పీసుల వారీగా (ఒక్కో పీస్ ధర × మొత్తం కార్ట్ పీసులు) లేదా స్థిర మొత్తం ఎంచుకోండి.',
      'రవాణా లేదా ఆటో ఖర్చు ఉంటే ఆటో ఛార్జీలను ఆన్ చేసి మొత్తం నమోదు చేయండి.',
      'ఈ రెండు ఛార్జీలు ఏ4 ఇన్వాయిస్, 58/80 మి.మీ. థర్మల్ రసీదు, చిత్రం మరియు వాట్సాప్ సందేశాల్లో కనిపిస్తాయి.',
    ],
    actionPage: 'new-billing',
    actionLabelEn: 'Go to New Billing',
    actionLabelTe: 'కొత్త బిల్లింగ్‌కు వెళ్లండి',
  },
  {
    id: 'bill-partial-due',
    category: 'billing',
    questionEn: 'How do I record partial payment or collect pending balance later?',
    questionTe: 'పాక్షిక చెల్లింపు ఎలా నమోదు చేయాలి లేదా తర్వాత బాకీ మొత్తం ఎలా వసూలు చేయాలి?',
    answerEn:
      'Enter the exact amount received today in the Amount Paid box during billing. The remaining balance is tracked automatically under Pending Balance.',
    answerTe:
      'బిల్ చేసేటప్పుడు "చెల్లించిన మొత్తం" బాక్స్‌లో ఆ రోజు అందిన డబ్బు మాత్రమే నమోదు చేయండి. మిగిలిన బాకీ స్వయంచాలకంగా నమోదు అవుతుంది.',
    stepsEn: [
      'During billing, leave Amount Paid at ₹0 for full credit (Unpaid) or enter the advance received for Partial status.',
      'When the customer pays the remaining due later, open Bill History and tap Pay on that bill.',
      'You can also send the customer bill link on WhatsApp so they can pay the exact due via PhonePe, GPay, or UPI.',
    ],
    stepsTe: [
      'పూర్తి అప్పు అయితే చెల్లించిన మొత్తం ₹0 ఉంచండి, లేదా అడ్వాన్స్ అందితే ఆ మొత్తం నమోదు చేయండి.',
      'కస్టమర్ తర్వాత బాకీ చెల్లించినప్పుడు బిల్లుల చరిత్రలో ఆ బిల్ పై "చెల్లించు" నొక్కి నమోదు చేయండి.',
      'లేదా వాట్సాప్‌లో బిల్ లింక్ పంపితే కస్టమర్ ఫోన్‌పే, జీపే లేదా యూపీఐ ద్వారా బాకీ చెల్లించవచ్చు.',
    ],
    actionPage: 'bill-history',
    actionLabelEn: 'Collect Due in History',
    actionLabelTe: 'చరిత్రలో బాకీ వసూలు చేయండి',
  },
  {
    id: 'bill-offline-mpin',
    category: 'billing',
    questionEn: 'Why do I see a permission or sync prompt when using MPIN or poor internet?',
    questionTe: 'ఎంపిన్ లేదా బలహీన ఇంటర్నెట్ ఉన్నప్పుడు అనుమతి లేదా సింక్ సందేశం ఎందుకు వస్తుంది?',
    answerEn:
      'Cloud actions such as deleting bills or syncing staff changes online require an active signed-in session. Offline bills queue safely on your device and sync once internet returns.',
    answerTe:
      'ఆన్‌లైన్‌లో బిల్లులు తొలగించడం లేదా మార్పులు సింక్ చేయడానికి యాక్టివ్ లాగిన్ సెషన్ అవసరం. ఇంటర్నెట్ లేనప్పుడు చేసిన బిల్లులు పరికరంలో సేవ్ అయి, నెట్ వచ్చిన వెంటనే సింక్ అవుతాయి.',
    stepsEn: [
      'If online actions ask you to re-authenticate, sign in once with your Username & Password or Google account.',
      'Always wait for the cloud sync confirmation before clearing browser data or switching devices.',
      'Check My Profile & Login anytime to verify your active role, username, and MPIN lock status.',
    ],
    stepsTe: [
      'ఆన్‌లైన్ చర్యలు మళ్లీ లాగిన్ అడిగితే, ఒకసారి మీ యూజర్‌నేమ్ & పాస్‌వర్డ్ లేదా గూగుల్ ఖాతాతో సైన్ ఇన్ చేయండి.',
      'బ్రౌజర్ డేటా క్లియర్ చేసే ముందు లేదా పరికరం మార్చే ముందు క్లౌడ్ సింక్ పూర్తయ్యే వరకు వేచి ఉండండి.',
      'మీ పాత్ర, యూజర్‌నేమ్ మరియు ఎంపిన్ లాక్ స్థితిని ఎప్పుడైనా "ప్రొఫైల్ & లాగిన్"లో చూడవచ్చు.',
    ],
    actionPage: 'profile',
    actionLabelEn: 'Check My Profile',
    actionLabelTe: 'ప్రొఫైల్ చూడండి',
  },
  {
    id: 'wa-unsaved-number',
    category: 'whatsapp',
    questionEn: 'How do I send a receipt on WhatsApp when the number is NOT saved in my contacts?',
    questionTe: 'నా ఫోన్ కాంటాక్ట్‌లలో సేవ్ చేయని నంబర్‌కు వాట్సాప్‌లో రసీదు ఎలా పంపాలి?',
    answerEn:
      'SLP Billing uses direct WhatsApp Click-to-Chat links, so you never have to save a customer phone number in your phone address book first.',
    answerTe:
      'ఎస్‌ఎల్‌పి బిల్లింగ్ నేరుగా వాట్సాప్ క్లిక్-టు-చాట్ లింక్‌లను ఉపయోగిస్తుంది కాబట్టి ముందుగా కాంటాక్ట్‌లలో నంబర్ సేవ్ చేయాల్సిన అవసరం లేదు.',
    stepsEn: [
      'Enter the customer 10-digit mobile number in WhatsApp / Mobile on New Billing (or inside the Receipt popup after saving).',
      'Look for the green "1-Click WhatsApp ready" confirmation showing +91 and the formatted number.',
      'Tap the green "Send on WhatsApp" button in the receipt modal or directly beside any bill in Bill History.',
      'WhatsApp opens straight to that customer chat with the full itemized bill and live receipt link pre-filled—just press Send.',
    ],
    stepsTe: [
      'కొత్త బిల్లింగ్‌లో "వాట్సాప్ / మొబైల్" బాక్స్‌లో (లేదా రసీదు పాప్-అప్‌లో) కస్టమర్ 10 అంకెల నంబర్ నమోదు చేయండి.',
      '+91 తో ఆకుపచ్చ రంగు "1-క్లిక్ వాట్సాప్ సిద్ధం" నిర్ధారణ కనిపిస్తుంది.',
      'రసీదు మోడల్‌లో లేదా బిల్లుల చరిత్రలో ఆకుపచ్చ "వాట్సాప్‌లో పంపండి" బటన్ నొక్కండి.',
      'కాంటాక్ట్ సేవ్ చేయకపోయినా నేరుగా ఆ కస్టమర్ వాట్సాప్ చాట్ బిల్ వివరాలతో తెరుచుకుంటుంది—సెండ్ నొక్కితే సరిపోతుంది.',
    ],
    actionPage: 'new-billing',
    actionLabelEn: 'Try in New Billing',
    actionLabelTe: 'కొత్త బిల్లింగ్‌లో ప్రయత్నించండి',
  },
  {
    id: 'wa-number-format',
    category: 'whatsapp',
    questionEn: 'Which phone number formats work best for 1-click WhatsApp delivery?',
    questionTe: '1-క్లిక్ వాట్సాప్ పంపడానికి ఏ మొబైల్ నంబర్ ఫార్మాట్ ఉత్తమం?',
    answerEn:
      'Enter any 10-digit Indian mobile number (e.g., 9876543210). Spaces, dashes, leading 0, or +91 prefixes are cleaned and normalized automatically.',
    answerTe:
      'ఏదైనా 10 అంకెల మొబైల్ నంబర్ (ఉదా: 9876543210) నమోదు చేయండి. ఖాళీలు, డ్యాష్‌లు, ముందు 0 లేదా +91 ఉన్నా స్వయంచాలకంగా సరిచేయబడతాయి.',
    stepsEn: [
      '10 digits (9876543210) automatically convert to +91 98765 43210.',
      '11 digits starting with 0 (09876543210) drop the 0 and add +91.',
      'International numbers (11 to 15 digits with country code) are preserved as entered.',
    ],
    stepsTe: [
      '10 అంకెలు (9876543210) స్వయంచాలకంగా +91 98765 43210 గా మారతాయి.',
      '0 తో మొదలయ్యే 11 అంకెలు (09876543210) సున్నా తీసివేసి +91 జతచేస్తాయి.',
      'దేశ కోడ్‌తో ఉన్న అంతర్జాతీయ నంబర్లు (11 నుండి 15 అంకెలు) అలాగే పనిచేస్తాయి.',
    ],
  },
  {
    id: 'wa-text-vs-image',
    category: 'whatsapp',
    questionEn: 'When should I use "Send on WhatsApp" vs "Share Bill Image"?',
    questionTe: '"వాట్సాప్‌లో పంపండి" మరియు "బిల్ చిత్రం షేర్" మధ్య తేడా ఏమిటి, ఎప్పుడు ఏది వాడాలి?',
    answerEn:
      'Use the top green "Send on WhatsApp" button whenever you want 1-click delivery straight to a customer mobile number (especially unsaved contacts). Use "Share Bill Image" when you want to send a visual PNG bill card.',
    answerTe:
      'సేవ్ చేయని లేదా సేవ్ చేసిన కస్టమర్ నంబర్‌కు 1 క్లిక్‌లో నేరుగా పంపడానికి ఆకుపచ్చ "వాట్సాప్‌లో పంపండి" బటన్ వాడండి. ఫోటో కార్డులా పంపాలనుకుంటే "బిల్ చిత్రం షేర్" వాడండి.',
    stepsEn: [
      'Send on WhatsApp (1-Click): Sends itemized products, total, paid/due status, and digital receipt/UPI pay link straight to that phone number.',
      'Share Bill Image: Generates a high-resolution PNG bill image via your device share sheet (requires picking a contact on mobile) or downloads the PNG.',
      'Share PhonePe / UPI Pay Link: Quickly copies and sends the due-payment link for pending credit bills.',
    ],
    stepsTe: [
      'వాట్సాప్‌లో పంపండి (1-క్లిక్): వస్తువుల జాబితా, మొత్తం, బాకీ/చెల్లింపు వివరాలు మరియు డిజిటల్ రసీదు లింక్‌ను నేరుగా ఆ నంబర్‌కు పంపుతుంది.',
      'బిల్ చిత్రం షేర్: బిల్ ఫోటోను తయారు చేసి ఫోన్ షేర్ మెనూ ద్వారా పంపుతుంది.',
      'ఫోన్‌పే / యూపీఐ చెల్లింపు లింక్ షేర్: బాకీ ఉన్న బిల్లులకు నేరుగా చెల్లింపు లింక్ పంపుతుంది.',
    ],
  },
  {
    id: 'receipt-verify-scanner',
    category: 'receipts',
    questionEn: 'How can staff verify a customer receipt or look up a printed bill quickly?',
    questionTe: 'కస్టమర్ రసీదును లేదా ప్రింట్ చేసిన బిల్లును త్వరగా ఎలా తనిఖీ చేయాలి?',
    answerEn:
      'Every bill carries a unique verification barcode and digital token. Scan it with the Verify Scanner or search the barcode directly in Bill History.',
    answerTe:
      'ప్రతి బిల్లుకు ప్రత్యేక బార్‌కోడ్ ఉంటుంది. వెరిఫై స్కానర్‌తో స్కాన్ చేయండి లేదా బిల్లుల చరిత్రలో బార్‌కోడ్ ద్వారా వెతకండి.',
    stepsEn: [
      'Open Verify Scanner from the sidebar or mobile bottom bar and scan the bill barcode.',
      'You can also type or scan the verification code into the Bill History search box.',
      'For thermal printers, switch between 58mm and 80mm slip widths inside the Receipt view before printing.',
    ],
    stepsTe: [
      'సైడ్‌బార్ లేదా మొబైల్ బాటమ్ బార్ నుండి "బిల్ స్కానర్" తెరిచి బిల్ బార్‌కోడ్ స్కాన్ చేయండి.',
      'బిల్లుల చరిత్ర శోధన బాక్స్‌లో కూడా బార్‌కోడ్ నంబర్ టైప్ చేసి చూడవచ్చు.',
      'థర్మల్ ప్రింట్ చేసే ముందు రసీదు విండోలో 58 మి.మీ. లేదా 80 మి.మీ. పేపర్ వెడల్పు ఎంచుకోండి.',
    ],
    actionPage: 'scanner',
    actionLabelEn: 'Open Verify Scanner',
    actionLabelTe: 'బిల్ స్కానర్ తెరవండి',
  },
];

interface HelpSupportPageProps {
  onNavigate: (page: NavPageId) => void;
}

export const HelpSupportPage: React.FC<HelpSupportPageProps> = ({ onNavigate }) => {
  const { language, isAdmin } = useAuth();
  const { business } = useBillingData();
  const prefersReducedMotion = useReducedMotion();

  const [category, setCategory] = useState<FaqCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({
    'wa-unsaved-number': true,
    'bill-labour-auto': true,
  });

  // Interactive Bill Total & Charges Calculator state
  const [calcSubtotal, setCalcSubtotal] = useState<string>('5000');
  const [calcDiscount, setCalcDiscount] = useState<string>('200');
  const [calcLabour, setCalcLabour] = useState<string>('300');
  const [calcAuto, setCalcAuto] = useState<string>('250');

  const calcResult = useMemo(() => {
    const subtotal = Math.max(0, Number(calcSubtotal) || 0);
    const discount = Math.min(subtotal, Math.max(0, Number(calcDiscount) || 0));
    const netItemsTotal = Math.max(0, Math.round((subtotal - discount) * 100) / 100);
    const labour = Math.max(0, Number(calcLabour) || 0);
    const auto = Math.max(0, Number(calcAuto) || 0);
    const grandTotal = Math.round((netItemsTotal + labour + auto) * 100) / 100;
    return { subtotal, discount, netItemsTotal, labour, auto, grandTotal };
  }, [calcSubtotal, calcDiscount, calcLabour, calcAuto]);

  const categories: Array<{ id: FaqCategory; labelEn: string; labelTe: string }> = [
    { id: 'all', labelEn: 'All Topics', labelTe: 'అన్ని అంశాలు' },
    { id: 'billing', labelEn: 'Billing Issues', labelTe: 'బిల్లింగ్ సమస్యలు' },
    { id: 'whatsapp', labelEn: 'WhatsApp Sharing', labelTe: 'వాట్సాప్ షేరింగ్' },
    { id: 'receipts', labelEn: 'Receipts & Sync', labelTe: 'రసీదులు & సింక్' },
  ];

  const categoryLabels: Record<Exclude<FaqCategory, 'all'>, { en: string; te: string }> = {
    billing: { en: 'Billing Issues', te: 'బిల్లింగ్ సమస్యలు' },
    whatsapp: { en: 'WhatsApp Sharing', te: 'వాట్సాప్ షేరింగ్' },
    receipts: { en: 'Receipts & Sync', te: 'రసీదులు & సింక్' },
  };

  const filteredFaqs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return FAQ_ITEMS.filter((item) => {
      if (category !== 'all' && item.category !== category) return false;
      if (!q) return true;
      const haystack = [
        item.questionEn,
        item.questionTe,
        item.answerEn,
        item.answerTe,
        ...(item.stepsEn || []),
        ...(item.stepsTe || []),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [category, searchQuery]);

  const allFilteredOpen = filteredFaqs.length > 0 && filteredFaqs.every((f) => Boolean(openIds[f.id]));

  const toggleFaq = (id: string) => {
    setOpenIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleToggleAll = () => {
    const nextState = !allFilteredOpen;
    setOpenIds((prev) => {
      const updated = { ...prev };
      filteredFaqs.forEach((f) => {
        updated[f.id] = nextState;
      });
      return updated;
    });
  };

  const brandName = translateBusinessName(business?.name, language);
  const proprietor = translateProprietor(business?.proprietor, language);

  return (
    <div className="space-y-6 animate-slp-in pb-16 lg:pb-6">
      {/* Page Title & Quick Navigation */}
      <div className="bg-white border border-[#E5DDD3] rounded-2xl p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex items-center gap-2 text-xs text-[#9A4307] font-semibold">
              <HelpCircle className="w-4 h-4 shrink-0" />
              <span>{tr(language, 'Staff Operations Guide', 'సిబ్బంది సహాయ మార్గదర్శి')}</span>
              <span aria-hidden="true">·</span>
              <span className="text-[#6D665E]">{brandName}</span>
            </div>
            <h2 className="font-display text-xl sm:text-2xl font-bold text-[#0A2240] tracking-tight text-balance">
              {tr(language, 'Help & Support Center', 'సహాయం & మద్దతు కేంద్రం')}
            </h2>
            <p className="text-xs sm:text-sm text-[#6D665E] leading-relaxed">
              {tr(
                language,
                'Step-by-step answers for billing corrections, labour & auto charges, and 1-click WhatsApp sharing to saved or unsaved customer numbers.',
                'బిల్ మార్పులు, లేబర్ & ఆటో ఛార్జీలు మరియు కాంటాక్ట్ సేవ్ లేని నంబర్లకు కూడా 1-క్లిక్ వాట్సాప్ పంపిణీ కోసం స్పష్టమైన మార్గదర్శకాలు.'
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('new-billing')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0A2240] hover:bg-[#13325B] text-white text-xs font-semibold transition whitespace-nowrap shrink-0"
            >
              <FilePlus2 className="w-3.5 h-3.5" />
              {tr(language, 'New Billing', 'కొత్త బిల్లింగ్')}
            </button>
            <button
              type="button"
              onClick={() => onNavigate('bill-history')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[#DFD7CC] bg-[#F6F1EA] hover:bg-[#EFE8DF] text-[#0A2240] text-xs font-semibold transition whitespace-nowrap shrink-0"
            >
              <History className="w-3.5 h-3.5 text-[#9A4307]" />
              {tr(language, 'Bill History', 'బిల్లుల చరిత్ర')}
            </button>
          </div>
        </div>

        {/* Search & Segmented Category Filter */}
        <div className="mt-5 pt-5 border-t border-[#E5DDD3] flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-[#9A4307] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={tr(
                language,
                'Search FAQs (e.g. unsaved WhatsApp, edit bill, labour, scanner)...',
                'సందేహాలు వెతకండి (ఉదా: వాట్సాప్, బిల్ మార్పు, లేబర్, స్కానర్)...'
              )}
              className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm rounded-xl border border-[#DFD7CC] bg-[#F6F1EA]/35 text-[#0A2240] focus:outline-none focus:ring-2 focus:ring-[#0A2240]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label={tr(language, 'Clear search', 'శోధన క్లియర్ చేయండి')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-[#8A8279] hover:text-[#2D3138]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1 p-1 bg-[#F3EDE5] rounded-xl overflow-x-auto">
            {categories.map((cat) => {
              const active = category === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap shrink-0 ${
                    active ? 'bg-white text-[#0A2240] shadow-sm' : 'text-[#6D665E] hover:text-[#0A2240]'
                  }`}
                >
                  {language === 'te' ? cat.labelTe : cat.labelEn}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content Split: FAQ List + Interactive Tax/WhatsApp Reference */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left: Staff FAQ Accordion */}
        <div className="xl:col-span-7 bg-white border border-[#E5DDD3] rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 bg-[#F6F1EA] border-b border-[#E5DDD3] flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-[#6D665E]">
              <span className="font-bold text-[#0A2240]">
                {tr(language, 'Frequently Asked Questions', 'తరచుగా అడిగే ప్రశ్నలు')}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {filteredFaqs.length} {tr(language, 'guides', 'మార్గదర్శకాలు')}
              </span>
            </div>
            {filteredFaqs.length > 0 && (
              <button
                type="button"
                onClick={handleToggleAll}
                className="text-xs font-semibold text-[#9A4307] hover:underline whitespace-nowrap shrink-0"
              >
                {allFilteredOpen
                  ? tr(language, 'Collapse All', 'అన్నీ మూసివేయి')
                  : tr(language, 'Expand All', 'అన్నీ తెరువు')}
              </button>
            )}
          </div>

          {filteredFaqs.length === 0 ? (
            <div className="p-10 text-center space-y-3">
              <p className="text-sm font-semibold text-[#0A2240]">
                {tr(language, 'No matching guides found', 'సరిపోలే మార్గదర్శకాలు కనుగొనబడలేదు')}
              </p>
              <p className="text-xs text-[#6D665E]">
                {tr(
                  language,
                  'Clear your search filter or switch back to All Topics to browse every billing guide.',
                  'అన్ని బిల్లింగ్ మార్గదర్శకాలు చూడటానికి శోధనను క్లియర్ చేయండి లేదా అన్ని అంశాలకు మారండి.'
                )}
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setCategory('all');
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0A2240] text-white text-xs font-semibold hover:bg-[#13325B] transition"
              >
                {tr(language, 'Reset Filters', 'ఫిల్టర్లు రీసెట్ చేయండి')}
              </button>
            </div>
          ) : (
            <div className="divide-y divide-blue-100/80">
              {filteredFaqs.map((item, index) => {
                const isOpen = Boolean(openIds[item.id]);
                const catInfo = categoryLabels[item.category];
                const questionText = language === 'te' ? item.questionTe : item.questionEn;
                const answerText = language === 'te' ? item.answerTe : item.answerEn;
                const steps = language === 'te' ? item.stepsTe : item.stepsEn;

                return (
                  <div key={item.id} className="transition-colors">
                    <button
                      type="button"
                      onClick={() => toggleFaq(item.id)}
                      aria-expanded={isOpen}
                      className="w-full px-5 py-4 text-left flex items-start justify-between gap-4 hover:bg-[#F6F1EA]/35 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0A2240]"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 text-[11px] text-[#6D665E]">
                          <span className="font-mono tabular-nums font-semibold text-[#9A4307]">
                            {String(index + 1).padStart(2, '0')}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{language === 'te' ? catInfo.te : catInfo.en}</span>
                        </div>
                        <h3 className="text-sm font-semibold text-[#0A2240] leading-snug">
                          {questionText}
                        </h3>
                      </div>
                      <ChevronDown
                        className={`w-4 h-4 text-[#8A8279] shrink-0 mt-1 transition-transform duration-200 ${
                          isOpen ? 'rotate-180 text-[#9A4307]' : ''
                        }`}
                      />
                    </button>

                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          initial={prefersReducedMotion ? false : { opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={prefersReducedMotion ? undefined : { opacity: 0, height: 0 }}
                          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                          className="overflow-hidden"
                        >
                          <div className="px-5 pb-5 pt-0.5 space-y-3 text-xs sm:text-sm text-[#6D665E] leading-relaxed">
                            <p>{answerText}</p>
                            {steps && steps.length > 0 && (
                              <ol className="space-y-1.5 pl-4 list-decimal text-xs text-[#2D3138]">
                                {steps.map((step, sIdx) => (
                                  <li key={sIdx} className="leading-relaxed">
                                    {step}
                                  </li>
                                ))}
                              </ol>
                            )}
                            {item.actionPage && (
                              <div className="pt-1">
                                <button
                                  type="button"
                                  onClick={() => onNavigate(item.actionPage!)}
                                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-[#DFD7CC] bg-[#F6F1EA] hover:bg-[#EFE8DF] text-[#9A4307] text-xs font-semibold transition whitespace-nowrap"
                                >
                                  {language === 'te' ? item.actionLabelTe : item.actionLabelEn}
                                </button>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Interactive Bill Calculator + WhatsApp Playbook + Support Desk */}
        <div className="xl:col-span-5 space-y-6">
          {/* Interactive Bill Total & Charges Calculator */}
          <div className="bg-white border border-[#E5DDD3] rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold text-[#9A4307]">
                  <Calculator className="w-4 h-4 shrink-0" />
                  <span>{tr(language, 'Interactive Bill Check', 'బిల్ లెక్క తనిఖీ')}</span>
                </div>
                <h3 className="font-display text-base font-bold text-[#0A2240] mt-0.5">
                  {tr(language, 'Bill Total & Charges Calculator', 'బిల్ మొత్తం & ఛార్జీల కాలిక్యులేటర్')}
                </h3>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="text-[11px] font-medium text-[#6D665E]">
                  {tr(language, 'Items Subtotal (₹)', 'వస్తువుల మొత్తం (₹)')}
                </span>
                <input
                  type="number"
                  min={0}
                  value={calcSubtotal}
                  onChange={(e) => setCalcSubtotal(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono tabular-nums rounded-xl border border-[#E5DDD3] bg-[#FAF8F5] text-[#0A2240] focus:outline-none focus:ring-2 focus:ring-[#0A2240]"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] font-medium text-[#6D665E]">
                  {tr(language, 'Discount (₹)', 'డిస్కౌంట్ (₹)')}
                </span>
                <input
                  type="number"
                  min={0}
                  value={calcDiscount}
                  onChange={(e) => setCalcDiscount(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono tabular-nums rounded-xl border border-[#E5DDD3] bg-[#FAF8F5] text-[#0A2240] focus:outline-none focus:ring-2 focus:ring-[#0A2240]"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] font-medium text-[#6D665E]">
                  {tr(language, 'Labour Charges (₹)', 'లేబర్ ఛార్జీలు (₹)')}
                </span>
                <input
                  type="number"
                  min={0}
                  value={calcLabour}
                  onChange={(e) => setCalcLabour(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono tabular-nums rounded-xl border border-[#E5DDD3] bg-[#FAF8F5] text-[#0A2240] focus:outline-none focus:ring-2 focus:ring-[#0A2240]"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] font-medium text-[#6D665E]">
                  {tr(language, 'Auto Charges (₹)', 'ఆటో ఛార్జీలు (₹)')}
                </span>
                <input
                  type="number"
                  min={0}
                  value={calcAuto}
                  onChange={(e) => setCalcAuto(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono tabular-nums rounded-xl border border-[#E5DDD3] bg-[#FAF8F5] text-[#0A2240] focus:outline-none focus:ring-2 focus:ring-[#0A2240]"
                />
              </label>
            </div>

            <div className="pt-3 border-t border-[#E5DDD3] space-y-1.5 text-xs">
              <div className="flex items-center justify-between text-[#6D665E]">
                <span>{tr(language, 'Net Items Total (Subtotal − Discount)', 'నికర వస్తువుల మొత్తం')}</span>
                <span className="font-mono tabular-nums font-semibold text-[#0A2240]">
                  {formatCurrency(calcResult.netItemsTotal)}
                </span>
              </div>
              <div className="flex items-center justify-between text-[#6D665E]">
                <span>{tr(language, 'Labour + Auto Charges', 'లేబర్ + ఆటో ఛార్జీలు')}</span>
                <span className="font-mono tabular-nums">
                  {formatCurrency(calcResult.labour + calcResult.auto)}
                </span>
              </div>
              <div className="pt-2 border-t border-[#E5DDD3] flex items-center justify-between text-sm font-bold text-[#0A2240]">
                <span>{tr(language, 'Final Grand Total', 'తుది మొత్తం బిల్')}</span>
                <span className="font-mono tabular-nums text-[#9A4307]">
                  {formatCurrency(calcResult.grandTotal)}
                </span>
              </div>
            </div>
          </div>

          {/* 3-Step WhatsApp Checklist */}
          <div className="bg-white border border-[#E5DDD3] rounded-2xl p-5 shadow-sm space-y-3.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#16A34A]">
              <MessageCircle className="w-4 h-4 shrink-0" />
              <span>{tr(language, 'WhatsApp Best Practices', 'వాట్సాప్ ఉత్తమ పద్ధతులు')}</span>
            </div>
            <h3 className="font-display text-base font-bold text-[#0A2240]">
              {tr(language, 'Send Receipts in 3 Quick Steps', '3 సులభ దశల్లో రసీదు పంపండి')}
            </h3>
            <ol className="space-y-2.5 text-xs text-[#6D665E] divide-y divide-[#EFEAE2]">
              <li className="pt-1">
                <span className="font-semibold text-[#0A2240]">
                  {tr(language, '1. Type customer 10-digit mobile', '1. కస్టమర్ 10 అంకెల నంబర్ నమోదు చేయండి')}
                </span>
                <p className="mt-0.5 text-[#6D665E]">
                  {tr(
                    language,
                    'No need to save the number in phone contacts—enter it on New Billing or inside the Receipt screen.',
                    'ఫోన్ కాంటాక్ట్‌లలో సేవ్ చేయాల్సిన పనిలేదు—కొత్త బిల్లింగ్ లేదా రసీదు తెరపై నంబర్ ఇవ్వండి.'
                  )}
                </p>
              </li>
              <li className="pt-2.5">
                <span className="font-semibold text-[#0A2240]">
                  {tr(language, '2. Tap green Send on WhatsApp', '2. ఆకుపచ్చ "వాట్సాప్‌లో పంపండి" నొక్కండి')}
                </span>
                <p className="mt-0.5 text-[#6D665E]">
                  {tr(
                    language,
                    'Opens their direct chat pre-filled with items, charges, paid/due balance, and digital receipt link.',
                    'వస్తువులు, ఛార్జీలు, బాకీ వివరాలు మరియు డిజిటల్ రసీదు లింక్‌తో నేరుగా వారి వాట్సాప్ చాట్ తెరుచుకుంటుంది.'
                  )}
                </p>
              </li>
              <li className="pt-2.5">
                <span className="font-semibold text-[#0A2240]">
                  {tr(language, '3. Resend anytime from Bill History', '3. బిల్లుల చరిత్ర నుండి ఎప్పుడైనా మళ్లీ పంపండి')}
                </span>
                <p className="mt-0.5 text-[#6D665E]">
                  {tr(
                    language,
                    'Every bill with a mobile number displays a direct green WhatsApp button right in the Bill History list.',
                    'మొబైల్ నంబర్ ఉన్న ప్రతి బిల్ పక్కన బిల్లుల చరిత్రలోనే నేరుగా వాట్సాప్ బటన్ ఉంటుంది.'
                  )}
                </p>
              </li>
            </ol>
          </div>

          {/* Shop Desk & Quick Shortcuts */}
          <div className="bg-white border border-[#E5DDD3] rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#0A2240]">
              <ShieldAlert className="w-4 h-4 text-[#9A4307] shrink-0" />
              <span>{tr(language, 'Need Admin Assistance?', 'అడ్మిన్ సహాయం అవసరమా?')}</span>
            </div>
            <p className="text-xs text-[#6D665E] leading-relaxed">
              {tr(
                language,
                'For bill edits, password resets, business settings changes, or restoring removed bills within 10 days, contact your shop administrator.',
                'బిల్ సవరణలు, పాస్‌వర్డ్ రీసెట్, వ్యాపార సెట్టింగ్స్ లేదా 10 రోజుల్లోపు తొలగించిన బిల్లులను తిరిగి పొందడానికి మీ షాప్ అడ్మిన్‌ను సంప్రదించండి.'
              )}
            </p>
            <div className="pt-1 space-y-1 text-xs text-[#2D3138]">
              {proprietor && (
                <div>
                  <span className="text-[#6D665E]">{tr(language, 'Proprietor:', 'యజమాని:')}</span>{' '}
                  <span className="font-semibold text-[#0A2240]">{proprietor}</span>
                </div>
              )}
              {business?.phone && (
                <div className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-[#9A4307] shrink-0" />
                  <span className="font-mono tabular-nums font-semibold text-[#0A2240]">{business.phone}</span>
                </div>
              )}
            </div>
            <div className="pt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onNavigate('scanner')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E5DDD3] hover:bg-[#FAF8F5] text-xs font-semibold text-[#0A2240] transition whitespace-nowrap"
              >
                <ScanBarcode className="w-3.5 h-3.5 text-[#9A4307]" />
                {tr(language, 'Verify Scanner', 'బిల్ స్కానర్')}
              </button>
              <button
                type="button"
                onClick={() => onNavigate('profile')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E5DDD3] hover:bg-[#FAF8F5] text-xs font-semibold text-[#0A2240] transition whitespace-nowrap"
              >
                <ReceiptText className="w-3.5 h-3.5 text-[#9A4307]" />
                {tr(language, 'My Profile & Login', 'ప్రొఫైల్ & లాగిన్')}
              </button>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => onNavigate('settings')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E5DDD3] hover:bg-[#FAF8F5] text-xs font-semibold text-[#0A2240] transition whitespace-nowrap"
                >
                  <Settings className="w-3.5 h-3.5 text-[#9A4307]" />
                  {tr(language, 'Business Settings', 'బిజినెస్ సెట్టింగ్స్')}
                </button>
              )}
            </div>
            <div className="pt-3 border-t border-[#EFEAE2] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#6D665E]">
              <span>{tr(language, 'Legal & Documentation', 'నిబంధనలు & గోప్యతా పత్రాలు')}</span>
              <LegalFooterLinks language={language} businessName={business?.name} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
