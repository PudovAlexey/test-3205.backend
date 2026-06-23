import { request } from 'undici';
import { UndiciUrlChecker } from './undici-url-checker';

jest.mock('undici', () => ({
  request: jest.fn(),
}));

const mockedRequest = request as unknown as jest.Mock;

function fakeResponse(statusCode: number) {
  return {
    statusCode,
    body: { dump: jest.fn().mockResolvedValue(undefined) },
  };
}

describe('UndiciUrlChecker', () => {
  let service: UndiciUrlChecker;

  beforeEach(() => {
    jest.clearAllMocks();
    // No ConfigService → defaults to 10s timeout.
    service = new UndiciUrlChecker();
  });

  it('returns httpStatus 200 with no error on success', async () => {
    mockedRequest.mockResolvedValue(fakeResponse(200));
    const signal = new AbortController().signal;

    const result = await service.head('https://example.com', signal);

    expect(result).toEqual({ httpStatus: 200, error: null, aborted: false });
    expect(mockedRequest).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({ method: 'HEAD', maxRedirections: 5 }),
    );
  });

  it('returns httpStatus 404 with no error (HTTP-level errors are mapped later)', async () => {
    mockedRequest.mockResolvedValue(fakeResponse(404));
    const signal = new AbortController().signal;

    const result = await service.head('https://example.com/missing', signal);

    expect(result).toEqual({ httpStatus: 404, error: null, aborted: false });
  });

  it('maps a network error (ENOTFOUND) to error code, httpStatus null', async () => {
    mockedRequest.mockRejectedValue({ code: 'ENOTFOUND' });
    const signal = new AbortController().signal;

    const result = await service.head('https://nope.invalid', signal);

    expect(result).toEqual({
      httpStatus: null,
      error: 'ENOTFOUND',
      aborted: false,
    });
  });

  it('maps an aborted signal to aborted:true / error "aborted"', async () => {
    const controller = new AbortController();
    controller.abort();
    mockedRequest.mockRejectedValue(new DOMException('Aborted', 'AbortError'));

    const result = await service.head('https://example.com', controller.signal);

    expect(result).toEqual({
      httpStatus: null,
      error: 'aborted',
      aborted: true,
    });
  });

  it('maps a timeout code (UND_ERR_HEADERS_TIMEOUT) to error "timeout"', async () => {
    mockedRequest.mockRejectedValue({ code: 'UND_ERR_HEADERS_TIMEOUT' });
    const signal = new AbortController().signal;

    const result = await service.head('https://slow.example', signal);

    expect(result).toEqual({
      httpStatus: null,
      error: 'timeout',
      aborted: false,
    });
  });
});
