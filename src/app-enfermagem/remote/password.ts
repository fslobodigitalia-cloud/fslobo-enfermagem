/** Política de senha do app: mínimo de 10 caracteres, com maiúscula, minúscula e número. */
export const PASSWORD_MIN = 10;

export type PasswordRule = { id: string; label: string; ok: boolean };

export function passwordRules(pw: string): PasswordRule[] {
  return [
    { id: "len", label: `Pelo menos ${PASSWORD_MIN} caracteres`, ok: pw.length >= PASSWORD_MIN },
    { id: "lower", label: "Uma letra minúscula", ok: /[a-zà-ÿ]/.test(pw) },
    { id: "upper", label: "Uma letra maiúscula", ok: /[A-ZÀ-Ý]/.test(pw) },
    { id: "digit", label: "Um número", ok: /\d/.test(pw) },
  ];
}

export const passwordOk = (pw: string) => passwordRules(pw).every((r) => r.ok);
