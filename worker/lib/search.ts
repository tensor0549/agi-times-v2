export function hasHan(value: string): boolean { return /\p{Script=Han}/u.test(value); }
export function escapeLike(value: string): string { return value.replace(/[\\%_]/g,(character)=>`\\${character}`); }
