export const countryCodes = [
  { code: '234', label: 'Nigeria', flag: '🇳🇬' }, { code: '233', label: 'Ghana', flag: '🇬🇭' },
  { code: '44', label: 'United Kingdom', flag: '🇬🇧' }, { code: '1', label: 'United States / Canada', flag: '🇺🇸' },
  { code: '27', label: 'South Africa', flag: '🇿🇦' }, { code: '254', label: 'Kenya', flag: '🇰🇪' },
] as const;
export function normalizePhone(value: string, countryCode = '234') {
  const cleaned = value.trim().replace(/[\s().-]/g, '');
  const local = cleaned.replace(/^0+/, '');
  const digits = cleaned.startsWith('+') ? cleaned.slice(1) : local.startsWith(countryCode) && local.length >= 10 ? local : `${countryCode}${local}`;
  if (!/^[1-9][0-9]{7,14}$/.test(digits)) throw new Error('Enter a valid phone number.');
  return digits;
}
