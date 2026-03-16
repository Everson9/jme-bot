// src/utils/validadores.js

// Valida se é um email válido
export const isValidEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

// Valida CPF
export const isValidCPF = (cpf) => {
  cpf = cpf.replace(/\D/g, '');
  if (cpf.length !== 11) return false;
  
  // Verifica se todos os dígitos são iguais
  if (/^(\d)\1+$/.test(cpf)) return false;
  
  // Validação dos dígitos verificadores
  let soma = 0;
  for (let i = 0; i < 9; i++) {
    soma += parseInt(cpf.charAt(i)) * (10 - i);
  }
  let resto = 11 - (soma % 11);
  let dv1 = resto > 9 ? 0 : resto;
  
  if (dv1 !== parseInt(cpf.charAt(9))) return false;
  
  soma = 0;
  for (let i = 0; i < 10; i++) {
    soma += parseInt(cpf.charAt(i)) * (11 - i);
  }
  resto = 11 - (soma % 11);
  let dv2 = resto > 9 ? 0 : resto;
  
  return dv2 === parseInt(cpf.charAt(10));
};

// Valida telefone (mínimo 10 dígitos)
export const isValidTelefone = (tel) => {
  const numeros = tel.replace(/\D/g, '');
  return numeros.length >= 10 && numeros.length <= 11;
};

// Valida se é um número de WhatsApp válido
export const isValidWhatsApp = (tel) => {
  const numeros = tel.replace(/\D/g, '');
  return numeros.length >= 10 && numeros.length <= 13;
};