const { criarSchema } = require('./schema');
const { run, get, all } = require('./db');

const GRUPOS = [
  { letra: 'A', nome: 'Grupo A' },
  { letra: 'B', nome: 'Grupo B' },
  { letra: 'C', nome: 'Grupo C' },
  { letra: 'D', nome: 'Grupo D' },
  { letra: 'E', nome: 'Grupo E' },
  { letra: 'F', nome: 'Grupo F' },
  { letra: 'G', nome: 'Grupo G' },
  { letra: 'H', nome: 'Grupo H' },
  { letra: 'I', nome: 'Grupo I' },
  { letra: 'J', nome: 'Grupo J' },
  { letra: 'K', nome: 'Grupo K' },
  { letra: 'L', nome: 'Grupo L' }
];

// 48 seleções em ordem dos grupos (1..48)
const SELECOES = [
  // Grupo A: 1, 2, 3, 4
  { id: 1, nome: 'Mexico', pt: 'México', sigla: 'MEX', bandeira: 'mx' },
  { id: 2, nome: 'South Africa', pt: 'África do Sul', sigla: 'AFS', bandeira: 'za' },
  { id: 3, nome: 'South Korea', pt: 'Coreia do Sul', sigla: 'COR', bandeira: 'kr' },
  { id: 4, nome: 'Czech Republic', pt: 'República Tcheca', sigla: 'CZE', bandeira: 'cz' },
  // Grupo B: 5, 6, 7, 8
  { id: 5, nome: 'Canada', pt: 'Canadá', sigla: 'CAN', bandeira: 'ca' },
  { id: 6, nome: 'Bosnia and Herzegovina', pt: 'Bósnia e Herzegovina', sigla: 'BIH', bandeira: 'ba' },
  { id: 7, nome: 'Qatar', pt: 'Catar', sigla: 'CAT', bandeira: 'qa' },
  { id: 8, nome: 'Switzerland', pt: 'Suíça', sigla: 'SUI', bandeira: 'ch' },
  // Grupo C: 9, 10, 11, 12
  { id: 9, nome: 'Brazil', pt: 'Brasil', sigla: 'BRA', bandeira: 'br' },
  { id: 10, nome: 'Morocco', pt: 'Marrocos', sigla: 'MAR', bandeira: 'ma' },
  { id: 11, nome: 'Haiti', pt: 'Haiti', sigla: 'HAI', bandeira: 'ht' },
  { id: 12, nome: 'Scotland', pt: 'Escócia', sigla: 'ESC', bandeira: 'gb-sct' },
  // Grupo D: 13, 14, 15, 16
  { id: 13, nome: 'United States', pt: 'Estados Unidos', sigla: 'EUA', bandeira: 'us' },
  { id: 14, nome: 'Paraguay', pt: 'Paraguai', sigla: 'PAR', bandeira: 'py' },
  { id: 15, nome: 'Australia', pt: 'Austrália', sigla: 'AUS', bandeira: 'au' },
  { id: 16, nome: 'Turkey', pt: 'Turquia', sigla: 'TUR', bandeira: 'tr' },
  // Grupo E: 17, 18, 19, 20
  { id: 17, nome: 'Germany', pt: 'Alemanha', sigla: 'GER', bandeira: 'de' },
  { id: 18, nome: 'Curaçao', pt: 'Curaçau', sigla: 'CUR', bandeira: 'cw' },
  { id: 19, nome: 'Ivory Coast', pt: 'Costa do Marfim', sigla: 'CMF', bandeira: 'ci' },
  { id: 20, nome: 'Ecuador', pt: 'Equador', sigla: 'EQU', bandeira: 'ec' },
  // Grupo F: 21, 22, 23, 24
  { id: 21, nome: 'Netherlands', pt: 'Holanda', sigla: 'HOL', bandeira: 'nl' },
  { id: 22, nome: 'Japan', pt: 'Japão', sigla: 'JPN', bandeira: 'jp' },
  { id: 23, nome: 'Sweden', pt: 'Suécia', sigla: 'SUE', bandeira: 'se' },
  { id: 24, nome: 'Tunisia', pt: 'Tunísia', sigla: 'TUN', bandeira: 'tn' },
  // Grupo G: 25, 26, 27, 28
  { id: 25, nome: 'Belgium', pt: 'Bélgica', sigla: 'BEL', bandeira: 'be' },
  { id: 26, nome: 'Egypt', pt: 'Egito', sigla: 'EGI', bandeira: 'eg' },
  { id: 27, nome: 'Iran', pt: 'Irã', sigla: 'IRA', bandeira: 'ir' },
  { id: 28, nome: 'New Zealand', pt: 'Nova Zelândia', sigla: 'NZL', bandeira: 'nz' },
  // Grupo H: 29, 30, 31, 32
  { id: 29, nome: 'Spain', pt: 'Espanha', sigla: 'ESP', bandeira: 'es' },
  { id: 30, nome: 'Cape Verde', pt: 'Cabo Verde', sigla: 'CBV', bandeira: 'cv' },
  { id: 31, nome: 'Saudi Arabia', pt: 'Arábia Saudita', sigla: 'ARA', bandeira: 'sa' },
  { id: 32, nome: 'Uruguay', pt: 'Uruguai', sigla: 'URU', bandeira: 'uy' },
  // Grupo I: 33, 34, 35, 36
  { id: 33, nome: 'France', pt: 'França', sigla: 'FRA', bandeira: 'fr' },
  { id: 34, nome: 'Senegal', pt: 'Senegal', sigla: 'SEN', bandeira: 'sn' },
  { id: 35, nome: 'Iraq', pt: 'Iraque', sigla: 'IRQ', bandeira: 'iq' },
  { id: 36, nome: 'Norway', pt: 'Noruega', sigla: 'NOR', bandeira: 'no' },
  // Grupo J: 37, 38, 39, 40
  { id: 37, nome: 'Argentina', pt: 'Argentina', sigla: 'ARG', bandeira: 'ar' },
  { id: 38, nome: 'Algeria', pt: 'Argélia', sigla: 'ALG', bandeira: 'dz' },
  { id: 39, nome: 'Austria', pt: 'Áustria', sigla: 'AUT', bandeira: 'at' },
  { id: 40, nome: 'Jordan', pt: 'Jordânia', sigla: 'JOR', bandeira: 'jo' },
  // Grupo K: 41, 42, 43, 44
  { id: 41, nome: 'Portugal', pt: 'Portugal', sigla: 'POR', bandeira: 'pt' },
  { id: 42, nome: 'DR Congo', pt: 'RD Congo', sigla: 'COD', bandeira: 'cd' },
  { id: 43, nome: 'Uzbekistan', pt: 'Uzbequistão', sigla: 'UZB', bandeira: 'uz' },
  { id: 44, nome: 'Colombia', pt: 'Colômbia', sigla: 'COL', bandeira: 'co' },
  // Grupo L: 45, 46, 47, 48
  { id: 45, nome: 'England', pt: 'Inglaterra', sigla: 'ING', bandeira: 'gb-eng' },
  { id: 46, nome: 'Croatia', pt: 'Croácia', sigla: 'CRO', bandeira: 'hr' },
  { id: 47, nome: 'Ghana', pt: 'Gana', sigla: 'GHA', bandeira: 'gh' },
  { id: 48, nome: 'Panama', pt: 'Panamá', sigla: 'PAN', bandeira: 'pa' }
];

// Mapeia ID da seleção -> letra do grupo
const TIME_PARA_GRUPO = {
  1: 'A', 2: 'A', 3: 'A', 4: 'A',
  5: 'B', 6: 'B', 7: 'B', 8: 'B',
  9: 'C', 10: 'C', 11: 'C', 12: 'C',
  13: 'D', 14: 'D', 15: 'D', 16: 'D',
  17: 'E', 18: 'E', 19: 'E', 20: 'E',
  21: 'F', 22: 'F', 23: 'F', 24: 'F',
  25: 'G', 26: 'G', 27: 'G', 28: 'G',
  29: 'H', 30: 'H', 31: 'H', 32: 'H',
  33: 'I', 34: 'I', 35: 'I', 36: 'I',
  37: 'J', 38: 'J', 39: 'J', 40: 'J',
  41: 'K', 42: 'K', 43: 'K', 44: 'K',
  45: 'L', 46: 'L', 47: 'L', 48: 'L'
};

// Estádios da Copa 2026
const ESTADIOS = {
  1: { nome: 'Estádio Azteca', cidade: 'Cidade do México', pais: 'México' },
  2: { nome: 'Estádio Akron', cidade: 'Guadalajara', pais: 'México' },
  3: { nome: 'Estádio BBVA', cidade: 'Monterrey', pais: 'México' },
  4: { nome: 'BC Place', cidade: 'Vancouver', pais: 'Canadá' },
  5: { nome: 'BMO Field', cidade: 'Toronto', pais: 'Canadá' },
  6: { nome: 'MetLife Stadium', cidade: 'Nova York/Nova Jersey', pais: 'EUA' },
  7: { nome: 'AT&T Stadium', cidade: 'Dallas', pais: 'EUA' },
  8: { nome: 'SoFi Stadium', cidade: 'Los Angeles', pais: 'EUA' },
  9: { nome: 'Hard Rock Stadium', cidade: 'Miami', pais: 'EUA' },
  10: { nome: 'Mercedes-Benz Stadium', cidade: 'Atlanta', pais: 'EUA' },
  11: { nome: 'NRG Stadium', cidade: 'Houston', pais: 'EUA' },
  12: { nome: 'Arrowhead Stadium', cidade: 'Kansas City', pais: 'EUA' },
  13: { nome: 'Lumen Field', cidade: 'Seattle', pais: 'EUA' },
  14: { nome: 'Levi\'s Stadium', cidade: 'San Francisco', pais: 'EUA' },
  15: { nome: 'Lincoln Financial Field', cidade: 'Filadélfia', pais: 'EUA' },
  16: { nome: 'Gillette Stadium', cidade: 'Boston', pais: 'EUA' }
};

  // 104 jogos da Copa 2026 (horários em Brasília -03:00)
  // fase: 'grupo' | 'r32' | 'r16' | 'qf' | 'sf' | 'terceiro' | 'final'
  // Para knockout, selecao_casa_id e visitante ficam null (serão preenchidos depois)
  const JOGOS = [
    // Rodada 1
    { id: 1, fase: 'grupo', rodada: 1, grupo: 'A', casa: 1, visitante: 2, data: '2026-06-11 16:00-03:00', estadio: 1 },
    { id: 2, fase: 'grupo', rodada: 1, grupo: 'A', casa: 3, visitante: 4, data: '2026-06-11 23:00-03:00', estadio: 2 },
    { id: 3, fase: 'grupo', rodada: 1, grupo: 'B', casa: 5, visitante: 6, data: '2026-06-12 16:00-03:00', estadio: 5 },
    { id: 4, fase: 'grupo', rodada: 1, grupo: 'D', casa: 13, visitante: 14, data: '2026-06-12 22:00-03:00', estadio: 8 },
    { id: 5, fase: 'grupo', rodada: 1, grupo: 'C', casa: 11, visitante: 12, data: '2026-06-13 22:00-03:00', estadio: 16 },
    { id: 6, fase: 'grupo', rodada: 1, grupo: 'D', casa: 15, visitante: 16, data: '2026-06-14 01:00-03:00', estadio: 4 },
    { id: 7, fase: 'grupo', rodada: 1, grupo: 'C', casa: 9, visitante: 10, data: '2026-06-13 19:00-03:00', estadio: 6 },
    { id: 8, fase: 'grupo', rodada: 1, grupo: 'B', casa: 7, visitante: 8, data: '2026-06-13 16:00-03:00', estadio: 14 },
    { id: 9, fase: 'grupo', rodada: 1, grupo: 'E', casa: 19, visitante: 20, data: '2026-06-14 20:00-03:00', estadio: 15 },
    { id: 10, fase: 'grupo', rodada: 1, grupo: 'E', casa: 17, visitante: 18, data: '2026-06-14 14:00-03:00', estadio: 11 },
    { id: 11, fase: 'grupo', rodada: 1, grupo: 'F', casa: 21, visitante: 22, data: '2026-06-14 17:00-03:00', estadio: 7 },
    { id: 12, fase: 'grupo', rodada: 1, grupo: 'F', casa: 23, visitante: 24, data: '2026-06-14 23:00-03:00', estadio: 3 },
    { id: 13, fase: 'grupo', rodada: 1, grupo: 'G', casa: 27, visitante: 28, data: '2026-06-15 22:00-03:00', estadio: 8 },
    { id: 14, fase: 'grupo', rodada: 1, grupo: 'H', casa: 29, visitante: 30, data: '2026-06-15 13:00-03:00', estadio: 10 },
    { id: 15, fase: 'grupo', rodada: 1, grupo: 'G', casa: 25, visitante: 26, data: '2026-06-15 16:00-03:00', estadio: 13 },
    { id: 16, fase: 'grupo', rodada: 1, grupo: 'H', casa: 31, visitante: 32, data: '2026-06-15 19:00-03:00', estadio: 9 },
    { id: 17, fase: 'grupo', rodada: 1, grupo: 'I', casa: 33, visitante: 34, data: '2026-06-16 16:00-03:00', estadio: 6 },
    { id: 18, fase: 'grupo', rodada: 1, grupo: 'I', casa: 35, visitante: 36, data: '2026-06-16 19:00-03:00', estadio: 16 },
    { id: 19, fase: 'grupo', rodada: 1, grupo: 'J', casa: 37, visitante: 38, data: '2026-06-16 22:00-03:00', estadio: 12 },
    { id: 20, fase: 'grupo', rodada: 1, grupo: 'J', casa: 39, visitante: 40, data: '2026-06-17 01:00-03:00', estadio: 14 },
    { id: 21, fase: 'grupo', rodada: 1, grupo: 'K', casa: 41, visitante: 42, data: '2026-06-17 14:00-03:00', estadio: 11 },
    { id: 22, fase: 'grupo', rodada: 1, grupo: 'L', casa: 45, visitante: 46, data: '2026-06-17 17:00-03:00', estadio: 7 },
    { id: 23, fase: 'grupo', rodada: 1, grupo: 'K', casa: 43, visitante: 44, data: '2026-06-17 21:00-03:00', estadio: 1 },
    { id: 24, fase: 'grupo', rodada: 1, grupo: 'L', casa: 47, visitante: 48, data: '2026-06-17 20:00-03:00', estadio: 5 },
    // Rodada 2
    { id: 25, fase: 'grupo', rodada: 2, grupo: 'A', casa: 1, visitante: 3, data: '2026-06-18 22:00-03:00', estadio: 2 },
    { id: 26, fase: 'grupo', rodada: 2, grupo: 'B', casa: 8, visitante: 6, data: '2026-06-18 16:00-03:00', estadio: 8 },
    { id: 27, fase: 'grupo', rodada: 2, grupo: 'B', casa: 5, visitante: 7, data: '2026-06-18 19:00-03:00', estadio: 4 },
    { id: 28, fase: 'grupo', rodada: 2, grupo: 'A', casa: 4, visitante: 2, data: '2026-06-18 13:00-03:00', estadio: 10 },
    { id: 29, fase: 'grupo', rodada: 2, grupo: 'C', casa: 12, visitante: 10, data: '2026-06-19 19:00-03:00', estadio: 16 },
    { id: 30, fase: 'grupo', rodada: 2, grupo: 'C', casa: 9, visitante: 11, data: '2026-06-19 21:30-03:00', estadio: 15 },
    { id: 31, fase: 'grupo', rodada: 2, grupo: 'D', casa: 13, visitante: 15, data: '2026-06-19 16:00-03:00', estadio: 13 },
    { id: 32, fase: 'grupo', rodada: 2, grupo: 'D', casa: 16, visitante: 14, data: '2026-06-20 00:00-03:00', estadio: 14 },
    { id: 33, fase: 'grupo', rodada: 2, grupo: 'E', casa: 17, visitante: 19, data: '2026-06-20 17:00-03:00', estadio: 5 },
    { id: 34, fase: 'grupo', rodada: 2, grupo: 'E', casa: 20, visitante: 18, data: '2026-06-20 21:00-03:00', estadio: 12 },
    { id: 35, fase: 'grupo', rodada: 2, grupo: 'F', casa: 21, visitante: 23, data: '2026-06-20 14:00-03:00', estadio: 11 },
    { id: 36, fase: 'grupo', rodada: 2, grupo: 'F', casa: 24, visitante: 22, data: '2026-06-20 23:00-03:00', estadio: 3 },
    { id: 37, fase: 'grupo', rodada: 2, grupo: 'G', casa: 25, visitante: 27, data: '2026-06-21 16:00-03:00', estadio: 8 },
    { id: 38, fase: 'grupo', rodada: 2, grupo: 'G', casa: 28, visitante: 26, data: '2026-06-21 22:00-03:00', estadio: 4 },
    { id: 39, fase: 'grupo', rodada: 2, grupo: 'H', casa: 29, visitante: 31, data: '2026-06-21 13:00-03:00', estadio: 10 },
    { id: 40, fase: 'grupo', rodada: 2, grupo: 'H', casa: 32, visitante: 30, data: '2026-06-21 19:00-03:00', estadio: 9 },
    { id: 41, fase: 'grupo', rodada: 2, grupo: 'I', casa: 33, visitante: 35, data: '2026-06-22 18:00-03:00', estadio: 15 },
    { id: 42, fase: 'grupo', rodada: 2, grupo: 'I', casa: 36, visitante: 34, data: '2026-06-22 21:00-03:00', estadio: 6 },
    { id: 43, fase: 'grupo', rodada: 2, grupo: 'J', casa: 37, visitante: 39, data: '2026-06-22 14:00-03:00', estadio: 7 },
    { id: 44, fase: 'grupo', rodada: 2, grupo: 'J', casa: 40, visitante: 38, data: '2026-06-23 00:00-03:00', estadio: 14 },
    { id: 45, fase: 'grupo', rodada: 2, grupo: 'K', casa: 41, visitante: 43, data: '2026-06-23 14:00-03:00', estadio: 11 },
    { id: 46, fase: 'grupo', rodada: 2, grupo: 'L', casa: 48, visitante: 46, data: '2026-06-23 20:00-03:00', estadio: 5 },
    { id: 47, fase: 'grupo', rodada: 2, grupo: 'K', casa: 44, visitante: 42, data: '2026-06-23 23:00-03:00', estadio: 2 },
    { id: 48, fase: 'grupo', rodada: 2, grupo: 'L', casa: 45, visitante: 47, data: '2026-06-23 17:00-03:00', estadio: 16 },
    // Rodada 3
    { id: 49, fase: 'grupo', rodada: 3, grupo: 'C', casa: 12, visitante: 9, data: '2026-06-24 19:00-03:00', estadio: 9 },
    { id: 50, fase: 'grupo', rodada: 3, grupo: 'C', casa: 10, visitante: 11, data: '2026-06-24 19:00-03:00', estadio: 10 },
    { id: 51, fase: 'grupo', rodada: 3, grupo: 'A', casa: 2, visitante: 3, data: '2026-06-24 22:00-03:00', estadio: 3 },
    { id: 52, fase: 'grupo', rodada: 3, grupo: 'A', casa: 4, visitante: 1, data: '2026-06-24 22:00-03:00', estadio: 1 },
    { id: 53, fase: 'grupo', rodada: 3, grupo: 'B', casa: 6, visitante: 7, data: '2026-06-24 16:00-03:00', estadio: 13 },
    { id: 54, fase: 'grupo', rodada: 3, grupo: 'B', casa: 8, visitante: 5, data: '2026-06-24 16:00-03:00', estadio: 4 },
    { id: 55, fase: 'grupo', rodada: 3, grupo: 'E', casa: 18, visitante: 19, data: '2026-06-25 17:00-03:00', estadio: 15 },
    { id: 56, fase: 'grupo', rodada: 3, grupo: 'E', casa: 20, visitante: 17, data: '2026-06-25 17:00-03:00', estadio: 6 },
    { id: 57, fase: 'grupo', rodada: 3, grupo: 'D', casa: 14, visitante: 15, data: '2026-06-25 23:00-03:00', estadio: 14 },
    { id: 58, fase: 'grupo', rodada: 3, grupo: 'D', casa: 16, visitante: 13, data: '2026-06-25 23:00-03:00', estadio: 8 },
    { id: 59, fase: 'grupo', rodada: 3, grupo: 'F', casa: 22, visitante: 23, data: '2026-06-25 20:00-03:00', estadio: 7 },
    { id: 60, fase: 'grupo', rodada: 3, grupo: 'F', casa: 24, visitante: 21, data: '2026-06-25 20:00-03:00', estadio: 12 },
    { id: 61, fase: 'grupo', rodada: 3, grupo: 'I', casa: 34, visitante: 35, data: '2026-06-26 16:00-03:00', estadio: 5 },
    { id: 62, fase: 'grupo', rodada: 3, grupo: 'I', casa: 36, visitante: 33, data: '2026-06-26 16:00-03:00', estadio: 16 },
    { id: 63, fase: 'grupo', rodada: 3, grupo: 'G', casa: 26, visitante: 27, data: '2026-06-27 00:00-03:00', estadio: 13 },
    { id: 64, fase: 'grupo', rodada: 3, grupo: 'G', casa: 28, visitante: 25, data: '2026-06-27 00:00-03:00', estadio: 4 },
    { id: 65, fase: 'grupo', rodada: 3, grupo: 'H', casa: 30, visitante: 31, data: '2026-06-26 21:00-03:00', estadio: 11 },
    { id: 66, fase: 'grupo', rodada: 3, grupo: 'H', casa: 32, visitante: 29, data: '2026-06-26 21:00-03:00', estadio: 2 },
    { id: 67, fase: 'grupo', rodada: 3, grupo: 'L', casa: 48, visitante: 45, data: '2026-06-27 18:00-03:00', estadio: 6 },
    { id: 68, fase: 'grupo', rodada: 3, grupo: 'L', casa: 46, visitante: 47, data: '2026-06-27 18:00-03:00', estadio: 15 },
    { id: 69, fase: 'grupo', rodada: 3, grupo: 'J', casa: 38, visitante: 39, data: '2026-06-27 23:00-03:00', estadio: 12 },
    { id: 70, fase: 'grupo', rodada: 3, grupo: 'J', casa: 40, visitante: 37, data: '2026-06-27 23:00-03:00', estadio: 7 },
    { id: 71, fase: 'grupo', rodada: 3, grupo: 'K', casa: 44, visitante: 41, data: '2026-06-27 20:30-03:00', estadio: 9 },
    { id: 72, fase: 'grupo', rodada: 3, grupo: 'K', casa: 42, visitante: 43, data: '2026-06-27 20:30-03:00', estadio: 10 },
  // Oitavas de final (R32) - 16 jogos
  { id: 73, fase: 'r32', rodada: 4, casa: null, visitante: null, data: '2026-06-28 12:00-03:00', estadio: 16, descricao: '2ºA vs 2ºB' },
  { id: 74, fase: 'r32', rodada: 4, casa: null, visitante: null, data: '2026-06-29 16:30-03:00', estadio: 9, descricao: '1ºE vs 3ºA/B/C/D/F' },
  { id: 75, fase: 'r32', rodada: 4, casa: null, visitante: null, data: '2026-06-29 19:00-03:00', estadio: 3, descricao: '1ºF vs 2ºC' },
  { id: 76, fase: 'r32', rodada: 4, casa: null, visitante: null, data: '2026-06-29 12:00-03:00', estadio: 5, descricao: '1ºC vs 2ºF' },
  { id: 77, fase: 'r32', rodada: 4, casa: null, visitante: null, data: '2026-06-30 17:00-03:00', estadio: 11, descricao: '1ºI vs 3ºC/D/F/G/H' },
  { id: 78, fase: 'r32', rodada: 4, casa: null, visitante: null, data: '2026-06-30 12:00-03:00', estadio: 4, descricao: '2ºE vs 2ºI' },
  { id: 79, fase: 'r32', rodada: 4, casa: null, visitante: null, data: '2026-06-30 19:00-03:00', estadio: 1, descricao: '1ºA vs 3ºC/E/F/H/I' },
  { id: 80, fase: 'r32', rodada: 4, casa: null, visitante: null, data: '2026-07-01 12:00-03:00', estadio: 7, descricao: '1ºL vs 3ºE/H/I/J/K' },
  { id: 81, fase: 'r32', rodada: 4, casa: null, visitante: null, data: '2026-07-01 17:00-03:00', estadio: 15, descricao: '1ºD vs 3ºB/E/F/I/J' },
  { id: 82, fase: 'r32', rodada: 4, casa: null, visitante: null, data: '2026-07-01 13:00-03:00', estadio: 14, descricao: '1ºG vs 3ºA/E/H/I/J' },
  { id: 83, fase: 'r32', rodada: 4, casa: null, visitante: null, data: '2026-07-02 19:00-03:00', estadio: 12, descricao: '2ºK vs 2ºL' },
  { id: 84, fase: 'r32', rodada: 4, casa: null, visitante: null, data: '2026-07-02 12:00-03:00', estadio: 16, descricao: '1ºH vs 2ºJ' },
  { id: 85, fase: 'r32', rodada: 4, casa: null, visitante: null, data: '2026-07-02 20:00-03:00', estadio: 13, descricao: '1ºB vs 3ºE/F/G/I/J' },
  { id: 86, fase: 'r32', rodada: 4, casa: null, visitante: null, data: '2026-07-03 18:00-03:00', estadio: 8, descricao: '1ºJ vs 2ºH' },
  { id: 87, fase: 'r32', rodada: 4, casa: null, visitante: null, data: '2026-07-03 20:30-03:00', estadio: 6, descricao: '1ºK vs 3ºD/E/I/J/L' },
  { id: 88, fase: 'r32', rodada: 4, casa: null, visitante: null, data: '2026-07-03 13:00-03:00', estadio: 4, descricao: '2ºD vs 2ºG' },
  // Quartas (R16) - 8 jogos
  { id: 89, fase: 'r16', rodada: 5, casa: null, visitante: null, data: '2026-07-04 17:00-03:00', estadio: 10, descricao: 'Vencedor 74 vs Vencedor 77' },
  { id: 90, fase: 'r16', rodada: 5, casa: null, visitante: null, data: '2026-07-04 12:00-03:00', estadio: 5, descricao: 'Vencedor 73 vs Vencedor 75' },
  { id: 91, fase: 'r16', rodada: 5, casa: null, visitante: null, data: '2026-07-05 16:00-03:00', estadio: 11, descricao: 'Vencedor 76 vs Vencedor 78' },
  { id: 92, fase: 'r16', rodada: 5, casa: null, visitante: null, data: '2026-07-05 18:00-03:00', estadio: 1, descricao: 'Vencedor 79 vs Vencedor 80' },
  { id: 93, fase: 'r16', rodada: 5, casa: null, visitante: null, data: '2026-07-06 14:00-03:00', estadio: 4, descricao: 'Vencedor 83 vs Vencedor 84' },
  { id: 94, fase: 'r16', rodada: 5, casa: null, visitante: null, data: '2026-07-06 17:00-03:00', estadio: 14, descricao: 'Vencedor 81 vs Vencedor 82' },
  { id: 95, fase: 'r16', rodada: 5, casa: null, visitante: null, data: '2026-07-07 12:00-03:00', estadio: 7, descricao: 'Vencedor 86 vs Vencedor 88' },
  { id: 96, fase: 'r16', rodada: 5, casa: null, visitante: null, data: '2026-07-07 13:00-03:00', estadio: 13, descricao: 'Vencedor 85 vs Vencedor 87' },
  // Quartas de final (QF) - 4 jogos
  { id: 97, fase: 'qf', rodada: 6, casa: null, visitante: null, data: '2026-07-09 16:00-03:00', estadio: 9, descricao: 'Vencedor 89 vs Vencedor 90' },
  { id: 98, fase: 'qf', rodada: 6, casa: null, visitante: null, data: '2026-07-10 12:00-03:00', estadio: 16, descricao: 'Vencedor 93 vs Vencedor 94' },
  { id: 99, fase: 'qf', rodada: 6, casa: null, visitante: null, data: '2026-07-11 17:00-03:00', estadio: 8, descricao: 'Vencedor 91 vs Vencedor 92' },
  { id: 100, fase: 'qf', rodada: 6, casa: null, visitante: null, data: '2026-07-11 20:00-03:00', estadio: 6, descricao: 'Vencedor 95 vs Vencedor 96' },
  // Semifinais (SF) - 2 jogos
  { id: 101, fase: 'sf', rodada: 7, casa: null, visitante: null, data: '2026-07-14 14:00-03:00', estadio: 4, descricao: 'Vencedor 97 vs Vencedor 98' },
  { id: 102, fase: 'sf', rodada: 7, casa: null, visitante: null, data: '2026-07-15 15:00-03:00', estadio: 7, descricao: 'Vencedor 99 vs Vencedor 100' },
  // Disputa de 3º lugar
  { id: 103, fase: 'terceiro', rodada: 8, casa: null, visitante: null, data: '2026-07-18 17:00-03:00', estadio: 8, descricao: 'Perdedor 101 vs Perdedor 102' },
  // Final
  { id: 104, fase: 'final', rodada: 9, casa: null, visitante: null, data: '2026-07-19 16:00-03:00', estadio: 11, descricao: 'Vencedor 101 vs Vencedor 102' }
];

async function seed() {
  console.log('🌱 Iniciando seed do banco de dados...');

  await criarSchema();

  // Limpa dados existentes
  await run('DELETE FROM palpites');
  await run('DELETE FROM jogos');
  await run('DELETE FROM selecoes');
  await run('DELETE FROM grupos');
  // Insere grupos
  const grupoIds = {};
  for (const grupo of GRUPOS) {
    const result = await run(
      'INSERT INTO grupos (letra, nome) VALUES (?, ?)',
      [grupo.letra, grupo.nome]
    );
    grupoIds[grupo.letra] = result.lastID;
  }
  console.log(`✅ ${GRUPOS.length} grupos inseridos`);

  // Insere seleções
  for (const selecao of SELECOES) {
    const grupoLetra = TIME_PARA_GRUPO[selecao.id];
    const grupoId = grupoIds[grupoLetra];
    const bandeiraUrl = `https://flagcdn.com/w80/${selecao.bandeira}.png`;
    await run(
      'INSERT INTO selecoes (id, nome, nome_pt, sigla, bandeira_url, grupo_id) VALUES (?, ?, ?, ?, ?, ?)',
      [selecao.id, selecao.nome, selecao.pt, selecao.sigla, bandeiraUrl, grupoId]
    );
  }
  console.log(`✅ ${SELECOES.length} seleções inseridas`);

  // Insere jogos (converte data string → Date para compatibilidade com pg)
  const JOGOS_COM_DATE = JOGOS.map(j => ({
    ...j,
    data: (() => {
      const m = typeof j.data === 'string' ? j.data.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/) : null;
      if (!m) return j.data;
      const [, y, M, d, h, min] = m.map(Number);
      return new Date(Date.UTC(y, M - 1, d, h + 3, min));
    })()
  }));
  for (const jogo of JOGOS_COM_DATE) {
    const grupoId = jogo.grupo ? grupoIds[jogo.grupo] : null;
    const estadio = ESTADIOS[jogo.estadio];
    await run(
      `INSERT INTO jogos
        (id, fase, rodada, grupo_id, selecao_casa_id, selecao_visitante_id, data, estadio, cidade, pais)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        jogo.id,
        jogo.fase,
        jogo.rodada,
        grupoId,
        jogo.casa,
        jogo.visitante,
        jogo.data,
        estadio.nome,
        estadio.cidade,
        estadio.pais
      ]
    );
  }
  console.log(`✅ ${JOGOS.length} jogos inseridos`);

  console.log('🎉 Seed concluído com sucesso!');
  console.log('\nPróximos passos:');
  console.log('  1. Crie um usuário admin: npm run criar-admin');
  console.log('  2. Inicie o servidor: npm start');
  console.log('  3. Acesse http://localhost:3000');
}

if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Erro no seed:', err);
      process.exit(1);
    });
}

module.exports = { seed };
