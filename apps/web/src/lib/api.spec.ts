import { describe, expect, it } from 'vitest';
import { apiErrorMessage } from './api';

describe('mensaje de error de la API', () => {
  /**
   * Axios rotula todo fallo como «Request failed with status code 409». La API
   * manda un motivo concreto —qué campo no coincide con la cadena, qué
   * evidencia falta— y tirarlo deja al usuario sin nada accionable.
   */
  it('prefiere el mensaje del cuerpo sobre el genérico de Axios', () => {
    expect(
      apiErrorMessage(
        { response: { data: { message: 'On-chain merkleRoot does not match the asset draft.' } } },
        'Request failed with status code 409',
      ),
    ).toBe('On-chain merkleRoot does not match the asset draft.');
  });

  it('junta los mensajes cuando la validación devuelve varios', () => {
    expect(
      apiErrorMessage(
        {
          response: { data: { message: ['controller must be lowercase', 'receivables required'] } },
        },
        'Request failed with status code 400',
      ),
    ).toBe('controller must be lowercase · receivables required');
  });

  it('cae al mensaje original cuando el cuerpo no trae nada legible', () => {
    const fallback = 'Network Error';
    expect(apiErrorMessage({ response: { data: {} } }, fallback)).toBe(fallback);
    expect(apiErrorMessage({ response: { data: '<html>' } }, fallback)).toBe(fallback);
    expect(apiErrorMessage({}, fallback)).toBe(fallback);
    expect(apiErrorMessage({ response: { data: { message: '' } } }, fallback)).toBe(fallback);
  });
});
