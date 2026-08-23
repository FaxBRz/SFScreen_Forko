export const sessionCodeLength = 7;
const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const sessionCodePattern = new RegExp(`^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{${sessionCodeLength}}$`);

export const normalizeSessionCode = (value: string): string => value.toUpperCase().replace(/[^23456789ABCDEFGHJKLMNPQRSTUVWXYZ]/g, '');

export const formatSessionCode = (value: string): string => {
  const normalized = normalizeSessionCode(value).slice(0, sessionCodeLength);
  return [normalized.slice(0, 3), normalized.slice(3, 6), normalized.slice(6, 7)].filter(Boolean).join('-');
};

export const isValidSessionCode = (value: string): boolean => sessionCodePattern.test(normalizeSessionCode(value));

export const formatGeneratedSessionCode = (bytes: Uint8Array): string => {
  if (bytes.length < sessionCodeLength) throw new Error('São necessários sete bytes aleatórios.');
  const raw = Array.from(bytes.slice(0, sessionCodeLength), (byte) => alphabet[byte & 31]).join('');
  return formatSessionCode(raw);
};
