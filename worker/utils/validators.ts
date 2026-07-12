export const isValidEmail = (value: unknown): value is string =>
  typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

export const isValidUsername = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{2,32}$/.test(value)

export const isValidPassword = (value: unknown): value is string =>
  typeof value === 'string' && value.length >= 8 && value.length <= 72

export const isValidRole = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 4
