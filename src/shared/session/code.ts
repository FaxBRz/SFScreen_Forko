const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export const normalizeSessionCode = (value: string): string => value.toUpperCase().replace(/[^23456789ABCDEFGHJKLMNPQRSTUVWXYZ]/g, '');

export const formatSessionCode = (value: string): string => {
  const normalized = normalizeSessionCode(value).slice(0, 7);
  return [normalized.slice(0, 3), normalized.slice(3, 6), normalized.slice(6, 7)].filter(Boolean).join('-');
};

export const isValidSessionCode = (value: string): boolean => /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{7}$/.test(normalizeSessionCode(value));

export const formatGeneratedSessionCode = (bytes: Uint8Array): string => {
  if (bytes.length < 7) throw new Error('São necessários sete bytes aleatórios.');
  const raw = Array.from(bytes.slice(0, 7), (byte) => alphabet[byte & 31]).join('');
  return formatSessionCode(raw);
};
