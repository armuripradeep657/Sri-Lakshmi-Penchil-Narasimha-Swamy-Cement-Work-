import { Bill, BillItem, Business, Language, Product } from '../types/billing';
import {
  formatAppDate,
  tr,
  translateBusinessName,
  translateCartProductName,
  translateCustomerName,
  translatePaymentMethod,
  translateVariantLabel,
} from './i18n';
import { formatTimestamp } from './firebase';

/**
 * Normalizes any Indian or international phone number into WhatsApp Click-to-Chat digits
 * (e.g. "98765 43210" -> "919876543210", "+91 98765-43210" -> "919876543210", "09876543210" -> "919876543210").
 * Works for ANY saved or unsaved WhatsApp number via https://wa.me/<digits>.
 */
export function formatWhatsAppPhone(rawMobile?: string | null): string {
  const digits = (rawMobile || '').replace(/[^0-9]/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`;
  if (digits.length >= 11 && digits.length <= 15) return digits;
  return '';
}

export function formatReadableWhatsAppPhone(rawMobile?: string | null): string {
  const waDigits = formatWhatsAppPhone(rawMobile);
  if (!waDigits) return (rawMobile || '').trim();
  if (waDigits.startsWith('91') && waDigits.length === 12) {
    return `+91 ${waDigits.slice(2, 7)} ${waDigits.slice(7)}`;
  }
  return `+${waDigits}`;
}

export function openExternalLinkSafely(url: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function buildWhatsAppReceiptText(params: {
  bill: Bill;
  items: BillItem[];
  business: Business | null | undefined;
  products: Product[];
  publicUrl: string;
  language: Language;
}): string {
  const { bill, items, business, products, publicUrl, language } = params;
  const bizDisplay = translateBusinessName(business?.name, language);
  const custDisplay = translateCustomerName(bill.customerName, language);
  const methodDisplay = translatePaymentMethod(bill.paymentMethod, language);
  const dt = formatTimestamp(bill.createdAt);
  const dateText = formatAppDate(dt, language);
  const isDue = bill.pendingBalance > 0 && bill.billStatus === 'active';

  const itemLines =
    items.length > 0
      ? items.slice(0, 15).map((item, index) => {
          const itemName = translateCartProductName(item.productName, item.productId, products, language);
          const variant = translateVariantLabel(item.variantLabel, language);
          const label = variant ? `${itemName} (${variant})` : itemName;
          return `${index + 1}. ${label} × ${item.quantity} = ₹${item.lineTotal.toFixed(2)}`;
        })
      : bill.itemsSummary
      ? [bill.itemsSummary]
      : [];

  const moreItemsNote =
    items.length > 15
      ? tr(
          language,
          `...and ${items.length - 15} more item(s)`,
          `...మరియు ఇంకా ${items.length - 15} వస్తువు(లు)`
        )
      : '';

  const chargeLines: string[] = [];
  if (bill.discountAmount > 0) {
    chargeLines.push(`${tr(language, 'Discount', 'డిస్కౌంట్')}: -₹${bill.discountAmount.toFixed(2)}`);
  }
  if (Number(bill.labourCharge || 0) > 0) {
    chargeLines.push(`${tr(language, 'Labour Charges', 'లేబర్ ఛార్జీలు')}: ₹${Number(bill.labourCharge).toFixed(2)}`);
  }
  if (Number(bill.autoCharge || 0) > 0) {
    chargeLines.push(`${tr(language, 'Auto Charges', 'ఆటో ఛార్జీలు')}: ₹${Number(bill.autoCharge).toFixed(2)}`);
  }

  const statusLine =
    bill.billStatus === 'cancelled'
      ? tr(language, 'Status: CANCELLED', 'స్థితి: రద్దు చేయబడింది')
      : bill.billStatus === 'refunded'
      ? tr(language, 'Status: REFUNDED', 'స్థితి: వాపసు చేయబడింది')
      : isDue
      ? `${tr(language, 'Paid', 'చెల్లించినది')}: ₹${bill.amountPaid.toFixed(2)} (${methodDisplay})\n${tr(
          language,
          'Balance Due',
          'బాకీ మొత్తం'
        )}: ₹${bill.pendingBalance.toFixed(2)}`
      : `${tr(language, 'Status', 'స్థితి')}: ${tr(language, 'AMOUNT PAID', 'పూర్తిగా చెల్లించబడింది')} (₹${bill.amountPaid.toFixed(
          2
        )} · ${methodDisplay})`;

  const lines = [
    `*${bizDisplay}*`,
    business?.phone ? `${tr(language, 'Phone', 'ఫోన్')}: ${business.phone}` : '',
    `------------------------------`,
    `${tr(language, 'Bill No', 'బిల్ నం.')}: ${bill.billNumber}`,
    `${tr(language, 'Date', 'తేదీ')}: ${dateText}`,
    `${tr(language, 'Customer', 'కస్టమర్')}: ${custDisplay}`,
    bill.customerMobile ? `${tr(language, 'Mobile', 'మొబైల్')}: ${bill.customerMobile}` : '',
    itemLines.length > 0 ? `------------------------------` : '',
    ...itemLines,
    moreItemsNote,
    chargeLines.length > 0 ? `------------------------------` : '',
    ...chargeLines,
    `------------------------------`,
    `*${tr(language, 'Grand Total', 'మొత్తం బిల్')}: ₹${bill.grandTotal.toFixed(2)}*`,
    statusLine,
    `------------------------------`,
    isDue
      ? tr(
          language,
          'View receipt or pay due via PhonePe / GPay / UPI:',
          'రసీదు చూడటానికి లేదా ఫోన్‌పే / జీపే / యూపీఐ ద్వారా బాకీ చెల్లించడానికి లింక్:'
        )
      : tr(
          language,
          'View & download digital receipt:',
          'డిజిటల్ రసీదు చూడటానికి & డౌన్‌లోడ్ చేయడానికి:'
        ),
    publicUrl,
  ].filter(Boolean);

  return lines.join('\n');
}

export function buildWhatsAppThankYouText(params: {
  bill: Bill;
  business: Business | null | undefined;
  publicUrl: string;
  language: Language;
}): string {
  const { bill, business, publicUrl, language } = params;
  const bizDisplay = translateBusinessName(business?.name, language);
  const custDisplay = translateCustomerName(bill.customerName, language);
  const methodDisplay = translatePaymentMethod(bill.paymentMethod, language);
  const isDue = bill.pendingBalance > 0 && bill.billStatus === 'active';

  const statusLine =
    bill.billStatus === 'cancelled'
      ? tr(language, 'Status: CANCELLED', 'స్థితి: రద్దు చేయబడింది')
      : bill.billStatus === 'refunded'
      ? tr(language, 'Status: REFUNDED', 'స్థితి: వాపసు చేయబడింది')
      : isDue
      ? `${tr(language, 'Paid', 'చెల్లించినది')}: ₹${bill.amountPaid.toFixed(2)} (${methodDisplay}) · ${tr(
          language,
          'Due',
          'బాకీ'
        )}: ₹${bill.pendingBalance.toFixed(2)}`
      : `${tr(language, 'Paid in Full', 'పూర్తిగా చెల్లించబడింది')}: ₹${bill.amountPaid.toFixed(2)} (${methodDisplay})`;

  const lines =
    language === 'te'
      ? [
          `🙏 *${bizDisplay}* లో కొనుగోలు చేసినందుకు ధన్యవాదాలు!`,
          '',
          `ప్రియమైన ${custDisplay},`,
          `మీ బిల్ విజయవంతంగా సిద్ధం చేయబడింది.`,
          '',
          `• *బిల్ నం.:* ${bill.billNumber}`,
          `• *మొత్తం విలువ:* ₹${bill.grandTotal.toFixed(2)}`,
          `• ${statusLine}`,
          '',
          `మీ డిజిటల్ బిల్ చూడటానికి & డౌన్‌లోడ్ చేయడానికి లింక్:`,
          publicUrl,
          '',
          `మమ్మల్ని ఎంచుకున్నందుకు హృదయపూర్వక ధన్యవాదాలు, మళ్లీ విచ్చేయండి!`,
        ]
      : [
          `🙏 Thank you for shopping with *${bizDisplay}*!`,
          '',
          `Dear ${custDisplay},`,
          `Thank you for your purchase. Your invoice is ready!`,
          '',
          `• *Bill No:* ${bill.billNumber}`,
          `• *Total Amount:* ₹${bill.grandTotal.toFixed(2)}`,
          `• ${statusLine}`,
          '',
          `View & download your digital bill here:`,
          publicUrl,
          '',
          `We appreciate your business and look forward to serving you again!`,
        ];

  return lines.join('\n');
}

export function buildWhatsAppDirectUrl(rawMobile: string | undefined | null, messageText: string): string {
  const waDigits = formatWhatsAppPhone(rawMobile);
  const encodedText = encodeURIComponent(messageText);
  return waDigits ? `https://wa.me/${waDigits}?text=${encodedText}` : `https://wa.me/?text=${encodedText}`;
}
